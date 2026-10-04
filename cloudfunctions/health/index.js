// cloudfunctions/health/index.js
// Day 15 · 板块②：健康检查云函数（CloudBase「普通云函数」）
//
// 它在整个作品里的位置：
//   第 1–14 天的作品是「纯静态」——没有后端，数据全在浏览器里。
//   从 Day 15 起作品要联网，这个云函数就是第一个跑在云端的接口，
//   它只回答一个问题：「后端还活着吗、公网能不能访问到？」
//   Day 16–20 的业务接口（热搜列表、平台清单……）都照这个套路往里加。
//
// 对外接口：GET /api/health   （完整契约见仓库根目录 api-contract.md）
// 返回格式：统一响应信封 { code, data, message }
//
// 一句技术说明：
//   CloudBase 的普通云函数「返回一个对象」时，平台会自动把它序列化成 JSON
//   并把响应头设为 Content-Type: application/json，所以这里直接 return 对象即可，
//   不需要手动 JSON.stringify。

"use strict";

// 服务标识（写死在代码里，方便前端核对「我连的是哪个后端」）
const SERVICE_NAME = "hot-search-api";
const SERVICE_VERSION = "0.1.0";

// 函数实例的启动时间：用来估算「本次实例已经运行了多久」。
// 冷启动（实例被回收后重新拉起）会重置这个值，所以它能顺带暴露冷启动现象。
const STARTED_AT = Date.now();

// event   ：HTTP 访问服务会把请求信息放进这里（path / httpMethod / headers / queryStringParameters / body）
// context ：运行时上下文，context.namespace 就是当前 CloudBase 环境 ID
exports.main = async (event, context) => {
  const ctx = context || {};
  const evt = event || {};

  return {
    code: 0,
    message: "ok",
    data: {
      service: SERVICE_NAME,
      status: "healthy",
      version: SERVICE_VERSION,

      // 环境 ID（CloudBase 会把它注入 context.namespace；取不到时回退读环境变量）
      envId: ctx.namespace || process.env.TCB_ENV || "unknown",

      // 本次请求实际用的 HTTP 方法，用来确认「请求确实到达了函数」
      requestMethod: String(evt.httpMethod || evt.method || "GET").toUpperCase(),

      // 服务器当前时间（ISO 8601，UTC）
      serverTime: new Date().toISOString(),

      // 本实例已运行秒数（值很小 = 刚冷启动）
      uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000)
    }
  };
};
