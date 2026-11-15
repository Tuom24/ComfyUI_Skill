import type { Asset, Plan, Revision, Run } from './domain';

// Tests retain the explicit demo fixture; normal development and builds use HTTP.
export const liveMode = import.meta.env.MODE !== 'test' && import.meta.env.VITE_PILOT_MODE !== 'demo';
export const recordingMode = import.meta.env.VITE_RECORDING_MODE === '1';
export class ApiError extends Error { constructor(message:string, public status:number) {super(message);} }
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.error ?? `服务请求失败 (${response.status})`, response.status);
  return body as T;
}
export const liveApi = {
  plan: (revision: Revision, signal?: AbortSignal) => api<Plan>('/plans', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({revision}), signal }),
  submit: (run: Run, fingerprint: string) => api<Run>('/runs', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id:run.id, planId:run.planId, revisionId:run.revisionId, fingerprint}) }),
  run: (id: string) => api<Run>(`/runs/${encodeURIComponent(id)}`),
  cancel: (id: string) => api(`/runs/${encodeURIComponent(id)}/cancel`, {method:'POST'}),
  upload: (file: File) => api<Pick<Asset,'id'|'url'|'width'|'height'|'duration'>>('/assets', {method:'POST', headers:{'Content-Type':file.type}, body:file}),
};
