// scripts/sync-shared.js —— 把数据访问层复制到各个云函数目录
//
// 为什么要这个脚本：
//   CloudBase 云函数是**按目录整体打包上传**的，云函数里写 `require("../shared/xxx")`
//   在本地能跑、部署到云端就会「找不到模块」——因为上传的压缩包里根本没有 shared/ 这个目录。
//   所以共享代码必须**物理复制**进每个函数目录（`lib/`）。
//
// Day 20 起数据访问层按表分家，每个云函数只复制**它用到的那几个文件**：
//   shared/db.js                      → 连库 + 通用工具（所有查库函数的公共底座）
//   shared/trendsRepository.js        → trends 表查询        → hot / favorites / sync 用
//   shared/favoritesRepository.js     → favorites 表查询     → favorites 用
//   shared/dramaEpisodesRepository.js → drama_episodes 表查询 → drama-episodes 用
//   shared/dramaWatchLogsRepository.js → drama_watch_logs 表查询 → drama-watchlogs 用
//
// 用法（改完 shared/ 下任何文件之后跑一次，再部署）：
//   node scripts/sync-shared.js
//
// ⚠️ lib/ 下的副本都是自动生成的，**不要手改**：手改的内容下次跑脚本就会被覆盖，
//    而且会和唯一真源对不上。要改数据访问 → 改 shared/ 下对应源文件 → 重新同步 → 部署。

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SHARED = path.join(ROOT, "shared");

// 每个云函数需要哪些数据层文件（health 是纯探针，不连数据库，跳过）
const PLAN = {
  "hot": ["db.js", "trendsRepository.js"],
  "favorites": ["db.js", "trendsRepository.js", "favoritesRepository.js"],
  "sync": ["db.js", "trendsRepository.js"],
  "drama-episodes": ["db.js", "dramaEpisodesRepository.js"],
  "drama-watchlogs": ["db.js", "dramaWatchLogsRepository.js"],
};

const BANNER =
  "// ⚠️ 本文件由 scripts/sync-shared.js 从 shared/ 自动复制生成，**不要手改**。\n" +
  "//    要改数据库操作请改 shared/ 下的源文件（db.js 或 *Repository.js），然后重新跑：\n" +
  "//    node scripts/sync-shared.js  →  tcb fn deploy <函数名> -e \"$ENV\" --force\n\n";

function main() {
  // 先确认 PLAN 里列的源文件都存在，缺一个就别继续（防止半新半旧地部署出去）
  const needed = new Set();
  Object.keys(PLAN).forEach(function (fn) {
    PLAN[fn].forEach(function (f) {
      needed.add(f);
    });
  });
  const missing = Array.from(needed).filter(function (f) {
    return !fs.existsSync(path.join(SHARED, f));
  });
  if (missing.length) {
    console.error("shared/ 下缺文件：" + missing.join(", "));
    process.exit(1);
  }

  console.log("数据源：shared/（" + needed.size + " 个文件，" + Object.keys(PLAN).length + " 个云函数）\n");

  let totalNew = 0;
  let totalUpdated = 0;

  Object.keys(PLAN).forEach(function (fn) {
    const dir = path.join(ROOT, "cloudfunctions", fn, "lib");
    fs.mkdirSync(dir, { recursive: true });
    PLAN[fn].forEach(function (file) {
      const source = fs.readFileSync(path.join(SHARED, file), "utf8");
      // 幂等：源里万一已经带了 banner（比如误操作），先去掉再统一加，避免叠加
      const body = source.replace(/^\/\/ ⚠️ 本文件由 scripts\/sync-shared\.js[\s\S]*?\n\n/, "");
      const content = BANNER + body;
      const dest = path.join(dir, file);
      const before = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : null;
      fs.writeFileSync(dest, content, "utf8");
      const changed = before === null ? "新建" : before === content ? "无变化" : "已更新";
      if (changed === "新建") totalNew++;
      if (changed === "已更新") totalUpdated++;
      console.log(
        "  " + fn.padEnd(16) + " → cloudfunctions/" + fn + "/lib/" + file.padEnd(26) + "[" + changed + "]"
      );
    });
  });

  console.log(
    "\n完成：新建 " + totalNew + " 份、更新 " + totalUpdated + " 份。下一步：tcb fn deploy <函数名> -e \"$ENV\" --force"
  );
}

main();
