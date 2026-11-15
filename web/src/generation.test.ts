import { describe, expect, it } from 'vitest';
import type { Run } from './domain';
import { elapsedLabel, generationPresentation } from './generation';

const run: Run = { id:'run', planId:'plan', revisionId:'revision', status:'running', startedAt:1000, updatedAt:1000, attempt:1, maxAttempts:3, stepIndex:0, scenario:'normal', events:[], artifacts:[], quality:'not_evaluated' };

describe('generation status presentation',()=>{
  it('keeps planning distinct from an execution',()=>{
    const state=generationPresentation(undefined,true);
    expect(state.phase).toBe('planning');
    expect(state.detail).toContain('尚未开始生成');
  });
  it('stops activity animation on disconnection without claiming failure or resubmission',()=>{
    const state=generationPresentation(run,false);
    expect(state.phase).toBe('restoring');
    expect(state.moving).toBe(false);
    expect(state.detail).toContain('不会重复提交');
  });
  it('does not treat a pending cancellation as a terminal confirmation',()=>{
    const state=generationPresentation({...run,status:'cancel_requested'},true);
    expect(state.phase).toBe('stopping');
    expect(state.moving).toBe(false);
    expect(state.detail).toContain('收到执行器确认后');
  });
  it('reports consumed execution attempts during repair, including the first attempt',()=>{
    const state=generationPresentation({...run,status:'repairing',attempt:2},true);
    expect(state.detail).toContain('已执行 2/3 次');
    expect(state.phase).toBe('repairing');
  });
  it('distinguishes queued, processing and preparing outputs without inventing progress',()=>{
    expect(generationPresentation({...run,status:'queued'},true).phase).toBe('queued');
    expect(generationPresentation(run,true).phase).toBe('running');
    expect(generationPresentation({...run,producing:true},true).phase).toBe('delivering');
  });
  it('shows elapsed wall time and clamps clock skew to zero',()=>{
    expect(elapsedLabel(1000,62600)).toBe('01:01');
    expect(elapsedLabel(2000,1000)).toBe('00:00');
  });
});
