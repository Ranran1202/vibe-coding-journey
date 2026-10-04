// cloudfunctions/health/index.js
// Day 15 · 「今日热搜」案例：第一个 CloudBase 云函数（健康检查）
//
// 它在整个作品里的位置：
//   第 1–14 天的作品是「纯静态」——没有后端，数据全在浏览器里。
//   从 Day 15 起作品要联网，这个云函数就是第一个跑在云端的接口。
//   它只回答一个问题：「后端还活着吗、公网能不能访问到？」
//   后续业务接口（热搜列表 /api/hot、收藏 /api/favorites……）都照这个套路往里加。
//
// 对外接口：GET /api/health        （完整契约见仓库根目录 api-contract.md）
// 返回 JSON：{ "ok": true, "service": "hot-search-demo", "time": "<服务器时间>" }
//
// 设计约束（按任务要求）：
//   - 只实现 GET /api/health；
//   - 不连数据库；
//   - 不写任何业务逻辑。
//
// 一句技术说明：
//   CloudBase 的普通云函数「返回一个对象」时，平台会自动把它序列化成 JSON，
//   并把响应头设为 Content-Type: application/json，所以这里直接 return 对象即可，
//   不需要手动 JSON.stringify。

"use strict";

// 服务标识：固定字符串，方便前端核对「我连的是哪个后端」。
const SERVICE_NAME = "hot-search-demo";

/**
 * 云函数入口。
 * event   ：HTTP 访问服务把请求信息放进这里（path / httpMethod / headers / queryStringParameters / body）。
 * context ：运行时上下文，context.namespace 是当前 CloudBase 环境 ID。
 * 本函数只用它来「证明服务在线」，不读取任何业务数据。
 */
exports.main = async (event, context) => {
  return {
    ok: true,
    service: SERVICE_NAME,
    time: new Date().toISOString(), // 服务器当前时间，ISO 8601（UTC），例：2026-10-04T07:47:10.946Z
  };
};
