// POST /api/admin/login  验证管理员密码
// 密码来自环境变量 ADMIN_PASSWORD；验证通过后前端将其保存在 sessionStorage，
// 后续管理请求通过 X-Admin-Secret 头携带。
import { json, timingSafeEqual, rateLimited } from '../_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.ADMIN_PASSWORD) {
    return json({ ok: false, error: '未配置 ADMIN_PASSWORD 环境变量，管理功能不可用' }, 403);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await rateLimited(env, ip, 'rla', 10)) {
    return json({ ok: false, error: '尝试过于频繁，请稍后再试' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: '无效的请求体' }, 400);
  }

  const password = typeof body?.password === 'string' ? body.password : '';
  if (!timingSafeEqual(password, env.ADMIN_PASSWORD)) {
    return json({ ok: false, error: '密码错误' }, 401);
  }

  return json({ ok: true });
}
