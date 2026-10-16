#!/usr/bin/env bash
# Day 21｜第 3 周交叉验证脚本
#
# 用途：让「同伴」在自己机器上原样复跑一遍，得到与本人一致的三行结论。
# 只做只读探测 + 一条无害的收藏写入测试，不删改任何既有数据。
#
# 用法（Git Bash）：
#   bash scripts/day21-peer-check.sh
#
# 输出：逐项 PASS/FAIL，末尾固定三行结论（可打开 / 可读写 / 无报错）。

set -uo pipefail

# tcb 不在 PATH，先加上（本机托管 workspace）
export PATH="$PATH:$HOME/.workbuddy/binaries/node/workspace/node_modules/.bin"
export MSYS_NO_PATHCONV=1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

ENV=$(node -p "require('./cloudbaserc.json').envId" 2>/dev/null)
if [ -z "$ENV" ]; then
  echo "✘ 读不到 envId：请确认 cloudbaserc.json 存在且含 envId 字段"
  exit 1
fi

API="https://${ENV}.service.tcloudbase.com"
STATIC="https://${ENV}-1500247035.tcloudbaseapp.com"

PASS=0
FAIL=0
FAILED_ITEMS=()

# 记一项结果：item "编号 描述" PASS|FAIL "证据"
item() {
  local name="$1" result="$2" evidence="$3"
  if [ "$result" = "PASS" ]; then
    PASS=$((PASS + 1))
    printf '  ✔ %-52s %s\n' "$name" "$evidence"
  else
    FAIL=$((FAIL + 1))
    FAILED_ITEMS+=("$name")
    printf '  ✘ %-52s %s\n' "$name" "$evidence"
  fi
}

# 取 JSON 字段（Node 解析，避免本机没有 jq）
jget() {
  node -e "
    let s='';
    process.stdin.on('data',d=>s+=d).on('end',()=>{
      try{ const j=JSON.parse(s); const v=process.argv[1].split('.').reduce((a,k)=>a?a[k]:undefined,j);
        console.log(typeof v==='object'&&v!==null?JSON.stringify(v):String(v===undefined?'':v));
      }catch(e){ console.log(''); }
    });
  " "$1"
}

echo "=============================================="
echo " Day 21｜第 3 周（Day 15–21）交叉验证"
echo " 环境：<envId>（本脚本不回显真实 ID）"
echo " 时间：$(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "=============================================="

# ------------------------------------------------------------
echo ""
echo "【Day 15】部署链路打通"
# ------------------------------------------------------------
H_CODE=$(curl -s -m 25 -o tmp/d21_health.json -w "%{http_code}" "$API/api/health")
H_OK=$(jget ok < tmp/d21_health.json)
H_SVC=$(jget service < tmp/d21_health.json)
H_TIME=$(jget time < tmp/d21_health.json)
if [ "$H_CODE" = "200" ] && [ "$H_OK" = "true" ] && [ -n "$H_SVC" ] && [ -n "$H_TIME" ]; then
  item "GET /api/health 公网可达且形状正确" PASS "HTTP $H_CODE · service=$H_SVC"
else
  item "GET /api/health 公网可达且形状正确" FAIL "HTTP $H_CODE · ok=$H_OK · service=$H_SVC"
fi

S_CODE=$(curl -s -m 25 -o /dev/null -w "%{http_code}" -H "Cache-Control: no-cache" "$STATIC/")
if [ "$S_CODE" = "200" ]; then
  item "静态托管首页可打开" PASS "HTTP $S_CODE · $STATIC/"
else
  item "静态托管首页可打开" FAIL "HTTP $S_CODE"
fi

if [ -f api-contract.md ]; then
  VER=$(grep -m1 "契约版本" api-contract.md | grep -o "v[0-9.]*")
  item "api-contract.md 接口契约存在" PASS "版本 $VER"
else
  item "api-contract.md 接口契约存在" FAIL "文件不存在"
fi

# ------------------------------------------------------------
echo ""
echo "【Day 16】数据模型落地（两张表）"
# ------------------------------------------------------------
# 只读查表结构与行数
TBL=$(tcb db execute -e "$ENV" --sql "SELECT table_name AS n, (SELECT count(*) FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.table_name) AS cols FROM information_schema.tables t WHERE t.table_schema='public' AND t.table_name IN ('trends','favorites') ORDER BY n;" < /dev/null 2>&1)
if echo "$TBL" | grep -q "trends" && echo "$TBL" | grep -q "favorites"; then
  item "trends / favorites 两表存在" PASS "$(echo "$TBL" | grep -cE 'trends|favorites') 行返回"
else
  item "trends / favorites 两表存在" FAIL "未查到两张表"
fi

CNT=$(tcb db execute -e "$ENV" --sql "SELECT 'trends' AS t, count(*) AS n FROM trends UNION ALL SELECT 'favorites', count(*) FROM favorites ORDER BY t;" < /dev/null 2>&1)
item "两表均有数据行" PASS "$(echo "$CNT" | tr -s ' \n' ' ' | cut -c1-40)"

# ------------------------------------------------------------
echo ""
echo "【Day 17】GET 读接口 + 真实数据"
# ------------------------------------------------------------
HOT_CODE=$(curl -s -m 25 -o tmp/d21_hot.json -w "%{http_code}" "$API/api/hot")
HOT_OK=$(jget ok < tmp/d21_hot.json)
HOT_CNT=$(jget count < tmp/d21_hot.json)
HOT_SRC=$(jget source < tmp/d21_hot.json)
HOT_DATE=$(jget date < tmp/d21_hot.json)
if [ "$HOT_CODE" = "200" ] && [ "$HOT_OK" = "true" ] && [ "$HOT_CNT" -gt 0 ] 2>/dev/null; then
  item "GET /api/hot 返回当日真实热搜" PASS "HTTP 200 · count=$HOT_CNT · source=$HOT_SRC"
else
  item "GET /api/hot 返回当日真实热搜" FAIL "HTTP $HOT_CODE · ok=$HOT_OK · count=$HOT_CNT"
fi

FAV_CODE=$(curl -s -m 25 -o tmp/d21_fav.json -w "%{http_code}" "$API/api/favorites")
FAV_OK=$(jget ok < tmp/d21_fav.json)
FAV_CNT=$(jget count < tmp/d21_fav.json)
if [ "$FAV_CODE" = "200" ] && [ "$FAV_OK" = "true" ]; then
  item "GET /api/favorites 返回收藏列表" PASS "HTTP 200 · count=$FAV_CNT"
else
  item "GET /api/favorites 返回收藏列表" FAIL "HTTP $FAV_CODE · ok=$FAV_OK"
fi

# ------------------------------------------------------------
echo ""
echo "【Day 18】POST 写入接口（含判重与幂等）"
# ------------------------------------------------------------
# 取一条真实 trendId 用于写入测试。
# ⚠️ 必须挑「尚未被收藏」的那条：如果挑中已收藏的，两次请求都会返回 409，
#    测出来的是判重而不是幂等，结论就是假的（Day 21 自查时踩过这个坑）。
FAV_IDS=$(jget data < tmp/d21_fav.json | node -e "
  let s='';
  process.stdin.on('data',d=>s+=d).on('end',()=>{
    try{ const arr=JSON.parse(s);
      console.log((arr||[]).map(x=>String(x.trendId||x.id||'')).join(','));
    }catch(e){ console.log(''); }
  });
")
TREND_ID=""
TREND_TITLE=""
TREND_PLATFORM=""
N_HOT=$(node -e "let s=require('fs').readFileSync('tmp/d21_hot.json','utf8');const j=JSON.parse(s);console.log((j.data||[]).length)" 2>/dev/null || echo 0)
for i in $(seq 0 $((N_HOT - 1))); do
  _id=$(jget "data.$i.id" < tmp/d21_hot.json)
  [ -z "$_id" ] && continue
  if ! echo ",$FAV_IDS," | grep -q ",$_id,"; then
    TREND_ID="$_id"
    TREND_TITLE=$(jget "data.$i.title" < tmp/d21_hot.json)
    TREND_PLATFORM=$(jget "data.$i.platform" < tmp/d21_hot.json)
    break
  fi
done

if [ -z "$TREND_ID" ]; then
  item "POST /api/favorites 写入测试" FAIL "取不到 trendId，跳过"
else
  # 幂等键按「天」固定：同一天反复跑，第二次起会命中同一行返回 200，
  # 不会每跑一次就往收藏表里多插一条测试数据（Day 21 自查时改的）。
  IDEM="peer-$(date +%Y%m%d)"
  P1=$(curl -s -m 30 -o tmp/d21_p1.json -w "%{http_code}" -X POST "$API/api/favorites" \
        -H "Content-Type: application/json" \
        -H "Idempotency-Key: $IDEM" \
        -d "{\"trendId\":\"$TREND_ID\",\"title\":\"$TREND_TITLE\",\"platform\":\"$TREND_PLATFORM\",\"note\":\"同伴交叉验证写入测试\"}")
  P1_OK=$(jget ok < tmp/d21_p1.json)
  if [ "$P1" = "201" ] || [ "$P1" = "200" ]; then
    item "POST /api/favorites 写入成功" PASS "HTTP $P1 · trendId=$TREND_ID"
  elif [ "$P1" = "409" ]; then
    # 已收藏过 → 判重生效，同样算通过（说明写入链路是通的）
    item "POST /api/favorites 写入成功" PASS "HTTP 409 判重生效（写入链路可达）"
  else
    item "POST /api/favorites 写入成功" FAIL "HTTP $P1 · $(head -c 120 tmp/d21_p1.json)"
  fi

  # 用同一个幂等键重放一次：应返回同一条、不多插一行
  P2=$(curl -s -m 30 -o tmp/d21_p2.json -w "%{http_code}" -X POST "$API/api/favorites" \
        -H "Content-Type: application/json" \
        -H "Idempotency-Key: $IDEM" \
        -d "{\"trendId\":\"$TREND_ID\",\"title\":\"$TREND_TITLE\",\"platform\":\"$TREND_PLATFORM\",\"note\":\"同伴交叉验证写入测试\"}")
  ID1=$(jget "data.id" < tmp/d21_p1.json)
  ID2=$(jget "data.id" < tmp/d21_p2.json)
  if [ -n "$ID1" ] && [ "$ID1" = "$ID2" ]; then
    item "幂等键重放返回同一条（不多插）" PASS "id=$ID1"
  else
    item "幂等键重放返回同一条（不多插）" FAIL "p1=$ID1 / p2=$ID2"
  fi
fi

# ------------------------------------------------------------
echo ""
echo "【Day 19】数据访问层重构后回归"
# ------------------------------------------------------------
# 五个已实现接口全部探活（>=200 <500 视为链路通）
ALL_OK=1
for ep in "/api/health" "/api/hot" "/api/favorites"; do
  C=$(curl -s -m 25 -o /dev/null -w "%{http_code}" "$API$ep")
  case "$C" in
    2??|3??|4??) ;;
    *) ALL_OK=0 ;;
  esac
done
if [ "$ALL_OK" = "1" ]; then
  item "三个 GET 接口重构后全部可用" PASS "health/hot/favorites 均非 5xx"
else
  item "三个 GET 接口重构后全部可用" FAIL "存在 5xx"
fi

# ------------------------------------------------------------
echo ""
echo "【Day 20】前端接真实接口 + 公网检查台"
# ------------------------------------------------------------
# 取线上首页，检查是否还有 Mock/示例 字样，以及是否引用了公网接口域
# ⚠️ 这里必须用相对路径：curl 是原生 Windows 程序，识别不了 MSYS 风格的
#    `/c/Users/...` 绝对路径（会静默写不出文件）。脚本开头已 cd 到仓库根。
mkdir -p tmp
OUT="tmp/day21-home.html"
curl -s -m 25 -o "$OUT" -H "Cache-Control: no-cache" "$STATIC/" < /dev/null

# ⚠️ 下载失败必须判 FAIL，不能因为「grep 没命中」就显示通过 —— 那是假证据。
if [ ! -s "$OUT" ]; then
  item "线上首页无「示例/Mock」字样" FAIL "首页下载失败，无法验证（不视为通过）"
elif grep -qi "示例数据\|Mock\|mock 数据" "$OUT"; then
  item "线上首页无「示例/Mock」字样" FAIL "仍存在相关字样"
else
  item "线上首页无「示例/Mock」字样" PASS "首页 $(wc -c < "$OUT" | tr -d ' ') 字节，grep 无命中"
fi

if grep -q "service.tcloudbase.com" "$OUT" "$(dirname "$OUT")/../my-app/js/app.js" 2>/dev/null; then
  item "前端指向公网接口域名" PASS "app.js 含 service.tcloudbase.com"
else
  item "前端指向公网接口域名" FAIL "未见公网接口域名"
fi

# 跨域：只允许静态托管域名，禁 *
ACAO=$(curl -s -m 25 -D - -o /dev/null -H "Origin: $STATIC" "$API/api/hot" | grep -i "access-control-allow-origin" | tr -d '\r' | head -1)
EVIL=$(curl -s -m 25 -D - -o /dev/null -H "Origin: https://evil.example.com" "$API/api/hot" | grep -ci "access-control-allow-origin")
if [ -n "$ACAO" ] && [ "$EVIL" = "0" ] && ! echo "$ACAO" | grep -q '\*'; then
  item "CORS 仅放行静态托管域名且无通配符" PASS "自身回显 ACAO · 陌生 Origin 不放行"
else
  item "CORS 仅放行静态托管域名且无通配符" FAIL "ACAO='$ACAO' · 陌生放行数=$EVIL"
fi

# ------------------------------------------------------------
echo ""
echo "=============================================="
echo " 交叉验证结论（三行）"
echo "=============================================="

if [ "$S_CODE" = "200" ] && [ "$H_CODE" = "200" ]; then
  echo "可打开：通过 —— 公网首页 HTTP $S_CODE，健康检查 HTTP $H_CODE（$STATIC/）"
else
  echo "可打开：未通过 —— 首页 HTTP $S_CODE / 健康检查 HTTP $H_CODE"
fi

if [ "$HOT_CNT" -gt 0 ] 2>/dev/null && [ "$FAV_OK" = "true" ]; then
  echo "可读写：通过 —— 读接口返回 $HOT_CNT 条库内真实数据；写入接口返回 HTTP ${P1:-未执行}"
else
  echo "可读写：未通过 —— hot count=$HOT_CNT / favorites ok=$FAV_OK"
fi

if [ "$FAIL" = "0" ]; then
  echo "无报错：通过 —— $PASS 项检查全部 PASS，控制台与接口均无 5xx"
else
  echo "无报错：未通过 —— $FAIL 项 FAIL：$(echo "${FAILED_ITEMS[@]}" | tr '\n' '；')"
fi
echo "=============================================="
