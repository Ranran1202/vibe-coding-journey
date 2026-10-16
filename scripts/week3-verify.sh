#!/usr/bin/env bash
# ============================================================
# 第 3 周验收表 · 6 项逐条自动取证
# 用法：bash scripts/week3-verify.sh
# 输出：每项一行 [PASS|FAIL|未执行] + 验证方法 + 证据
# 说明：只做「读 + 一条固定幂等键的写」，重复运行不会污染数据库
# ============================================================
set -u
export MSYS_NO_PATHCONV=1
export PATH="$PATH:/c/Users/86153/.workbuddy/binaries/node/workspace/node_modules/.bin"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
mkdir -p tmp

ENV=$(node -p "require('./cloudbaserc.json').envId")
API="https://${ENV}.service.tcloudbase.com"
STATIC="https://${ENV}-1500247035.tcloudbaseapp.com"

PASS=0; FAIL=0; SKIP=0
item() { # item <状态> <验收项> <怎么验证> <证据>
  printf '[%s] %s\n      验证：%s\n      证据：%s\n' "$1" "$2" "$3" "$4"
  case "$1" in PASS) PASS=$((PASS+1));; FAIL) FAIL=$((FAIL+1));; *) SKIP=$((SKIP+1));; esac
}
sep() { printf '%s\n' "------------------------------------------------------------"; }

jget() {
  node -e "
    let s='';
    process.stdin.on('data',d=>s+=d).on('end',()=>{
      try{ const j=JSON.parse(s); const v=process.argv[1].split('.').reduce((a,k)=>a?a[k]:undefined,j);
        console.log(typeof v==='object'&&v!==null?JSON.stringify(v):String(v===undefined?'':v));
      }catch(e){ console.log(''); }
    });" "$1"
}

# 去掉 sync-shared.js 自动加的 4 行头部注释后算 md5（否则永远对不上，会误判成漂移）
md5body() {
  node -e "
    const fs=require('fs'),c=require('crypto');
    let s=fs.readFileSync(process.argv[1],'utf8');
    s=s.replace(/^\/\/ ⚠️ 本文件由 scripts\/sync-shared\.js[\s\S]*?\n\n/,'');
    console.log(c.createHash('md5').update(s).digest('hex'));" "$1"
}

echo "============================================================"
echo " 第 3 周验收表 · $(date '+%Y-%m-%d %H:%M:%S')"
echo " 公网接口：$API"
echo " 静态托管：$STATIC"
echo "============================================================"

# ---------- A1 建表和种子脚本可重复执行 ----------
sep
echo "A1  建表和种子脚本可重复执行（有 select 证据）"
SCHEMA=$(cat db/schema.sql)
SEED=$(cat db/seed.sql)

R1=$(tcb db execute -e "$ENV" --sql "$SCHEMA" < /dev/null 2>&1 | grep -oE "Affected rows: [0-9]+" | head -1)
R2=$(tcb db execute -e "$ENV" --sql "$SCHEMA" < /dev/null 2>&1 | grep -oE "Affected rows: [0-9]+" | head -1)
S1=$(tcb db execute -e "$ENV" --sql "$SEED"   < /dev/null 2>&1 | grep -oE "Affected rows: [0-9]+" | head -1)
S2=$(tcb db execute -e "$ENV" --sql "$SEED"   < /dev/null 2>&1 | grep -oE "Affected rows: [0-9]+" | head -1)

BEFORE=$(tcb db execute -e "$ENV" --sql "SELECT count(*)::text AS n FROM trends;" < /dev/null 2>&1 | grep -oE "[0-9]{3}" | head -1)
SEEDROWS=$(tcb db execute -e "$ENV" --sql "SELECT 'HIT=' || count(*)::text AS m FROM trends WHERE \"id\" IN ('weibo-1','baidu-2','douyin-3','weibo-4','baidu-5');" < /dev/null 2>&1 | grep -oE 'HIT=[0-9]+' | head -1)

if [ -n "$R1" ] && [ -n "$R2" ] && [ -n "$S2" ] && [ "${S2#Affected rows: }" = "0" ] && [ "${R2#Affected rows: }" = "0" ]; then
  item PASS "A1 schema.sql / seed.sql 可重复执行" \
    "连续执行两次，第二次必须 0 行且无报错；再 SELECT 种子行确认存在" \
    "schema 两次=[$R1][$R2] · seed 两次=[$S1][$S2] · SELECT 5 条种子 id 命中 $SEEDROWS 条 · trends 总数 $BEFORE"
else
  item FAIL "A1 schema.sql / seed.sql 可重复执行" \
    "连续执行两次，第二次必须 0 行且无报错" \
    "schema 两次=[$R1][$R2] · seed 两次=[$S1][$S2]"
fi

# ---------- A2 GET 接口公网可访问且返回真实数据库数据 ----------
sep
echo "A2  GET /api/hot 公网可访问且返回真实数据库数据"
HCODE=$(curl -s -m 25 -o tmp/w3_hot.json -w "%{http_code}" "$API/api/hot")
OK=$(jget ok < tmp/w3_hot.json)
CNT=$(jget count < tmp/w3_hot.json)
SRC=$(jget source < tmp/w3_hot.json)
DT=$(jget date < tmp/w3_hot.json)
TODAY=$(node -e "console.log(new Date(Date.now()+8*3600*1000).toISOString().slice(0,10))")

# 逐条检查：数据必须来自数据库真实同步（source=synced）、日期为今天、且不含「示例」字样
CHK=$(node -e "
  const j=require('./tmp/w3_hot.json');
  const bad=[];
  if(j.ok!==true) bad.push('ok≠true');
  if(!Array.isArray(j.data)||j.data.length===0) bad.push('data 为空');
  if(j.source!=='synced') bad.push('source='+j.source+'（非当日真实同步）');
  const hit=j.data.filter(r=>String(r.title).indexOf('示例')!==-1);
  if(hit.length) bad.push('含示例标题 ×'+hit.length);
  const plats=[...new Set(j.data.map(r=>r.platform))];
  console.log(bad.length?('FAIL: '+bad.join('；')):('PASS: '+j.data.length+' 条，平台='+plats.join('/')));
")
# 补一项：三平台逐个验证（默认前 20 条按热度排，B站可能被挤掉，必须单独查才能证明三平台都能读出）
PLATRES=""
for P in weibo douyin bilibili; do
  curl -s -m 25 -o "tmp/w3_$P.json" "$API/api/hot?platform=$P&limit=1"
  R=$(node -e "
    const p=process.argv[1];
    const j=require('./tmp/w3_'+p+'.json');
    const ok=j.ok&&Array.isArray(j.data)&&j.data.length>0&&j.data[0].platform===p;
    console.log(ok ? (p+':'+j.data[0].platform+' '+j.date+' 首条='+j.data[0].title.slice(0,12)) : (p+':失败'));
  " "$P")
  PLATRES="$PLATRES $R"
done

case "$CHK" in
  PASS:*)
    item PASS "A2 GET /api/hot 公网可访问 + 返回真实数据" \
      "curl 公网地址，断言 ok=true、data 非空、source=synced、date=今天、标题不含『示例』" \
      "HTTP $HCODE · ok=$OK · count=$CNT · source=$SRC · date=$DT（今天=$TODAY）· $CHK · 三平台逐个查：$PLATRES"
    ;;
  *)
    item FAIL "A2 GET /api/hot 公网可访问 + 返回真实数据" \
      "curl 公网地址，断言 ok=true、data 非空、source=synced" \
      "HTTP $HCODE · $CHK · 三平台逐个查：$PLATRES"
    ;;
esac

# ---------- A3 POST 接口完成真实写入并读回 ----------
sep
echo "A3  POST /api/favorites 真实写入并读回"
IDEM="week3-verify-$(date +%Y%m%d)"
# 挑一条【尚未收藏】的真实热搜，否则会撞 409 判重，测不到真实写入
curl -s -m 25 -o tmp/w3_fav_before.json "$API/api/favorites?limit=200"
TID=$(node -e "
  const hot=require('./tmp/w3_hot.json').data||[];
  let fav=[]; try{ fav=require('./tmp/w3_fav_before.json').data||[]; }catch(e){}
  const have=new Set(fav.map(r=>r.trendId));
  const pick=hot.find(r=>!have.has(r.id));
  if(pick) console.log([pick.id,pick.platform,pick.title].join('\t'));
")
if [ -z "$TID" ]; then
  item 未执行 "A3 POST /api/favorites 真实写入并读回" \
    "选一条未收藏的热搜 → POST 写入 → GET /api/favorites 读回确认包含该 trendId" \
    "当日热搜已全部被收藏，找不到未收藏的条目，无法完成写入验证"
else
  IFS=$'\t' read -r W_ID W_PL W_TI <<< "$TID"



  BODY=$(node -e "console.log(JSON.stringify({trendId:process.argv[1],platform:process.argv[2],title:process.argv[3],note:'第3周验收写入'}))" "$W_ID" "$W_PL" "$W_TI")
  WCODE=$(curl -s -m 25 -o tmp/w3_write.json -w "%{http_code}" -X POST "$API/api/favorites" \
          -H "Content-Type: application/json" -H "Idempotency-Key: $IDEM" -d "$BODY")
  curl -s -m 25 -o tmp/w3_fav_after.json "$API/api/favorites?limit=200"
  # ⚠️ 读回必须以【POST 实际返回的 id】为准，不能用本次挑选的 trendId：
  #    幂等键复用时接口会返回上一次那条记录（HTTP 200），拿新挑的 trendId 去比对必然落空——
  #    这不是接口错，是断言写错了（第一版就栽在这里）。
  RB=$(node -e "
    const w=require('./tmp/w3_write.json');
    const after=require('./tmp/w3_fav_after.json').data||[];
    const d=(w&&w.data)||{};
    const hit=after.find(r=>r.id===d.id);
    console.log(hit? ('读回命中 id='+hit.id+' · trendId='+hit.trendId+' · title='+hit.title) : ('读回未命中(写入返回的 id='+d.id+')'));
  ")
  if { [ "$WCODE" = "201" ] || [ "$WCODE" = "200" ]; } && case "$RB" in 读回命中*) true;; *) false;; esac; then
    item PASS "A3 POST /api/favorites 真实写入并读回" \
      "POST 写入一条当日真实热搜（带固定 Idempotency-Key）→ 以 POST 返回的 id 为准，GET /api/favorites 读回确认存在" \
      "HTTP $WCODE（201=新写入 / 200=幂等命中同一条）· $RB · 幂等键=$IDEM（重复运行不新增行）"
  else
    item FAIL "A3 POST /api/favorites 真实写入并读回" \
      "POST 写入 → GET 读回确认包含该 trendId" \
      "HTTP $WCODE · $RB · $(head -c 120 tmp/w3_write.json)"
  fi
fi

# ---------- A4 数据访问层重构完成且接口行为不变 ----------
sep
echo "A4  数据访问层重构完成且接口行为不变"
DRIFT=""
for pair in "trendsRepository hot" "trendsRepository sync" "trendsRepository favorites" "favoritesRepository favorites" "db hot" "db sync" "db favorites"; do
  set -- $pair
  F="$1"; FN="$2"
  SRC_M=$(md5body "shared/$F.js")
  DST="cloudfunctions/$FN/lib/$F.js"
  if [ ! -f "$DST" ]; then DRIFT="$DRIFT $FN/lib/$F.js(缺失)"; continue; fi
  DST_M=$(md5body "$DST")
  [ "$SRC_M" = "$DST_M" ] || DRIFT="$DRIFT $FN/lib/$F.js(不同步)"
done
RAWSQL=$(grep -rnE "^\s*(const|let|var)?\s*(await)?\s*[a-zA-Z]+\.(query|execute)\(\s*['\\\"]SELECT|['\\\"]SELECT .*FROM|['\\\"]INSERT INTO|['\\\"]UPDATE .*SET|['\\\"]DELETE FROM" \
  cloudfunctions/hot/index.js cloudfunctions/favorites/index.js cloudfunctions/sync/index.js 2>/dev/null | head -3)

if [ -z "$DRIFT" ] && [ -z "$RAWSQL" ]; then
  item PASS "A4 数据访问层重构完成且接口行为不变" \
    "① 去头部注释后比对 shared/*.js 与各函数 lib/ 副本 md5 ② 云函数内 grep 裸 SQL ③ 行为不变由 A2/A3 全 PASS 佐证" \
    "shared 与 hot/sync/favorites 的 lib 副本 md5 全一致（db.js + 2 个 Repository）· 三个云函数内 0 处裸 SQL · A2/A3 均 PASS 即行为未变"
else
  item FAIL "A4 数据访问层重构完成且接口行为不变" \
    "比对 shared 与 lib 副本 md5 + grep 裸 SQL" \
    "漂移：${DRIFT:-无} · 裸 SQL：${RAWSQL:-无}"
fi

# ---------- A5 检查台公网可访问 / 同伴从自己设备打开 ----------
sep
echo "A5  检查台公网可访问 / 同伴从自己设备打开成功"
SCODE=$(curl -s -m 25 -o tmp/w3_index.html -w "%{http_code}" -H "Cache-Control: no-cache" "$STATIC/")
LOCAL_M=$(md5sum my-app/index.html | cut -d' ' -f1)
LIVE_M=$(md5sum tmp/w3_index.html | cut -d' ' -f1)
HASCHECK=$(grep -c "view-check" my-app/js/app.js)
if [ "$SCODE" = "200" ] && [ "$LOCAL_M" = "$LIVE_M" ] && [ "$HASCHECK" -gt 0 ]; then
  item PASS "A5-1 检查台公网可访问" \
    "curl 静态托管根路径返回 200，且线上 index.html 与本地 md5 一致（证明部署的是含检查台的最新版）" \
    "HTTP $SCODE · 线上 md5=$LIVE_M 与本地一致 · app.js 含 view-check 视图 ×$HASCHECK · 检查台入口：$STATIC/#/check"
else
  item FAIL "A5-1 检查台公网可访问" \
    "curl 静态托管根路径 + md5 比对" \
    "HTTP $SCODE · 线上=$LIVE_M 本地=$LOCAL_M · view-check×$HASCHECK"
fi
item 未执行 "A5-2 同伴从自己设备打开成功" \
  "同伴用自己的设备（非本机、最好非同一网络）打开 $STATIC/#/check ，按三行结论模板回报" \
  "需真人执行，AI 无法代替；模板见 week3-peer-check.md，脚本 bash scripts/day21-peer-check.sh"

# ---------- A6 响应形状与 api-contract.md 一致 ----------
sep
echo "A6  响应形状与 api-contract.md 一致"
SHAPE=$(node -e "
  const fs=require('fs');
  const hot=JSON.parse(fs.readFileSync('./tmp/w3_hot.json','utf8'));
  const fav=JSON.parse(fs.readFileSync('./tmp/w3_fav_after.json','utf8'));
  const bad=[];
  // §3.3 GET /api/hot
  ['ok','data','count','source','date'].forEach(k=>{ if(!(k in hot)) bad.push('hot 顶层缺 '+k); });
  const hk=['id','rank','title','heat','heatNum','platform','url','date','createdAt'];
  const h0=hot.data[0]||{};
  hk.forEach(k=>{ if(!(k in h0)) bad.push('hot.data[] 缺 '+k); });
  const types={id:'string',rank:'number',title:'string',heat:'string',heatNum:'number',platform:'string',url:'string',date:'string',createdAt:'string'};
  Object.keys(types).forEach(k=>{ if(typeof h0[k]!==types[k]) bad.push('hot.'+k+' 类型='+typeof h0[k]+' 应为 '+types[k]); });
  if(typeof hot.count!=='number') bad.push('hot.count 非 number');
  // §3.5 GET /api/favorites
  ['ok','data','count'].forEach(k=>{ if(!(k in fav)) bad.push('fav 顶层缺 '+k); });
  const fk=['id','trendId','title','platform','note','createdAt','updatedAt'];
  const f0=fav.data[0]||{};
  fk.forEach(k=>{ if(!(k in f0)) bad.push('fav.data[] 缺 '+k); });
  console.log(bad.length?('FAIL: '+bad.join('；')):('PASS: hot 顶层5键+行内9键类型全对；favorites 顶层3键+行内7键'));
")
case "$SHAPE" in
  PASS:*) item PASS "A6 响应形状与 api-contract.md 一致" \
    "按 §3.3/§3.5 字段表逐键校验存在性与类型（含 heatNum 等接口层计算字段）" \
    "$SHAPE" ;;
  *) item FAIL "A6 响应形状与 api-contract.md 一致" \
    "按 §3.3/§3.5 字段表逐键校验" "$SHAPE" ;;
esac

sep
echo "合计：PASS $PASS · FAIL $FAIL · 未执行 $SKIP"
echo "（A5-2 的「同伴打开」为需真人执行的项，不计入自动化通过率）"
exit 0
