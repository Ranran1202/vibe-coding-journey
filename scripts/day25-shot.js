// scripts/day25-shot.js
// Day 25 取证截图：用 Playwright + 无头 Chrome 截发布前检查取证页。
// 路线与 Day 24 一致（本环境 msedge --screenshot 静默失败，Playwright 路线稳定）。
// 用法：先 bash scripts/verify-project.sh 生成记录，再
//   NODE_PATH=<workspace>/node_modules node scripts/day25-shot.js <输出文件名>
"use strict";

const { chromium } = require("playwright-core");
const path = require("path");

const CHROME = "C:\\Users\\86153\\.agent-browser\\browsers\\chrome-154.0.8037.92\\chrome.exe";
const ROOT = path.resolve(__dirname, "..");
const OUT_NAME = process.argv[2] || "day25-verify-project-break.png";

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const htmlPath = path.join(ROOT, "tmp", "verify-project-shot.html").replace(/\\/g, "/");
  await page.goto("file:///" + htmlPath);
  await page.waitForTimeout(400);
  const out = path.join(ROOT, "tmp", OUT_NAME);
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  console.log("已截图 tmp/" + OUT_NAME);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
