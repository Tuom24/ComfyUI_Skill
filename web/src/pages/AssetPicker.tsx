import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { Asset } from '../domain';
import { collectAssets, groupForAsset } from '../assetLibrary';
import { Empty, Media, Modal, Notice } from '../components';
import { assetLabel } from '../resources';
import { usePilot } from '../store';

export function AssetPicker({ excludedIds, onSelect, onClose }: { excludedIds: string[]; onSelect(asset: Asset): void; onClose(): void }) {
  const tasks = usePilot(s => s.tasks);
  const saved = usePilot(s => s.libraryAssets);
  const groups = usePilot(s => s.assetGroups);
  const membership = usePilot(s => s.assetGroupById);
  const [group, setGroup] = useState('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const assets = collectAssets(saved, tasks).filter(a => !excludedIds.includes(a.id));
  const shown = assets.filter(a => (group === 'all' || groupForAsset(a.id, membership, groups) === (group === 'ungrouped' ? '' : group)) && `${assetLabel(a)} ${a.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <Modal title="选择已有素材" onClose={onClose}>
    <div className="asset-picker-filters"><label className="search-field"><Search size={14}/><input aria-label="搜索已有素材" value={query} onChange={e => setQuery(e.target.value)} placeholder="文件名或素材名称"/></label><select aria-label="按素材分组选择" value={group} onChange={e => setGroup(e.target.value)}><option value="all">全部分组</option><option value="ungrouped">未分组</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
    {error && <Notice tone="error">{error}</Notice>}
    {shown.length > 0 ? <div className="asset-picker-list">{shown.map(asset => <button key={asset.id} onClick={() => { try { onSelect({ ...asset, role: 'unassigned', targetAssetId: undefined, maskMode: undefined }); onClose(); } catch (e) { setError(e instanceof Error ? e.message : '无法添加素材。'); } }}><div className="resource-preview"><Media media={asset}/></div><div><strong>{assetLabel(asset)}</strong><small>{groups.find(g => g.id === groupForAsset(asset.id, membership, groups))?.name ?? '未分组'} · {asset.name}</small></div><Plus size={16}/></button>)}</div> : <Empty title="没有可选素材" description="可切换分组或调整搜索。已在本次创作中的文件不重复显示。"/>}
  </Modal>;
}
