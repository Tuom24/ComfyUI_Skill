# 工作流语义卡片规范

语义卡片是与工作流文件一一对应的能力描述。每张卡片一个 JSON 文件，文件名 = `<id>.json`，集中存放于 `cards/` 目录。

## 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `id` | string | ✅ | 工作流唯一标识，kebab-case，如 `bg-replace-v1`；与文件名、组合计划引用一致 |
| `name` | string | ✅ | 人类可读名称，如 `背景替换` |
| `modality` | string | ✅ | 输入模态：`image` / `video` / `text` / `audio` / `multi` |
| `task_family` | string | ✅ | 任务族，如 `背景编辑`、`图生视频`、`风格迁移`；同族工作流互为备选 |
| `summary` | string | ✅ | 一句话能力描述，只写可验证的行为，不写效果承诺 |
| `inputs` | array | ✅ | 输入槽列表，见下 |
| `outputs` | array | ✅ | 输出槽列表，见下 |
| `params` | array | ✅ | 可调参数列表，见下 |
| `api_graph` | string | ✅ | 工作流 JSON/API 图的相对路径 |
| `notes` | string | ⬜ | 适用边界与已知限制，如"大角度视角变化可能失真" |

## inputs / outputs 槽

```json
{"slot": "image", "type": "image", "required": true, "desc": "原始图像"}
```

- `slot`：槽名，在组合计划 `bindings` 中引用；
- `type`：媒体类型，取值 `image` / `mask` / `video` / `audio` / `text` / `latent`；类型匹配是硬约束，`mask` 不能接 `image`；
- `required`：必填槽在执行前必须有绑定；可选槽未绑定时按 `desc` 中声明的默认行为处理。

## params 参数

```json
{"name": "denoise", "type": "float", "range": [0.5, 0.9], "default": 0.75, "desc": "重绘幅度"}
```

- `type`：`string` / `int` / `float` / `bool` / `enum`；
- `range`：数值范围或 `enum` 的取值列表；组合计划中的取值必须在范围内；
- 只登记影响结果的关键参数，节点内部固定值不登记。

## 登记流程

1. 读取工作流 JSON，定位输入节点（LoadImage/LoadVideo/文本框）、输出节点（SaveImage/SaveVideo）和可调参数节点；
2. 按上表填写卡片，`summary`/`notes` 基于实际执行或工作流来源文档，不臆造；
3. 保存到 `cards/<id>.json`，确认 `api_graph` 路径可达；
4. 同族工作流使用相同 `task_family`，便于互为备选。

## 一致性维护

- 新增/替换工作流时同步新增/更新卡片，删除工作流时删除对应卡片；
- 卡片与工作流文件不一致时（id、路径、参数对不上），以工作流文件为准修正卡片；
- `notes` 是选择依据的一部分，用户反馈的边界信息（如"对低分辨率输入效果差"）应更新进 `notes`。
