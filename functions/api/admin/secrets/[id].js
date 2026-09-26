// DELETE /api/admin/secrets/:id  删除 webhook 密钥（管理员）
import { json, checkAdmin, getSecrets, saveSecrets } from '../../_lib.js';

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const auth = checkAdmin(request, new URL(request.url), env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const id = decodeURIComponent(params.id);
  const list = await getSecrets(env);
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) {
    return json({ ok: false, error: '密钥不存在' }, 404);
  }

  await saveSecrets(env, next);
  return json({ ok: true, deleted: id });
}
