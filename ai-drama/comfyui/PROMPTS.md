# 出图提示词手册（SD WebUI 版）

> 用途：给 `script-draft.md` 里的每一镜出画面。
> 分工：**出图 = SD WebUI（就是你现在这个）**；**出视频 = ComfyUI（云端 GPU）**。
> 抄法：正向 = ①角色锚 + ②本镜场景 + ③风格锚 + ④画质锚，四段拼起来粘进「正向提示词」。

---

## 一、固定不变的积木块（每个镜头都要带）

### ① 角色锚 —— 林默（主角，6 集都用这一段，保证脸不跑）
```
(1boy:1.35), male focus, masculine, solo, chinese college student, 19 years old, (short black hair:1.25), hair above ears, thin-framed glasses, average build, plain hoodie
```
> ⚠️ **踩坑记录**：动漫底模（如 APWainting）容易把男生画成女生。若出图仍是女生：
> 1. 检查反向提示词里有 `1girl, female, feminine, long hair, breasts, makeup` 这几项；
> 2. 把 `(1boy:1.35)` 继续加到 `1.5`，并把 `slim build` 换成 `average build`（"纤细"会助长女性化）；
> 3. 头发描述**不要**用 `messy hair` / `hair between eyes`（极容易变长发），用 `short hair, hair above ears`；
> 4. 抽 6 次以上还是女生 → 说明该底模男性画得差，换底模，或把主角设定改成女生（剧情同样成立）。
> 后面出场时替换用（本集不用）：
> - 阿强：`1boy, chinese college student, 20 years old, short spiky hair, sporty jacket, confident grin`
> - 陈教授：`1woman, chinese female professor, 40 years old, tied-back hair, blazer, gentle stern expression`

### ③ 风格锚 —— 全剧统一画风
```
anime style, cel shading, cinematic lighting, warm color palette, detailed face, clean lineart, film grain
```

### ④ 画质锚
```
best quality, masterpiece, highly detailed, sharp focus
```

### 反向提示词（固定，直接粘，别改）
```
(worst quality, low quality:1.4), blurry, jpeg artifacts, lowres, bad anatomy, bad hands, extra fingers, missing fingers, extra limbs, deformed, disfigured, mutation, ugly, watermark, signature, text, username, logo, photorealistic, 3d render, oversaturated, flat lighting, 1girl, female, feminine, long hair, breasts, makeup, lipstick, earrings, mascara, blush
```
> 结尾那一串 `1girl, female, feminine, long hair, ...` 是**防性别跑偏**的，别删。

---

## 二、参数照抄（图里那几栏）

| 位置 | 填什么 |
|---|---|
| 模型 | `sd15/APWainting_v1.2`（已选对，别动） |
| 外挂 VAE | `vaeFtMse840000EmaPruned`（已选对，别动） |
| CLIP 终止层数 | **2**（动漫模型要这个值，你做对了） |
| 采样方法 Sampler | `DPM++ 2M Karras`（把 Automatic 改掉，比现在的 2M 更稳） |
| 调度类型 | `Karras` |
| 迭代步数 Steps | **25** |
| 提示词引导 CFG Scale | **7** |
| 尺寸 | **512 × 768**（竖屏，短视频用） |
| 种子 Seed | **-1**（先随机抽，抽到满意的那张再固定） |
| 高分辨率修复 Hires.fix | 开，放大算法 `R-ESRGAN 4x+ Anime6B`，重绘幅度 **0.45**，放大到 768×1152 |

**操作顺序**：填好上面 → 点右侧橙色「生成」→ 出图不满意就再点一次（种子随机，多抽几次很正常，出 4 张里挑 1 张是常态）。

---

## 三、第 1 集 14 个镜头 —— ②场景段（照抄，配上面的①③④）

| 镜号 | ② 场景段（粘在角色锚后面） |
|---|---|
| 1 | `sitting at dorm desk at night, warm desk lamp light, holding smartphone, phone screen glow on face, messy desk with books and instant noodle cup, dormitory room with bunk bed, medium shot` |
| 2 | `montage view, student carrying books in library aisle, back view, holding food tray in canteen, delivering food in rain with delivery box, daylight, three panels composition` |
| 3 | `close-up of hand holding smartphone, thumb tapping download button on app store screen, simple blue interface glow, dim dorm room background` |
| 4 | `close-up of smartphone screen showing a form being filled line by line, fingers typing, glowing screen in dark room, shallow depth of field` |
| 5 | `split screen composition, left side glowing group chat bubbles on phone, right side boy staring at screen without replying, night dorm, cold phone glow vs warm lamp` |
| 6 | `side view of boy putting phone down on desk, looking out of dorm window at night, profile face, distant city lights, quiet mood, medium shot` |
| 7 | `close-up of smartphone chat interface, two hands typing a message, screen glow lighting fingertips, dark dorm at night` |
| 8 | `close-up of smartphone screen text bubble, soft glow, boy's reflecting eyes visible on screen surface, shallow depth of field, night` |
| 9 | `extreme close-up of boy's eyes widening slightly, reflection of screen light in glasses, single word floating in air above his head, dark background` |
| 10 | `overhead view of smartphone screen showing a simple bullet list of three lines, boy's hand holding it above a notebook, desk lamp light` |
| 11 | `phone screen showing chat messages piling up, notification banner, boy's roommate talking off screen, casual dorm night, warm light` |
| 12 | `close-up of thumb pressing send on chat message, screen glow, calm expression reflected, night dorm` |
| 13 | `smartphone screen showing success notification icon and a number, the boy not touching it, hand resting beside phone, warm desk lamp, still composition` |
| 14 | `wide shot of dark dorm room, boy turns off desk lamp, screen light fading, silhouette sitting still, one line of light on the wall, cinematic darkness` |

---

## 四、改其他集时怎么套
1. 角色锚不变（林默永远是①那段），阿强/陈教授出场时按上面的备选替换。
2. 风格锚、画质锚、反向提示词、参数 —— **全部不动**。
3. 只换②场景段，场景从 `data/episodes.json` 每集的 `scene` 字段展开（宿舍 / 课堂 / 图书馆 / 毕业季）。

## 五、几个坑
- **提示词写英文**。SD1.5 模型对中文理解很差，中文词基本等于噪音。
- **别让 AI 画屏幕上的文字**（余额、聊天内容），SD 渲染文字必糊。要"数字感"就靠屏幕光晕 + 特写手部，文字后期在剪映加。
- 一张图里只画一个人，多人同框（林默+阿强）容易出多手多脚，建议**分开出图再拼**。
- 抽到满意的一张后，把种子数字填回 Seed 栏，换个场景词就能保持同一张脸的"底子"。
- 出图分辨率别超过 768 宽，SD1.5 拉太高会出双头。要清晰用 Hires.fix 放大。
