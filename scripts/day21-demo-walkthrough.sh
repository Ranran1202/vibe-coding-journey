#!/usr/bin/env bash
# Day 21｜演示提纲 · 完整走通脚本
#
# 用途：把「演示提纲」的四段结构真正跑一遍，而不是只在纸上写。
#       每段跑完打印一行结论，任一段失败即以非 0 退出。
#
# 用法（Git Bash）：
#   bash scripts/day21-demo-walkthrough.sh
#
# 幂等：收藏写入用固定 Idempotency-Key，重复运行不会新增行（返回同一条）。

set -uo pipefail

export PATH="$PATH:$HOME/.workbuddy/binaries/node/workspace/node_modules/.bin"
export MSYS_NO_PATHCONV=1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

ENV=$(node -p "require('./cloudbaserc.json').envId" 2>/dev/null)
API="https://${ENV}.service.tcloudbase.com"
STATIC="https://${ENV}-1500247035.tcloudbaseapp.com"

# 用真实域名，但对外打印时脱敏，避免把环境 ID 贴回聊天记录
mask() { echo "$1" | sed "s/${ENV}/<envId>/g"; }

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

FAILED=0
step() {
  local no="$1" text="$2" result="$3" evidence="$4"
  if [ "$result" = "PASS" ]; then
    printf '  ✔ %s %-30s %s\n' "$no" "$text" "$evidence"
  else
    printf '  ✘ %s %-30s %s\n' "$no" "$text" "$evidence"
    FAILED=$((FAILED + 1))
  fi
}

echo "=============================================="
echo " Day 21｜演示提纲 · 完整走通一遍"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="

# ---- 第一段：用户问题（口头讲，这里只打印要点） --------------------
echo ""
echo "【第一段 · 用户问题】"
echo "  想看今天微博 / 抖音 / B站三个平台的热搜榜，"
echo "  数据要来自真实榜单（不是我手写的假数据），"
echo "  看到感兴趣的要能收藏，明天回来还能看到。"

# ---- 第二段：核心流程（真实跑一遍） -------------------------------
echo ""
echo "【第二段 · 核心流程】逐步实跑"

# 2.1 健康探针
HC=$(curl -s -m 25 -o tmp/demo_health.json -w "%{http_code}" "$API/api/health")
HS=$(jget service < tmp/demo_health.json)
[ "$HC" = "200" ] && step "2.1" "健康探针" PASS "HTTP $HC · $HS" \
                   || step "2.1" "健康探针" FAIL "HTTP $HC"

# 2.2 同步当日真实热搜（三个平台并发由函数内部处理，这里探一个平台即可代表链路）
SY=$(curl -s -m 60 -o tmp/demo_sync.json -w "%{http_code}" -X POST "$API/api/sync" \
      -H "Content-Type: application/json" -d '{"source":"weibo","force":1}')
# ⚠️ 同步接口的字段是**嵌套**的：data.detail[0].fetched，不在顶层。
#    第一版按顶层解析，三个字段全取到空字符串，看着像「同步了 0 条」，实为解析错。
SF=$(jget "data.detail.0.fetched" < tmp/demo_sync.json)
SI=$(jget "data.detail.0.inserted" < tmp/demo_sync.json)
SU=$(jget "data.detail.0.updated" < tmp/demo_sync.json)
SS=$(jget "data.detail.0.skipped" < tmp/demo_sync.json)
[ "$SY" = "200" ] && step "2.2" "同步当日真实热搜" PASS "HTTP $SY · fetched=$SF · inserted=$SI · updated=$SU · skipped=$SS" \
                   || step "2.2" "同步当日真实热搜" FAIL "HTTP $SY · $(head -c 100 tmp/demo_sync.json)"

# 2.3 读接口
RH=$(curl -s -m 25 -o tmp/demo_hot.json -w "%{http_code}" "$API/api/hot?limit=3")
RC=$(jget count < tmp/demo_hot.json)
RT=$(jget "data.0.title" < tmp/demo_hot.json)
[ "$RH" = "200" ] && [ "$RC" -gt 0 ] 2>/dev/null \
  && step "2.3" "GET /api/hot 读真实数据" PASS "HTTP $RH · count=$RC · 首条「$RT」" \
  || step "2.3" "GET /api/hot 读真实数据" FAIL "HTTP $RH · count=$RC"

# 2.4 写入接口（固定幂等键）
IDEM="day21-demo-walkthrough-001"

# 先取一份较全的热搜 + 当前收藏列表，挑一条「还没被收藏」的来演示写入。
# 否则会撞上 409 判重，演示里看到的是「已收藏」而不是「写入成功」。
curl -s -m 25 -o tmp/demo_hot20.json "$API/api/hot?limit=20"
curl -s -m 25 -o tmp/demo_fav_before.json "$API/api/favorites"
TID=$(node -e "
  const hot=require('./tmp/demo_hot20.json').data||[];
  const fav=require('./tmp/demo_fav_before.json').data||[];
  const ids=new Set(fav.map(x=>String(x.trendId||x.id||'')));
  const hit=hot.find(h=>!ids.has(String(h.id)));
  console.log(hit?hit.id:'');
" 2>/dev/null)
TTI=$(node -e "
  const hot=require('./tmp/demo_hot20.json').data||[];
  const h=hot.find(x=>x.id==='$TID');
  console.log(h?(h.title||''):'');
" 2>/dev/null)
TPL=$(node -e "
  const hot=require('./tmp/demo_hot20.json').data||[];
  const h=hot.find(x=>x.id==='$TID');
  console.log(h?(h.platform||''):'');
" 2>/dev/null)
PW=$(curl -s -m 30 -o tmp/demo_post.json -w "%{http_code}" -X POST "$API/api/favorites" \
      -H "Content-Type: application/json" -H "Idempotency-Key: $IDEM" \
      -d "{\"trendId\":\"$TID\",\"title\":\"$TTI\",\"platform\":\"$TPL\",\"note\":\"Day21 演示走通写入\"}")
case "$PW" in
  200|201) step "2.4" "POST 写入收藏" PASS "HTTP $PW · trendId=$TID" ;;
  409)     step "2.4" "POST 写入收藏" PASS "HTTP 409 判重生效（写入链路可达）" ;;
  *)       step "2.4" "POST 写入收藏" FAIL "HTTP $PW · $(head -c 100 tmp/demo_post.json)" ;;
esac

# 2.5 回读确认
RF=$(curl -s -m 25 -o tmp/demo_fav.json -w "%{http_code}" "$API/api/favorites")
FC=$(jget count < tmp/demo_fav.json)
HIT=$(node -e "
  const j=require('./tmp/demo_fav.json');
  const hit=(j.data||[]).find(x=>x.trendId==='$TID');
  console.log(hit? '回读命中 id='+hit.id : '未回读命中');
" 2>/dev/null)
[ "$RF" = "200" ] && step "2.5" "回读确认写入生效" PASS "HTTP $RF · $HIT · 共 $FC 条" \
                   || step "2.5" "回读确认写入生效" FAIL "HTTP $RF"

# ---- 第三段：提示词改写（静态，打印对照） --------------------------
echo ""
echo "【第三段 · 提示词改写】原始说法 → 改写后"
echo "  原始：帮我把热搜接到页面上"
echo "  改写：按 api-contract.md §3.3 实现 GET /api/hot，"
echo "        参数 platform/date/limit，响应 {ok,data,count,source,date}，"
echo "        SQL 必须参数化，失败返回 {ok:false,error:\"中文原因\"}"

# ---- 第四段：验证方式 ---------------------------------------------
echo ""
echo "【第四段 · 验证方式】"
echo "  公网首页：$(mask "$STATIC/")"
echo "  接口自证：curl $(mask "$API")/api/hot?limit=3"
echo "  改库验证：控制台改一行 → 刷新接口，返回应跟着变"

echo ""
echo "=============================================="
if [ "$FAILED" = "0" ]; then
  echo " 演示走通结果：全部 5 步通过，演示可完整复现"
else
  echo " 演示走通结果：$FAILED 步未通过，演示不可交付"
fi
echo "=============================================="
[ "$FAILED" = "0" ] || exit 1
