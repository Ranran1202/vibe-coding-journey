#!/usr/bin/env bash
# ============================================================
# verify-project · 发布前检查（Skill「verify-project」的可执行部分）
#
# 用法：
#   bash scripts/verify-project.sh          # 两条线全查（默认，13 项）
#   bash scripts/verify-project.sh hot      # 只查「今日热搜」+ 仓库级项（A1–A7）
#   bash scripts/verify-project.sh drama    # 只查「我的AI漫」（B1–B6）
#
# 输出：每项 [PASS|FAIL|未执行] + 通过标准 + 证据（只写实测值，不写模糊话）
# 退出码：0 = 无 FAIL（可发布）；1 = 有 FAIL（先修再发）
# 逐项记录写 tmp/vp-records.txt（供 scripts/verify-project-shot.js 渲染取证页）
#
# 检查项的来历与完整定义见 .workbuddy/skills/verify-project/SKILL.md
# ============================================================
set -u
export MSYS_NO_PATHCONV=1
export PATH="$PATH:/c/Users/86153/.workbuddy/binaries/node/workspace/node_modules/.bin"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
mkdir -p tmp

SUITE="${1:-all}"
case "$SUITE" in
  all|hot|drama) ;;
  *) echo "用法：bash scripts/verify-project.sh [all|hot|drama]"; exit 2 ;;
esac

ENV=$(node -p "require('./cloudbaserc.json').envId" 2>/dev/null)
if [ -z "$ENV" ]; then
  echo "[verify-project] 无法从 cloudbaserc.json 读取 envId（该文件被 .gitignore，只在本地存在；新克隆的仓库要先补上）"
  exit 2
fi
# 环境预检：缺工具早退出，别让检查跑到一半才崩（旧版 check.sh 的同款设计）
command -v tcb  >/dev/null 2>&1 || { echo "[verify-project] 找不到 tcb CLI（应位于 ~/.workbuddy/binaries/node/workspace/node_modules/.bin，PATH 已自动追加）"; exit 2; }
command -v curl >/dev/null 2>&1 || { echo "[verify-project] 找不到 curl"; exit 2; }
command -v node >/dev/null 2>&1 || { echo "[verify-project] 找不到 node"; exit 2; }
# 环境 ID 与租户号属敏感信息：输出一律打码（项目纪律：环境 ID 不打印）
ENV_MASK="${ENV:0:6}***"
TENANT="1500247035"
API="https://${ENV}.service.tcloudbase.com"
API_MASK="https://${ENV_MASK}.service.tcloudbase.com"
STATIC="https://${ENV}-${TENANT}.tcloudbaseapp.com"
STATIC_MASK="https://${ENV_MASK}-***.tcloudbaseapp.com"

US=$'\037'   # 记录文件的字段分隔符
PASS=0; FAIL=0; SKIP=0
RECORDS=tmp/vp-records.txt
: > "$RECORDS"

# 已知待修项（来自 Day 24 记录；修复后从这里移除，该项即转绿）
KNOWN_ISSUES=""

item() { # item <编号> <PASS|FAIL|未执行> <名称> <通过标准> <证据>
  printf '%s%s%s%s%s%s%s%s%s%s%s\n' "$1" "$US" "$2" "$US" "$3" "$US" "$4" "$US" "$5" >> "$RECORDS"
  printf '[%s] %s\n      通过标准：%s\n      证据：%s\n' "$2" "$3" "$4" "$5"
  case "$2" in
    PASS) PASS=$((PASS+1)) ;;
    FAIL) FAIL=$((FAIL+1)) ;;
    *)    SKIP=$((SKIP+1)) ;;
  esac
}

split_us() { _ST="${1%%$US*}"; _EV="${1#*$US}"; }

jval() { # jval <点分键> < 文件：从 JSON 文件里取一个值打印（取不到打印空行）
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);const v=process.argv[1].split('.').reduce((a,k)=>a?a[k]:undefined,j);console.log(typeof v==='object'&&v!==null?JSON.stringify(v):String(v===undefined?'':v))}catch(e){console.log('')}})" "$1"
}

sep() { printf '%s\n' "------------------------------------------------------------"; }

echo "============================================================"
echo " verify-project · 发布前检查 · $(date '+%Y-%m-%d %H:%M:%S')"
echo " 套件：$SUITE（hot = A1–A7 今日热搜+仓库级 · drama = B1–B6 我的AI漫）"
echo " 接口基址（已打码）：$API_MASK"
echo " 静态托管（已打码）：$STATIC_MASK"
echo "============================================================"

# ============================================================
# A 套件 · 今日热搜 + 仓库级（A1–A7）
# ============================================================
run_hot() {

# ---------- A1 公网首页可访问且展示数据库真实数据 ----------
echo "── A1 公网首页可访问且展示数据库真实数据"
A1_CODE=$(curl -s -m 25 -o tmp/vp_index.html -w "%{http_code}" "$STATIC/")
curl -s -m 25 -o tmp/vp_hot.json "$API/api/hot"
# 挂载点断言：页面里得有 id="hotList" 这个渲染容器（旧版 check.sh 的真本事：
# 首页 200 但挂载点丢了 = 接口有数据页面也白屏，光看 HTTP 200 发现不了）
A1_MOUNT=$(grep -c 'id="hotList"' tmp/vp_index.html 2>/dev/null || true)
A1_TITLE=$(grep -o '<title>[^<]*</title>' tmp/vp_index.html 2>/dev/null | head -1 || true)
A1=$(node -e "
const fs=require('fs');const US=String.fromCharCode(31);
let j={};try{j=JSON.parse(fs.readFileSync('tmp/vp_hot.json','utf8'))}catch(e){}
const today=new Date(Date.now()+8*3600*1000).toISOString().slice(0,10);const bad=[];
if(j.ok!==true)bad.push('ok≠true');
if(!Array.isArray(j.data)||j.data.length===0)bad.push('data 为空');
if(j.source!=='synced')bad.push('source='+j.source+'（当天无真实同步数据，首页展示的是历史兜底）');
if(j.date!==today)bad.push('date='+j.date+'≠今天 '+today);
if(bad.length){console.log('FAIL'+US+bad.join('；'))}
else{const pl=[...new Set(j.data.map(r=>r.platform))].join('/');console.log('PASS'+US+'count='+j.data.length+' · source='+j.source+' · date='+j.date+' · 平台='+pl)}
")
split_us "$A1"
if [ "$A1_CODE" = "200" ] && [ "$_ST" = "PASS" ] && [ "${A1_MOUNT:-0}" -ge 1 ]; then
  item "A1" "PASS" "公网首页可访问且展示数据库真实数据" \
    "① curl 静态站根路径返回 HTTP 200 且页面含挂载点 id=\"hotList\"；② GET /api/hot：ok=true 且 data 非空 且 source=synced（当天真实同步，非历史兜底）且 date=今天（北京时间）" \
    "HTTP $A1_CODE · 挂载点 #hotList ×${A1_MOUNT:-0} · 标题 ${A1_TITLE:-未找到} · hot：$_EV"
else
  item "A1" "FAIL" "公网首页可访问且展示数据库真实数据" \
    "① curl 静态站根路径返回 HTTP 200 且页面含挂载点 id=\"hotList\"；② GET /api/hot：ok=true 且 data 非空 且 source=synced 且 date=今天" \
    "HTTP $A1_CODE · 挂载点 #hotList ×${A1_MOUNT:-0} · 标题 ${A1_TITLE:-未找到} · hot：$_EV"
fi

# ---------- A2 GET /api/health 正常 ----------
echo "── A2 GET /api/health 正常"
A2_CODE=$(curl -s -m 25 -o tmp/vp_health.json -w "%{http_code}" "$API/api/health")
A2=$(node -e "
const fs=require('fs');const US=String.fromCharCode(31);
let j={};try{j=JSON.parse(fs.readFileSync('tmp/vp_health.json','utf8'))}catch(e){}
const bad=[];
if(j.ok!==true)bad.push('ok≠true');
if(j.service!=='hot-search-demo')bad.push('service='+j.service+'（不是本项目服务标识）');
const t=j.time?new Date(j.time):null;
if(!t||isNaN(t.getTime()))bad.push('time 不是合法时间');
else{const diff=Math.round(Math.abs(Date.now()-t.getTime())/1000);
  if(diff>300)bad.push('time 与本地时钟相差 '+diff+' 秒（超过 5 分钟）');
  else var okdiff=diff;}
if(bad.length){console.log('FAIL'+US+bad.join('；'))}
else{console.log('PASS'+US+'service='+j.service+' · time='+j.time+'（与本地时钟差 '+okdiff+' 秒）')}
")
split_us "$A2"
if [ "$A2_CODE" = "200" ] && [ "$_ST" = "PASS" ]; then
  item "A2" "PASS" "GET /api/health 正常" \
    "HTTP 200 且 ok=true 且 service=hot-search-demo 且 time 为合法 ISO 时间且与本地时钟相差 ≤5 分钟" \
    "HTTP $A2_CODE · $_EV"
else
  item "A2" "FAIL" "GET /api/health 正常" \
    "HTTP 200 且 ok=true 且 service=hot-search-demo 且 time 合法且时钟差 ≤5 分钟" \
    "HTTP $A2_CODE · $_EV"
fi

# ---------- A3 读写接口各调用一次且结果正确 ----------
echo "── A3 读写接口各调用一次且结果正确（清理残留→写入→判重→读回→改→删→确认消失）"
curl -s -m 25 -o tmp/vp_hot_a3.json "$API/api/hot"
curl -s -m 25 -o tmp/vp_fav_before.json "$API/api/favorites?limit=200"
# 0) 清理以往检查残留的测试收藏（note 含 verify-project，是本 Skill 自己的数据。
#    上轮异常退出没删干净时，残留行会占着候选位，把本轮误判成「无可用候选」）
CLEANED=$(node -e "
const fs=require('fs');
let fav=[];try{fav=JSON.parse(fs.readFileSync('tmp/vp_fav_before.json','utf8')).data||[]}catch(e){}
console.log(fav.filter(r=>typeof r.note==='string'&&r.note.indexOf('verify-project')!==-1).map(r=>r.id).join(' '));
")
CLEANED_N=0
for LID in $CLEANED; do
  CCODE=$(curl -s -m 25 -o /dev/null -w "%{http_code}" -X DELETE "$API/api/favorites/$LID")
  [ "$CCODE" = "200" ] && CLEANED_N=$((CLEANED_N+1))
done
# 清理后重新拉列表，让被残留占位的 trendId 重新成为候选
curl -s -m 25 -o tmp/vp_fav_before.json "$API/api/favorites?limit=200"
TID=$(node -e "
const hot=require('./tmp/vp_hot_a3.json').data||[];
let fav=[];try{fav=require('./tmp/vp_fav_before.json').data||[]}catch(e){}
const have=new Set(fav.map(r=>r.trendId));
const pick=hot.find(r=>!have.has(r.id));
if(pick)console.log([pick.id,pick.platform,pick.title].join('\t'));
")
if [ -z "$TID" ]; then
  item "A3" "未执行" "读写接口各调用一次且结果正确" \
    "选一条未收藏的真实热搜 → POST 写入 → 同 trendId 重复 POST → 409 判重 → GET 读回 → PATCH 改备注 → DELETE 取消 → 再 GET 确认消失" \
    "当日热搜已全部被收藏，找不到未收藏条目，无法完成真实写入验证（人工确认后可换一条历史 trendId 重试）"
else
  IFS=$'\t' read -r W_ID W_PL W_TI <<< "$TID"
  IDEM="verify-project-$(date +%s)"
  BODY=$(node -e "console.log(JSON.stringify({trendId:process.argv[1],platform:process.argv[2],title:process.argv[3],note:'verify-project 发布前自检'}))" "$W_ID" "$W_PL" "$W_TI")
  WCODE=$(curl -s -m 25 -o tmp/vp_write.json -w "%{http_code}" -X POST "$API/api/favorites" \
           -H "Content-Type: application/json" -H "Idempotency-Key: $IDEM" -d "$BODY")
  # 判重断言：同 trendId 再 POST 一次（故意不带幂等键——测的是业务判重，不是幂等回放）→ 409
  DUP2=$(curl -s -m 25 -o tmp/vp_dup.json -w "%{http_code}" -X POST "$API/api/favorites" \
          -H "Content-Type: application/json" -d "$BODY")
  DUP2_ERR=$(jval error < tmp/vp_dup.json)
  FID=$(jval data.id < tmp/vp_write.json)
  curl -s -m 25 -o tmp/vp_fav_after_post.json "$API/api/favorites?limit=200"
  RB1=$(node -e "
const w=require('./tmp/vp_write.json');const after=require('./tmp/vp_fav_after_post.json').data||[];const d=(w&&w.data)||{};
const hit=after.find(r=>r.id===d.id);
console.log(hit?('读回命中 id='+hit.id):('读回未命中（POST 返回的 id='+d.id+'）'));
")
  PCODE=$(curl -s -m 25 -o tmp/vp_patch.json -w "%{http_code}" -X PATCH "$API/api/favorites/$FID" \
           -H "Content-Type: application/json" -d '{"note":"verify-project 自检·已改"}')
  PNOTE=$(jval data.note < tmp/vp_patch.json)
  DCODE=$(curl -s -m 25 -o tmp/vp_delete.json -w "%{http_code}" -X DELETE "$API/api/favorites/$FID")
  DDEL=$(jval data.deleted < tmp/vp_delete.json)
  curl -s -m 25 -o tmp/vp_fav_after_del.json "$API/api/favorites?limit=200"
  RB2=$(node -e "
const fid=process.argv[1];const after=require('./tmp/vp_fav_after_del.json').data||[];
console.log(after.some(r=>r.id===fid)?('仍可见 id='+fid+'（软删除未生效）'):('已不可见 id='+fid));
" "$FID")
  A3OK=1
  [ "$WCODE" = "201" ] || A3OK=0
  [ "$DUP2" = "409" ] || A3OK=0
  case "$DUP2_ERR" in *已经收藏过了*) ;; *) A3OK=0 ;; esac
  case "$RB1" in 读回命中*) ;; *) A3OK=0 ;; esac
  [ "$PCODE" = "200" ] || A3OK=0
  [ "$PNOTE" = "verify-project 自检·已改" ] || A3OK=0
  [ "$DCODE" = "200" ] || A3OK=0
  [ "$DDEL" = "true" ] || A3OK=0
  case "$RB2" in 已不可见*) ;; *) A3OK=0 ;; esac
  A3_EV="清理历史残留 $CLEANED_N 条 · POST(幂等键 $IDEM) → HTTP $WCODE · 重复POST(不带幂等键) → HTTP $DUP2「$DUP2_ERR」· $RB1 · PATCH 改备注 → HTTP $PCODE note=\"$PNOTE\" · DELETE → HTTP $DCODE deleted=$DDEL · $RB2 · 写入 trendId=$W_ID"
  if [ "$A3OK" = "1" ]; then
    item "A3" "PASS" "读写接口各调用一次且结果正确" \
      "POST 返回 201 且 GET 读回命中同一 id；同一 trendId 重复 POST（不带幂等键）→ 409「已经收藏过了」（判重生效，重复写入不许静默成功）；PATCH 返回 200 且 note 已更新；DELETE 返回 200 且 deleted=true；删除后再 GET 列表不含该 id（软删除生效）" \
      "$A3_EV"
  else
    item "A3" "FAIL" "读写接口各调用一次且结果正确" \
      "POST 201 + 读回命中 + 重复 POST 409 + PATCH 200 且 note 更新 + DELETE 200 且 deleted=true + 删除后不可见" \
      "$A3_EV · POST 响应原文 $(head -c 150 tmp/vp_write.json)"
  fi
fi

# ---------- A4 代码和 Git 里搜索不到硬编码密钥 ----------
echo "── A4 代码和 Git 里搜索不到硬编码密钥"
A4=$(node scripts/vp-secret-scan.cjs)
split_us "$A4"
item "A4" "$_ST" "代码和 Git 里搜索不到硬编码密钥" \
  "三路扫描特征词：git 工作区被跟踪文件 + git 全历史 + 未跟踪未忽略文件（排除 tmp/ 运行产物）；过排除清单与「像真密钥」启发式后，真实命中 0 处（明细见 tmp/vp-secret-details.txt）" \
  "$_EV"

# ---------- A5 .gitignore 覆盖 .env，仓库存在 .env.example ----------
echo "── A5 .gitignore 覆盖 .env 且 .env.example 入库"
A5=$(node -e "
const fs=require('fs');const {execFileSync}=require('child_process');const US=String.fromCharCode(31);
const bad=[];const ev=[];
const gi=fs.readFileSync('.gitignore','utf8').split('\n');
const hasEnvRule=gi.some(l=>{const t=l.trim();return t==='.env'||t==='.env.*'});
ev.push('.gitignore 含 .env 规则：'+(hasEnvRule?'是':'否'));if(!hasEnvRule)bad.push('.gitignore 没有 .env 规则');
const exExists=fs.existsSync('.env.example');
ev.push('.env.example 存在：'+(exExists?'是':'否'));if(!exExists)bad.push('.env.example 不存在');
const tracked=execFileSync('git',['ls-files','.env.example'],{encoding:'utf8'}).trim();
ev.push('.env.example 被 git 跟踪：'+(tracked?'是':'否'));if(!tracked)bad.push('.env.example 未被 git 跟踪');
const envTracked=execFileSync('git',['ls-files','.env'],{encoding:'utf8'}).trim();
ev.push('.env 被 git 跟踪：'+(envTracked?'是（不该跟踪）':'否'));if(envTracked)bad.push('.env 被 git 跟踪了');
let ignored=false;try{execFileSync('git',['check-ignore','.env']);ignored=true}catch(e){}
ev.push('git check-ignore .env：'+(ignored?'命中':'未命中'));if(!ignored)bad.push('.env 未被忽略');
console.log((bad.length?'FAIL':'PASS')+US+(bad.length?bad.join('；'):ev.join(' · ')))
")
split_us "$A5"
item "A5" "$_ST" ".gitignore 覆盖 .env 且仓库存在 .env.example" \
  "四条全过：① .gitignore 含 .env 规则 ② .env.example 存在 ③ .env.example 被 git 跟踪 ④ .env 未被跟踪且被 check-ignore 命中" \
  "$_EV"

# ---------- A6 数据库可连接，核心表存在（今日热搜线） ----------
echo "── A6 数据库可连接，核心表存在（trends / favorites）"
A6_T=$(tcb db execute -e "$ENV" --sql "SELECT 'TRENDS_CNT=' || count(*)::text AS m FROM trends;" < /dev/null 2>&1 | grep -oE 'TRENDS_CNT=[0-9]+' | head -1)
A6_F=$(tcb db execute -e "$ENV" --sql "SELECT 'FAV_CNT=' || count(*)::text AS m FROM favorites;" < /dev/null 2>&1 | grep -oE 'FAV_CNT=[0-9]+' | head -1)
if [ -n "$A6_T" ] && [ -n "$A6_F" ]; then
  item "A6" "PASS" "数据库可连接，核心表存在（trends / favorites）" \
    "tcb db execute 连接成功，且 SELECT count 对 trends、favorites 都返回数字（表存在且可查）" \
    "TRENDS_CNT=${A6_T#TRENDS_CNT=} · FAV_CNT=${A6_F#FAV_CNT=}（favorites 计数含软删除行，属设计使然）"
else
  item "A6" "FAIL" "数据库可连接，核心表存在（trends / favorites）" \
    "tcb db execute 连接成功，且两表 SELECT count 都返回数字" \
    "TRENDS_CNT=[${A6_T:-空}] · FAV_CNT=[${A6_F:-空}]（空=表不存在或连不上）"
fi

# ---------- A7 favicon 可用（Day 24 已知待修项） ----------
echo "── A7 favicon 可用"
A7_ICON=$(grep -c -iE "rel=[\"']?icon" my-app/index.html)
A7_CODE=$(curl -s -m 15 -o /dev/null -w "%{http_code}" "$STATIC/favicon.ico")
if [ "$A7_ICON" -gt 0 ] || [ "$A7_CODE" = "200" ]; then
  item "A7" "PASS" "favicon 可用（页面不产生 404 噪音）" \
    "index.html 声明了 icon（link rel=icon 或 data-URI），或 GET /favicon.ico 返回 200" \
    "index.html icon 声明 ×$A7_ICON · GET /favicon.ico → HTTP $A7_CODE"
else
  item "A7" "FAIL" "favicon 可用（页面不产生 404 噪音）" \
    "index.html 声明了 icon，或 GET /favicon.ico 返回 200" \
    "index.html icon 声明 ×$A7_ICON · GET /favicon.ico → HTTP $A7_CODE"
fi
}

# ============================================================
# B 套件 · 我的AI漫（B1–B6）
# ============================================================
run_drama() {

# ---------- B1 跨域头正确 ----------
echo "── B1 跨域头正确（GET + PATCH/DELETE 逐方法预检）"
curl -s -i -m 25 -X OPTIONS "$API/api/drama/watch-logs" -H "Origin: $STATIC" -H "Access-Control-Request-Method: PATCH"  -o tmp/vp_b1_pre_patch.txt
curl -s -i -m 25 -X OPTIONS "$API/api/drama/watch-logs" -H "Origin: $STATIC" -H "Access-Control-Request-Method: DELETE" -o tmp/vp_b1_pre_del.txt
curl -s -i -m 25 "$API/api/drama/watch-logs?limit=1" -H "Origin: $STATIC" -o tmp/vp_b1_get.txt
B1=$(node -e "
const fs=require('fs');const US=String.fromCharCode(31);
const ENVID=process.argv[2],TENANT=process.argv[3];
const mask=s=>String(s).split(ENVID).join('wb-te***').split(TENANT).join('***');
function hdr(file,name){try{const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);for(const l of lines){const i=l.indexOf(':');if(i>0&&l.slice(0,i).trim().toLowerCase()===name)return l.slice(i+1).trim()}}catch(e){}return ''}
const ao1=hdr('tmp/vp_b1_pre_patch.txt','access-control-allow-origin');
const am1=hdr('tmp/vp_b1_pre_patch.txt','access-control-allow-methods');
const ao2=hdr('tmp/vp_b1_pre_del.txt','access-control-allow-origin');
const am2=hdr('tmp/vp_b1_pre_del.txt','access-control-allow-methods');
const ao3=hdr('tmp/vp_b1_get.txt','access-control-allow-origin');
const bad=[];const ev=[];
ev.push('PATCH 预检 origin='+(ao1?mask(ao1):'(无)')+' methods='+(am1||'(无)'));
ev.push('DELETE 预检 origin='+(ao2?mask(ao2):'(无)')+' methods='+(am2||'(无)'));
ev.push('GET origin='+(ao3?mask(ao3):'(无)'));
if(ao1!==process.argv[1])bad.push('PATCH 预检未回显本站 Origin');
if(!am1||am1.toUpperCase().indexOf('PATCH')===-1)bad.push('PATCH 预检的 allow-methods 不含 PATCH');
if(ao2!==process.argv[1])bad.push('DELETE 预检未回显本站 Origin');
if(!am2||am2.toUpperCase().indexOf('DELETE')===-1)bad.push('DELETE 预检的 allow-methods 不含 DELETE');
if(ao3!==process.argv[1])bad.push('GET 未回显本站 Origin');
console.log((bad.length?'FAIL':'PASS')+US+(bad.length?bad.join('；'):ev.join(' · ')))
" "$STATIC" "$ENV" "$TENANT")
split_us "$B1"
item "B1" "$_ST" "跨域头正确（drama-watchlogs）" \
  "带本站 Origin 的 GET 与 PATCH/DELETE 预检，响应都回 access-control-allow-origin（回显本站），且预检的 allow-methods 含所求方法" \
  "$_EV"

# ---------- B2 前端代码无硬编码接口域名 / 环境 ID ----------
echo "── B2 前端代码无硬编码接口域名 / 环境 ID"
B2_RAW=$(grep -rnE 'wb-test01|service\.tcloudbase\.com|-1500247035\.tcloudbaseapp\.com' my-app/js ai-drama/assets/js 2>/dev/null || true)
# 排除 my-app/js/app.js 第 118–130 行：currentApiBase 域名推导逻辑本体（正则与注释），不是硬编码地址
B2_LEFT=$(printf '%s\n' "$B2_RAW" | grep -v '^my-app/js/app.js:11[89]:' | grep -v '^my-app/js/app.js:12[0-9]:' | grep -v '^my-app/js/app.js:130:' || true)
if [ -z "$B2_RAW" ]; then B2_N=0; else B2_N=$(printf '%s\n' "$B2_RAW" | wc -l); fi
if [ -z "$B2_LEFT" ]; then
  item "B2" "PASS" "前端代码无硬编码接口域名 / 环境 ID" \
    "grep my-app/js 与 ai-drama/assets/js：0 处硬编码 envId / 接口域 / 静态域租户号（域名必须由 currentApiBase 从主机名推导；推导逻辑本体所在行按已知误报排除）" \
    "原始命中 $B2_N 处，全部位于 my-app/js/app.js 第 118–130 行（currentApiBase 推导块），按已知误报排除后剩 0 处"
else
  item "B2" "FAIL" "前端代码无硬编码接口域名 / 环境 ID" \
    "grep 前端 JS：0 处硬编码 envId / 接口域 / 静态域租户号" \
    "排除推导块后仍有 $B2_N 处以上命中：$B2_LEFT"
fi

# ---------- B3 读接口返回真实数据（episodes / watch-logs） ----------
echo "── B3 读接口返回真实数据（episodes / watch-logs）"
curl -s -m 25 -o tmp/vp_ep.json "$API/api/drama/episodes"
curl -s -m 25 -o tmp/vp_wl.json "$API/api/drama/watch-logs"
B3=$(node -e "
const fs=require('fs');const US=String.fromCharCode(31);const bad=[];const ev=[];
let ep={},wl={};
try{ep=JSON.parse(fs.readFileSync('tmp/vp_ep.json','utf8'))}catch(e){bad.push('episodes 响应不是合法 JSON')}
try{wl=JSON.parse(fs.readFileSync('tmp/vp_wl.json','utf8'))}catch(e){bad.push('watch-logs 响应不是合法 JSON')}
const epKeys=['id','order','title','status','duration','durationSec','summary','scene','videoUrl','cast','updatedAt'];
const wlKeys=['id','episodeId','viewer','progress','device','watchedAt'];
if(ep.ok!==true)bad.push('episodes ok≠true');
if(!Array.isArray(ep.data)||ep.data.length===0)bad.push('episodes data 为空');
else{const e0=ep.data[0];epKeys.forEach(k=>{if(!(k in e0))bad.push('episodes.data[0] 缺字段 '+k)});
  ev.push('剧集 '+ep.data.length+' 集（首条 id='+e0.id+' 第'+e0.order+'集《'+e0.title+'》 status='+e0.status+'）')}
if(wl.ok!==true)bad.push('watch-logs ok≠true');
if(!Array.isArray(wl.data))bad.push('watch-logs data 不是数组');
else{if(wl.data[0]){wlKeys.forEach(k=>{if(!(k in wl.data[0]))bad.push('watch-logs.data[0] 缺字段 '+k)})}
  ev.push('观看记录 '+wl.data.length+' 条')}
console.log((bad.length?'FAIL':'PASS')+US+(bad.length?bad.join('；'):ev.join(' · ')))
")
split_us "$B3"
item "B3" "$_ST" "读接口返回真实数据（episodes / watch-logs）" \
  "两接口都 HTTP 200、ok=true、data 为数组；episodes 非空且行内 11 个契约字段齐全；watch-logs 行内 6 个契约字段齐全" \
  "$_EV"

# ---------- B4 写路径与重复写入防护 ----------
echo "── B4 写路径与重复写入防护（SQL 插测试行 → PATCH → 防重 → 非法值 → DELETE）"
DID=""
cleanup_b4() {
  if [ -n "$DID" ]; then
    tcb db execute -e "$ENV" --sql "DELETE FROM \"drama_watch_logs\" WHERE \"id\" = '$DID';" < /dev/null >/dev/null 2>&1
  fi
}
trap cleanup_b4 EXIT
EPID=$(tcb db execute -e "$ENV" --sql "SELECT 'EP=' || \"id\" AS m FROM \"drama_episodes\" ORDER BY \"order\" LIMIT 1;" < /dev/null 2>&1 | grep -oE 'EP=[A-Za-z0-9_-]+' | head -1 | cut -d= -f2)
if [ -z "$EPID" ]; then
  item "B4" "未执行" "写路径与重复写入防护" \
    "SQL 插入专用测试行 → PATCH 改 progress → 重复 PATCH 不产生第二行 → 非法 progress 被 400 拒绝 → DELETE 真删 → 列表确认消失" \
    "取不到真实剧集 id（drama_episodes 为空），无法构造外键合法的测试行"
else
  DID="verify-drama-$(date +%s)"
  INS=$(tcb db execute -e "$ENV" --sql "INSERT INTO \"drama_watch_logs\" (\"id\",\"episodeId\",\"viewer\",\"progress\",\"device\",\"watchedAt\") VALUES ('$DID','$EPID','verify-project',1,'verify-project',now());" < /dev/null 2>&1 | grep -oE 'Affected rows: [0-9]+' | head -1)
  P1=$(curl -s -m 25 -o tmp/vp_b4_p1.json -w "%{http_code}" -X PATCH "$API/api/drama/watch-logs/$DID" -H "Content-Type: application/json" -d '{"progress":88,"device":"verify-project"}')
  V1=$(jval data.progress < tmp/vp_b4_p1.json)
  P2=$(curl -s -m 25 -o tmp/vp_b4_p2.json -w "%{http_code}" -X PATCH "$API/api/drama/watch-logs/$DID" -H "Content-Type: application/json" -d '{"progress":90}')
  curl -s -m 25 -o tmp/vp_b4_list.json "$API/api/drama/watch-logs?limit=100"
  DUP=$(node -e "const j=require('./tmp/vp_b4_list.json');const id=process.argv[1];console.log((j.data||[]).filter(r=>r.id===id).length)" "$DID")
  P3=$(curl -s -m 25 -o tmp/vp_b4_p3.json -w "%{http_code}" -X PATCH "$API/api/drama/watch-logs/$DID" -H "Content-Type: application/json" -d '{"progress":999}')
  E3V=$(jval error < tmp/vp_b4_p3.json)
  D1=$(curl -s -m 25 -o tmp/vp_b4_d1.json -w "%{http_code}" -X DELETE "$API/api/drama/watch-logs/$DID")
  DELV=$(jval data.deleted < tmp/vp_b4_d1.json)
  curl -s -m 25 -o tmp/vp_b4_list2.json "$API/api/drama/watch-logs?limit=100"
  GONE=$(node -e "const j=require('./tmp/vp_b4_list2.json');const id=process.argv[1];console.log((j.data||[]).some(r=>r.id===id)?'仍存在':'已消失')" "$DID")
  B4OK=1
  [ "${INS#Affected rows: }" = "1" ] || B4OK=0
  [ "$P1" = "200" ] || B4OK=0
  [ "$V1" = "88" ] || B4OK=0
  [ "$P2" = "200" ] || B4OK=0
  [ "$DUP" = "1" ] || B4OK=0
  [ "$P3" = "400" ] || B4OK=0
  case "$E3V" in *progress*) ;; *) B4OK=0 ;; esac
  [ "$D1" = "200" ] || B4OK=0
  [ "$DELV" = "true" ] || B4OK=0
  [ "$GONE" = "已消失" ] || B4OK=0
  B4_EV="SQL 插入 $INS · PATCH progress=88 → HTTP $P1（回读 progress=$V1）· 二次 PATCH → HTTP $P2 · 二次 PATCH 后该 id 行数=$DUP（不许多）· progress=999 → HTTP $P3「$E3V」· DELETE → HTTP $D1 deleted=$DELV · 删除后列表：$GONE"
  if [ "$B4OK" = "1" ]; then
    item "B4" "PASS" "写路径与重复写入防护" \
      "① SQL 插入影响 1 行 ② PATCH progress=88 返回 200 且回读值=88 ③ 重复 PATCH 不产生第二行（行数=1）④ progress=999 被 400 拒绝且 error 提到 progress ⑤ DELETE 返回 200 且 deleted=true ⑥ 删除后列表不含该 id" \
      "$B4_EV"
  else
    item "B4" "FAIL" "写路径与重复写入防护" \
      "① 插入影响 1 行 ② PATCH 200 且回读 88 ③ 重复 PATCH 后行数=1 ④ 999 被 400 拒绝 ⑤ DELETE 200 且 deleted=true ⑥ 删除后消失" \
      "$B4_EV · 测试行 id=$DID（脚本退出时自动清理）"
  fi
fi

# ---------- B5 错误处理三键恒定且为中文 ----------
echo "── B5 错误处理三键恒定且为中文"
E1=$(curl -s -m 25 -o tmp/vp_e1.json -w "%{http_code}" -X PATCH  "$API/api/drama/watch-logs/vp-no-such-id" -H "Content-Type: application/json" -d '{"progress":50}')
E2=$(curl -s -m 25 -o tmp/vp_e2.json -w "%{http_code}" -X DELETE "$API/api/drama/watch-logs/vp-no-such-id")
E3=$(curl -s -m 25 -o tmp/vp_e3.json -w "%{http_code}" -X PATCH  "$API/api/drama/watch-logs/vp-no-such-id" -H "Content-Type: application/json" -d '')
E4=$(curl -s -m 25 -o tmp/vp_e4.json -w "%{http_code}" -X PATCH  "$API/api/drama/watch-logs/vp-no-such-id" -H "Content-Type: application/json" -d '{"progress":"abc"}')
B5=$(node -e "
const fs=require('fs');const US=String.fromCharCode(31);const bad=[];const ev=[];
const cases=[['e1','PATCH 不存在的 id','404'],['e2','DELETE 不存在的 id','404'],['e3','PATCH 空请求体','400'],['e4','PATCH progress=abc','400']];
for(const [f,name,want] of cases){
  let j={};try{j=JSON.parse(fs.readFileSync('tmp/vp_'+f+'.json','utf8'))}catch(e){}
  const miss=['ok','data','error'].filter(k=>!(k in j));
  const cjk=typeof j.error==='string'&&/[\u4e00-\u9fff]/.test(j.error);
  ev.push(name+' → ok='+j.ok+' error=\"'+j.error+'\"');
  if(miss.length)bad.push(name+' 响应缺键：'+miss.join('/'));
  if(!cjk)bad.push(name+' 的 error 不是中文：'+JSON.stringify(j.error));
}
console.log((bad.length?'FAIL':'PASS')+US+(bad.length?bad.join('；'):ev.join(' · ')))
")
split_us "$B5"
if [ "$_ST" = "PASS" ] && [ "$E1" = "404" ] && [ "$E2" = "404" ] && [ "$E3" = "400" ] && [ "$E4" = "400" ]; then
  item "B5" "PASS" "错误处理三键恒定且为中文" \
    "不存在 id 的 PATCH/DELETE → 404；空请求体 / progress=abc → 400；四个失败响应都含 ok/data/error 三键，且 error 为中文字符串（无英文原文/堆栈）" \
    "状态码：PATCH 不存在=$E1 · DELETE 不存在=$E2 · 空 body=$E3 · progress=abc=$E4 · $_EV"
else
  item "B5" "FAIL" "错误处理三键恒定且为中文" \
    "不存在 id → 404；空 body / progress=abc → 400；失败响应三键恒定且 error 为中文" \
    "状态码：PATCH 不存在=$E1 · DELETE 不存在=$E2 · 空 body=$E3 · progress=abc=$E4 · $_EV"
fi

# ---------- B6 数据库可连接，漫剧核心表存在 ----------
echo "── B6 数据库可连接，漫剧核心表存在（drama_episodes / drama_watch_logs）"
B6_E=$(tcb db execute -e "$ENV" --sql "SELECT 'DRAMA_EP_CNT=' || count(*)::text AS m FROM \"drama_episodes\";" < /dev/null 2>&1 | grep -oE 'DRAMA_EP_CNT=[0-9]+' | head -1)
B6_W=$(tcb db execute -e "$ENV" --sql "SELECT 'DRAMA_WL_CNT=' || count(*)::text AS m FROM \"drama_watch_logs\";" < /dev/null 2>&1 | grep -oE 'DRAMA_WL_CNT=[0-9]+' | head -1)
if [ -n "$B6_E" ] && [ -n "$B6_W" ]; then
  item "B6" "PASS" "数据库可连接，漫剧核心表存在（drama_episodes / drama_watch_logs）" \
    "tcb db execute 连接成功，且 SELECT count 对 drama_episodes、drama_watch_logs 都返回数字" \
    "DRAMA_EP_CNT=${B6_E#DRAMA_EP_CNT=} · DRAMA_WL_CNT=${B6_W#DRAMA_WL_CNT=}"
else
  item "B6" "FAIL" "数据库可连接，漫剧核心表存在（drama_episodes / drama_watch_logs）" \
    "tcb db execute 连接成功，且两表 SELECT count 都返回数字" \
    "DRAMA_EP_CNT=[${B6_E:-空}] · DRAMA_WL_CNT=[${B6_W:-空}]（空=表不存在或连不上）"
fi
}

# ============================================================
# 调度与汇总
# ============================================================
case "$SUITE" in
  all)  run_hot; run_drama ;;
  hot)  run_hot ;;
  drama) run_drama ;;
esac

printf 'META%s%s%s%s%s%s%s%s%s%s%s%s%s%s\n' "$US" "$(date '+%Y-%m-%d %H:%M:%S')" "$US" "$SUITE" "$US" "$API_MASK" "$US" "$STATIC_MASK" "$US" "$PASS" "$US" "$FAIL" "$US" "$SKIP" "$US" "$KNOWN_ISSUES" >> "$RECORDS"

sep
echo "合计：PASS $PASS · FAIL $FAIL · 未执行 $SKIP"
if [ "$SUITE" = "all" ] || [ "$SUITE" = "hot" ]; then
  echo "已知待修项（来自 Day 24 记录，修复后移除即转绿）：$KNOWN_ISSUES"
fi
if [ "$FAIL" -eq 0 ]; then
  echo "结论：无 FAIL，可以发布（退出码 0）"
  exit 0
else
  echo "结论：有 $FAIL 项 FAIL，先修再发（退出码 1）"
  exit 1
fi
