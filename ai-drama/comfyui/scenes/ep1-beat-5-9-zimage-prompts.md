# 第 1 集《群里的光》· 镜 5–9 · Z-Image 自然语言提示词

> 用途：把第 1 集「镜 5 → 镜 9」改写成 **Z-Image（Lumina2 / qwen_3_4b 文本编码器）能吃的自然语言提示词**。
> 与旧 `ep1-beat-5-9.md` 的区别：旧版是 SD1.5 的 `tag` 写法（`(1boy:1.35)`、`(short black hair:1.25)`），Z-Image 不吃那套，必须改成**自然语言场景描述 + 英文风格 token 收尾**。
>
> **✅ 已在你的云端实例（lightcc.cloud）实跑验证通过的配置**（2026-09-27，5 镜全部出图）：
> - 主模型（`UNETLoader`）：**`Zimage/z_image_turbo_bf16.safetensors`**
> - 文本编码器（`CLIPLoader`，type=**lumina2**）：**`qwen_3_4b.safetensors`**
> - VAE（`VAELoader`）：**`ae.safetensors`**
> - 文本编码节点：**`CLIPTextEncodeLumina2`**（system_prompt 选 `superior`）
>
> 参数（Z-Image-Turbo 默认，已实跑）：
> - Steps **8** / CFG Scale **1.0** / Sampler **res_multistep** / Scheduler **simple** / Denoise **1.0**
> - 尺寸 **1024×1536**（竖屏，实测可出）
> - Seed 先随机，抽到林默脸满意后固定回填（镜 5/6/8 共用同一 seed 保脸一致）
>
> ⚠️ **`ditto_global_style` 在本实例加载不了**：它是 Ditto 风格模型的专用格式，通用 `UNETLoader` 会报 `Could not detect model type`（已实测报错）。你截图里那套「Load Diffusion Model」来自另一个装了 Ditto 插件的环境，与本实例不是同一个。本实例没有 Ditto 加载节点。故改用上面能直接跑的 `z_image_turbo`。
>
> ⚠️ CFG=1.0 时「反向提示词」几乎不起作用（无引导分离），所以下面**只给正向**，反向留空即可。若想要反向生效，把 CFG 提到 3–4（但 turbo 模型可能偏糊，按需试）。
>
> ⚠️ **已知坑（实跑发现）**：Z-Image 会自动往屏幕/镜片上渲染**乱码文字**（镜 6/7/8 的手机屏都出现了假中文）。这与我们「屏幕不出现可读文字、文字全后期」的铁律冲突。缓解办法：① 提示词里把「模糊的聊天界面」加强为「**纯色空白屏幕 / 关闭的屏幕，不出现任何文字或字母**」；② 把 CFG 提到 2–3 并加反向词 `text, letters, words, watermark, gibberish`；③ 最稳的是出图后用剪映/PS 把屏幕区域盖住再后期加字。镜 9（机房拓扑）文字反而成立，可保留。

---

## 镜 5 · 手指悬屏，「X 人正在输入…」（约 8 秒）

**正向（直接粘进 CLIPTextEncode 正向框）：**
```
一个19岁的中国男大学生，黑短发齐耳，戴细黑框眼镜，身材中等，穿着纯色连帽卫衣，夜晚坐在大学宿舍书桌前，食指悬在手机屏幕上方几厘米没有落下。台灯暖光照亮他的侧脸，手机冷光打在手背。屏幕上堆满模糊的群聊气泡，没有可读文字，"X人正在输入"提示条在闪烁。暖光与冷屏光形成对比，中近景，镜头微微上摇到手部。anime style, cel shading, cinematic lighting, warm color palette, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**视频 I2V 运动（英文，给图生视频）：**
```
camera slowly pushes in on Lin Mo's hand hovering above the phone; phone screen glow flickers softly; the "X people typing" indicator blinks on and off; warm desk lamp light trembles slightly; subtle breath, no big movement.
```

**后期**：字幕「几百个人同时在买……那到底是谁，先想到的？」；屏幕气泡「闭眼进」「今天不买就晚了」（剪映加，红色=涨）；镜 4→5 同场景硬切。

---

## 镜 6 · 打开 AI 对话框打字（约 6 秒）

**正向：**
```
一个19岁的中国男大学生，黑短发齐耳，戴细黑框眼镜，穿着纯色连帽卫衣，把手机拿在手里，打开AI对话框，正在打字，屏幕上是模糊的聊天界面没有可读文字，只有对话框形状和闪烁的光标。夜晚宿舍书桌前，台灯暖光在镜片上拉出细线，手机屏光照在脸上。侧近景，焦点在手机屏，半张脸入镜。anime style, cel shading, cinematic lighting, warm color palette, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**视频 I2V 运动：**
```
Lin Mo's thumb moves slowly typing on the phone screen; soft phone glow flickers with each key tap; warm lamp light stays steady; calm, deliberate motion.
```

**后期**：对话框字幕「大家都买的时候，我该跟吗？」（剪映打字机效果）；打字声垫底。

---

## 镜 7 · AI 回复字幕浮出（约 10 秒 · 屏特写，无人物）

**正向（此镜不含角色锚）：**
```
手机屏幕的极端特写，占满画面，群聊气泡之上浮出一条AI回复气泡，柔光。深色宿舍背景，浅景深，画面里只有气泡形状和光晕，没有可读文字。anime style, cel shading, cinematic lighting, warm color palette, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**视频 I2V 运动：**
```
the reply bubble gently fades in from bottom; soft screen glow breathes; subtle tiny particles of light drift; otherwise still, like a held breath.
```

**后期**：字幕逐字浮出 AI 回复「你看的是『大家都在买』，不是『它值这个价』。这两件事，经常是反的。」；音效干净送达「叮」。

---

## 镜 8 · 盯着「反的」二字，屏幕暗了又亮（约 12 秒）

**正向：**
```
一个19岁的中国男大学生，黑短发齐耳，戴细黑框眼镜，穿着纯色连帽卫衣，面部大特写，正对镜头，盯着眼前的手机屏幕久久没有动，屏幕上"反的"两个字映在镜片上。手机因无操作先暗下去、又因新消息亮起，光在他镜片和脸上明灭。表情平静、被击中但克制。夜晚宿舍，台灯暖光勾边。anime style, cel shading, cinematic lighting, warm color palette, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**视频 I2V 运动：**
```
phone screen light slowly fades to dark then flickers back on from a new notification; light plays across Lin Mo's glasses and cheek; his eyes blink once, very slow; almost no body movement, heavy stillness.
```

**后期**：字幕「反的……」；音乐极轻 pad 音起；镜 7→8 从屏特写拉回人脸（匹配剪辑）。

---

## 镜 9 · 机房闪回 · 广播风暴卡死（约 6 秒 · 冷调，无人物）

**正向（此镜不含角色锚，强调冷调，去掉 warm color palette）：**
```
计算机机房，多块显示器上显示网络拓扑图，满屏节点同时向外发包，链路瞬间变红并卡死，画面有故障般的网格感。冷色荧光灯，蓝屏光，冷色调。没有人物或只有背影，重点是"系统被自己淹死"的视觉。cinematic, anime style, cel shading, cool color palette, grid feel, detailed, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**视频 I2V 运动：**
```
network nodes light up simultaneously and flood the screen with packets; connection lines flash red and freeze; subtle screen glitch and scanline; cold static energy, then a sharp freeze-frame.
```

**后期**：无字幕；音效尖锐报错「嘀——」一闪即逝；镜 8→9 用色彩突变+轻微模糊切到冷调（告诉观众这是回忆）；镜 9→10 同样手法切回暖调。

---

## 出图执行顺序（建议）

1. 先出镜 5、6、8（含林默）：共用同一随机 seed 底子，挑一张脸满意的把 seed 固定回填，再换场景词出另外两镜，保脸一致。
2. 镜 7、9 不含林默脸，单独出。
3. 每镜多抽，4 抽 1 常态；满意即固定 seed。
4. 视频走 I2V：镜 5、8（微妙运动最出戏）、镜 9（节点流动+卡死定格）做图生视频；镜 7 用静帧+剪映字幕动画即可。

## 一致性铁律
- 镜 5/6/8 必带林默特征（黑短发齐耳、细黑框眼镜、连帽卫衣）；严防画成长发/女生。
- 镜 5/6/8 暖调（台灯），镜 9 冷调（机房）—— 观众一眼分现实/回忆。
- 所有屏幕不画可读文字，只给气泡+光晕，文字全后期。

---

## 实跑记录（2026-09-27 · 云端 lightcc 实例）

- **工作流文件**：`ep1-beat-5-9-zimage-workflow.json`（API 格式，29 节点；可直接 POST 到 `/prompt`，或导入 ComfyUI 加载）
- **实跑结果**：`POST /prompt` 返回 200、`node_errors` 为空，约 60 秒出图 5 张，已下载到 `assets/img/ep1-pilot/`：
  - `ep1_beat5_00001_.png` · `ep1_beat6_00001_.png` · `ep1_beat7_00001_.png` · `ep1_beat8_00001_.png` · `ep1_beat9_00001_.png`
- **结论**：架构跑通；主要待修是「屏幕乱码字」（见上方已知坑）与「风格偏写实」两项。
- **想换风格**：同实例 `UNETLoader` 里还有 `Zimage/ZIT-Remix-Reality-v20`、`Zimage/ZIT-moodyRealMix_zitV5DPO`（更写实）等；若要更纯动漫可另找动漫向 Z-Image 底模。
