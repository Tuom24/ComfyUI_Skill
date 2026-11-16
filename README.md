# ComfyTree

ComfyTree 是面向 ComfyUI 的 Agent Skill：把个人 API 工作流登记为可检索的语义卡，让 Agent 根据任务与素材规划工作流，再经校验后执行。配套前端提供快速生成、工作台编辑和运行结果查看。

当前发布版本：**v1.0.0**。

## 使用前准备

- 支持 Agent Skills 的客户端，例如 WorkBuddy 或 Codex，以及 Python 3.9 及以上。
- 可访问的 ComfyUI 服务，以及所选工作流需要的模型和自定义节点。
- 使用前端时，需要 Node.js 22.12 及以上、npm 和一个已登录且有可用模型权限的规划器 CLI。WorkBuddy 前端规划使用 CodeBuddy CLI；Codex 前端规划使用 Codex CLI。

在 Windows PowerShell 中，可将仓库安装到 WorkBuddy 的用户技能目录：

```powershell
git clone https://github.com/Tuom24/ComfyUI_Skill.git "$HOME/.workbuddy/skills/comfytree"
```

Codex 用户可将目录改为 `"$HOME/.codex/skills/comfytree"`。其他客户端请使用其配置的技能目录。若目标目录已经存在，请在检查本地修改后更新，避免覆盖已有文件。安装后重新加载技能或重启客户端。

可以直接对 Agent 说：

> 使用 ComfyTree 连接我的 ComfyUI，登记我的 API 格式工作流；先检查输入、节点和模型，再根据我的需求生成方案并执行。

Agent 会根据实际环境询问或检查服务地址、工作流和素材。模型、个人工作流、账号、素材和产物由用户自行提供和管理。

## 登记个人工作流

从 ComfyUI 导出 **API 格式** JSON，然后让 Agent 登记，或运行：

```powershell
python "$skill/scripts/register_workflow.py" "$graph" --library "$library" --id my-workflow
```

其中 `$skill` 是技能目录，`$graph` 是 API 图文件，`$library` 是独立的个人工作流库目录。登记先生成草稿；核对全部输入、输出、参数、节点映射、模型及依赖后，才能将 `execution.verified` 设为 `true`。字段与映射见[执行契约](references/execution.md)。随仓库提供的 66 张参考卡尚未配置执行映射，需逐张核验后才能运行。

## 使用前端

先启动 ComfyUI，并准备已核验的工作流库。使用 PowerShell 的两个终端分别启动 Agent 服务和前端：

```powershell
# 终端 1：将路径改为自己的技能目录和工作流库
$skill = "$HOME/.workbuddy/skills/comfytree"
$library = "C:/path/to/your-workflow-library"
python "$skill/scripts/agent_service.py" --library "$library" --state "$HOME/ComfyTree-state" --comfy-url http://127.0.0.1:8188 --planner workbuddy
```

```powershell
# 终端 2：安装依赖并启动前端，保持终端开启
$skill = "$HOME/.workbuddy/skills/comfytree"
Set-Location "$skill/web"
npm ci
python "$skill/scripts/launch_frontend.py"
```

默认打开 `http://127.0.0.1:5174/`。Codex 用户将服务命令中的 `--planner workbuddy` 改为 `--planner codex`。前端服务默认连接 `http://127.0.0.1:8090`；ComfyUI 或服务使用其他地址时，请相应修改参数。启动器只启动前端，按 `Ctrl+C` 停止。CLI 路径、登录与其他 Agent 接入方法见[前端与 Agent 接入](references/agent-service.md)。

快速生成适合描述需求后由 Agent 规划；工作台支持检查和编辑工作流声明的提示词、参数和输入槽，再运行新版本。个人库中没有合适的已核验工作流时，系统会提示补充。输入可包括图片和遮罩；遮罩需要明确关联目标及白色区域的含义。

## 验证与能力范围

`examples/smoke/` 是无需模型的图片复制工作流，可验证上传、执行和结果读取；将该目录复制到独立位置，并在其中放入名为 `input.png` 的图片。`examples/text-to-image/library/` 提供 SD 1.5 文生图示例，模型文件名见 API 图；仓库不包含权重。两个示例都需要运行中的 ComfyUI。

```powershell
python "$skill/scripts/validate_plan.py" "$plan" --cards "$library/cards"
python "$skill/scripts/run_plan.py" "$plan" --cards "$library/cards" --server http://127.0.0.1:8188 --output "$output" --check
```

将变量替换为实际路径。预检通过后去掉 `--check` 才会执行；`$output` 必须是尚不存在的新目录。

当前执行器支持文本、`LoadImage` 图片及遮罩输入，以及单张 `SaveImage` 输出，也可将阶段图片传递给后续阶段。视频、音频、多图输出及其他媒体节点需要额外执行器；模型、自定义节点、图像尺寸和生成效果仍取决于具体工作流与环境。

## 资源与许可

仓库不包含模型权重和用户素材。项目代码暂未指定许可证；公开可见并不自动授予开源使用或再分发许可。工作流和第三方依赖的来源及许可状态见[资源清单](OPEN_SOURCE_INVENTORY.md)。
