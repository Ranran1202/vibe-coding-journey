// my-app/tests/mock-api.cjs
// 测试专用：把「云端接口」打桩成本地夹具，让 jsdom 里的页面走**真实代码路径**
// （currentApiBase → fetch(/api/hot) → 渲染），而不是依赖任何内置数据。
//
// 重要区别：
//   · 这是**测试夹具**，只存在于 tests/ 目录，不会进页面；
//   · 页面本体（index.html + js/*.js）已不含任何内置假数据——原 js/data.js 已删除。
//
// 打桩地址必须与真实部署一致：jsdom 的 url 用 HOST，页面才能从主机名反推出接口域名。

// 打桩主机名：Day 23 安全审计修复——不再把真实环境 ID 写死在代码里。
// 本地跑测试时如需对齐真实主机名，用环境变量传入：MOCK_HOST=<你的托管域名> node tests/xxx.cjs
// 默认值是明显的假域名（demo-env-000000），只为满足「页面从主机名反推接口域名」的代码路径。
const HOST = process.env.MOCK_HOST || "demo-env-000000.tcloudbaseapp.com";

// 夹具：5 条，覆盖微博 / 抖音 / B站 三个平台（与 js/config.js 的 BOARDS 一致）
const HOT = [
  { id: "weibo-1-d0101", rank: 1, title: "今冬首场初雪刷屏", heat: "523 万",
    platform: "weibo", url: "https://s.weibo.com/weibo?q=chuxue",
    date: "2026-10-16", createdAt: "2026-10-16T11:00:00+08:00" },
  { id: "weibo-2-d0101", rank: 2, title: "新款折叠屏手机发布", heat: "412 万",
    platform: "weibo", url: "https://s.weibo.com/weibo?q=zhedie",
    date: "2026-10-16", createdAt: "2026-10-16T11:00:00+08:00" },
  { id: "douyin-1-d0101", rank: 1, title: "这部剧大结局引热议", heat: "388 万",
    platform: "douyin", url: "https://www.douyin.com/search/dajieju",
    date: "2026-10-16", createdAt: "2026-10-16T11:00:00+08:00" },
  { id: "douyin-2-d0101", rank: 2, title: "周末周边游攻略走红", heat: "301 万",
    platform: "douyin", url: "https://www.douyin.com/search/zhoubianyou",
    date: "2026-10-16", createdAt: "2026-10-16T11:00:00+08:00" },
  { id: "bilibili-1-d0101", rank: 1, title: "UP主复刻经典名场面", heat: "276 万",
    platform: "bilibili", url: "https://search.bilibili.com/all?keyword=fuke",
    date: "2026-10-16", createdAt: "2026-10-16T11:00:00+08:00" }
];

function jsonResponse(body, status) {
  const code = status || 200;
  return Promise.resolve({
    ok: code < 400,
    status: code,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

/** 在 jsdom 的 window 上装一个假的 fetch，按接口路径返回夹具。 */
function installMockApi(window) {
  window.fetch = function (url) {
    const u = String(url || "");
    if (u.indexOf("/api/hot") !== -1) {
      const m = u.match(/[?&]platform=([^&]+)/);
      const platform = m ? decodeURIComponent(m[1]) : null;
      const data = platform ? HOT.filter((d) => d.platform === platform) : HOT;
      return jsonResponse({ ok: true, data, count: data.length, source: "synced", date: "2026-10-16" });
    }
    if (u.indexOf("/api/health") !== -1) {
      return jsonResponse({ ok: true, service: "hot-search-demo", time: new Date().toISOString() });
    }
    if (u.indexOf("/api/favorites") !== -1) {
      return jsonResponse({ ok: true, data: { id: "fav-test-1", trendId: HOT[0].id } }, 201);
    }
    return jsonResponse({ ok: false, error: "未打桩的接口：" + u }, 404);
  };
}

module.exports = { HOST, HOT, installMockApi };
