import { beforeEach, describe, expect, it } from 'vitest';
import type { Creation } from './domain';
import { recentCreations, uniqueCreations } from './recentCreations';
import { usePilot } from './store';

function creation(id: string, updatedAt: number, patch: Partial<Creation> = {}): Creation {
  return { id, title: '相同名称', createdAt: 1, updatedAt, archived: false, origin: 'assistant', draft: { text: '创作要求', assets: [], output: 'image' }, revisions: [], plans: [], runs: [], messages: [], ...patch };
}
beforeEach(() => usePilot.setState({ tasks: [] }));

describe('one history record per creation identity', () => {
  it('keeps the latest snapshot of an ID without merging independent same-title creations', () => {
    const latest = creation('first', 4, { lastView: 'workbench' });
    expect(uniqueCreations([creation('first', 1), creation('second', 3), latest])).toEqual([latest, creation('second', 3)]);
  });

  it('filters workbench recents by the current view instead of a past handoff', () => {
    const backInQuick = creation('quick', 4, { handedOffAt: 2, lastView: 'assistant' });
    const manual = creation('manual', 3, { lastView: 'workbench' });
    const legacy = creation('legacy', 2, { origin: undefined });
    const archived = creation('archived', 5, { archived: true, lastView: 'workbench' });
    expect(recentCreations([backInQuick, manual, legacy, archived], 4, 'workbench').map(t => t.id)).toEqual(['manual', 'legacy']);
    expect(recentCreations([backInQuick, manual, legacy, archived], 1).map(t => t.id)).toEqual(['quick']);
  });

  it('changing views repeatedly preserves task identity and all creation data', () => {
    const task = creation('existing', 10, { messages: [{ id: 'message', role: 'user', text: '之前的要求', at: 1 }] });
    usePilot.setState({ tasks: [task, creation('another', 9)] });
    usePilot.getState().setTaskView('existing', 'workbench');
    expect(usePilot.getState().tasks[0].lastView).toBe('workbench');
    usePilot.getState().setTaskView('existing', 'assistant');
    usePilot.getState().setTaskView('existing', 'assistant');
    expect(usePilot.getState().tasks).toHaveLength(2);
    expect(usePilot.getState().tasks[0]).toEqual({ ...task, lastView: 'assistant' });
    expect(usePilot.getState().tasks[1].id).toBe('another');
  });
});
