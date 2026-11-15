import type { Asset, AssetGroup, Creation } from './domain';

/** Group membership belongs to the library, never to an immutable request snapshot. */
export function collectAssets(saved: Asset[], tasks: Creation[]): Asset[] {
  const records = tasks.flatMap(t => [...t.revisions.flatMap(r => r.assets), ...t.draft.assets]);
  return [...new Map([...records, ...saved].map(asset => [asset.id, asset])).values()];
}

export function validateGroupName(name: string, groups: AssetGroup[], excludingId?: string) {
  const value = name.trim();
  if (!value) throw new Error('请输入分组名称。');
  if (value.length > 40) throw new Error('分组名称最多 40 个字。');
  if (groups.some(g => g.id !== excludingId && g.name.toLocaleLowerCase() === value.toLocaleLowerCase())) throw new Error('已有同名分组，请换一个名称。');
  return value;
}

export function groupForAsset(id: string, membership: Record<string, string>, groups: AssetGroup[]) {
  const candidate = membership[id];
  return groups.some(group => group.id === candidate) ? candidate : '';
}
