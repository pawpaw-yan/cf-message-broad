// GET /api/config  前端启动时探测站点配置（公开信息，仅暴露开关状态，不含任何敏感值）
// private: 私密模式是否开启（开启时查看留言需要管理员密码）
// adminEnabled: 管理功能是否可用（是否配置了 ADMIN_PASSWORD）
import { json, isPrivateMode } from './_lib.js';

export async function onRequestGet(context) {
  const { env } = context;
  return json({
    ok: true,
    private: isPrivateMode(env),
    adminEnabled: !!env.ADMIN_PASSWORD,
  });
}
