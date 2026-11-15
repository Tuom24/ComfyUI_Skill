import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_BUILD_ID } from './buildInfo.generated';

const newer = String(UI_BUILD_ID) === 'ui-0000000000000000' ? 'ui-1111111111111111' : 'ui-0000000000000000';
const response = (buildId: unknown) => ({ ok: true, json: async () => ({ buildId }) });
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('independent interface version check', () => {
  it('permits the current build and bypasses the browser cache', async () => {
    const fetch = vi.fn().mockResolvedValue(response(UI_BUILD_ID));
    vi.stubGlobal('fetch', fetch);
    const guard = await import('./buildGuard');
    expect(await guard.ensureCurrentBuild()).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/build-info.json', { cache: 'no-store' });
    expect(guard.buildSnapshot()).toBeNull();
  });

  it('blocks an outdated interface, publishes the update and recovers after matching', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(newer)).mockResolvedValueOnce(response(UI_BUILD_ID));
    vi.stubGlobal('fetch', fetch);
    const guard = await import('./buildGuard');
    const listener = vi.fn();
    const unsubscribe = guard.subscribeBuild(listener);
    expect(await guard.ensureCurrentBuild()).toBe(false);
    expect(guard.buildSnapshot()).toBe(newer);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(await guard.ensureCurrentBuild()).toBe(true);
    expect(guard.buildSnapshot()).toBeNull();
    unsubscribe();
  });

  it('does not unblock a known mismatch when the network subsequently fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(newer)).mockRejectedValueOnce(new Error('offline')));
    const guard = await import('./buildGuard');
    expect(await guard.ensureCurrentBuild()).toBe(false);
    expect(await guard.ensureCurrentBuild()).toBe(false);
    expect(guard.buildSnapshot()).toBe(newer);
  });

  it('shares an in-flight request for concurrent clicks', async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    const fetch = vi.fn(() => new Promise<ReturnType<typeof response>>(done => { resolve = done; }));
    vi.stubGlobal('fetch', fetch);
    const guard = await import('./buildGuard');
    const first = guard.ensureCurrentBuild();
    const second = guard.ensureCurrentBuild();
    expect(second).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve(response(UI_BUILD_ID));
    expect(await first).toBe(true);
  });

  it('ignores invalid metadata without forgetting an already known update', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response('invalid')).mockResolvedValueOnce(response(newer)).mockResolvedValueOnce(response(4)));
    const guard = await import('./buildGuard');
    expect(await guard.ensureCurrentBuild()).toBe(true);
    expect(guard.buildSnapshot()).toBeNull();
    expect(await guard.ensureCurrentBuild()).toBe(false);
    expect(await guard.ensureCurrentBuild()).toBe(false);
    expect(guard.buildSnapshot()).toBe(newer);
  });
});
