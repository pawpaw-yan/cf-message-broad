// GET    /api/messages  获取留言列表（最新在前）
// POST   /api/messages  Webhook 发送留言
// DELETE /api/messages  清空全部留言（管理员）
//
// KV key 设计：msg:{倒序时间戳}:{uuid}
// 倒序时间戳让 KV list 天然按"最新在前"排列。

import { json, CORS_HEADERS, checkAdmin, rateLimited, verifyWebhookSecret } from './_lib.js';

const MAX_NAME_LEN = 50;
const MAX_MESSAGE_LEN = 2000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const RATE_LIMIT_PER_MINUTE = 10;

function makeId() {
  const inverted = String(9999999999999 - Date.now()).padStart(13, '0');
  return `${inverted}:${crypto.randomUUID()}`;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.MESSAGES_KV) {
    return json({ ok: false, error: 'KV 绑定 MESSAGES_KV 未配置，请在 Cloudflare Pages 设置中绑定' }, 500);
  }

  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || DEFAULT_LIMIT, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  // KV 一次最多返回 1000 条，足够覆盖 MAX_LIMIT
  const list = await env.MESSAGES_KV.list({ prefix: 'msg:' });
  const keys = list.keys.slice(0, limit);

  const values = await Promise.all(keys.map((k) => env.MESSAGES_KV.get(k.name, 'json')));
  const messages = values.filter(Boolean).map(({ key, ...rest }) => rest);

  return json({ ok: true, count: messages.length, messages });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.MESSAGES_KV) {
    return json({ ok: false, error: 'KV 绑定 MESSAGES_KV 未配置，请在 Cloudflare Pages 设置中绑定' }, 500);
  }

  const url = new URL(request.url);
  if (!(await verifyWebhookSecret(request, url, env))) {
    return json({ ok: false, error: '无效的密钥（secret）' }, 401);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await rateLimited(env, ip, 'rl', RATE_LIMIT_PER_MINUTE)) {
    return json({ ok: false, error: '发送太频繁，请稍后再试' }, 429);
  }

  // 解析请求体：JSON / 表单 / 纯文本，尽量兼容各种 webhook 来源
  const contentType = request.headers.get('Content-Type') || '';
  let data;
  try {
    if (contentType.includes('application/json')) {
      data = await request.json();
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      data = Object.fromEntries(form);
    } else {
      data = { message: (await request.text()).trim() };
    }
  } catch {
    return json({ ok: false, error: '无法解析请求体，请检查 Content-Type 与内容格式' }, 400);
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    // 兼容多种常见字段名
    data = {
      name: data.name ?? data.author ?? data.username ?? data.from ?? data.nickname,
      message: data.message ?? data.text ?? data.content ?? data.body ?? data.msg,
      source: data.source ?? data.app ?? undefined,
    };
  }

  const name = String(data?.name ?? '').trim().slice(0, MAX_NAME_LEN) || 'Webhook';
  const message = String(data?.message ?? '').trim().slice(0, MAX_MESSAGE_LEN);

  if (!message) {
    return json({ ok: false, error: `缺少消息内容：请在请求体中提供 message 字段（也兼容 text / content / body）` }, 400);
  }

  const id = makeId();
  const record = {
    id,
    name,
    message,
    source: data?.source ? String(data.source).slice(0, 50) : undefined,
    timestamp: Date.now(),
  };

  await env.MESSAGES_KV.put(`msg:${id}`, JSON.stringify(record));

  return json({ ok: true, id: record.id, name: record.name, message: record.message, timestamp: record.timestamp }, 201);
}

// 清空全部留言（管理员）
export async function onRequestDelete(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const auth = checkAdmin(request, url, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  if (!env.MESSAGES_KV) {
    return json({ ok: false, error: 'KV 绑定 MESSAGES_KV 未配置' }, 500);
  }

  let deleted = 0;
  let cursor;
  do {
    const list = await env.MESSAGES_KV.list({ prefix: 'msg:', cursor });
    await Promise.all(list.keys.map((k) => env.MESSAGES_KV.delete(k.name)));
    deleted += list.keys.length;
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  return json({ ok: true, deleted });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
