// 共享辅助函数。_ 开头的文件不会被 Pages Functions 注册为路由。

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Secret, X-Admin-Secret',
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

// 恒定时间字符串比较，避免时序侧信道
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length === b.length ? 0 : 1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function bearer(request) {
  return (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
}

// 管理员验证：X-Admin-Secret 头 / Authorization Bearer / ?admin= 均可
export function checkAdmin(request, url, env) {
  if (!env.ADMIN_PASSWORD) {
    return { ok: false, status: 403, error: '未配置 ADMIN_PASSWORD 环境变量，管理功能不可用' };
  }
  const provided =
    request.headers.get('X-Admin-Secret') || bearer(request) || url.searchParams.get('admin') || '';
  if (!timingSafeEqual(provided, env.ADMIN_PASSWORD)) {
    return { ok: false, status: 401, error: '管理员密码错误' };
  }
  return { ok: true };
}

// 简单限流：按 IP + 前缀，每分钟 limit 次
export async function rateLimited(env, ip, prefix, limit) {
  const minute = Math.floor(Date.now() / 60000);
  const key = `${prefix}:${ip}:${minute}`;
  const count = parseInt((await env.MESSAGES_KV.get(key)) || '0', 10);
  if (count >= limit) return true;
  await env.MESSAGES_KV.put(key, String(count + 1), { expirationTtl: 120 });
  return false;
}

// ---- Webhook 密钥管理（存于 KV cfg:secrets）----

export async function getSecrets(env) {
  const raw = await env.MESSAGES_KV.get('cfg:secrets');
  const list = raw ? JSON.parse(raw) : [];
  return Array.isArray(list) ? list : [];
}

export async function saveSecrets(env, list) {
  await env.MESSAGES_KV.put('cfg:secrets', JSON.stringify(list));
}

export function generateSecret() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return 'wh_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// 校验发送方密钥并返回匹配详情：
// - open: true   未配置任何密钥（开放发送模式）
// - ok: true     密钥有效；managed 为匹配到的管理密钥条目（null 表示匹配的是 WEBHOOK_SECRET）
// - ok: false    密钥无效或缺失
export async function matchWebhookSecret(request, url, env) {
  const provided =
    url.searchParams.get('secret') || request.headers.get('X-Webhook-Secret') || bearer(request) || '';
  const managed = await getSecrets(env);
  const hasEnvSecret = !!env.WEBHOOK_SECRET;

  if (!managed.length && !hasEnvSecret) {
    return { open: true, ok: true, managed: null };
  }
  if (provided) {
    for (const s of managed) {
      if (timingSafeEqual(provided, s.secret)) {
        return { open: false, ok: true, managed: s };
      }
    }
    if (hasEnvSecret && timingSafeEqual(provided, env.WEBHOOK_SECRET)) {
      return { open: false, ok: true, managed: null };
    }
  }
  return { open: false, ok: false, managed: null };
}
