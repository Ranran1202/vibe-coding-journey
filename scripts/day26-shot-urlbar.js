#!/usr/bin/env node
// scripts/day26-shot-urlbar.js
// Day 26 专用截图：带浏览器地址栏 + 页面内容。
// 原理：Playwright 启动**有头** Chrome 打开目标 URL（地址栏可见），自动点掉
//       CloudBase 测试域名的「风险提醒」拦截页，等渲染后调 PowerShell 截屏。
//       只截 (0,0,1280,860) 窗口区域——Playwright 自身截图截不到浏览器 UI。
// 用法：NODE_PATH=<workspace>/node_modules node scripts/day26-shot-urlbar.js <输出名> "<url>"
"use strict";
const { execSync } = require("child_process");
const path = require("path");
const { chromium } = require("playwright-core");

const CHROME = "C:\\Users\\86153\\.agent-browser\\browsers\\chrome-154.0.8037.92\\chrome.exe";
const WIN_W = 1280, WIN_H = 860;
const OUT = process.argv[2] || "day26-shot";
const URL = process.argv[3];
if (!URL) { console.error("用法: node scripts/day26-shot-urlbar.js <输出名> <url>"); process.exit(2); }

(async () => {
  const browser = await chromium.launch({
    headless: false,
    executablePath: CHROME,
    args: [
      "--window-size=" + WIN_W + "," + WIN_H,
      "--window-position=0,0",
      "--disable-extensions",
    ],
  });
  const ctx = await browser.newContext({ viewport: null });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  // CloudBase 测试域名风险提醒页：点「确定访问」进入真实页面
  await page.waitForTimeout(1500);
  const gate = page.locator("text=确定访问");
  if (await gate.count() > 0) {
    await gate.first().click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(3500); // 等接口数据渲染 + 地址栏稳定
  const png = path.resolve(__dirname, "..", "tmp", OUT + ".png").replace(/\\/g, "/");
  // 先把 Chrome 窗口激活到前台（避免截到其他窗口），再截屏
  const act =
    "Add-Type '\"using System;using System.Runtime.InteropServices;public class W{[DllImport(\\\"user32.dll\\\")]public static extern bool SetForegroundWindow(IntPtr h);}\"';" +
    "$p=Get-Process chrome -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1;" +
    "if($p){[W]::SetForegroundWindow($p.MainWindowHandle)|Out-Null;Start-Sleep -Milliseconds 800}";
  execSync('powershell -NoProfile -Command "' + act + '"', { timeout: 15000 });
  const ps =
    "Add-Type -AssemblyName System.Windows.Forms,System.Drawing;" +
    "$bmp=New-Object System.Drawing.Bitmap " + WIN_W + "," + WIN_H + ";" +
    "$g=[System.Drawing.Graphics]::FromImage($bmp);" +
    "$g.CopyFromScreen(0,0,0,0,$bmp.Size);" +
    "$bmp.Save('" + png + "');" +
    "$g.Dispose();$bmp.Dispose()";
  execSync('powershell -NoProfile -Command "' + ps + '"', { timeout: 30000 });
  await browser.close();
  console.log("已保存 " + png);
})();
