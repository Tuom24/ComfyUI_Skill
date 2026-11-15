import { useEffect, useId, useRef, useState } from 'react';
import { Check, Moon, Palette, RotateCcw, Sun } from 'lucide-react';
import { IconButton } from './components';
import { PALETTES, THEME_FAMILIES } from './themes';
import type { CSSProperties } from 'react';
import { usePilot } from './store';

export function ThemePicker() {
  const theme = usePilot(s => s.theme);
  const palette = usePilot(s => s.palette);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = useId();
  const current = PALETTES.find(p => p.id === palette) ?? PALETTES[0];

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) { setOpen(false); setPinned(false); }
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false); setPinned(false);
        root.current?.querySelector<HTMLButtonElement>('.appearance-trigger')?.focus();
      }
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [open]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  function enter(pointer: string) {
    clearTimeout(closeTimer.current);
    if (pointer === 'mouse') setOpen(true);
  }
  function leave() {
    if (!pinned) closeTimer.current = setTimeout(() => {
      if (!root.current?.contains(document.activeElement)) setOpen(false);
    }, 150);
  }
  return <div className="theme-control" ref={root} onPointerEnter={e => enter(e.pointerType)} onPointerLeave={leave} onBlur={e => {
    if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) { setOpen(false); setPinned(false); }
  }}>
    <IconButton label="外观与配色" title={`${theme === 'light' ? '浅色' : '深色'} · ${current.name}`} className="appearance-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => {
      clearTimeout(closeTimer.current);
      if (pinned) { setOpen(false); setPinned(false); } else { setOpen(true); setPinned(true); }
    }}><Palette size={18}/><span className="appearance-indicator"/></IconButton>
    {open && <div className="theme-popover" id={`${id}-panel`} role="dialog" aria-labelledby={`${id}-title`}>
      <div className="theme-popover-heading"><strong id={`${id}-title`}>外观与配色</strong><span>自动保存</span></div>
      <fieldset className="appearance-mode"><legend>明暗模式</legend>
        <label><input type="radio" name={`${id}-mode`} checked={theme === 'light'} onChange={() => usePilot.getState().setAppearance('light')}/><span><Sun size={15}/>浅色{theme === 'light' && <Check size={13}/>}</span></label>
        <label><input type="radio" name={`${id}-mode`} checked={theme === 'dark'} onChange={() => usePilot.getState().setAppearance('dark')}/><span><Moon size={15}/>深色{theme === 'dark' && <Check size={13}/>}</span></label>
      </fieldset>
      <fieldset className="appearance-palettes"><legend>完整主题 · {current.name}</legend><div>{PALETTES.map(option => {
        const tokens = THEME_FAMILIES[option.id][theme];
        return <label key={option.id} className="palette-choice"><input type="radio" aria-label={option.name} name={`${id}-palette`} checked={palette === option.id} onChange={() => usePilot.getState().setPalette(option.id)}/><span>
          <span className="theme-miniature" aria-hidden="true" style={Object.fromEntries(Object.entries(tokens).map(([key,value]) => [`--mini-${key}`,value])) as CSSProperties}><i/><span><b/><em/><em/><strong/></span></span>
          <span className="palette-caption"><span>{option.name}{palette === option.id && <Check size={12}/>}</span><small>{option.description}</small></span>
        </span></label>;
      })}</div></fieldset>
      <div className="theme-popover-footer"><p>背景、导航、编辑面与文字层次一起切换。</p><button onClick={() => usePilot.getState().resetAppearance()}><RotateCcw size={12}/>恢复白色默认</button></div>
    </div>}
  </div>;
}
