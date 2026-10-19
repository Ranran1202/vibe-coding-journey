// scripts/vp-secret-scan.cjs
// 发布前检查 · A4「代码和 Git 里搜索不到硬编码密钥」的执行体
// 由 scripts/verify-project.sh 调用，人也可以直接 node scripts/vp-secret-scan.cjs 单跑。
//
// 扫三遍（对应检查项名「代码和 Git」）：
//   ① git 工作区被跟踪文件（git grep -n -I -E <模式>）
//   ② git 全历史（git grep ... $(git rev-list --all)）
//   ③ 未跟踪未忽略文件（git ls-files --others --exclude-standard）
//      ——本地有密钥文件但忘了提交/提交前删掉的情况，只有这路能抓到
//
// 判定分两层（顺序不能反）：
//   第一层 · 排除清单：已知误报，逐条带理由（Day 23 安全审计实测沉淀，新增文档须同步登记）
//   第二层 · 「像真密钥」启发式：过了排除清单的命中，再看它像不像真密钥
//
// 输出：stdout 单行 「状态\x1f证据」（\x1f 为字段分隔符，供 verify-project.sh 记录）
//       明细（每一处命中的判定与理由）写 tmp/vp-secret-details.txt
//       退出码：0 = 无真实密钥；1 = 发现疑似真实密钥

"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const US = String.fromCharCode(31); // 字段分隔符

// 特征词模式（Day 23 安全审计用过的那套，含带凭据连接串）
const PATTERN =
  "password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|" +
  "BEGIN [A-Z ]*PRIVATE KEY|AKID|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|credential|" +
  "(postgres|mysql|mongodb|redis|amqp)://[^/ :]+:[^/ @]+@";

// ---------- 第一层：排除清单（已知误报，带理由） ----------
// key = 文件路径（相对仓库根）；value = 判为误报的理由
const EXCLUDED_FILES = {
  ".gitignore": "忽略规则行本身含 .env 等模式串（Day 23 已判定）",
  "AGENTS.md": "宪法安全约定条款，出现 password/token 等词是规则文本，不是值",
  "cloudfunctions/README.md": "接口说明文档，命中处为字段名/示例说明",
  "api-contract.md": "接口契约文档，命中处为字段名/示例说明",
  "ai-drama/api-contract.md": "接口契约文档，命中处为字段名/示例说明",
  ".env.example": "密钥治理模板文件，只含占位符与说明（Day 23 建立，git 已跟踪）",
  "my-app/tests/mock-api.cjs": "本地测试夹具，token 为术语用法（Day 23 已判定）",
  ".workbuddy/skills/verify-project/SKILL.md": "本 Skill 文档，含检查模式原文",
  "scripts/vp-secret-scan.cjs": "扫描器自身，含模式定义",
  "scripts/verify-project.sh": "检查脚本，含模式定义",
  "day23-security-audit.md": "Day 23 审计报告，含搜索模式原文",
  "day25-verify-project.md": "Day 25 交付文档，含检查模式原文",
  "HANDOFF.md": "会话交接文档，命中处为「本文件不含敏感信息」的安全约定说明文字",
  "ai-drama/comfyui/scenes/wan_i2v.py": "ComfyUI WIP 脚本，token 为「API 调用次数」术语（「一个 token 都不烧」）",
};

// ---------- 第二层：「像真密钥」启发式 ----------
// 连接串里的凭据是「文档占位符」时不算真密钥（第一轮实测误报的修正）：
// user:pass / user:password / username:password / xxx… / your-… / <…> / changeme / example
// —— 设计文档的 .env.example 模板块里全是这类值（本项目 ai-drama/TECH_DESIGN.md §7.2 实测命中 46 次）
function isPlaceholderCreds(creds) {
  return /^(user|username|db_user|dbuser|your[_-]?\w*|<[^>]*>|x{3,}|\*+|changeme|change_me|example|password|pass|secret|your_password|postgres|mysql|root|admin)(:.*)?$/i.test(
    creds
  );
}

function looksLikeRealSecret(line) {
  const conn = line.match(/(postgres|mysql|mongodb|redis|amqp):\/\/([^/ :]+):([^/ @]+)@/i);
  if (conn) {
    if (isPlaceholderCreds(conn[2] + ":" + conn[3])) return null; // 文档占位符，不是真密钥
    return "带凭据的数据库连接串";
  }
  if (/sk-[A-Za-z0-9]{20,}/.test(line)) return "sk- 前缀长随机串";
  if (/AKIA[0-9A-Z]{16}/.test(line)) return "AWS AccessKeyId 形态";
  if (/BEGIN [A-Z ]*PRIVATE KEY/.test(line)) return "私钥文件头";
  if (/(api[_-]?key|access[_-]?key|secret|token|password|passwd|credential)\s*[:=]\s*["']?[A-Za-z0-9/+_\-]{20,}/i.test(line))
    return "键=值 形式的长随机值（≥20 位）";
  if (/Bearer\s+[A-Za-z0-9._\-]{20,}/.test(line)) return "Bearer 长 token";
  return null;
}

// 打码分两级：
//   maskLight：环境 ID 与租户号——任何输出都不出现（项目纪律）
//  maskHard  ：给「真实命中」行用，额外打掉 20 位以上高熵串（防密钥明文进输出）
const ENV_ID = require(path.join(ROOT, "cloudbaserc.json")).envId;
const TENANT = "1500247035"; // 静态托管租户号（与 verify-project.sh 保持一致）
function maskLight(s) {
  return String(s).split(ENV_ID).join("wb-te***").split(TENANT).join("***");
}
function maskHard(s) {
  return maskLight(s).replace(/([A-Za-z0-9/+_\-]){20,}/g, (m) => m.slice(0, 4) + "***(" + m.length + "位)");
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (e.status === 1) return e.stdout || ""; // git grep 无命中时退出码为 1，属正常
    throw e;
  }
}

// 解析 git grep 输出：工作区是 path:line:content；带 rev 时是 rev:path:line:content
function parseGrep(text, withRev) {
  const out = [];
  String(text || "")
    .split("\n")
    .filter(Boolean)
    .forEach((raw) => {
      const parts = raw.split(":");
      if (withRev) {
        if (parts.length < 4) return;
        out.push({ rev: parts[0], file: parts[1], line: parts[2], content: parts.slice(3).join(":") });
      } else {
        if (parts.length < 3) return;
        out.push({ file: parts[0], line: parts[1], content: parts.slice(2).join(":") });
      }
    });
  return out;
}

function main() {
  const startedAt = new Date().toISOString();
  const re = new RegExp(PATTERN); // git grep -E 的 ERE 与 JS RegExp 语法兼容（字符类/量词/分组一致）

  // ① 工作区被跟踪文件
  const workHits = parseGrep(git(["grep", "-n", "-I", "-E", PATTERN]), false);
  // ② git 全历史
  const revs = git(["rev-list", "--all"]).trim().split(/\s+/).filter(Boolean);
  const histHits = revs.length ? parseGrep(git(["grep", "-n", "-I", "-E", PATTERN].concat(revs)), true) : [];
  // ③ 未跟踪未忽略文件（排除 tmp/：本 Skill 与历史验证的运行产物目录——
  //    接口响应体与自产明细，扫它等于自我引用；旧版 check.sh 排除 tmp/vp-run 的同款理由）
  const untrackedHits = [];
  git(["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter((f) => f && !f.startsWith("tmp/"))
    .forEach((f) => {
      let text;
      try {
        const st = fs.statSync(path.join(ROOT, f));
        if (!st.isFile() || st.size > 1024 * 1024) return; // 跳过目录与超大文件
        text = fs.readFileSync(path.join(ROOT, f), "utf8");
      } catch (e) {
        return;
      }
      if (text.indexOf("\0") !== -1) return; // 二进制文件跳过（git grep -I 的同款行为）
      text.split("\n").forEach((line, i) => {
        if (re.test(line)) untrackedHits.push({ file: f, line: String(i + 1), content: line });
      });
    });

  const details = [];
  let realCount = 0;
  let benignCount = 0;

  function judge(hit, scope) {
    const where = scope + " " + hit.file + ":" + hit.line;
    const reason = EXCLUDED_FILES[hit.file];
    if (reason) {
      // 已知误报：行内容原样展示（只打码环境 ID/租户号），方便人工核对排除理由
      benignCount++;
      details.push("【误报·排除清单】" + where + "  " + maskLight(hit.content) + "  —— " + reason);
      return;
    }
    const verdict = looksLikeRealSecret(hit.content);
    if (verdict) {
      // 真实命中：重打码，防密钥明文进输出
      realCount++;
      details.push("【真实命中】" + where + "  " + maskHard(hit.content) + "  —— " + verdict);
    } else {
      benignCount++;
      details.push("【误报·启发式】" + where + "  " + maskLight(hit.content) + "  —— 含特征词但不像真密钥（无长随机值/连接串/私钥头）");
    }
  }

  workHits.forEach((h) => judge(h, "[工作区]"));
  histHits.forEach((h) => judge(h, "[历史 " + h.rev.slice(0, 7) + "]"));
  untrackedHits.forEach((h) => judge(h, "[未跟踪]"));

  fs.writeFileSync(
    path.join(ROOT, "tmp", "vp-secret-details.txt"),
    "密钥扫描明细 · " + startedAt + "\n" +
      "模式：" + PATTERN + "\n" +
      "范围：工作区被跟踪文件 + git 全历史 " + revs.length + " 个提交 + 未跟踪未忽略文件（排除 tmp/）\n" +
      "原始命中：工作区 " + workHits.length + " 处 + 历史 " + histHits.length + " 行 + 未跟踪 " + untrackedHits.length + " 处\n" +
      "排除误报 " + benignCount + " 处 · 真实命中 " + realCount + " 处\n" +
      "------------------------------------------------------------\n" +
      (details.length ? details.join("\n") : "（零命中）") +
      "\n",
    "utf8"
  );

  if (realCount === 0) {
    console.log(
      "PASS" + US +
        "原始命中：工作区 " + workHits.length + " 处 + 历史 " + histHits.length +
        " 行 + 未跟踪 " + untrackedHits.length + " 处（全历史 " + revs.length +
        " 个提交）；排除误报 " + benignCount +
        " 处（排除清单+启发式逐条判定，明细见 tmp/vp-secret-details.txt）；真实密钥 0 处"
    );
    process.exit(0);
  } else {
    const first = details.filter((d) => d.indexOf("【真实命中】") === 0).slice(0, 3);
    console.log(
      "FAIL" + US +
        "真实命中 " + realCount + " 处：" + first.join(" ｜ ") +
        "（完整明细见 tmp/vp-secret-details.txt）"
    );
    process.exit(1);
  }
}

main();
