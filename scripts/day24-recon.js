// scripts/day24-recon.js
// Day 24 步骤①复现：用无头 Chrome 打开线上真实页面，抓 F12 控制台输出、
// 失败的网络请求、以及页面最终渲染状态——找真实 Bug，不做任何修改。
"use strict";

const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");

const ROOT = path.resolve(__dirname, "..");
const envId = require(path.join(ROOT, "cloudbaserc.json")).envId;
const PAGE = "https://" + envId + "-1500247035.tcloudbaseapp.com/";
const CHROME = "C:\\Users\\86153\\.agent-browser\\browsers\\chrome-154.0.8037.92\\chrome.exe";

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();

  const consoleMsgs = [];
  const pageErrors = [];
  const netFailures = [];
  const requests = [];
  const allReqs = [];

  page.on("console", (m) => {
    consoleMsgs.push({ type: m.type(), text: m.text() });
  });
  page.on("pageerror", (e) => {
    pageErrors.push(String((e && e.stack) || e));
  });
  page.on("requestfailed", (r) => {
    netFailures.push({
      url: r.url().split("?")[0],
      method: r.method(),
      failure: r.failure() ? String(r.failure().errorText) : "?",
    });
  });
  page.on("response", (r) => {
    const entry = { url: r.url().split("?")[0], status: r.status() };
    allReqs.push(entry);
    if (r.status() >= 400) {
      requests.push(entry);
    }
  });

  console.log("打开线上页面：" + PAGE.replace(envId, "<env-id>"));
  await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 30000 });

  // CloudBase 测试域名有平台中间页（标题「风险提醒」，404 状态 + 3s 倒计时按钮），
  // 真实用户点「确定访问」即可穿过。勘察要模拟真实用户：等按钮可点后点击，再等跳转。
  if ((await page.title()) === "风险提醒") {
    console.log("遇到平台测试域名中间页，点击「确定访问」穿过…");
    const btn = page.locator("#submitBtn");
    await btn.waitFor({ state: "visible", timeout: 10000 });
    // 按钮 disabled 到倒计时结束，轮询到可点
    for (let i = 0; i < 40; i++) {
      if (await btn.isEnabled()) break;
      await page.waitForTimeout(500);
    }
    await btn.click();
    await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  }

  await page.waitForTimeout(2500);

  // 页面最终状态：榜单卡片数 / 条目数 / 是否错误态 / 各平台分区
  const state = await page.evaluate(() => {
    const cards = document.querySelectorAll("#hotList .board-card");
    const items = document.querySelectorAll("#hotList .hot-item");
    const errBox = document.querySelector("#hotList .error-box");
    const loadingBox = document.querySelector("#hotList .loading-box");
    const boards = Array.from(document.querySelectorAll("#hotList .board-card")).map((b) => ({
      name: (b.querySelector(".board-name") || {}).textContent || "?",
      count: b.querySelectorAll(".hot-item").length,
      empty: Boolean(b.querySelector(".board-empty")),
    }));
    return {
      title: document.title,
      url: location.href,
      hash: location.hash,
      boardCount: cards.length,
      itemCount: items.length,
      hasErrorBox: Boolean(errBox),
      errorText: errBox ? errBox.textContent.trim().slice(0, 120) : null,
      isLoadingBox: Boolean(loadingBox),
      boards: boards,
      updateTime: (document.getElementById("updateTime") || {}).textContent || "",
      dataSource: (document.getElementById("dataSourceBadge") || {}).textContent || "",
      resultCount: (document.getElementById("resultCount") || {}).textContent || "",
      bodyTextHead: document.body.innerText.replace(/\s+/g, " ").slice(0, 160),
    };
  });

  const report = {
    page: PAGE.replace(envId, "<env-id>"),
    state: state,
    consoleMessages: consoleMsgs,
    pageErrors: pageErrors,
    networkFailures: netFailures,
    httpErrors: requests,
    allRequests: allReqs,
  };
  fs.writeFileSync(path.join(ROOT, "tmp/day24-recon.json"), JSON.stringify(report, null, 2));

  console.log("===== 全部请求 " + allReqs.length + " 条 =====");
  allReqs.forEach((r) => console.log("  " + r.status + " " + r.url.replace(envId, "<env-id>")));

  console.log("===== 控制台输出 " + consoleMsgs.length + " 条 =====");
  consoleMsgs.forEach((m) => console.log("[" + m.type + "] " + m.text.slice(0, 200)));
  console.log("===== 页面异常 " + pageErrors.length + " 条 =====");
  pageErrors.forEach((e) => console.log(e.slice(0, 300)));
  console.log("===== 网络失败 " + netFailures.length + " 条 =====");
  netFailures.forEach((f) => console.log(JSON.stringify(f)));
  console.log("===== HTTP>=400 " + requests.length + " 条 =====");
  requests.forEach((r) => console.log(JSON.stringify(r)));
  console.log("===== 页面状态 =====");
  console.log(JSON.stringify(state, null, 2));

  await browser.close();
})().catch((e) => {
  console.error("勘察脚本异常：" + String((e && e.stack) || e));
  process.exitCode = 1;
});
