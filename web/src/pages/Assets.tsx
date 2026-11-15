import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Check, FileImage, Film, Folder, FolderInput, FolderOpen, FolderPlus, Image, Pencil, Plus, Search, X } from 'lucide-react';
import type { Asset } from '../domain';
import { collectAssets, groupForAsset } from '../assetLibrary';
import { Button, Empty, IconButton, Media, Modal, Notice, SectionTitle, formatSize } from '../components';
import { LIMITS } from '../data';
import { saveUpload } from '../media';
import { assetLabel } from '../resources';
import { usePilot } from '../store';

export function Assets() {
  const tasks = usePilot(s => s.tasks);
  const saved = usePilot(s => s.libraryAssets);
  const groups = usePilot(s => s.assetGroups);
  const membership = usePilot(s => s.assetGroupById);
  const notify = usePilot(s => s.notify);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<Asset>();
  const [groupDialog, setGroupDialog] = useState<{ id?: string; name: string }>();
  const [groupName, setGroupName] = useState('');
  const [groupError, setGroupError] = useState('');
  const [dissolving, setDissolving] = useState(false);
  const [moving, setMoving] = useState<string[]>([]);
  const [destination, setDestination] = useState('');
  const [moveError, setMoveError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const assets = collectAssets(saved, tasks);
  const requestedGroup = params.get('group') ?? 'all';
  const active = ['all', 'ungrouped'].includes(requestedGroup) || groups.some(g => g.id === requestedGroup) ? requestedGroup : 'all';
  const currentGroup = groups.find(g => g.id === active);
  const groupId = (id: string) => groupForAsset(id, membership, groups);
  const countIn = (id: string) => assets.filter(a => groupId(a.id) === id).length;
  const inGroup = assets.filter(a => active === 'all' || groupId(a.id) === (active === 'ungrouped' ? '' : active));
  const shown = inGroup.filter(a => (kind === 'all' || a.kind === kind) && `${assetLabel(a)} ${a.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const selectedIds = selected.filter(id => shown.some(a => a.id === id));

  function switchGroup(id: string) { setParams(id === 'all' ? {} : { group: id }); setSelected([]); }
  function openGroup(id?: string) {
    const name = groups.find(g => g.id === id)?.name ?? '';
    setGroupDialog({ id, name }); setGroupName(name); setGroupError('');
  }
  function saveGroup() {
    try {
      if (groupDialog?.id) usePilot.getState().renameAssetGroup(groupDialog.id, groupName);
      else switchGroup(usePilot.getState().createAssetGroup(groupName));
      setGroupDialog(undefined);
    } catch (e) { setGroupError(e instanceof Error ? e.message : '分组保存失败。'); }
  }
  function openMove(ids: string[]) {
    setMoving(ids); setDestination(ids.length === 1 ? groupId(ids[0]) : ''); setMoveError('');
  }
  function move() {
    try {
      usePilot.getState().moveAssets(moving, destination);
      setSelected(ids => ids.filter(id => !moving.includes(id)));
      notify(`已将 ${moving.length} 份素材移入${groups.find(g => g.id === destination)?.name ?? '未分组'}。`);
      setMoving([]);
    } catch (e) { setMoveError(e instanceof Error ? e.message : '移动失败。'); }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); let count = 0;
    try {
      for (const input of Array.from(files)) {
        const asset = await saveUpload(input);
        usePilot.getState().saveLibraryAsset(asset);
        if (currentGroup) usePilot.getState().moveAssets([asset.id], currentGroup.id);
        count++;
      }
      notify(`已添加 ${count} 个文件${currentGroup ? `到「${currentGroup.name}」` : '到未分组'}。`);
    } catch (e) { notify(`${e instanceof Error ? e.message : '保存失败。'}${count ? `已保存 ${count} 个文件。` : ''}`); }
    finally { setBusy(false); if (file.current) file.current.value = ''; }
  }
  function startWith(asset: Asset, mode: 'assistant' | 'workbench') {
    const id = usePilot.getState().newTask({ assets: [{ ...asset, role: 'unassigned', targetAssetId: undefined, maskMode: undefined }] }, mode);
    navigate(`/${mode}/${id}`);
  }

  return <div className="page asset-page">
    <SectionTitle title="素材管理" description="按项目、主题或用途分组整理；同一份文件可以在不同创作中复用。" action={<>
      <input hidden type="file" multiple ref={file} accept={LIMITS.accepted.join(',')} aria-label="上传到素材库" onChange={e => void upload(e.target.files)}/>
      <Button disabled={busy} onClick={() => file.current?.click()}><Plus size={15}/>{busy ? '正在保存' : currentGroup ? '添加到当前分组' : '添加文件'}</Button>
    </>}/>
    <div className="asset-browser">
      <aside className="asset-group-sidebar" aria-label="素材分组">
        <div className="asset-group-heading"><span>资料分组</span><IconButton label="新建分组" onClick={() => openGroup()}><FolderPlus size={17}/></IconButton></div>
        <nav aria-label="分组列表">
          <button className={active === 'all' ? 'active' : ''} aria-current={active === 'all' ? 'page' : undefined} onClick={() => switchGroup('all')}><Image size={16}/><span>全部素材</span><small>{assets.length}</small></button>
          <button className={active === 'ungrouped' ? 'active' : ''} aria-current={active === 'ungrouped' ? 'page' : undefined} onClick={() => switchGroup('ungrouped')}><FolderOpen size={16}/><span>未分组</span><small>{countIn('')}</small></button>
          {groups.map(group => <button key={group.id} className={active === group.id ? 'active' : ''} aria-current={active === group.id ? 'page' : undefined} onClick={() => switchGroup(group.id)}><Folder size={16}/><span>{group.name}</span><small>{countIn(group.id)}</small></button>)}
        </nav>
        <button className="text-button create-group-link" onClick={() => openGroup()}><Plus size={13}/>新建一个分组</button>
        <p className="asset-group-hint">分组整理保存在本机。创作中的素材用途与阶段绑定分别定义。</p>
      </aside>
      <section className="asset-browser-content" aria-label="素材文件">
        <div className="asset-location-heading"><div><span className="eyebrow">素材库 / {currentGroup ? '自建分组' : active === 'ungrouped' ? '待整理' : '所有文件'}</span><h2>{currentGroup?.name ?? (active === 'ungrouped' ? '未分组' : '全部素材')}<small>{inGroup.length} 个文件</small></h2></div>
          {currentGroup && <div><IconButton label="重命名当前分组" onClick={() => openGroup(currentGroup.id)}><Pencil size={15}/></IconButton><button className="text-button" onClick={() => setDissolving(true)}>解散分组</button></div>}
        </div>
        <div className="directory-filters asset-file-filters">
          <label className="search-field"><Search size={16}/><input aria-label="搜索素材" value={query} onChange={e => { setQuery(e.target.value); setSelected([]); }} placeholder="搜索当前范围的素材"/></label>
          <div className="filter-tabs">{[['all', '全部'], ['image', '图片'], ['video', '视频']].map(([value, label]) => <button className={kind === value ? 'selected' : ''} key={value} onClick={() => { setKind(value); setSelected([]); }}>{label}</button>)}</div>
        </div>
        <div className="asset-selection-bar">
          <label><input type="checkbox" aria-label="选择当前显示的全部素材" disabled={!shown.length} checked={!!shown.length && selectedIds.length === shown.length} onChange={e => setSelected(e.target.checked ? shown.map(a => a.id) : [])}/>{selectedIds.length ? `已选 ${selectedIds.length} 项` : '选择素材'}</label>
          {selectedIds.length > 0 ? <><button className="text-button" onClick={() => openMove(selectedIds)}><FolderInput size={15}/>移动到分组</button><button className="text-button" onClick={() => setSelected([])}><X size={13}/>清除选择</button></> : <span>上传到当前分组，或选中已有文件后移动</span>}
        </div>
        <div className="asset-file-grid">{shown.map(asset => <article key={asset.id} className={`asset-file ${selectedIds.includes(asset.id) ? 'is-selected' : ''}`}>
          <div className="asset-file-visual"><button className="asset-preview-button" aria-label={`预览 ${assetLabel(asset)}`} onClick={() => setPreview(asset)}><Media media={asset}/></button><label className="asset-select"><input type="checkbox" aria-label={`选择 ${assetLabel(asset)}`} checked={selectedIds.includes(asset.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, asset.id] : ids.filter(id => id !== asset.id))}/></label><span className="asset-media-kind">{asset.kind === 'image' ? <Image size={13}/> : <Film size={13}/>}</span></div>
          <button className="asset-file-title" onClick={() => setPreview(asset)}>{assetLabel(asset)}</button>
          <p>{formatSize(asset.size)}{asset.width ? ` · ${asset.width} × ${asset.height}` : ''}</p>
          <div className="asset-file-location"><span><Folder size={11}/>{groups.find(g => g.id === groupId(asset.id))?.name ?? '未分组'}</span><button className="text-button" aria-label={`移动 ${assetLabel(asset)}`} onClick={() => openMove([asset.id])}>移动</button></div>
        </article>)}</div>
        {!shown.length && <Empty icon={<FileImage/>} title={query || kind !== 'all' ? '没有匹配的素材' : currentGroup ? '这个分组还是空的' : '这里还没有素材'} description={query || kind !== 'all' ? '调整搜索或类型筛选，也可以切换到全部素材。' : '添加图片或视频，或在全部素材中选中文件并移动到这里。'} action={!query && kind === 'all' ? <Button variant="secondary" disabled={busy} onClick={() => file.current?.click()}><Plus size={14}/>添加文件</Button> : undefined}/>}
      </section>
    </div>
    {groupDialog && <Modal title={groupDialog.id ? '重命名分组' : '新建素材分组'} onClose={() => setGroupDialog(undefined)}><form onSubmit={e => { e.preventDefault(); saveGroup(); }}><label className="group-name-field">分组名称<input autoFocus maxLength={40} aria-label="分组名称" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="例如：建筑项目、人物参考、视频原片"/></label>{groupError && <div role="alert"><Notice tone="error">{groupError}</Notice></div>}<div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setGroupDialog(undefined)}>取消</Button><Button type="submit">{groupDialog.id ? '保存名称' : '创建分组'}<Check size={14}/></Button></div></form></Modal>}
    {moving.length > 0 && <Modal title={`移动 ${moving.length} 份素材`} onClose={() => setMoving([])}><p className="dialog-description">选择存放位置，创作中的文件引用保持不变。</p><label className="group-name-field">目标分组<select aria-label="目标分组" value={destination} onChange={e => setDestination(e.target.value)}><option value="">未分组</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>{moveError && <Notice tone="error">{moveError}</Notice>}<div className="modal-actions"><Button variant="secondary" onClick={() => setMoving([])}>取消</Button><Button onClick={move}><FolderInput size={14}/>确认移动</Button></div></Modal>}
    {dissolving && currentGroup && <Modal title={`解散「${currentGroup.name}」`} onClose={() => setDissolving(false)}><p>该分组的 {inGroup.length} 个文件将移入未分组。文件本身及创作引用都会保留。</p><div className="modal-actions"><Button variant="secondary" onClick={() => setDissolving(false)}>返回</Button><Button onClick={() => { usePilot.getState().dissolveAssetGroup(currentGroup.id); setDissolving(false); switchGroup('ungrouped'); notify('分组已解散，素材已移入未分组。'); }}>解散并保留文件</Button></div></Modal>}
    {preview && <Modal title={assetLabel(preview)} wide onClose={() => setPreview(undefined)}><div className="expanded-media"><Media media={preview} controls/></div><div className="asset-preview-metadata"><span>{preview.name} · {formatSize(preview.size)}</span><button className="text-button" onClick={() => { openMove([preview.id]); setPreview(undefined); }}><FolderInput size={14}/>{groups.find(g => g.id === groupId(preview.id))?.name ?? '未分组'} · 移动</button></div><div className="material-usage"><h3>使用这份素材的创作</h3>{tasks.filter(t => t.draft.assets.some(a => a.id === preview.id)).map(t => <Link key={t.id} to={`/workbench/${t.id}`}>{t.title}<ArrowUpRight size={13}/></Link>)}</div><div className="modal-actions"><Button variant="secondary" onClick={() => startWith(preview, 'assistant')}>交给助手<ArrowUpRight size={13}/></Button><Button onClick={() => startWith(preview, 'workbench')}>在工作台使用<ArrowUpRight size={13}/></Button></div></Modal>}
  </div>;
}
