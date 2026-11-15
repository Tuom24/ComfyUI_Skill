import type { Run } from './domain';

export function generationPresentation(run: Run | undefined, connected: boolean) {
  if (!run) return { phase:'planning', title:'正在整理创作方案', detail:'核对提示词、素材用途与可用工作流。此时尚未开始生成。', moving:true };
  if (!connected) return { phase:'restoring', title:'连接中断，等待恢复', detail:'保留最后确认的阶段，恢复后核对执行状态，不会重复提交。', moving:false };
  if (run.status==='cancel_requested') return { phase:'stopping', title:'正在等待停止确认', detail:'取消请求已提交；收到执行器确认后才会标记为已停止。', moving:false };
  if (run.status==='queued') return { phase:'queued', title:'已排队，等待执行', detail:'提示词和素材版本已锁定。轮到这次创作后，处理会自动开始。', moving:true };
  if (run.status==='repairing') return { phase:'repairing', title:'正在检查并修复问题', detail:`已执行 ${run.attempt}/${run.maxAttempts} 次。系统会根据错误反馈调整，再使用剩余次数重试。`, moving:true };
  if (run.producing) return { phase:'delivering', title:'正在整理成果', detail:'处理阶段已进入成果准备，完成后可在这里查看与下载。', moving:true };
  return { phase:'running', title:'正在处理你的创作', detail:'当前阶段完成后会更新记录，成果准备好后将自动显示。', moving:true };
}

export function elapsedLabel(startedAt: number, now: number) {
  const seconds=Math.max(0,Math.floor((now-startedAt)/1000));
  return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
}
