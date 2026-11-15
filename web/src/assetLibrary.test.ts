import { beforeEach, describe, expect, it } from 'vitest';
import type { Asset, Revision } from './domain';
import { fingerprint } from './domain';
import { collectAssets, groupForAsset } from './assetLibrary';
import { usePilot } from './store';

const image: Asset = { id: 'image-a', name: 'source.png', label: '建筑原图', kind: 'image', role: 'source', size: 512, mime: 'image/png' };
const video: Asset = { id: 'video-b', name: 'scene.mp4', kind: 'video', role: 'unassigned', size: 1024, mime: 'video/mp4' };
beforeEach(() => usePilot.setState({ tasks: [], libraryAssets: [], assetGroups: [], assetGroupById: {}, theme: 'light' }));

describe('asset library grouping', () => {
  it('collects existing task files and saved files without duplicate IDs', () => {
    usePilot.getState().newTask({ assets: [image] });
    usePilot.getState().saveLibraryAsset(image);
    usePilot.getState().saveLibraryAsset(video);
    expect(collectAssets(usePilot.getState().libraryAssets, usePilot.getState().tasks).map(a => a.id)).toEqual(['image-a', 'video-b']);
  });
  it('moves a task file without changing its draft, immutable revision or fingerprint', () => {
    const taskId = usePilot.getState().newTask({ text: '修改原图', assets: [image] });
    const task = usePilot.getState().tasks[0];
    const revision: Revision = { ...structuredClone(task.draft), id: 'rev', number: 1, createdAt: 1, fingerprint: fingerprint(task.draft) };
    usePilot.setState({ tasks: [{ ...task, revisions: [revision] }] });
    const before = structuredClone(usePilot.getState().tasks);
    const groupId = usePilot.getState().createAssetGroup('建筑项目');
    usePilot.getState().moveAssets([image.id], groupId);
    expect(usePilot.getState().assetGroupById[image.id]).toBe(groupId);
    expect(usePilot.getState().tasks).toEqual(before);
    expect(usePilot.getState().tasks[0].id).toBe(taskId);
  });
  it('moves multiple files atomically and rejects invalid destinations and missing files', () => {
    usePilot.getState().saveLibraryAsset(image);
    usePilot.getState().saveLibraryAsset(video);
    const groupId = usePilot.getState().createAssetGroup('参考资料');
    usePilot.getState().moveAssets([image.id, video.id], groupId);
    expect(Object.values(usePilot.getState().assetGroupById)).toEqual([groupId, groupId]);
    expect(() => usePilot.getState().moveAssets([image.id], 'gone')).toThrow('目标分组');
    expect(() => usePilot.getState().moveAssets([image.id, 'gone'], '')).toThrow('部分素材');
    expect(Object.values(usePilot.getState().assetGroupById)).toEqual([groupId, groupId]);
  });
  it('renames by stable ID and rejects blank, duplicate or overly long names', () => {
    const id = usePilot.getState().createAssetGroup('  建筑项目  ');
    usePilot.getState().createAssetGroup('Film');
    expect(() => usePilot.getState().renameAssetGroup(id, ' film ')).toThrow('同名');
    expect(() => usePilot.getState().createAssetGroup(' ')).toThrow('名称');
    expect(() => usePilot.getState().createAssetGroup('文'.repeat(41))).toThrow('40');
    usePilot.getState().renameAssetGroup(id, '建筑项目二');
    expect(usePilot.getState().assetGroups[0]).toMatchObject({ id, name: '建筑项目二' });
  });
  it('dissolves a group into ungrouped without removing files or touching other groups', () => {
    usePilot.getState().saveLibraryAsset(image); usePilot.getState().saveLibraryAsset(video);
    const first = usePilot.getState().createAssetGroup('建筑'); const second = usePilot.getState().createAssetGroup('视频');
    usePilot.getState().moveAssets([image.id], first); usePilot.getState().moveAssets([video.id], second);
    const files = structuredClone(usePilot.getState().libraryAssets);
    usePilot.getState().dissolveAssetGroup(first);
    expect(usePilot.getState().assetGroupById).toEqual({ [video.id]: second });
    expect(usePilot.getState().libraryAssets).toEqual(files);
    expect(groupForAsset(image.id, usePilot.getState().assetGroupById, usePilot.getState().assetGroups)).toBe('');
  });
  it('restores group membership and theme from persisted state', async () => {
    usePilot.getState().saveLibraryAsset(image);
    const id = usePilot.getState().createAssetGroup('人物'); usePilot.getState().moveAssets([image.id], id); usePilot.getState().setTheme();
    const saved = localStorage.getItem('comfypilot-v1')!;
    usePilot.setState({ assetGroups: [], assetGroupById: {}, theme: 'light' });
    localStorage.setItem('comfypilot-v1', saved); await usePilot.persist.rehydrate();
    expect(usePilot.getState().assetGroups[0].id).toBe(id);
    expect(usePilot.getState().assetGroupById[image.id]).toBe(id);
    expect(usePilot.getState().theme).toBe('dark');
  });
  it('opens older saved records without losing tasks or resetting their chosen theme', async () => {
    const id = usePilot.getState().newTask({ assets: [image] });
    localStorage.setItem('comfypilot-v1', JSON.stringify({ version: 2, state: { tasks: usePilot.getState().tasks, libraryAssets: [], theme: 'dark' } }));
    await usePilot.persist.rehydrate();
    expect(usePilot.getState().tasks[0].id).toBe(id);
    expect(usePilot.getState().theme).toBe('dark');
    expect(usePilot.getState().assetGroups).toEqual([]);
    expect(groupForAsset(image.id, { [image.id]: 'old-group' }, [])).toBe('');
  });
});
