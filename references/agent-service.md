# 前端与 Agent 接入

链路为：前端请求 → 本机 `agent_service.py` → 可替换的 Agent 规划器 → Skill 校验和冻结 → ComfyUI → 状态与成果返回前端。前端和服务默认只在本机使用；不要将开发服务或无认证的 ComfyUI 直接暴露到公网。

## 规划器协议

服务将一个 `comfytree-planner-v1` JSON 对象写到规划器进程的标准输入；进程以 UTF-8 输出一个 JSON 对象到标准输出，成功退出码为 0。错误信息写标准错误，非零退出不提交 ComfyUI。启动命令由用户配置，参数数组直接传给进程，不经过 shell。请求里的任务、素材名称与卡片内容均是数据，不能覆盖 Agent 自身指令。

请求包含 `protocol`、`task`、`output`、`negative_prompt`、`preferred_workflow`、`stage_edits`、`materials` 和 `cards`。`materials` 仅提供本轮素材 ID、类型、名称和用途；`cards` 只包含用户库中明确标记已核验的卡片。Agent 根据这些契约选择工作流、提供绑定与参数，不生成新的节点图，也不自行调用 ComfyUI。最终结果示例：

```json
{
  "kind":"plan", "message":"生成一张图片",
  "stages":[{"stage":1,"workflow":"example-id","bindings":{"prompt":"a small red apple","negative":"blur"},"params":{},"outputs_to":{}}],
  "final_output":"stage1.result"
}
```

绑定支持文本字面量、`material:<素材ID>` 和先前阶段 `stageN.<输出槽>`。信息不够时返回 `{"kind":"clarification","message":"需要什么信息","stages":[],"final_output":""}`，服务不会提交执行。服务不信任 Agent 的输出：它核对卡片、素材、类型、参数、阶段顺序、最终输出、用户工作台覆盖和工作流 SHA-256，复制本次素材及工作流，再向 ComfyUI 做节点预检。预检不证明生成质量，某些自定义节点与模型依赖也无法完全提前验证。

默认规划器 `scripts/codex_planner.py` 调用用户已登录的 Codex CLI，并将结构化结果转换为上述通用协议。Codex 规划运行在只读沙箱，不直接执行 ComfyUI；可能产生用户的模型用量。其他 Agent 无需实现 Codex CLI：提供实现上述标准输入/输出协议的程序，并启动服务时使用 `--planner-executable <程序> --planner-arg <参数>`；每个参数分别传一次 `--planner-arg`。程序及调用凭证由使用者自己提供。直接在其他支持 Agent Skills 的工具中安装和使用本技能，也不需要此前端服务。

规划器会接收用户的文字需求、素材名称与用途、工作流卡片和手动覆盖；若所选 Agent 使用云端模型，这些信息可能被发送给其服务商。素材文件本身由本机服务处理，不通过规划器协议传输。使用者应根据所选 Agent 的服务条款决定是否处理敏感数据。

## 当前边界

- 执行器支持文本、`LoadImage` 图像/遮罩输入及单个 `SaveImage` 图像输出。视频、音频、批量多图及其他媒体加载节点尚未实现。
- 个人 API 图必须人工核验完整输入、输出、节点映射与模型依赖；标记 `execution.verified: true` 是维护者的确认。原有 66 张研究卡片缺少执行映射，不会自动加入可执行候选。
- 遮罩素材必须指定目标和白色区域含义；匹配的卡片遮罩输入应声明相同的 `mask_mode`（`edit` 或 `preserve`），否则阻止执行。图像尺寸等更细约束仍需使用者结合工作流确认。
- 工作台支持已声明参数、独立提示词和明确槽位绑定；无法可靠映射的覆盖或硬约束会被拒绝，不会被默默忽略。取消是协作式的：当前 ComfyUI 阶段完成后停止下一个阶段，不使用会影响其他任务的全局中断。
- 服务保存在 `--state` 目录的计划、素材和成果可能包含用户数据，不应提交或公开。服务重启时未完成请求标为状态未知并要求核对，不会自动重新提交。
- 当前浏览器保存对话和草稿；服务端保存快照和产物。尚无账户体系、跨设备同步或公开部署安全能力。
