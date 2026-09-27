# -*- coding: utf-8 -*-
"""通用：把指定工作流 JSON 提交到云端 ComfyUI，轮询出图并下载到 assets/img/ep1/。
用法: python _run_wf.py <workflow.json> [outdir]
"""
import json, os, sys, time, urllib.request, urllib.parse

URL = "https://yz8z6cnaisfpgz8dp8o82uyi1glzyu8jr.swiftlink51.lightcc.cloud"
WFILE = sys.argv[1]
OUTDIR = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "assets", "img", "ep1"))
os.makedirs(OUTDIR, exist_ok=True)
wf = json.load(open(WFILE, encoding="utf-8"))


def post(path, payload):
    req = urllib.request.Request(URL + path, data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status, json.loads(r.read().decode("utf-8"))


def get(path):
    with urllib.request.urlopen(URL + path, timeout=120) as r:
        return r.status, r.read()


st, res = post("/prompt", {"prompt": wf, "client_id": "ep1-run"})
print("POST /prompt ->", st)
if st != 200:
    print(res); raise SystemExit(1)
pid = res["prompt_id"]
print("prompt_id:", pid, "| node_errors:", res.get("node_errors") or "none")

history = {}
for i in range(180):
    time.sleep(5)
    _, raw = get(f"/history/{pid}")
    history = json.loads(raw.decode("utf-8"))
    if pid in history and (history[pid].get("outputs") or history[pid].get("status", {}).get("completed")):
        break
    if i % 6 == 0:
        print(f"  ...waiting {i*5}s")

entry = history.get(pid)
if not entry:
    print("TIMEOUT"); raise SystemExit(1)
info = entry.get("status", {})
print("status:", info.get("status_str"), "| completed:", info.get("completed"))
for m in info.get("messages", []):
    if m[0] in ("execution_error", "execution_interrupted"):
        print("!! ERROR:", json.dumps(m[1], ensure_ascii=False)[:600])

saved = []
for nid, out in entry.get("outputs", {}).items():
    for img in out.get("images", []):
        q = urllib.parse.urlencode({"filename": img["filename"], "subfolder": img.get("subfolder", ""), "type": img.get("type", "output")})
        _, raw = get("/view?" + q)
        p = os.path.join(OUTDIR, img["filename"])
        open(p, "wb").write(raw)
        saved.append((img["filename"], len(raw)))
print(f"\nDOWNLOADED {len(saved)} -> {OUTDIR}")
for n, sz in sorted(saved):
    print(f"  {n}  {sz/1024:.0f} KB")
