import type { Artifact, Asset, Creation, CreationConstraints, CreationSpec, Draft, OutputKind } from './domain';

export type TurnIntent = 'question' | 'plan_only' | 'execute';
/** Development-only intent rules. The production service supplies the resolved spec and patch. */
export function classifyTurn(text: string): TurnIntent {
  if (/^(?:请)?(?:解释|说明|为什么|为何|怎么|如何|有哪些|支持哪些|这是什么|能做什么|目前支持)|(?:什么意思|有什么区别|现在什么状态|进度怎么样)[？?。]*$/.test(text.trim())) return 'question';
  if (/只(?:看|要|生成|检查|讨论|调整).{0,5}(?:方案|计划|需求)|先.{0,8}(?:方案|规划)|(?:不要|先别|暂不)(?:执行|运行|生成)|先看看/.test(text)) return 'plan_only';
  if (/[？?]$/.test(text.trim()) && !/(?:帮我|请把|把它|改成|生成一|制作一|继续生成|调整为)/.test(text)) return 'question';
  return 'execute';
}

function goalText(text: string) {
  return text.replace(/(?:不要|不做|不需要)(?:视频|动画|图片|图像)/g,'').replace(/\d+(?:\.\d+)?\s*(?:秒钟?|s\b|fps\b|帧\/秒)/gi,'').replace(/\d+\s*[:：]\s*\d+/g,'').replace(/\d+\s*[x×*]\s*\d+/gi,'').replace(/(?:生成|制作|一张|一幅|一段|图片|图像|照片|视频|动画|横版|竖版|方图)/g,'').replace(/^[\s，,。]+|[\s，,。]+$/g,'').trim() || '延续当前创作';
}
function outputFrom(text: string, previous: OutputKind) {
  const positive=text.replace(/(?:不要|不需要|不做|别做)(?:视频|动画|图片|图像)/g,'');
  const actions=[...positive.matchAll(/(?:改成|改为|换成|还是|只要|输出|生成|制作)[^，。；！？\n]{0,10}?(图片|图像|照片|静态图|视频|动画)/g)];
  const latest=actions.at(-1)?.[1];
  if(latest)return /视频|动画/.test(latest)?'video':'image';
  if(/动起来|视频|动画/.test(positive))return 'video';
  if(/图片|图像|照片|静态图/.test(positive)||/不要(?:视频|动画)/.test(text))return 'image';
  return previous;
}
function constraintsFrom(text: string, old: CreationConstraints, output: OutputKind) {
  const next={...old};
  const duration=text.match(/(\d+(?:\.\d+)?)\s*(?:秒钟?|s\b)/i);
  const fps=text.match(/(\d+(?:\.\d+)?)\s*(?:fps|帧\/秒|帧每秒)/i);
  const size=text.match(/(\d+)\s*[x×*]\s*(\d+)/i);
  const ratio=text.match(/(\d+)\s*[:：]\s*(\d+)/);
  const count=text.match(/(?:生成|输出|要)\s*(\d+)\s*(?:张|幅|个结果)/);
  if(duration)next.durationSeconds=Number(duration[1]);
  if(fps)next.fps=Number(fps[1]);
  if(size){next.width=Number(size[1]);next.height=Number(size[2]);}
  if(ratio)next.ratio=`${Number(ratio[1])}:${Number(ratio[2])}`;
  else if(/横版|横构图/.test(text))next.ratio='横版';
  else if(/竖版|竖构图/.test(text))next.ratio='竖版';
  else if(/方图|正方形/.test(text))next.ratio='1:1';
  if(count)next.count=Number(count[1]);
  if(/不限制时长|取消时长/.test(text))delete next.durationSeconds;
  if(/不限制比例|取消比例/.test(text))delete next.ratio;
  if(output==='image'){delete next.durationSeconds;delete next.fps;}
  return next;
}

export function initialSpec(draft: Draft): CreationSpec {
  return draft.spec?structuredClone(draft.spec):{goal:goalText(draft.text),instruction:draft.text,output:draft.output,constraints:constraintsFrom(draft.text,{},draft.output),changes:[]};
}
export function compileSpec(spec: CreationSpec) {
  const c=spec.constraints;
  return [`创作目标：${spec.goal}`,spec.instruction?`本轮要求（优先于背景描述）：${spec.instruction}`:'',`当前输出：${spec.output==='image'?'图片':'视频'}`,c.durationSeconds!==undefined?`目标时长：${c.durationSeconds} 秒`:'',c.fps!==undefined?`目标帧率：${c.fps} fps`:'',c.width&&c.height?`目标尺寸：${c.width} × ${c.height}`:'',c.ratio?`画面比例：${c.ratio}`:'',c.count?`成果数量：${c.count}`:''].filter(Boolean).join('\n');
}
export function resolveTurn(draft: Draft, text: string): CreationSpec {
  const previous=initialSpec(draft);
  const command=/^(?:开始|确认|继续|立即)?(?:生成|执行|运行)[吧。！!\s]*$/.test(text.trim());
  if(command)return {...previous,changes:['按当前方案要求继续执行']};
  const output=outputFrom(text,previous.output);
  const constraints=constraintsFrom(text,previous.constraints,output);
  const changes:string[]=[];
  if(output!==previous.output)changes.push(`输出改为${output==='image'?'图片':'视频'}`);
  if(constraints.durationSeconds!==previous.constraints.durationSeconds)changes.push(constraints.durationSeconds!==undefined?`目标时长 ${constraints.durationSeconds} 秒`:'取消视频时长要求');
  if(constraints.ratio!==previous.constraints.ratio)changes.push(`画面比例 ${constraints.ratio??'不限'}`);
  if(constraints.fps!==previous.constraints.fps&&constraints.fps)changes.push(`帧率 ${constraints.fps} fps`);
  if(constraints.width!==previous.constraints.width||constraints.height!==previous.constraints.height)changes.push(`尺寸 ${constraints.width} × ${constraints.height}`);
  return {...previous,goal:!draft.text.trim()||previous.goal==='延续当前创作'?goalText(text):previous.goal,instruction:text,output,constraints,changes:changes.length?changes:['按本轮描述调整，保留当前创作背景']};
}

export function currentArtifact(task: Creation): Artifact | undefined {
  const selected=task.runs.flatMap(r=>r.artifacts).find(a=>a.id===task.selectedArtifactId);
  return selected??[...task.runs].reverse().find(r=>r.artifacts.length)?.artifacts[0];
}
export function requestsCurrentResult(text: string) { return /把它|将它|这张|该图|这幅|这段|刚才|当前(?:成果|结果|图片)|让.{0,5}动起来|再.{0,8}(?:暖|冷|亮|暗)|(?:暖|亮|冷|暗)一点/.test(text); }
export function roleFromInstruction(asset: Asset, text: string): Asset['role'] | undefined {
  if(asset.kind==='image'&&/(?:参考|借鉴).{0,12}(?:风格|色调|质感)|作为.{0,4}参考/.test(text))return 'reference';
  if(asset.kind==='image'&&/原图|编辑|修改|重绘|保留.{0,8}(?:主体|构图)|让.{0,5}动起来/.test(text))return 'source';
  if(asset.kind==='video'&&/输入视频|原视频|编辑|修改|剪辑|视频画质/.test(text))return 'video';
  return undefined;
}
