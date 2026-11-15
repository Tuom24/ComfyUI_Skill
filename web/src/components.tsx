import { useEffect, useId, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AlertCircle, ArrowUpRight, Check, CircleDashed, Download, LoaderCircle, Plus, Sparkles, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { Artifact, Asset } from './domain';
import { mediaUrl } from './media';
import { usePilot } from './store';

export function Button({ children, variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; children: ReactNode }) { return <button className={clsx('button', `button-${variant}`, className)} {...props}>{children}</button>; }
export function IconButton({ label, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) { return <button className={clsx('icon-button', className)} aria-label={label} title={label} {...props}>{children}</button>; }
export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'green' | 'amber' | 'red' | 'muted' | 'blue' }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function DemoBadge() { return <Badge tone="amber"><span className="tiny-dot"/>演示数据</Badge>; }
export function SectionTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) { return <div className="section-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>; }
export function Empty({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-icon">{icon ?? <Sparkles/>}</div><h3>{title}</h3><p>{description}</p>{action}</div>; }
export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' | 'success' }) { return <div className={`notice notice-${tone}`}><AlertCircle size={17}/><div>{children}</div></div>; }
export function Modal({ title, children, onClose, wide = false, className }: { title: string; children: ReactNode; onClose(): void; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null); const id = useId();
  useEffect(() => { const before = document.activeElement as HTMLElement; const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } if (e.key === 'Tab') { const list = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]'); if (!list?.length) { e.preventDefault(); return; } const first = list[0]; const last = list[list.length - 1]; if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); } } };
    document.addEventListener('keydown', key); return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', key); before?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className={clsx('modal', wide && 'modal-wide', className)} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} ref={ref}><div className="modal-header"><h2 id={id}>{title}</h2><IconButton label="关闭对话框" onClick={onClose}><X size={19}/></IconButton></div><div className="modal-body">{children}</div></div></div>;
}
export function useMedia(media?: { id: string; url?: string }) {
  const [state, setState] = useState({ url: '', error: '' }); const id = media?.id; const url = media?.url;
  useEffect(() => { let active = true; let revoke = ''; setState({ url: '', error: '' }); if (!id) return;
    mediaUrl({ id, url }).then(result => { if (!active) { if (result.revoke) URL.revokeObjectURL(result.url); return; } if (result.revoke) revoke = result.url; setState({ url: result.url, error: '' }); }).catch(e => { if (active) setState({ url: '', error: e instanceof Error ? e.message : '无法读取素材' }); });
    return () => { active = false; if (revoke) URL.revokeObjectURL(revoke); };
  }, [id, url]); return state;
}
export function Media({ media, controls = false, className = '' }: { media: Asset | Artifact; controls?: boolean; className?: string }) { const { url, error } = useMedia(media); if (error) return <div className="media-error"><AlertCircle size={22}/><span>{error}</span></div>; if (!url) return <div className="media-loading"><LoaderCircle className="spin"/></div>; return media.kind === 'video' ? <video className={className} src={url} controls={controls} muted playsInline preload="metadata" poster={'poster' in media ? media.poster : undefined}/> : <img className={className} src={url} alt={media.name} loading="lazy"/>; }
export function Toast() { const toast = usePilot(s => s.toast); return toast ? <div className="toast" role="status"><Check size={17}/>{toast}</div> : null; }
export function Loading({ label = '正在加载' }: { label?: string }) { return <div className="loading-inline"><LoaderCircle size={18} className="spin"/>{label}</div>; }
export function StatusIcon({ state }: { state: string }) { return ['running', 'repairing', 'planning', 'queued'].includes(state) ? <LoaderCircle size={13} className="spin"/> : state === 'completed' ? <Check size={13}/> : <CircleDashed size={13}/>; }
export function formatDate(time: number) { return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(time); }
export function formatSize(size: number) { return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : size ? `${Math.ceil(size / 1024)} KB` : '演示素材'; }
export { ArrowUpRight, Download, Plus, Sparkles };
