# 第 1 集《群里的光》· 场景制作卡：镜 5–9（羊群效应高潮段）

> 用途：把新剧本第 1 集「镜 5 → 镜 9」这一段落成**可直接执行的出图 / 出视频批次**。
> 每镜给出：分镜 → 出图正向提示词（已拼好，粘进 SD 即可）→ 反向提示词与参数（引用固定块）→ 视频 I2V 运动描述 → 后期字幕/转场/音乐节点。
> 选段理由：这是「羊群效应 = 广播风暴」的核心落点，含「宿舍暖调 ↔ 机房冷调」对比，情绪曲线完整，适合当 pilot 制作示范。
> 总时长：约 42 秒。情绪曲线：悬疑（5）→ 提问（6）→ 点破（7）→ 沉默（8）→ 技术闪回高潮（9）。

---

## 0. 通用固定块（每镜必带，抄一次即可，不重复贴）

**① 角色锚 · 林默**（镜 5/6/8 带，镜 7/9 不带人物）
```
(1boy:1.35), male focus, masculine, solo, chinese college student, 19 years old, (short black hair:1.25), hair above ears, thin-framed glasses, average build, plain hoodie
```

**③ 风格锚**（全剧统一）
```
anime style, cel shading, cinematic lighting, warm color palette, detailed face, clean lineart, film grain
```

**④ 画质锚**
```
best quality, masterpiece, highly detailed, sharp focus
```

**反向提示词**（固定，直接粘，别改）
```
(worst quality, low quality:1.4), blurry, jpeg artifacts, lowres, bad anatomy, bad hands, extra fingers, missing fingers, extra limbs, deformed, disfigured, mutation, ugly, watermark, signature, text, username, logo, photorealistic, 3d render, oversaturated, flat lighting, 1girl, female, feminine, long hair, breasts, makeup, lipstick, earrings, mascara, blush
```

**参数照抄**（SD WebUI 那几栏，来自 `PROMPTS.md` 第二节）
| 位置 | 值 |
|---|---|
| 模型 | `sd15/APWainting_v1.2` |
| 外挂 VAE | `vaeFtMse840000EmaPruned` |
| CLIP 终止层数 | **2** |
| Sampler | `DPM++ 2M Karras` |
| 调度 | `Karras` |
| Steps | **25** |
| CFG Scale | **7** |
| 尺寸 | **512 × 768**（竖屏；Hires.fix 放大到 768×1152） |
| Seed | **-1**（随机抽，满意后固定回填） |
| Hires.fix | 开，算法 `R-ESRGAN 4x+ Anime6B`，重绘幅度 **0.45**，放大 768×1152 |

> 出图顺序：填好上方 → 点橙色「生成」→ 不满意再点（种子随机，多抽正常，4 抽 1 是常态）。满意那张把种子填回 Seed 栏，换场景词即可保同一张脸。

---

## 1. 镜 5 · 手指悬屏，「X 人正在输入…」（约 8 秒）

- **景别 / 机位**：中近景，机位略低于视线，微微上摇到手部。
- **画面（分镜）**：林默坐宿舍桌前，食指悬在手机屏上方 2–3 厘米，没有落下；屏幕上群聊气泡堆积（文字后期加，图里只给气泡形状+光晕）；台灯暖光勾侧脸，手机冷光打在手背；「X 人正在输入…」指示条闪烁。
- **台词 / 音效**：林默（轻声自语）「几百个人同时在买……那到底是谁，先想到的？」+ 键盘悬停的细微电流声。
- **出图正向（拼好，直接粘）**：
```
(1boy:1.35), male focus, masculine, solo, chinese college student, 19 years old, (short black hair:1.25), hair above ears, thin-framed glasses, average build, plain hoodie, finger hovering above smartphone screen, sitting at dorm desk at night, warm desk lamp light on side face, phone screen glow on hand, blurred group chat bubbles on screen (no readable text), X people typing indicator flickering, cold phone glow vs warm lamp, medium close-up, anime style, cel shading, cinematic lighting, warm color palette, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```
- **反向**：用上方固定块。
- **参数**：用上方固定块（Seed 先 -1）。
- **视频 I2V 运动（英文，给 ComfyUI）**：
```
camera slowly pushes in on Lin Mo's hand hovering above the phone; phone screen glow flickers softly; the "X people typing" indicator blinks on and off; warm desk lamp light trembles slightly; subtle breath, no big movement.
```
- **后期**：字幕「几百个人同时在买……那到底是谁，先想到的？」；屏幕气泡「闭眼进」「今天不买就晚了」（剪映加，红色=涨）；转场：镜 4→5 同场景硬切。

---

## 2. 镜 6 · 打开 AI 对话框打字（约 6 秒）

- **景别 / 机位**：侧近景，焦点在手机屏，林默半张脸入镜。
- **画面（分镜）**：林默把手机拿起，打开 AI 对话框，开始打字「大家都买的时候，我该跟吗？」；台灯暖光在镜片上拉出细线；屏上只给对话框形状+光标闪烁（文字后期）。
- **台词 / 音效**：旁白「我问了 AI。它没说买，也没说不买。」+ 打字声。
- **出图正向（拼好）**：
```
(1boy:1.35), male focus, masculine, solo, chinese college student, 19 years old, (short black hair:1.25), hair above ears, thin-framed glasses, average build, plain hoodie, holding smartphone, opening AI chat dialog, typing on screen, dorm desk at night, warm desk lamp light, phone screen glow on face, blurred chat interface (no readable text), side view, anime style, cel shading, cinematic lighting, warm color palette, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```
- **反向 / 参数**：固定块。
- **视频 I2V 运动**：
```
Lin Mo's thumb moves slowly typing on the phone screen; soft phone glow flickers with each key tap; warm lamp light stays steady; calm, deliberate motion.
```
- **后期**：对话框字幕「大家都买的时候，我该跟吗？」（剪映打字机效果）；音乐：打字声垫底。

---

## 3. 镜 7 · AI 回复字幕浮出（约 10 秒 · 屏特写，无人物）

- **景别 / 机位**：手机屏极端特写，浅景深。
- **画面（分镜）**：手机屏占满画面，群聊气泡之上浮出一条 AI 回复气泡，柔光；文字全后期加，图里只给气泡形状+光晕+浅景深背景。
- **台词 / 音效**：旁白「它只把我的句子，拆成了两半。」+ 一条干净的消息送达音。
- **出图正向（拼好，此镜不含角色锚）**：
```
extreme close-up of smartphone screen, group chat bubbles and one reply bubble above, soft glow, blurred text (no readable words), dark dorm background, shallow depth of field, anime style, cel shading, cinematic lighting, warm color palette, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```
- **反向 / 参数**：固定块（此镜可关 Hires 或降 Steps 到 20，纯 UI 特写无需太高细节）。
- **视频 I2V 运动**：
```
the reply bubble gently fades in from bottom; soft screen glow breathes; subtle tiny particles of light drift; otherwise still, like a held breath.
```
- **后期**：字幕逐字浮出 AI 回复「你看的是『大家都在买』，不是『它值这个价』。这两件事，经常是反的。」；音效：干净送达「叮」。

---

## 4. 镜 8 · 盯着「反的」二字，屏幕暗了又亮（约 12 秒）

- **景别 / 机位**：林默面部大特写，机位正对，屏光在镜片上反射。
- **画面（分镜）**：林默盯着屏上「反的」二字，久久没动；手机屏因无操作先暗下、又因消息推送亮起，光在他镜片和脸上明灭；表情平静、被击中但克制；台灯暖光勾边。
- **台词 / 音效**：林默（自语）「反的……」+ 音乐极轻地起。
- **出图正向（拼好）**：
```
(1boy:1.35), male focus, masculine, solo, chinese college student, 19 years old, (short black hair:1.25), hair above ears, thin-framed glasses, average build, plain hoodie, close-up of boy's face, looking at phone screen, screen light reflecting in glasses, phone screen dims and brightens, warm desk lamp light, calm restrained expression, night dorm, side light, anime style, cel shading, cinematic lighting, warm color palette, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```
- **反向 / 参数**：固定块。
- **视频 I2V 运动**：
```
phone screen light slowly fades to dark then flickers back on from a new notification; light plays across Lin Mo's glasses and cheek; his eyes blink once, very slow; almost no body movement, heavy stillness.
```
- **后期**：字幕「反的……」；音乐：极轻 pad 音起；转场：镜 7→8 从屏特写拉回人脸（匹配剪辑）。

---

## 5. 镜 9 · 机房闪回 · 广播风暴卡死（约 6 秒 · 冷调，无人物）

- **景别 / 机位**：机房多屏中景 / 屏幕特写交替；冷色调，网格感。
- **画面（分镜）**：闪回——计算机网络课，屏幕上网络拓扑图满屏节点同时发包，链路瞬间变红、卡死；冷荧光灯，蓝屏光；无人物或仅背影，重点是「系统被自己淹死」的视觉。
- **台词 / 音效**：旁白「学计算机网络时我见过——一个包被无限转发，整张网就瘫了。」+ 尖锐的报错提示音，一闪即逝。
- **出图正向（拼好，此镜不含角色锚，强调冷调）**：
```
computer lab, multiple monitors showing network topology with nodes broadcasting packets, links turning red and freezing, cool fluorescent light, blue screen glow, glitching network graph, cold color palette, grid feel, no people, cinematic, anime style, cel shading, detailed, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```
- **反向 / 参数**：固定块，但**把 `warm color palette` 从风格锚里去掉**（本镜用冷调），尺寸可保持 512×768。
- **视频 I2V 运动**：
```
network nodes light up simultaneously and flood the screen with packets; connection lines flash red and freeze; subtle screen glitch and scanline; cold static energy, then a sharp freeze-frame.
```
- **后期**：无字幕；音效：尖锐报错「嘀——」一闪即逝；转场：镜 8→9 用**色彩突变 + 轻微模糊**切到冷调，明确告诉观众「这是回忆」；镜 9→10 回现实用同样手法切回暖调。

---

## 6. 出图 / 出视频执行顺序（建议）

1. **先出图（5 张）**：镜 5、6、8 共用同一林默 seed 底子（先随机抽，挑一张脸满意的，把 seed 填回，再换 ②场景段出另外两镜，保脸一致）；镜 7、9 不含林默脸，单独出。
2. **抽卡**：每镜多抽，4 抽 1 常态；满意那张固定 seed。
3. **视频（I2V）**：镜 5、8 做 I2V（有微妙运动，最出戏）；镜 7 用静帧 + 剪映字幕动画即可；镜 9 做 I2V（节点流动 + 卡死定格）。
4. **剪辑拼接**：镜 5(8s) → 6(6s) → 7(10s) → 8(12s) → 9(6s)，按上方「后期」加字幕、音效、转场，总约 42 秒。

## 7. 一致性检查清单（出图前默念）

- [ ] 林默每镜（5/6/8）带 ①角色锚；眼镜必画；卫衣为主视觉；反向末尾 `1girl/female/...` 防性别跑偏。
- [ ] 镜 5/6/8 暖调（台灯），镜 9 冷调（机房）—— 观众一眼分现实/回忆。
- [ ] 所有屏幕**不画可读文字**，只给气泡+光晕，文字全后期。
- [ ] ③风格锚、④画质锚、反向、参数全剧不动。

## 8. 待办 / 衔接

- 本卡的 ②场景段（镜 5/6/7/8/9）是按**新剧本**重写的，正好可替换 `PROMPTS.md` 第三节里**已过期的旧版**（旧版是开户/下载 App/送外卖/填表，与新剧本不符）。等你确认后，我把这份 ②段正式写回 `PROMPTS.md` 第三节，并清掉旧内容。
- 镜 1–4、10–14 的制作卡可按同样模板补齐（放本 `scenes/` 目录），凑齐第 1 集整集批次。
