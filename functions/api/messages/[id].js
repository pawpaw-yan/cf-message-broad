// DELETE /api/messages/:id  删除留言（需要管理密钥）
// 密钥来源：ADMIN_SECRET，未配置时回退到 WEBHOOK_SECRET；两者都未配置则拒绝删除。
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Secret',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

export async function onRequestDelete(context) {
  const { env, request, params } = context;

  const secret = env.ADMIN_SECRET || env.WEBHOOK_SECRET;
  if (!secret) {
    return json({ ok: false, error: '未配置 ADMIN_SECRET / WEBHOOK_SECRET，删除功能已禁用' }, 403);
  }

  const url = new URL(request.url);
  const provided =
    url.searchParams.get('secret') ||
    request.headers.get('X-Webhook-Secret') ||
    (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (provided !== secret) {
    return json({ ok: false, error: '无效的密钥（secret）' }, 401);
  }

  if (!env.MESSAGES_KV) {
    return json({ ok: false, error: 'KV 绑定 MESSAGES_KV 未配置' }, 500);
  }

  // id 形如 {倒序时间戳}:{uuid}，拼回 KV key
  const id = decodeURIComponent(params.id);
  if (!/^[0-9]{13}:[0-9a-f-]{36}$/i.test(id)) {
    return json({ ok: false, error: '无效的留言 ID' }, 400);
  }

  const key = `msg:${id}`;
  const existing = await env.MESSAGES_KV.get(key);
  if (!existing) {
    return json({ ok: false, error: '留言不存在' }, 404);
  }

  await env.MESSAGES_KV.delete(key);
  return json({ ok: true, deleted: id });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
