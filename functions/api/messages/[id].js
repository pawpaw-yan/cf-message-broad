// DELETE /api/messages/:id  删除单条留言（管理员）
import { json, CORS_HEADERS, checkAdmin } from '../_lib.js';

export async function onRequestDelete(context) {
  const { env, request, params } = context;

  const auth = checkAdmin(request, new URL(request.url), env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

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
