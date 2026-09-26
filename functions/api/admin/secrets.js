// GET  /api/admin/secrets  列出 webhook 密钥（管理员）
// POST /api/admin/secrets  添加 webhook 密钥（管理员），body: { name?, secret? }
// 密钥存于 KV 的 cfg:secrets；配置了任一密钥后，发送留言必须携带有效密钥。
import { json, checkAdmin, getSecrets, saveSecrets, generateSecret } from '../_lib.js';

const MAX_SECRETS = 20;

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = checkAdmin(request, new URL(request.url), env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  return json({ ok: true, secrets: await getSecrets(env) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = checkAdmin(request, new URL(request.url), env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  let body = {};
  try {
    body = await request.json();
  } catch {
    // 允许空 body，默认自动生成密钥
  }

  const name = String(body?.name ?? '').trim().slice(0, 50) || '未命名密钥';
  let secret = String(body?.secret ?? '').trim();
  if (!secret) secret = generateSecret();
  if (secret.length < 8) {
    return json({ ok: false, error: '密钥太短（至少 8 个字符）' }, 400);
  }

  const list = await getSecrets(env);
  if (list.length >= MAX_SECRETS) {
    return json({ ok: false, error: `最多保存 ${MAX_SECRETS} 个密钥，请先删除不用的` }, 400);
  }
  if (list.some((s) => s.secret === secret)) {
    return json({ ok: false, error: '该密钥已存在' }, 400);
  }

  const item = { id: crypto.randomUUID().slice(0, 8), name, secret, created: Date.now() };
  list.push(item);
  await saveSecrets(env, list);
  return json({ ok: true, secret: item }, 201);
}
