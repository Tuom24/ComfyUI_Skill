import type { Benchmark, Capability, Protocol } from './domain';
export const CAPABILITIES: Capability[] = [
  { id: 'text-image', name: '文字变成画面', subtitle: '文生图', kind: 'image', category: '图像生成', required: [], state: 'available', prompt: '一座立于海岸悬崖的现代白色建筑，落日余晖，平静的蓝绿色海面，极简建筑摄影，竖构图。', cover: '/art/coast.svg', workflow: 'W404dc3bdaa', description: '描述主体、环境与视觉风格，系统为你选择图像生成流程。' },
  { id: 'image-edit', name: '给画面一个新风格', subtitle: '图像编辑', kind: 'image', category: '图像编辑', required: ['source'], state: 'available', prompt: '保持原图的主体和构图，把画面转换为温暖的胶片摄影风格，柔和颗粒与自然光线。', cover: '/art/still.svg', workflow: 'Wfaf115c6c9', description: '以指定图片为输入进行风格与细节修改，保留明确提出的约束。' },
  { id: 'image-video', name: '让静止的瞬间流动', subtitle: '图生视频', kind: 'video', category: '视频创作', required: ['source'], state: 'available', prompt: '让这张海岸图片动起来，镜头缓慢推进，海面轻轻流动，保持建筑稳定，生成一段短视频。', cover: '/art/coast.svg', workflow: 'We9ebcd7c4b', description: '提供一张输入图片并描述运动方式，选择图片驱动的视频工作流。' },
  { id: 'chain', name: '从新风格到新故事', subtitle: '组合创作', kind: 'video', category: '组合任务', required: ['source'], state: 'available', prompt: '先将输入图片改为电影感的黄昏色调，再让画面生成一段缓慢推进的视频，保持主体一致。', cover: '/art/desert.svg', workflow: 'Wfaf115c6c9 → We9ebcd7c4b', description: '将已有工作流按依赖组合，前一步的输出作为后一步的输入。' },
  { id: 'local-edit', name: '只改变你选中的区域', subtitle: '局部重绘', kind: 'image', category: '图像编辑', required: ['source', 'mask'], state: 'available', prompt: '只修改遮罩选中的区域，替换为自然的绿色植物，保留其他部分。', cover: '/art/garden.svg', workflow: 'W03c604ae5f', description: '需要待编辑图片与 PNG 遮罩，明确指定需要修改的区域。' },
  { id: 'talking', name: '让照片开口说话', subtitle: '人物视频', kind: 'video', category: '视频创作', required: ['source', 'video'], state: 'unavailable', prompt: '', cover: '/art/still.svg', workflow: '由联合选择器确定', description: '当前演示环境缺少驱动依赖，暂不可用。需要人物图片与驱动视频。' },
];
export const LIMITS = { maxAssets: 8, imageBytes: 20 * 1024 * 1024, videoBytes: 200 * 1024 * 1024, accepted: ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'] };
export const PROTOCOL: Protocol = { profile: 'capability_single_pass', workflowCount: 66, topK: 20, queryLimit: 1, maxAttempts: 3, evaluator: 'ComfyBench official', dataset: 'ComfyBench-200-original' };
export const DEMO_BATCH: Benchmark = { id: 'demo-batch', name: '单次检索 RAG · 界面演示', source: 'demo', status: 'completed', createdAt: Date.UTC(2026, 9, 23, 2), total: 4, protocol: PROTOCOL, cases: [
  { id: 'demo-001', prompt: '生成海岸建筑的极简摄影作品', routing: 'passed', execution: 'completed', quality: 'passed', attempts: 1, artifact: '/art/coast.svg', evidence: ['模拟能力描述：生成海岸建筑图像。', '模拟检索：66 → Top-20；匿名工作流 W404dc3bdaa。', '模拟组合校验：文本输入 → 图片输出，依赖有效。', '模拟官方评价：通过。此记录不是实际实验结果。'] },
  { id: 'demo-002', prompt: '将参考图片调整为胶片风格', routing: 'passed', execution: 'completed', quality: 'failed', attempts: 3, artifact: '/art/still.svg', reason: '模拟：主体保持未达到质量要求', evidence: ['模拟检索：Wfaf115c6c9。', '模拟执行：共 3 次尝试，包含首次执行。', '模拟评价：未达到主体保持要求。'] },
  { id: 'demo-166', prompt: '修改输入图像人物的肤色', routing: 'failed', execution: 'not_run', quality: 'not_evaluated', attempts: 0, reason: '模拟：候选工作流需要未提供的遮罩', evidence: ['模拟组合失败：缺少 mask。', '记录 routing_failed；不补检索；保留在分母中。'] },
  { id: 'demo-189', prompt: '由单张人物照片生成说话视频', routing: 'failed', execution: 'not_run', quality: 'not_evaluated', attempts: 0, reason: '模拟：缺少 driving video', evidence: ['模拟输入：只有图片。', '候选需要未提供的 driving video。', '记录 routing_failed。该示例只说明失败处理逻辑。'] },
] };
export const ROLE_LABEL = { unassigned: '尚未定义用途', reference: '风格 / 内容参考', source: '待处理原图', video: '待处理视频', mask: '区域遮罩', start_frame: '视频起始帧', end_frame: '视频结束帧', driving: '动作驱动视频' };
export const RUN_LABEL = { queued: '等待执行', running: '正在生成', repairing: '自动修复中', cancel_requested: '取消请求中', cancelled: '已取消', completed: '生成完成', failed: '执行失败' };
export const SCENARIOS = { normal: '正常完成', repair: '修复后完成', failure: '执行尝试用尽', dependency: '模型依赖缺失', no_match: '无可执行组合', quality: '生成完成但质量未通过' };
