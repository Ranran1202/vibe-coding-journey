// scripts/sync-shared.js —— 把数据访问层复制到各个云函数目录
//
// 为什么要这个脚本：
//   CloudBase 云函数是**按目录整体打包上传**的，云函数里写 `require("../shared/db")`
//   在本地能跑、部署到云端就会「找不到模块」——因为上传的压缩包里根本没有 shared/ 这个目录。
//   所以共享代码必须**物理复制**进每个函数目录（这里是 `lib/db.js`）。
//
// 用法（改完 shared/db.js 之后跑一次，再部署）：
//   node scripts/sync-shared.js
//
// 它会把 shared/db.js 原样复制到下面这些云函数的 lib/db.js，并在副本头部打上「自动生成」标记。
// ⚠️ 副本不要手改：手改的内容下次跑脚本就会被覆盖，而且会和唯一真源对不上。

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "shared", "db.js");

// 只有这些函数需要查库（health 是纯探针，不连数据库，跳过）
const TARGETS = ["hot", "favorites", "sync", "drama-episodes", "drama-watchlogs"];

const BANNER =
  "// ⚠️ 本文件由 scripts/sync-shared.js 从 shared/db.js 自动复制生成，**不要手改**。\n" +
  "//    要改数据库操作请改 shared/db.js，然后重新跑：node scripts/sync-shared.js\n" +
  "//    再部署：tcb fn deploy <函数名> -e \"$ENV\" --force\n\n";

function main() {
  if (!fs.existsSync(SRC)) {
    console.error("找不到源文件：" + SRC);
    process.exit(1);
  }

  const source = fs.readFileSync(SRC, "utf8");
  // 幂等：源里万一已经带了 banner（比如误操作），先去掉再统一加，避免叠加
  const body = source.replace(/^\/\/ ⚠️ 本文件由 scripts\/sync-shared\.js[\s\S]*?\n\n/, "");
  const content = BANNER + body;

  console.log("数据源：shared/db.js（" + source.length + " 字节）\n");
  TARGETS.forEach(function (fn) {
    const dir = path.join(ROOT, "cloudfunctions", fn, "lib");
    const dest = path.join(dir, "db.js");
    fs.mkdirSync(dir, { recursive: true });
    const before = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : null;
    fs.writeFileSync(dest, content, "utf8");
    const changed = before === null ? "新建" : before === content ? "无变化" : "已更新";
    console.log("  " + fn.padEnd(16) + " → cloudfunctions/" + fn + "/lib/db.js  [" + changed + "]");
  });
  console.log("\n完成。下一步：tcb fn deploy <函数名> -e \"$ENV\" --force");
}

main();
