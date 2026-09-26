# AI 漫剧 · 视频生成指南（ComfyUI · 云端 GPU）

> 项目：《我的AI不预测股价，它预测人性》
> 你本地**没有显卡**，所以 ComfyUI 跑在**云端 GPU 实例**上（AutoDL / 揽睿星核等按小时租用）。
> 本文件是"出片"这一步的可复用操作手册，和展示站代码无关（站点只存视频外链，见 TECH_DESIGN）。

## 一、租云端 GPU（以 AutoDL 为例）
1. 打开 autodl.com 注册并充值（新人有赠金，出几段短片约 ¥5–20）。
2. 租实例：选一张显卡。出视频建议 **RTX 3090 / 4090（24G）**；预算紧可先用 **A10（24G）** 或 **3060（12G，只够几秒短片段）**。
3. 镜像选 **ComfyUI** 官方/社区镜像（通常已带 PyTorch + SDXL 基础环境）。
4. 开机后，实例控制台提供「JupyterLab」「终端」「自定义服务（打开 ComfyUI WebUI）」三个入口。

## 二、装视频模型
ComfyUI 默认只有文生图，出视频要补模型 + 节点：
- 推荐 **Wan2.1 / Wan2.2**（阿里，效果与性价比平衡）或 **HunyuanVideo**（腾讯）。
- 在 ComfyUI 管理器（ComfyUI-Manager）里搜对应工作流节点包安装；模型权重按镜像文档下到 `models/` 对应目录（Wan 的 UNet/VAE/CLIP、HunyuanVideo 的 transformer 等）。
- 多数镜像社区提供「一键装 Wan」脚本，优先用，省去手动下权重。

## 三、两种工作流
- **文生视频（T2V）**：给提示词直接出片，适合空镜、情绪镜头、概念画面。
- **图生视频（I2V）**：先有一张图（角色设定图 / 分镜草图）让画面动起来，适合角色出场、对话场景。
- 角色一致性：先用即梦 / SD 出一张固定形象的参考图，I2V 时反复引用，保证林默、阿强每集长相一致。

## 四、从 episodes.json 取提示词
每集的 `cast`（出场角色）、`scene`（场景）、`summary`（剧情）就是提示词素材。示例（第 1 集）：
- 角色：林默（计算机大二男生，黑框眼镜、连帽卫衣）；阿强（室友，圆脸）。
- 场景：大学宿舍、自习室、手机屏幕。
- 风格提示词：`cinematic, soft lighting, Chinese university campus, 2.5D anime style, consistent character`。

> 建议把每集最终用的提示词回填到 `episodes.json` 对应集的字段里，作为"剧本圣经"的一部分。

## 五、出片 → 上线
1. ComfyUI 出 mp4 → 下载到本地。
2. 上传 **B站 / YouTube** 拿嵌入链接（最省事，且符合「视频外链不进仓库」规则）。
3. 把链接填进 `ai-drama/data/episodes.json` 每集的 `videoUrl` + `embedType`，剧集页（episodes.html）会自动 iframe 播放（接入逻辑在第 5 步实现）。
4. **不要**把 mp4 直接丢进仓库——仓库只存文字介绍和链接。

## 六、合规
页脚已有「虚构声明 / 不构成投资建议」。出片时画面也避免明示真实代码、或暗示收益可复制。
