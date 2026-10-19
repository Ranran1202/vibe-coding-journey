#!/usr/bin/env node
// scripts/day27-trial-self.js
// Day 27 降级自测：以「新用户」视角走核心流程（打开→进详情→点收藏→看反馈），
// 抓下收藏后出现的 toast 瞬间作为「修复已生效」证据。
// 用法：NODE_PATH=<ws>/node_modules node scripts/day27-trial-self.js <输出名> "<url>"
"use strict";
const { execSync } = require("child_process");
const path = require("path");
const { chromium } = require("playwright-core");
const CHROME = "C:\\Users\\86153\\.agent-browser\\browsers\\chrome-154.0.8037.92\\chrome.exe";
const WIN_W = 1280, WIN_H = 860;
const OUT = process.argv[2] || "day27-trial-self";
const URL = process.argv[3];
if (!URL) { console.error("用法: node scripts/day27-trial-self.js <输出名> <url>"); process.exit(2); }

(async () => {
  const browser = await chromium.launch({
    headless: false, executablePath: CHROME,
    args: ["--window-size=" + WIN_W + "," + WIN_H, "--window-position=0,0", "--disable-extensions"],
  });
  const page = await browser.newContext({ viewport: null }).then(c => c.newPage());
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const gate = page.locator("text=确定访问");
  if (await gate.count() > 0) { await gate.first().click().catch(() => {}); await page.waitForTimeout(1500); }
  // 等热搜列表渲染
  await page.waitForSelector(".hot-item", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  // 进入第一条详情（整行 .hot-item 可点）
  await page.locator(".hot-item").first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector(".btn-fav-toggle", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  // 点收藏（详情页 btn-fav-toggle）
  await page.locator(".btn-fav-toggle").first().click({ timeout: 8000 }).catch(() => {});
  // 等 toast 出现（toast 1.6 秒后淡出）——出现瞬间立刻页面级截图，必中
  await page.waitForSelector(".toast.show", { timeout: 5000 }).catch(() => {});
  await page.screenshot({ path: path.resolve(__dirname, "..", "tmp", OUT + "-toast.png") });
  console.log("页面级 toast 截图已保存 tmp/" + OUT + "-toast.png");
  const hasToast = await page.locator(".toast.show").count();
  const toastText = hasToast ? await page.locator(".toast.show").first().textContent() : "(无 toast)";
  console.log("收藏后 toast 文本:", toastText);
  // 激活窗口后截 1280x860
  const act =
    "Add-Type '\"using System;using System.Runtime.InteropServices;public class W{[DllImport(\\\"user32.dll\\\")]public static extern bool SetForegroundWindow(IntPtr h);}\"';" +
    "$p=Get-Process chrome -ErrorAction SilentlyContinue|Where-Object{$_.MainWindowHandle-ne 0}|Select-Object -First 1;if($p){[W]::SetForegroundWindow($p.MainWindowHandle)|Out-Null;Start-Sleep -Milliseconds 800}";
  execSync('powershell -NoProfile -Command "' + act + '"', { timeout: 15000 });
  const png = path.resolve(__dirname, "..", "tmp", OUT + ".png").replace(/\\/g, "/");
  const ps = "Add-Type -AssemblyName System.Windows.Forms,System.Drawing;$b=New-Object System.Drawing.Bitmap " + WIN_W + "," + WIN_H + ";$g=[System.Drawing.Graphics]::FromImage($b);$g.CopyFromScreen(0,0,0,0,$b.Size);$b.Save('" + png + "');$g.Dispose();$b.Dispose()";
  execSync('powershell -NoProfile -Command "' + ps + '"', { timeout: 30000 });
  await browser.close();
  console.log("已保存 " + png + "（toast 出现=" + (hasToast > 0) + "）");
})();
