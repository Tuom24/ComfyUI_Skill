import { recordingMode } from '../liveApi';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, FileImage, Film, Layers3, Search, SlidersHorizontal, Type } from 'lucide-react';
import { MODALITIES, PARAMETER_NAMES, workflowTitle, type WorkflowDefinition } from '../catalog';
import { Button, Empty, Modal, Notice } from '../components';
import { useCatalog } from '../hooks';

const OPERATIONS: Record<string, string> = {
  replacement:'局部替换', comic_strip:'漫画分镜', handwritten_letter:'手写信件', interior_plan:'室内布局', poster:'海报设计', watermark_add:'添加水印',
  frame_interpolation:'视频补帧', quality_restoration:'画质修复', upscaling:'清晰放大', portrait_conversion:'人像转换', refinement:'细节精修', composition_layout:'构图生成',
  image_to_video:'让图片动起来', keyframe_interpolation:'首尾帧过渡', panoramic_exploration:'全景探索', text_rendering:'画中文字', text_to_image:'文字成像', text_to_video:'文字成片',
  extension:'画布扩展', age_progression:'年龄变化', clothing:'服装重绘', face_swap:'面部替换', gender_swap:'人物外观', hairstyle:'发型与发色', id_photo:'证件照片', skin_color:'肤色调整',
  modification:'光线重塑', generation:'遮罩生成', text_overlay:'文字叠加', watermark_removal:'水印处理', dancing:'舞蹈动作', speaking:'说话动作', addition:'添加物体', color_modification:'物体调色', removal:'移除物体',
  cloning:'姿态参考', defect_fix:'瑕疵修复', old_photo_fix:'老照片修复', seam_refinement:'接缝修复', cartoonization:'卡通画风', content_cloning:'内容参考', material_transformation:'材质转换', repainting:'风格重绘', sculpture_conversion:'雕塑质感', style_cloning:'风格参考', style_transfer:'画风迁移', shot_composition:'视频拼接', transition:'镜头过渡',
};
const GROUPS = ['全部方向', '画面生成', '人物与动作', '局部与背景', '画风与光线', '画质与修复', '文字与设计', '视频与镜头'];
const FEATURED = ['W404dc3bdaa','W04dc26c831','W203425ac34','We9ebcd7c4b','Wfaf115c6c9','W72dfb2c5a2'];
export function workflowGroup(w: WorkflowDefinition) {
  const family = w.operation.split('/')[0];
  if (w.operation.endsWith('/upscaling')) return '画质与修复';
  if (/Identity|Face|Pose|Motion/.test(family)) return '人物与动作';
  if (/Object|Background|Mask|Geometry/.test(family)) return '局部与背景';
  if (/Style|Lighting/.test(family)) return '画风与光线';
  if (/Restoration|Enhancement/.test(family)) return '画质与修复';
  if (/Creative|Misc/.test(family)) return '文字与设计';
  if (w.modality.endsWith('v')) return '视频与镜头';
  return '画面生成';
}
function shortTitle(w: WorkflowDefinition) {
  if (w.description.includes('旋转色相')) return '局部调色';
  if (w.operation.startsWith('Background')) return '背景替换';
  return OPERATIONS[w.operation.split('/')[1]] ?? MODALITIES[w.modality];
}
function descriptionPart(w: WorkflowDefinition, part: '输入' | '输出') {
  return w.description.match(new RegExp(`${part}[：:]([\\s\\S]*?)(?=\\n\\s*[^\\n]+[：:]|$)`))?.[1].trim() ?? '详见模板定义';
}

/** Code-native capability illustrations, deliberately labelled as diagrams rather than results. */
export function WorkflowArtwork({ workflow }: { workflow: WorkflowDefinition }) {
  const id = useId();
  const group = workflowGroup(workflow);
  const portrait = group === '人物与动作';
  const design = group === '文字与设计';
  const edit = group === '局部与背景';
  const restore = group === '画质与修复';
  const video = workflow.modality.endsWith('v');
  const operation = workflow.operation.split('/')[1];
  return <svg className="workflow-artwork" viewBox="0 0 420 252" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" x2="1" y1="0" y2="1"><stop stopColor="var(--art-base)"/><stop offset="1" stopColor="var(--surface-2)"/></linearGradient></defs>
    <rect width="420" height="252" fill={`url(#${id})`}/>
    <circle cx="345" cy="38" r="94" fill="var(--art-soft)" opacity=".22"/>
    <path d="M0 211L420 148V252H0Z" fill="var(--art-soft)" opacity=".35"/>
    {portrait ? <g>
      <path d="M110 228V209Q110 147 192 147Q275 147 275 209V228" fill="var(--art-ink)"/>
      <path d="M167 137V163Q193 185 218 163V137" fill="var(--art-warm)"/>
      <ellipse cx="192" cy="102" rx="45" ry="56" fill="var(--art-warm)"/>
      <path d="M148 103Q132 39 185 37Q247 30 237 105L222 79Q177 90 163 65Z" fill="var(--accent)" opacity=".8"/>
      <path d="M267 58H300M284 42V74M290 119H328M309 101V138" stroke="var(--art-ink)" strokeWidth="1.5" opacity=".6"/>
      <rect x="124" y="27" width="137" height="198" rx="68" fill="none" stroke="var(--surface)" strokeWidth="1.5" opacity=".8"/>
      {operation==='clothing' && <><path d="M127 186L155 165L192 187L230 165L258 186" fill="none" stroke="var(--surface)" strokeWidth="2" strokeDasharray="4 4"/><path d="M155 169L171 192L192 181L214 192L230 169" fill="var(--art-soft)"/><path d="M193 187V225" stroke="var(--surface)" strokeWidth="1.5"/></>}
      {operation==='hairstyle' && <><path d="M143 95Q130 28 184 25Q248 19 245 104L219 68Q188 89 161 62Z" fill="var(--accent)" opacity=".8"/><path d="M158 43Q199 18 226 54M164 53Q199 31 226 65" fill="none" stroke="var(--art-soft)" strokeWidth="2"/></>}
      {operation==='id_photo' && <><rect x="105" y="19" width="175" height="216" rx="3" fill="none" stroke="var(--accent)" strokeWidth="1.5"/><path d="M298 171H342M298 181H330M298 195H342M298 205H319" stroke="var(--art-ink)" strokeWidth="2" opacity=".6"/></>}
      {/face_swap|portrait_conversion|refinement/.test(operation) && <><circle cx="192" cy="101" r="59" fill="none" stroke="var(--surface)" strokeWidth="1.5" strokeDasharray="4 5"/><path d="M174 104H181M204 104H211M185 129Q193 134 202 129" stroke="var(--art-ink)" strokeWidth="2" fill="none"/></>}
      {operation==='age_progression' && <g fill="none" stroke="var(--art-ink)" opacity=".7"><path d="M170 92Q179 88 185 92M201 92Q209 88 216 92M170 110L181 112M205 112L215 110M182 135Q194 142 205 135"/></g>}
      {operation==='cloning' && <g fill="none" stroke="var(--accent)" strokeWidth="2"><circle cx="315" cy="113" r="10"/><path d="M315 124V169L294 202M315 169L338 199M315 135L289 159M315 135L342 119"/><circle cx="315" cy="169" r="4" fill="var(--surface)"/></g>}
    </g> : design ? <g transform="rotate(-9 210 126)">
      <rect x="117" y="25" width="181" height="210" rx="2" fill="var(--surface)"/>
      <rect x="134" y="42" width="147" height="105" fill="var(--art-soft)"/>
      <circle cx="230" cy="80" r="24" fill="var(--art-warm)"/>
      <path d="M134 147L198 73L256 147" fill="var(--art-ink)"/>
      {operation==='comic_strip' && <><path d="M207 42V147M134 94H281" stroke="var(--surface)" strokeWidth="7"/><path d="M146 57H180M222 108H258" stroke="var(--surface)" strokeWidth="9" strokeLinecap="round"/></>}
      <text x="133" y="186" fontSize="31" fontWeight="500" fontFamily="Georgia,serif" fill="var(--text)">{operation==='handwritten_letter'?'Dear,':operation==='interior_plan'?'SPACE.':'FORM.'}</text>
      <path d="M134 203H228M134 210H184" stroke="var(--muted)" opacity=".5"/>
    </g> : <g>
      <circle cx="291" cy="68" r="29" fill="var(--art-warm)"/>
      <path d="M0 195Q67 131 157 189T420 177V252H0Z" fill="var(--art-ink)" opacity=".35"/>
      <path d="M138 211V104Q138 46 197 46Q255 46 255 104V211Z" fill="var(--surface)"/>
      <path d="M170 211V112Q170 85 197 85Q224 85 224 112V211Z" fill="var(--art-ink)"/>
      <path d="M255 115L318 144V211H255Z" fill="var(--surface)" opacity=".6"/>
      <path d="M76 213H343" stroke="var(--art-ink)" opacity=".45"/>
      {edit && <><rect x="156" y="72" width="83" height="141" rx="3" fill="none" stroke="var(--accent)" strokeDasharray="5 5"/><path d="M232 71L272 52H306" fill="none" stroke="var(--accent)"/><circle cx="232" cy="71" r="3" fill="var(--accent)"/></>}
      {restore && <><path d="M210 20V234" stroke="var(--accent)" strokeWidth="1.5"/><g stroke="var(--surface)" strokeWidth="1" opacity=".5">{[72,96,120,144,168,192].map(x=><path key={x} d={`M${x} 65V220`}/>)}{[80,104,128,152,176,200].map(y=><path key={y} d={`M60 ${y}H210`}/>)}</g></>}
      {workflow.operation.startsWith('Lighting') && <g stroke="var(--art-warm)" strokeWidth="9" opacity=".24"><path d="M277 0L59 252M329 0L111 252M381 0L163 252"/></g>}
      {workflow.operation.startsWith('Style') && <><path d="M210 24V231" stroke="var(--accent)" strokeDasharray="3 4" opacity=".6"/><path d="M227 173L246 156M234 191L269 159M242 207L291 163M261 208L309 166" stroke="var(--art-warm)" strokeWidth="4" opacity=".7"/></>}
    </g>}
    {video && <g><rect x="26" y="210" width="368" height="22" rx="3" fill="var(--surface)" opacity=".88"/>{Array.from({length:15},(_,i)=><rect key={i} x={35+i*24} y="216" width="16" height="10" rx="1" fill={i<7?'var(--art-ink)':'var(--art-soft)'}/>)}<circle cx="354" cy="67" r="19" fill="var(--surface)" opacity=".9"/><path d="M350 59L361 67L350 75Z" fill="var(--art-ink)"/></g>}
    <path d="M23 42V25H40M380 25H397V42M23 211V228H40M380 228H397V211" stroke="var(--art-ink)" fill="none" opacity=".5"/>
  </svg>;
}

export function WorkflowBrowser({ rows, error, output, onUse, secondaryAction }: { rows: WorkflowDefinition[]; error?: string; output?: string; onUse(w: WorkflowDefinition):void; secondaryAction?(w: WorkflowDefinition): ReactNode }) {
  const [query,setQuery] = useState('');
  const [modality,setModality] = useState('all');
  const [group,setGroup] = useState(GROUPS[0]);
  const [selectedId,setSelectedId] = useState('');
  const detail = useRef<HTMLElement>(null);
  useEffect(()=>{
    if(selectedId && window.matchMedia('(max-width:760px)').matches) detail.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});
  },[selectedId]);
  const available = rows.filter(w => !output || (w.modality.endsWith('v')?'video':'image') === output).sort((a,b)=>{
    const ai=FEATURED.indexOf(a.id), bi=FEATURED.indexOf(b.id);
    return (ai<0?FEATURED.length:ai)-(bi<0?FEATURED.length:bi);
  });
  const found = available.filter(w => (modality==='all'||w.modality===modality) && (group===GROUPS[0]||workflowGroup(w)===group) && `${w.id} ${w.description} ${shortTitle(w)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = found.find(w=>w.id===selectedId) ?? found[0];
  const visibleGroups = GROUPS.filter(g=>g===GROUPS[0]||available.some(w=>workflowGroup(w)===g));
  const types = Object.entries(MODALITIES).filter(([key])=>available.some(w=>w.modality===key));
  return <div className={`template-browser ${selectedId?'has-preview':''}`}>
    <div className="template-browser-intro"><div><span className="eyebrow">TEMPLATE COLLECTION</span><h2>选一种方式，让想法成形。</h2><p>先看处理方向，再确认素材要求。选好后进入工作台调整。</p></div><span><strong>{available.length.toString().padStart(2,'0')}</strong>份模板</span></div>
    <div className="template-search-row"><label className="search-field"><Search size={16}/><input aria-label="搜索模板" placeholder="搜索效果、素材要求或模板编号" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="模板类型" value={modality} onChange={e=>setModality(e.target.value)}><option value="all">全部类型</option>{types.map(([key,title])=><option key={key} value={key}>{title} · {available.filter(w=>w.modality===key).length}</option>)}</select></div>
    <div className="template-directions" aria-label="按创作方向筛选">{visibleGroups.map(g=><button key={g} aria-pressed={group===g} className={group===g?'active':''} onClick={()=>setGroup(g)}>{g}</button>)}</div>
    {error && <Notice tone="error">{error}</Notice>}
    <div className="template-reading-layout"><div className="template-results"><p className="template-result-count">{found.length} 份匹配模板<span>图示为能力示意，非实际生成效果</span></p><div className="template-visual-grid">{found.map(w=><button key={w.id} aria-label={`查看模板：${shortTitle(w)} · ${w.id}`} aria-pressed={selected?.id===w.id} className={`template-tile ${selected?.id===w.id?'selected':''}`} onClick={()=>setSelectedId(w.id)}><div className="template-tile-art"><WorkflowArtwork workflow={w}/><span className="template-modality">{MODALITIES[w.modality]}</span><span className="template-selection">{selected?.id===w.id?<Check size={15}/>:<ArrowUpRight size={15}/>}</span></div><div className="template-tile-caption"><div><h3>{shortTitle(w)}</h3><span>{workflowGroup(w)}</span></div><p>{workflowTitle(w)}</p></div></button>)}</div>
      {!found.length && <Empty icon={<Layers3 size={25}/>} title={rows.length?'没有匹配的模板':error?'目录暂不可用':'正在读取模板'} description={rows.length?'换一个关键词，或查看其他创作方向。':'模板准备好后会显示在这里。'} action={rows.length?<button className="text-button" onClick={()=>{setQuery('');setModality('all');setGroup(GROUPS[0]);}}>清除筛选<ArrowRight size={13}/></button>:undefined}/>}
    </div>{selected && <aside ref={detail} className="template-detail" aria-label="所选模板详情"><button className="text-button template-mobile-back" onClick={()=>setSelectedId('')}><ArrowLeft size={13}/>返回模板列表</button><div className="template-detail-cover"><WorkflowArtwork workflow={selected}/><span>能力示意</span></div><div className="template-detail-heading"><span>{MODALITIES[selected.modality]} / {workflowGroup(selected)}</span><h3>{shortTitle(selected)}</h3><p>{workflowTitle(selected)}</p></div><div className="template-use-actions"><Button onClick={()=>onUse(selected)}>使用这个模板<ArrowRight size={14}/></Button>{secondaryAction?.(selected)}</div><dl className="template-requirements"><div><dt>{selected.modality.startsWith('t')?<Type size={14}/>:selected.modality.startsWith('v')?<Film size={14}/>:<FileImage size={14}/>}需要准备</dt><dd>{descriptionPart(selected,'输入')}</dd></div><div><dt><ArrowUpRight size={14}/>你会得到</dt><dd>{descriptionPart(selected,'输出')}</dd></div></dl><details className="template-technical"><summary><SlidersHorizontal size={13}/>模板字段与来源</summary><p>{selected.nodeCount} 个节点 · {selected.parameters.length} 个可编辑字段</p><p>{[...new Set(selected.parameters.map(p=>PARAMETER_NAMES[p.name]??p.name))].slice(0,8).join(' / ')}</p><code>{selected.id}</code><small>文件校验 SHA256 · {selected.sha256.slice(0,12)}</small></details><p className="template-availability">{recordingMode?'模板定义已收录，可查看输入要求与节点参数。':'模板定义已收录。模型与插件环境待验证，当前运行为演示。'}</p></aside>}</div>
  </div>;
}

export function WorkflowPicker({ onSelect, onClose, output }: { onSelect(w: WorkflowDefinition):void; onClose():void; output?:string }) {
  const {rows,error} = useCatalog();
  return <Modal title="浏览创作模板" wide className="template-library-modal" onClose={onClose}><WorkflowBrowser rows={rows} error={error} output={output} onUse={w=>{onSelect(w);onClose();}}/></Modal>;
}
