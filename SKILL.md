---
name: comfytree
description: 使用 ComfyTree 管理个人 ComfyUI 工作流、匹配和组合生成任务、校验并执行已核验的图像工作流，或启动用户指定的 ComfyTree 前端。适用于登记工作流、自然语言驱动 ComfyUI 和多阶段素材传递。
---

# ComfyTree 工作流技能

把用户的任务和素材映射到工作流卡片与有序计划，再校验、执行并交付。用户提供的工作流、素材和生成记录属于用户个人数据；保存在用户指定的独立目录，不写入技能安装目录或上传到代码仓库。

## 工作流与任务

- 确定 ComfyUI 服务地址及用户工作流库位置。未指定时先检查现有配置或询问；不得假设某台机器的路径或节点已安装。普通 ComfyUI UI JSON 不能当作 API 图执行，请从 ComfyUI 导出 API 格式。
- 登记 API 图时运行 `python <skill>/scripts/register_workflow.py <graph.json> --library <用户库目录> --id <唯一ID>`。检查实际图、来源文档和用户说明，补齐草稿卡片的全部输入、输出、参数、节点映射及限制；不能从节点名猜测效果或忽略输入。仅核实完整后将 `execution.verified` 设为 true。格式见 [执行契约](references/execution.md)。
- 自然语言任务先明确目标与现有素材，根据卡片的类型、能力及限制选择工作流。多阶段用实际输出连接后续输入；无法满足时说明缺口。内置 66 张卡片是历史研究资产，输入及节点映射未经此次运行核验，不能直接视作可执行卡片；发现缺项应基于 API 图纠正，不能臆造。
- 根据 [计划模板](assets/composition-plan.template.json) 写计划，类型必须显式区分 image 和 mask，文本可直接绑定或引用 UTF-8 文本文件；所有素材路径相对计划文件。执行 `python <skill>/scripts/validate_plan.py <plan.json> --cards <库目录>/cards`。该检查只验证声明契约，不证明图、模型、节点及运行结果可用。
- 运行 `python <skill>/scripts/run_plan.py <plan.json> --cards <库目录>/cards --server <ComfyUI地址> --output <新输出目录> --check` 进行服务器节点及映射预检。确认通过后去掉 `--check` 执行并报告实际产物、工作流与参数。当前脚本仅支持 `LoadImage` 图像/遮罩、文本输入和 `SaveImage` 单图输出；视频、音频、复杂自定义节点或多图输出需要合适的专用执行器，不得宣称已执行。输出目录必须不存在，脚本保存提交 ID；超时或提交结果不明时检查服务器队列和 `run.json`，不要自动重发。
- 用户提出修改时更新计划并重新校验；不在同一轮静默循环重试。模型、自定义节点、私有路径和账号由用户环境提供；缺少依赖时报告实际缺口。

## ComfyTree 前端

用户要求使用前端时，优先使用本技能 `web/` 中的 ComfyTree 前端；用户明确指定其他版本时使用其路径。先按 [Agent 服务说明](references/agent-service.md) 准备工作流库、ComfyUI 和 Agent 规划器，并运行 `scripts/agent_service.py`；安装前端依赖后运行 `python <skill>/scripts/launch_frontend.py`。默认 Codex 是可替换的规划器，不是技能格式要求；其他 Agent 可直接使用技能或实现该协议。不要仅凭页面打开就声称生成环境可用。

如需字段细节和边界，阅读 [执行契约](references/execution.md)。
