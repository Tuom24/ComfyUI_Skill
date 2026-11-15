import { createJSONStorage } from 'zustand/middleware';
let issue: string | null = null;
const fallback = new Map<string, string>();
const listeners = new Set<() => void>();
function report(next: string | null) { if (issue === next) return; issue = next; queueMicrotask(() => listeners.forEach(fn => fn())); }
export const subscribePersistence = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const persistenceSnapshot = () => issue;
export const pilotStorage = createJSONStorage(() => ({
  getItem(name: string) { try { return fallback.get(name) ?? localStorage.getItem(name); } catch { report('本地记录暂时无法读取，当前内容仅在内存中保留。'); return fallback.get(name) ?? null; } },
  setItem(name: string, value: string) { try { localStorage.setItem(name, value); fallback.delete(name); report(null); } catch { fallback.set(name, value); report('浏览器存储空间不足或访问受限。请导出重要记录，刷新可能丢失尚未保存的修改。'); } },
  removeItem(name: string) { fallback.delete(name); try { localStorage.removeItem(name); } catch { report('无法清除本地记录。'); } },
}));
