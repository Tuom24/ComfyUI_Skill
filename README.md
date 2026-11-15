# ComfyTree Agent Skill

ComfyTree 将个人 ComfyUI 工作流登记为语义卡，由 Agent 根据用户需求生成方案，再由 Skill 校验、冻结和执行。仓库包含可独立安装的 `comfyflow-compose` 技能、可替换的 Agent 规划器协议、本机服务和 ComfyTree 前端。

**目前是可验证原型，不是完整产品。** 已实测真实 Codex 规划、本机 ComfyUI 文生图、前端快速生成和工作台修改参数后复跑；已在本机验证图片复制的两阶段传递。其他 Agent 产品尚待独立端到端测试；66 张历史研究卡片还没有执行映射。具体见 [当前状态](STATUS.md)。

## 安装技能

需要 Python 3.9+、用户自己的 ComfyUI 服务及所需模型/自定义节点。将仓库完整目录复制到支持 Agent Skills 的客户端技能目录，例如：

- Codex：`~/.codex/skills/comfyflow-compose/`
- WorkBuddy：`~/.workbuddy/skills/comfyflow-compose/`

具体目录以客户端配置为准。重新加载技能或重启客户端后，可请求 Agent：“使用 comfyflow-compose 登记我的 ComfyUI API 工作流。”其他支持 Agent Skills 的客户端可以读取同一 `SKILL.md` 和脚本，不需要 Codex；实际发现与工具权限以各客户端为准。

个人工作流、素材、密钥和产物保存在独立的用户目录，不放入技能目录或公开仓库。登记 API 图（普通 UI 格式需要先从 ComfyUI 导出为 API 格式）：

```bash
python <skill>/scripts/register_workflow.py <api-graph.json> --library <user-library> --id my-workflow
```

登记产生草稿，不自动推断真实能力和完整节点映射。使用者或 Agent 应检查图与来源说明、补齐全部输入/输出和映射，确认无误后设置 `execution.verified: true`。具体格式见 [执行契约](references/execution.md)。现有 66 张研究卡片尚无已验证执行映射，默认不会被视为可执行候选。

## 启动前端和 Agent 服务

启动 ComfyUI，并准备已核验的个人工作流库。默认使用已登录的 Codex CLI 规划；模型用量和客户端权限由使用者负责。也可用 [规划器协议](references/agent-service.md) 替换为其他 Agent。下面的尖括号是需要替换的路径，保留空格的路径请用引号括起来。

```bash
# 终端 1：先按自己的部署方式启动 ComfyUI
# 终端 2：启动仅监听本机的 Agent 服务
python <skill>/scripts/agent_service.py --library <user-library> --state <private-state-directory> --comfy-url http://127.0.0.1:8188

# 终端 3：首次安装前端依赖后启动界面（Node.js 22.12+）
cd <skill>/web
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173/`。快速生成可让 Agent 选择工作流，也可先查看方案；工作台可编辑已声明的提示词、参数与槽位。服务将用户的阶段覆盖与 Agent 计划核对，通过后冻结卡片、API 图和素材，并运行 Skill。当前图像执行限制、取消语义和隐私边界见 [Agent 服务说明](references/agent-service.md)。

例如 Windows PowerShell 中，把 `$skill` 改成仓库实际路径，先启动本机 ComfyUI（默认 8188），再分别在两个终端运行：

```powershell
$skill = 'C:\path\to\comfyflow-compose'
python "$skill\scripts\agent_service.py" --library "$skill\examples\text-to-image\library" --state "$env:USERPROFILE\ComfyTree-state" --comfy-url http://127.0.0.1:8188
```

```powershell
$skill = 'C:\path\to\comfyflow-compose'
Set-Location "$skill\web"
npm ci
npm run dev
```

示例文生图需要安装工作流指定的 SD 1.5 模型；模型文件名和其他环境条件见示例卡片。默认 Codex 规划器还需要安装并登录 Codex CLI。只打开前端不能证明生成环境已就绪。

也可安装前端依赖后运行 `python <skill>/scripts/launch_frontend.py`；默认打开 5174 并连接 8090，可用 `--frontend`、`--port`、`--api-url` 指定其他地址。启动器不负责启动 ComfyUI 或 Agent 服务。

## 最小验证

`examples/smoke/` 只读取并保存一张图片，验证接口和阶段传递，不需要生图模型；将它复制到独立目录并放入 `input.png`。`examples/text-to-image/library/` 是已在指定 SD 1.5 模型上实测的单阶段文生图卡片与 API 图，**不包含模型权重**。两种示例都需要实际运行的 ComfyUI；工作流和模型的可用性以用户环境为准。

```bash
python <skill>/scripts/validate_plan.py <plan.json> --cards <user-library>/cards
python <skill>/scripts/run_plan.py <plan.json> --cards <user-library>/cards --server http://127.0.0.1:8188 --output <new-output-directory> --check
# 预检通过后去掉 --check 才会提交执行
```

开发测试：`python -m unittest discover -s tests -v`；前端在 `web/` 运行 `npm test` 和 `npm run build`。模拟测试不能替代模型、第三方节点及其他 Agent 产品的真实联调。

## 开放与赛事材料

本仓库未包含模型权重、用户素材、密钥、运行记录或录制案例图片。自研代码许可证按团队决定暂不指定；现有工作流及其第三方依赖的权利需要逐项核验。[资源使用清单](OPEN_SOURCE_INVENTORY.md) 和 [状态说明](STATUS.md) 如实列出待办，不等于已经完成全部赛事许可审查。
