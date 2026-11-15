import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { buildMockPlan, mockAdapter, parseBenchmark } from './adapter';
import { DEMO_BATCH } from './data';
import type { Asset, Benchmark, Draft, Revision } from './domain';
import { benchmarkMetrics, canConfirm, compatible, fingerprint, planIsFresh } from './domain';
import { usePilot } from './store';
import { mediaBlob, saveUpload, validateFile } from './media';
import { persistenceSnapshot, pilotStorage } from './persistence';

const asset: Asset = { id: 'source', name: 'input.png', mime: 'image/png', kind: 'image', role: 'source', size: 10 };
const revision = (draft: Draft): Revision => ({ ...draft, id: 'r1', number: 1, createdAt: 100, fingerprint: fingerprint(draft) });
async function prepare(text = '生成海岸建筑', output: 'image' | 'video' = 'image') { const id = usePilot.getState().newTask({ text, output }); const p = usePilot.getState().generatePlan(id); await vi.advanceTimersByTimeAsync(850); await p; return id; }
const task = (id: string) => usePilot.getState().tasks.find(t => t.id === id)!;
async function advance(ms = 1700) { await vi.advanceTimersByTimeAsync(ms); await usePilot.getState().tick(); }

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-23T08:00:00Z')); usePilot.setState({ tasks: [], batches: [structuredClone(DEMO_BATCH)], scenario: 'normal', connected: true, toast: null }); });
afterEach(() => { vi.useRealTimers(); });

describe('media contracts and plans', () => {
  it('blocks an edit without its source and preserves the request', () => { const r = revision({ text: '修改原图的风格', output: 'image', assets: [] }); const p = buildMockPlan(r, 'normal'); expect(p.blockers.map(b => b.code)).toContain('missing_source'); expect(r.text).toBe('修改原图的风格'); });
  it('does not invent a mask or driving video', () => { const p = buildMockPlan(revision({ text: '修改肤色', output: 'image', assets: [asset] }), 'normal'); expect(p.blockers.map(b => b.code)).toContain('missing_mask'); });
  it('builds a valid ordered chain using upstream output', () => { const p = buildMockPlan(revision({ text: '先修改风格再生成视频', output: 'video', assets: [asset] }), 'normal'); expect(p.blockers).toEqual([]); expect(p.steps).toHaveLength(2); expect(p.steps[1].dependsOn).toEqual([p.steps[0].id]); expect(p.steps[1].inputs).toEqual([p.steps[0].id]); });
  it('rejects incompatible media roles and oversized or unsupported files', () => { const p = buildMockPlan(revision({ text: '编辑原图', output: 'image', assets: [{ ...asset, kind: 'video', mime: 'video/mp4' }] }), 'normal'); expect(p.blockers.some(b => b.code === 'media_contract')).toBe(true); expect(validateFile({ type: 'image/svg+xml', size: 40 })).toBeTruthy(); expect(validateFile({ type: 'image/png', size: 21 * 1024 * 1024 })).toBeTruthy(); });
  it('persists uploaded bytes independently of task metadata', async () => { vi.useRealTimers(); const file = new File(['test bytes'], 'source.png', { type: 'image/png' }); const saved = await saveUpload(file); expect(saved.url).toBeUndefined(); const blob = await mediaBlob(saved); expect(await blob.text()).toBe('test bytes'); });
});

describe('versioning and execution safety', () => {
  it('invalidates a plan when the prompt or asset roles change', async () => { const id = await prepare(); expect(planIsFresh(task(id))).toBe(true); usePilot.getState().updateDraft(id, { text: '另一种风格' }); expect(canConfirm(task(id))).toBe(false); const id2 = await prepare('修改原图'); usePilot.getState().addAsset(id2, asset); const p = usePilot.getState().generatePlan(id2); await vi.advanceTimersByTimeAsync(850); await p; expect(canConfirm(task(id2))).toBe(true); usePilot.getState().setRole(id2, asset.id, 'reference'); expect(planIsFresh(task(id2))).toBe(false); });
  it('makes repeat confirmation idempotent and locks the input snapshot', async () => { const id = await prepare(); const first = usePilot.getState().confirmRun(id); const second = usePilot.getState().confirmRun(id); expect(first).toBeTruthy(); expect(second).toBeUndefined(); expect(task(id).runs).toHaveLength(1); usePilot.getState().updateDraft(id, { text: '新的草稿' }); expect(task(id).revisions[0].text).toBe('生成海岸建筑'); expect(task(id).runs[0].revisionId).toBe(task(id).revisions[0].id); });
  it('preserves task state when switching views', async () => { const id = await prepare(); const before = structuredClone(task(id)); usePilot.getState().setView('chat'); usePilot.getState().setView('workbench'); expect(task(id)).toEqual(before); });
  it('explaining a plan does not mutate input or execute', async () => { const id = await prepare(); usePilot.getState().sendMessage(id, '解释一下', 'explain'); expect(task(id).draft.text).toBe('生成海岸建筑'); expect(task(id).runs).toHaveLength(0); expect(task(id).messages.at(-1)?.text).toContain('确认生成'); });
  it('requires cancellation acknowledgement', async () => { const id = await prepare(); const run = usePilot.getState().confirmRun(id)!; usePilot.getState().cancelRun(id, run); expect(task(id).runs[0].status).toBe('cancel_requested'); await advance(900); expect(task(id).runs[0].status).toBe('cancelled'); });
  it('stops after exactly three attempts including the initial run', async () => { const id = await prepare(); usePilot.getState().setScenario('failure'); usePilot.getState().confirmRun(id); for (let i = 0; i < 8; i++) await advance(); const run = task(id).runs[0]; expect(run.status).toBe('failed'); expect(run.attempt).toBe(3); const count = run.events.length; await advance(10000); expect(task(id).runs[0].events).toHaveLength(count); });
  it('repairs once and completes on the second attempt', async () => { vi.spyOn(mockAdapter, 'produceArtifacts').mockResolvedValue([{ id: 'art1', name: 'demo.svg', kind: 'image', url: '/art/coast.svg', poster: '/art/coast.svg', mime: 'image/svg+xml', runId: 'mock' }]); const id = await prepare(); usePilot.getState().setScenario('repair'); usePilot.getState().confirmRun(id); for (let i = 0; i < 5; i++) await advance(); const run = task(id).runs[0]; expect(run.status).toBe('completed'); expect(run.attempt).toBe(2); expect(run.quality).toBe('not_evaluated'); });
  it('disconnecting never converts a queued task into failure or resubmits it', async () => { const id = await prepare(); usePilot.getState().confirmRun(id); usePilot.getState().setConnected(false); await advance(20000); expect(task(id).runs[0].status).toBe('queued'); usePilot.getState().recover(); expect(task(id).runs).toHaveLength(1); usePilot.getState().setConnected(true); await advance(); expect(task(id).runs[0].status).toBe('running'); });
  it('surfaces persistence failures without crashing the task flow', async () => { const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Quota', 'QuotaExceededError'); }); await pilotStorage?.setItem('test', { state: {}, version: 1 }); expect(persistenceSnapshot()).toContain('存储空间不足'); spy.mockRestore(); await pilotStorage?.setItem('test', { state: {}, version: 1 }); expect(persistenceSnapshot()).toBeNull(); });
});

describe('benchmark integrity', () => {
  const file = () => ({ ...structuredClone(DEMO_BATCH), schemaVersion: 1 });
  it('keeps failures and pending cases in the total denominator', () => { const b: Benchmark = { ...DEMO_BATCH, total: 200, status: 'running' }; expect(benchmarkMetrics(b)).toEqual({ routed: 2, executed: 2, passed: 1, processed: 4, failed: 3 }); expect(b.total).toBe(200); });
  it('preserves the demo source on import', () => { const b = parseBenchmark(file()); expect(b.source).toBe('demo'); expect(b.total).toBe(4); });
  it('rejects duplicate cases and contradictory completion claims', () => { const a = file(); a.cases[1].id = a.cases[0].id; expect(() => parseBenchmark(a)).toThrow(); const b = file(); b.total = 200; expect(() => parseBenchmark(b)).toThrow('覆盖全部'); const c = file(); c.cases[2].quality = 'passed'; expect(() => parseBenchmark(c)).toThrow(); });
  it('rejects pending execution after routing failed', () => { const b = file(); b.status = 'running'; b.cases[2].execution = 'pending'; expect(() => parseBenchmark(b)).toThrow('不一致'); });
  it('rejects excessive attempts and malformed retrieval parameters', () => { const b = file(); b.cases[0].attempts = 4; expect(() => parseBenchmark(b)).toThrow(); const c = file(); c.protocol.topK = 999; expect(() => parseBenchmark(c)).toThrow('Top-K'); });
  it('only compares compatible sources and protocol values regardless of key order', () => { const other = { ...DEMO_BATCH, id: 'other', protocol: Object.fromEntries(Object.entries(DEMO_BATCH.protocol).reverse()) as Benchmark['protocol'] }; expect(compatible(DEMO_BATCH, other)).toBe(true); expect(compatible(DEMO_BATCH, { ...other, source: 'imported' })).toBe(false); expect(compatible(DEMO_BATCH, { ...other, protocol: { ...other.protocol, topK: 10 } })).toBe(false); });
});
