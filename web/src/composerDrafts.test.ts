import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearComposerDraft, preserveVisibleComposer, readComposerDraft, saveComposerDraft } from './composerDrafts';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('unsent quick-generation drafts', () => {
  it('separates drafts by conversation and clears only the sent one', () => {
    expect(saveComposerDraft(undefined, '新创作草稿')).toBe(true);
    saveComposerDraft('first', '未发送的修改要求');
    saveComposerDraft('second', '另一段对话');
    expect(readComposerDraft('first')).toBe('未发送的修改要求');
    clearComposerDraft('first');
    expect(readComposerDraft('first')).toBeNull();
    expect(readComposerDraft('second')).toBe('另一段对话');
    expect(readComposerDraft()).toBe('新创作草稿');
  });

  it('preserves the visible input under the current conversation before updating', () => {
    vi.stubGlobal('document', { querySelector: () => ({ value: '刷新前的文字' }) });
    vi.stubGlobal('window', { location: { hash: '#/assistant/current-id' } });
    expect(preserveVisibleComposer()).toBe(true);
    expect(readComposerDraft('current-id')).toBe('刷新前的文字');
  });

  it('reports a save failure so an update cannot silently discard nonempty text', () => {
    vi.stubGlobal('sessionStorage', { setItem: () => { throw new Error('quota'); }, getItem: () => { throw new Error('blocked'); } });
    vi.stubGlobal('document', { querySelector: () => ({ value: '未发送内容' }) });
    vi.stubGlobal('window', { location: { hash: '#/assistant/current-id' } });
    expect(preserveVisibleComposer()).toBe(false);
    expect(readComposerDraft('current-id')).toBeNull();
  });
});
