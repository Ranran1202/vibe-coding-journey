# 第 1 集《群里的光》· 全 14 镜 · Z-Image 自然语言提示词（v2 · 消字修订版）

> 用途：第 1 集整集出图。Z-Image（Lumina2 / `qwen_3_4b` 文本编码器）吃**自然语言**，不吃 SD1.5 的 `tag` 写法。
>
> **✅ 已实跑的配置（云端 lightcc 实例，2026-09-27）**
> | 项 | 值 |
> |---|---|
> | 主模型 `UNETLoader` | `Zimage/z_image_turbo_bf16.safetensors` |
> | 文本编码器 `CLIPLoader` (type=lumina2) | `qwen_3_4b.safetensors` |
> | VAE `VAELoader` | `ae.safetensors` |
> | 文本编码节点 | `CLIPTextEncodeLumina2`（字段是 `user_prompt`，system_prompt 选 `superior`） |
> | 采样 | Steps **8** / CFG **1.0** / `res_multistep` / `simple` / denoise 1.0 |
> | 尺寸 | **1024×1536**（竖屏） |
>
> **⚠️ 本版最重要的修订：消字（v1 出字问题的修正）**
> v1 跑的镜 7/8/9 被模型自动渲染了**可读乱码文字**（手机屏上出现假中文、镜片上出现「天/板」），违反本剧铁律「屏幕不出现可读文字，文字全后期」。根因与对策：
> - **根因**：Z-Image 这类模型见「手机 / 屏幕 / 群聊 / 拓扑图」会默认"补字"；且 **CFG=1.0 时反向提示词完全不起作用**（无引导分离），写反向词没用。
> - **对策（本版采用）**：在每条正向末尾追加统一硬约束句——
>   > `画面中绝对不出现任何文字、字母、汉字、数字、符号、水印、logo、界面图标；所有屏幕与界面只由纯色色块和柔光构成，不出现任何字符。`
> - **并把"屏幕内容"改写成"纯色色块"**：气泡 = 纯色圆角矩形，内部空白；镜 8 删掉「反的」二字（只留镜片光斑）；镜 9 拓扑图只留圆点/方块/细线。**凡是具体的字，一律留给剪映后期加。**
> - 若仍有个别镜出字：把该镜 CFG 提到 2.0–3.0 并把上面那句同时写进反向（`文字, 字母, 数字, 汉字, 水印, 乱码`）；或出图后用剪映把屏区盖住再叠字。

> **🎬 风格基准（本集已统一）**：剧本第 1 集镜 1 原注「写实动画风」，**实跑以「写实电影感」为准**（Z-Image-Turbo 天然偏写实，硬要赛璐璐动漫反而崩）。所以正向统一用 `cinematic photorealistic rendering, film still, shallow depth of field, soft realistic skin`，**不要再写 `anime style / cel shading`**——否则同集会混进赛璐璐风，跳帧。若整部改走纯动漫风，需另换动漫向底模，届时本文件所有提示词要整体重写风格尾串。

---

## 镜 1 · 宿舍趴桌，群聊瀑布（约 6 秒）

```
一个19岁的中国男大学生林默，黑短发齐耳，戴细黑框眼镜，中等身材，穿着纯色连帽卫衣，表情平静克制，趴在夜晚大学宿舍的书桌前，手机亮着放在手边，台灯暖黄的光打在他的侧脸上，背景是上下铺床架和堆着书本、泡面碗的凌乱书桌，窗外有城市灯火。中景，深夜安静又孤寂的氛围。画面中绝对不出现任何文字、字母、汉字、数字、符号、水印、logo、界面图标；所有屏幕与界面只由纯色色块和柔光构成，不出现任何字符。 anime style, cel shading, cinematic lighting, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**后期**：旁白「大二那年，我第一次发现，一群人同时兴奋，是会变得很有说服力的。」；屏上气泡字幕「闭眼进」（剪映加）。

---

## 镜 2 · 手机屏特写，消息瀑布（约 6 秒 · 屏特写）

```
手机屏幕的极端特写，深色界面上一排排纯色圆角矩形的聊天气泡形状不断向上冒出，气泡内部是完全空白的纯色，几个红色圆点在跳动，屏幕发出柔和的冷光，气泡边缘有轻微光晕，画面密集有压迫感。画面中绝对不出现任何文字、字母、汉字、数字、符号、水印、logo、界面图标；所有屏幕与界面只由纯色色块和柔光构成，不出现任何字符。 anime style, cel shading, cinematic lighting, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**后期**：密集「叮叮」提示音，越叠越紧；气泡文案叠字。

---

## 镜 3 · 分屏：群聊狂欢 / 林默安静（约 8 秒）

```
左右分屏构图：左半是手机屏幕上密集涌出的纯色聊天气泡形状与红色光点，右半是一个19岁的中国男大学生林默的侧脸，黑短发齐耳，戴细黑框眼镜，中等身材，穿着纯色连帽卫衣，安静地看着屏幕没有打字，台灯暖光勾边，手机冷光打在脸上。画面中绝对不出现任何文字、字母、汉字、数字、符号、水印、logo、界面图标；所有屏幕与界面只由纯色色块和柔光构成，不出现任何字符。 anime style, cel shading, cinematic lighting, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**后期**：消息音突然停一拍（留白）；旁白「阿强把账户截图发出来，后面跟了三十个鼓掌的表情。」

---

## 镜 4 · 门外喊话，林默没抬头（约 6 秒）

```
夜晚大学宿舍，一个19岁的中国男大学生林默，黑短发齐耳，戴细黑框眼镜，中等身材，穿着纯色连帽卫衣，表情平静克制，坐在书桌前没有抬头，视线落在手机上，房门半掩着，门缝漏进走廊的一道暖光和模糊的笑闹光影，台灯暖黄。中景，安静但像被打扰。画面中绝对不出现任何文字、字母、汉字、数字、符号、水印、logo、界面图标；所有屏幕与界面只由纯色色块和柔光构成，不出现任何字符。 anime style, cel shading, cinematic lighting, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**后期**：阿强（画外）「林默你还在犹豫？风口啊兄弟！」；门缝漏出的笑闹声。

---

## 镜 5 · 手指悬屏（约 8 秒）★v1 已出图，本版加消字

```
一个19岁的中国男大学生林默，黑短发齐耳，戴细黑框眼镜，中等身材，穿着纯色连帽卫衣，表情平静克制，夜晚坐在大学宿舍书桌前，食指悬在手机屏幕上方几厘米没有落下。台灯暖光照亮他的侧脸，手机冷光打在手背。手机屏幕是均匀发亮的冷光面，上面只有纯色圆角矩形的气泡形状与柔光。暖光与冷屏光形成对比，中近景，镜头微微上摇到手部。画面中绝对不出现任何文字、字母、汉字、数字、符号、水印、logo、界面图标；所有屏幕与界面只由纯色色块和柔光构成，不出现任何字符。 anime style, cel shading, cinematic lighting, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**视频 I2V**：`camera slowly pushes in on Lin Mo's hand hovering above the phone; screen glow flickers; warm lamp light trembles slightly; subtle breath.`

---

## 镜 6 · 打开 AI 对话框打字（约 6 秒）★v1 已出图，本版加消字

```
一个19岁的中国男大学生林默，黑短发齐耳，戴细黑框眼镜，中等身材，穿着纯色连帽卫衣，表情平静克制，双手握着手机正在打字，手机屏幕是均匀的冷白发光面，只有抽象的圆角矩形轮廓和一条闪烁的细竖线光标。夜晚宿舍书桌前，台灯暖光在镜片上拉出细线，手机屏光照在脸上。侧近景，焦点在手机屏，半张脸入镜。画面中绝对不出现任何文字、字母、汉字、数字、符号、水印、logo、界面图标；所有屏幕与界面只由纯色色块和柔光构成，不出现任何字符。 anime style, cel shading, cinematic lighting, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**后期**：对话框字幕「大家都买的时候，我该跟吗？」（打字机效果）。

---

## 镜 7 · 屏特写，AI 回复浮出（约 10 秒 · 屏特写）★v1 出字，本版重写

```
手机屏幕的极端特写，占满画面，深色界面上浮现出一条被柔光包裹的纯色圆角矩形气泡，气泡内部完全空白，其余气泡形状虚化在背景里，浅景深，柔光晕开。画面中绝对不出现任何文字、字母、汉字、数字、符号、水印、logo、界面图标；所有屏幕与界面只由纯色色块和柔光构成，不出现任何字符。 anime style, cel shading, cinematic lighting, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**后期**：字幕逐字浮出「你看的是『大家都在买』，不是『它值这个价』。这两件事，经常是反的。」

---

## 镜 8 · 盯着屏幕，镜片明灭（约 12 秒）★v1 出字，本版删「反的」

```
一个19岁的中国男大学生林默，黑短发齐耳，戴细黑框眼镜，中等身材，穿着纯色连帽卫衣，表情平静克制，面部大特写，正对镜头，久久盯着眼前的手机屏幕没有动，手机屏幕的冷光映在他的镜片上，镜片上只有柔和的光斑与反光。表情平静、被击中但克制。夜晚宿舍，台灯暖光勾边。画面中绝对不出现任何文字、字母、汉字、数字、符号、水印、logo、界面图标；所有屏幕与界面只由纯色色块和柔光构成，不出现任何字符。 anime style, cel shading, cinematic lighting, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**视频 I2V**：`phone glow fades to dark then flickers back on; light plays across his glasses and cheek; eyes blink once, very slow; heavy stillness.`

**后期**：字幕「反的……」；极轻 pad 音起。

---

## 镜 9 · 机房闪回 · 广播风暴卡死（约 6 秒 · 冷调 · 无人物）★v1 出字，本版重写

```
计算机机房，多块显示器组成画面，屏幕上只有极度简化的网络拓扑示意：圆点与方块由细线连接成网格，链路正由蓝变红并卡死，色块拥挤到近乎过载，画面带故障般的网格感与扫描线。冷色荧光灯，冷蓝色调，没有人物。重点是“系统被自己淹死”的视觉。画面中绝对不出现任何文字、字母、汉字、数字、符号、水印、logo、界面图标；所有屏幕与界面只由纯色色块和柔光构成，不出现任何字符。 cinematic, anime style, cel shading, cool color palette, grid feel, detailed, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**后期**：无字幕；尖锐报错「嘀——」一闪即逝；色彩突变切回暖调表示回到现实。

---

## 镜 10 · 手机反扣，桌面震动（约 6 秒）

```
夜晚大学宿舍桌面特写，一部手机屏幕朝下反扣在木桌上，机身微微震动，桌面上的水杯和笔记本随之轻颤，台灯暖黄，背景是虚化的宿舍一角。画面中绝对不出现任何文字、字母、汉字、数字、符号、水印、logo、界面图标；所有屏幕与界面只由纯色色块和柔光构成，不出现任何字符。 anime style, cel shading, cinematic lighting, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**后期**：旁白「那条消息，是发给所有人的。也包括我。」；桌面嗡嗡震动声。

---

## 镜 11 · 重新拿起手机，静音群聊（约 8 秒）

```
一个19岁的中国男大学生林默，黑短发齐耳，戴细黑框眼镜，中等身材，穿着纯色连帽卫衣，表情平静克制，重新把手机从桌上拿起，拇指停在屏幕侧面，神情平静而果断，手机屏幕是均匀的冷光面。夜晚宿舍，台灯暖光勾边。中近景。画面中绝对不出现任何文字、字母、汉字、数字、符号、水印、logo、界面图标；所有屏幕与界面只由纯色色块和柔光构成，不出现任何字符。 anime style, cel shading, cinematic lighting, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**后期**：林默（很轻）「先不跟。」；静音的「咔」一声。

---

## 镜 12 · 群里忽然安静（约 8 秒 · 屏特写）

```
手机屏幕特写，深色界面上一条单独的纯色圆角矩形气泡从下方浮现在大片空白处，周围其余气泡形状虚化，屏幕冷光柔和，气氛忽然安静下来。画面中绝对不出现任何文字、字母、汉字、数字、符号、水印、logo、界面图标；所有屏幕与界面只由纯色色块和柔光构成，不出现任何字符。 anime style, cel shading, cinematic lighting, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**后期**：字幕「那个…我刚卖了，有点慌。」；一声迟疑的提示音。

---

## 镜 13 · 群主头像变灰（约 8 秒 · 屏特写）

```
手机屏幕特写，画面上方一个圆形头像图标由彩色渐变为灰色并略微虚化，下方是纯色的圆角矩形气泡形状，屏幕冷光偏暗，气氛沉下去。画面中绝对不出现任何文字、字母、汉字、数字、符号、水印、logo、界面图标；所有屏幕与界面只由纯色色块和柔光构成，不出现任何字符。 anime style, cel shading, cinematic lighting, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**后期**：字幕「X 已退出群聊」；音乐骤然收住。

---

## 镜 14 · 关灯收尾（约 8 秒 · 宽镜）

```
夜晚大学宿舍的宽镜，一个19岁的中国男大学生林默，黑短发齐耳，戴细黑框眼镜，中等身材，穿着纯色连帽卫衣，表情平静克制，坐在书桌前伸手关掉台灯，房间沉入黑暗，只剩台灯余光落在他的侧脸上，手机屏幕已经暗下。安静克制的收尾感，画面几乎全黑。画面中绝对不出现任何文字、字母、汉字、数字、符号、水印、logo、界面图标；所有屏幕与界面只由纯色色块和柔光构成，不出现任何字符。 anime style, cel shading, cinematic lighting, detailed face, clean lineart, film grain, best quality, masterpiece, highly detailed, sharp focus
```

**后期**：无台词；一片安静，只有呼吸。

---

## 一致性铁律（出图前默念）

1. **林默每镜必带**：黑短发齐耳、细黑框眼镜、纯色连帽卫衣、表情平静克制 —— 严防画成女生/长发。
2. **冷暖分现实/闪回**：宿舍 = 暖（台灯）；机房闪回（镜 9）= 冷（荧光灯 + 网格感）。
3. **屏幕不出字**：一律纯色色块 + 柔光，所有文案后期剪映加。
4. **跨镜保脸**：镜 1/3/4/5/6/8/11/14 含林默，先挑一张脸满意的固定 seed 回填，再出其余镜。

## 出图执行顺序（建议）

1. 先出含林默的镜（1/3/5/8），4 抽 1 挑脸 → 固定 seed。
2. 再出屏特写（2/7/12/13）与空镜（9/10）—— 这几镜不含脸，可任意 seed。
3. 视频走 I2V：镜 5、8（微动最出戏）、镜 9（节点流动 + 卡死定格）；屏特写镜用静帧 + 剪映字幕动画。

---

## 实跑记录（2026-09-27 · 云端 lightcc 实例）

- **工作流**：`ep1-all-14-zimage-workflow.json`（API 格式，74 节点；可直接 POST `/prompt`，也可导入 ComfyUI）
- **v1（镜 5–9，SD1.5 提示词 → Z-Image 改写版）问题**：镜 7/8/9 屏幕被渲染出**可读乱码文字**（详见本文件开头「消字」说明）。
- **v2（本版，整集 14 镜 + 消字措辞）**：`POST /prompt` 返回 200、`node_errors` 空，**2 分 35 秒出图 14 张**，已下载到 `assets/img/ep1/ep1_beat01.png … ep1_beat14.png`。
  - ✅ **消字基本成功**：镜 7（手机屏）与镜 8（眼镜反光）**乱码文字全部消失**，只剩纯色气泡与光斑。
  - ⚠️ **新发现 3 类坑（已在 v3 修正）**：
    1. **正向里的「解释性引号」会被画成屏上文字** —— 镜 9 我在提示词里写了「重点是“系统被自己淹死”的视觉」，结果屏幕上真的出现了这句中文。**教训：正向提示词里不要出现引号包裹的句子，模型会当成要显示的内容。**
    2. **含「头像图标」会被理解成壁纸/人物图** —— 镜 13 原写「头像图标变灰」，出了个动漫女孩的脸当屏保。改为「纯色圆形色块头像占位符 + 明确声明画面中没有人物图像、没有脸」。
    3. **「桌上手机反扣」会多画手机** —— 镜 10 出了两部手机且屏可见。改为「画面里只有一部手机，屏幕朝下，看不见屏幕内容，没有第二部手机」。
    4. **风格漂移** —— 首批 14 张里只有镜 1 走了赛璐璐动漫风，其余走写实，同集会跳。v3 把镜 1 重出为写实，全集合一。
- **v3（4 镜修正版）**：`ep1-fix-4shots-zimage-workflow.json`，49 秒出图 4 张（镜 1/9/10/13），**四张全部达标**，已择优替换进 `assets/img/ep1/`。
- **可复用工具**：`submit_to_cloud.py <workflow.json>` —— 把任意 API 格式工作流提交到该云端实例、轮询出图、自动下载，免开界面。
- **建议下一步**：① 对 14 张里仍不理想的单镜多抽（每镜 4 抽 1 常见，改 KSampler seed 重跑即可）；② 挑镜 5/8/9 走 I2V 出视频；③ 按同法铺第 2–6 集（提示词模板与本文件一致，只换场景段）。
