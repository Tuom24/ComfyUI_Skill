import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, ChevronRight, FolderOpen, Image, Layers3, Plus, SlidersHorizontal, Workflow } from 'lucide-react';
import { Button, Media, Notice, SectionTitle, formatDate } from '../components';
import { useCatalog } from '../hooks';
import { usePilot } from '../store';
import { PARAMETER_NAMES, type WorkflowDefinition } from '../catalog';
import { WorkflowPicker } from './Studio';
import { recentCreations } from '../recentCreations';

const STARTERS = [
  { id: 't2i', type: '文生图', title: '从文字开始', caption: '把构图、光线与风格写进画面', requirement: '输入要求以所选工作流为准', image: '/art/coast.svg', prompt: '海岸悬崖上的白色建筑，柔和晨光，平静的蓝绿色海面，极简摄影。' },
  { id: 'i2i', type: '图片编辑', title: '给原图一个新方向', caption: '保留主体，调整风格与细节', requirement: '进入工作台后添加工作流所需素材', image: '/art/still.svg', prompt: '保留主体与构图，调整为自然光下的温暖胶片风格。' },
  { id: 'i2v', type: '图生视频', title: '让静止的画面流动', caption: '从单张图片延伸镜头与运动', requirement: '进入工作台后添加工作流所需素材', image: '/art/desert.svg', prompt: '镜头缓慢向前推进，柔和光线，保持画面主体稳定。' },
];

export function WorkbenchStart() {
  const navigate = useNavigate();
  const { rows, error } = useCatalog();
  const tasks = usePilot(s => s.tasks);
  const [picker, setPicker] = useState(false);
  const [selected, setSelected] = useState(STARTERS[0].id);
  const opening = useRef<HTMLElement>(null);
  const available = STARTERS.filter(s => rows.some(w => w.modality === s.id));
  const starter = available.find(s => s.id === selected) ?? available[0] ?? STARTERS[0];
  const workflow = rows.find(w => w.modality === starter.id);
  const fields = workflow?.parameters.filter(p => ['steps', 'cfg', 'denoise', 'width', 'height', 'fps'].includes(p.name)).slice(0, 3) ?? [];
  const recent = recentCreations(tasks,3,'workbench');

  function create(template?: WorkflowDefinition) {
    const id = usePilot.getState().newTask({ text: '', output: template?.modality.endsWith('v') ? 'video' : 'image', preferredWorkflow: template?.id }, 'workbench');
    navigate(`/workbench/${id}`);
  }
  function selectStarter(id: string) {
    setSelected(id);
    opening.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  return <div className="page workbench-home">
    <SectionTitle title="工作台" description="提示词、素材与参数，在这里亲手调整。" action={<Button variant="secondary" onClick={() => create()}><Plus size={15}/>空白工作台</Button>}/>
    <section className="workbench-opening" aria-label="选择创作起点" ref={opening}>
      <div className="workbench-opening-copy">
        <span className="workbench-kicker"><SlidersHorizontal size={14}/>留给你调整的空间</span>
        <h2>把画面，<br/>调成你的想法。</h2>
        <p>从一个合适的模板开始，细调提示词、绑定素材，对照每次运行的结果。快速生成中的作品也可以在这里继续。</p>
        <div className="workbench-start-actions"><Button disabled={!workflow} onClick={() => create(workflow)}>{starter.type}工作台<ArrowUpRight size={15}/></Button><button className="text-button" onClick={() => setPicker(true)}>浏览全部模板<ArrowRight size={14}/></button></div>
        <div className="starter-requirement"><span className="status-dot"/>{starter.requirement}</div>
      </div>
      <figure className="workbench-preview">
        <div className="preview-window-bar"><span><Workflow size={14}/>我的创作<span className="preview-window-divider">/</span>{starter.type}</span><span><Layers3 size={13}/>工作区示意</span></div>
        <div className="preview-window-content" aria-hidden="true">
          <div className="preview-editing-pane"><div className="preview-section-label">提示词<span>01</span></div><p className="preview-prompt">{starter.prompt}</p><div className="preview-section-label">{starter.type === '文生图' ? '画面方向' : '输入素材'}<span>02</span></div><div className="preview-reference"><img src={starter.image} alt=""/><div><strong>{starter.type === '文生图' ? '海岸与光线' : '参考画面'}</strong><span>{starter.type === '文生图' ? '构图 · 光线 · 质感' : '命名 · 用途 · 阶段绑定'}</span></div></div><div className="preview-section-label">参数<span>03</span></div><dl className="preview-parameters">{fields.map(field => <div key={field.key}><dt>{PARAMETER_NAMES[field.name] ?? field.name}</dt><dd>{String(field.value)}</dd></div>)}</dl><div className="preview-version-mark"><Check size={11}/>每次运行，保留独立版本</div></div>
          <div className="preview-art-pane"><div className="preview-art-label"><Image size={12}/>画面预览</div><img src={starter.image} alt=""/><span className="preview-art-footer">{starter.type === '图生视频' ? '静帧示意 · 视频模板' : '原创示例画面'}<span>01 / 01</span></span></div>
        </div>
        <figcaption>编辑区示意，图片为原创示例；选择模板后进入实际工作台。</figcaption>
      </figure>
    </section>
    {error && <Notice tone="error">{error} 仍可创建空白工作台。</Notice>}
    <section className="starter-gallery" aria-label="常用创作模板"><div className="workbench-section-heading"><h2>选一个起点</h2><span>{rows.length ? `${rows.length} 份已核验模板` : '暂无已核验模板'}</span></div><div className="starter-gallery-items">{available.map((item, index) => <button key={item.id} className={`starter-gallery-item ${starter.id === item.id ? 'selected' : ''}`} aria-label={`预览${item.type}模板：${item.title}`} aria-pressed={starter.id === item.id} onClick={() => selectStarter(item.id)}><div className="starter-cover"><img src={item.image} alt={item.type === '图生视频' ? '沙漠建筑原创示例静帧' : `${item.type}原创示例`}/><span>{item.type}</span><i>{starter.id === item.id ? <Check size={15}/> : <ArrowUpRight size={16}/>}</i></div><div className="starter-gallery-caption"><span>0{index + 1}</span><div><h3>{item.title}</h3><p>{item.caption}</p></div></div></button>)}</div></section>
    <section className="workbench-recent"><div className="workbench-section-heading"><h2>最近的工作台</h2><Link className="text-button" to="/creations">全部创作<ArrowRight size={13}/></Link></div>{recent.length > 0 ? <div className="workbench-recent-list">{recent.map(task => {
      const result = task.runs.at(-1)?.artifacts[0];
      return <Link to={`/workbench/${task.id}`} key={task.id}><div className="workbench-recent-preview">{result ? <Media media={result}/> : <Workflow size={21}/>}</div><div><strong>{task.title}</strong><span>{task.handedOffAt ? '从快速生成转入' : task.draft.preferredWorkflow ? '从模板开始' : '自由编辑'} · {task.revisions.length} 个版本</span></div><time>{formatDate(task.updatedAt)}</time><ChevronRight size={16}/></Link>;
    })}</div> : <div className="workbench-recent-empty"><FolderOpen size={20}/><p>创建后的项目会留在这里，随时回来继续编辑。</p></div>}</section>
    {picker && <WorkflowPicker onClose={() => setPicker(false)} onSelect={create}/>}
  </div>;
}
