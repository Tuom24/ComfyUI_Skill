import { liveMode, recordingMode } from './liveApi';
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { BookOpen, ChevronRight, FlaskConical, FolderOpen, Home as HomeIcon, Images, Menu, MessageSquare, Moon, PanelLeftClose, PanelLeftOpen, Settings2, SlidersHorizontal, Sun, Workflow, X } from 'lucide-react';
import { clsx } from 'clsx';
import { IconButton, Toast } from './components';
import { startMockEngine, usePilot } from './store';
import { Home, History, Capabilities, Help } from './pages/Library';
import { Assets } from './pages/Assets';
import { Workbench, Assistant } from './pages/Studio';
import { WorkbenchStart } from './pages/WorkbenchStart';
import { Evaluations, Team } from './pages/Operations';
import { persistenceSnapshot, subscribePersistence } from './persistence';
import { ThemePicker } from './ThemePicker';
import { applyAppearance } from './themes';
import { BuildUpdateNotice } from './BuildUpdateNotice';
import { recentCreations } from './recentCreations';

const navigation = [
  { path: '/', title: '创作首页', icon: HomeIcon },
  { path: '/assistant', title: '快速生成', icon: MessageSquare },
  { path: '/workbench', title: '工作台', icon: SlidersHorizontal },
  { path: '/creations', title: '创作记录', icon: FolderOpen },
  { path: '/assets', title: '素材管理', icon: Images },
  { path: '/capabilities', title: '工作流目录', icon: Workflow },
];
function LegacyCreation() { const { id } = useParams(); const task = usePilot(s => s.tasks.find(t => t.id === id)); return <Navigate to={`/${task?.lastView??task?.origin??'workbench'}/${id}`} replace/>; }
function Shell() {
  const location = useLocation(); const [mobile, setMobile] = useState(false);
  const theme = usePilot(s => s.theme); const collapsed = usePilot(s => s.sidebarCollapsed);
  const palette = usePilot(s => s.palette);
  const connected = usePilot(s => s.connected); const plannerIssue = usePilot(s => s.plannerIssue); const storageIssue = useSyncExternalStore(subscribePersistence, persistenceSnapshot);
  useLayoutEffect(() => { applyAppearance(theme, palette); }, [theme, palette]);
  useEffect(() => { setMobile(false); window.scrollTo(0, 0); }, [location.pathname]);
  useEffect(() => { usePilot.getState().recover(); return startMockEngine(); }, [usePilot]);
  const section = navigation.find(n => n.path === '/' ? location.pathname === '/' : location.pathname.startsWith(n.path))?.title ?? (location.pathname.startsWith('/evaluations') ? '评测记录' : location.pathname === '/help' ? '使用与开放说明' : '团队工具');
  return <div className={clsx('app-shell', collapsed && 'sidebar-collapsed')}>
    {mobile && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setMobile(false)}/>}
    <aside className={clsx('sidebar', mobile && 'sidebar-open')} id="app-sidebar"><NavLink to="/" className="brand" aria-label="ComfyTree 首页"><span className="brand-mark">c<span>t</span></span><span className="brand-word">ComfyTree<small>创作，由你定义</small></span></NavLink>
      <nav className="primary-nav" aria-label="主导航">{navigation.map(({ path, title, icon: Icon }) => <NavLink key={path} to={path} end={path === '/'} title={collapsed ? title : undefined} className={({ isActive }) => clsx('nav-item', isActive && 'active')}><Icon size={18}/><span>{title}</span></NavLink>)}</nav>
      <div className="sidebar-recents"><span className="sidebar-label">最近创作</span>{recentCreations(usePilot(s => s.tasks)).map(t => <NavLink title={t.title} key={t.id} to={`/${t.lastView??t.origin??'workbench'}/${t.id}`} className="sidebar-recent"><span className="tiny-dot"/>{t.title}</NavLink>)}</div>
      <div className="sidebar-bottom">{!liveMode&&<NavLink to="/evaluations" className={({ isActive }) => clsx('nav-item', isActive && 'active')} title="评测记录"><FlaskConical size={18}/><span>评测记录</span></NavLink>}<NavLink to="/help" className={({ isActive }) => clsx('nav-item', isActive && 'active')} title="使用说明"><BookOpen size={18}/><span>使用说明</span></NavLink>{!liveMode&&<NavLink to="/team" className={({ isActive }) => clsx('nav-item', isActive && 'active')} title="团队工具"><Settings2 size={18}/><span>团队工具</span></NavLink>}<div className="sidebar-environment"><span className="status-dot"/><span>{recordingMode?'案例资料':liveMode?'创作服务':'本地演示'} <small>{recordingMode?'已有运行记录':liveMode?'真实运行服务':'模型服务尚未连接'}</small></span></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="topbar-start"><IconButton label={mobile ? '关闭导航' : '打开导航'} className="mobile-menu" aria-expanded={mobile} aria-controls="app-sidebar" onClick={() => setMobile(!mobile)}>{mobile ? <X size={19}/> : <Menu size={19}/>}</IconButton><IconButton label={collapsed ? '展开侧栏' : '收起侧栏'} className="desktop-collapse" aria-expanded={!collapsed} aria-controls="app-sidebar" onClick={() => usePilot.getState().toggleSidebar()}>{collapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}</IconButton><span className="breadcrumb">ComfyTree <ChevronRight size={13}/><strong>{section}</strong></span></div><div className="topbar-actions"><span className="connection-indicator"><span className={clsx('status-dot', !connected && 'offline')}/>{recordingMode?'历史案例':connected ? liveMode?'创作服务':'演示模式' : '连接中断'}</span><ThemePicker/></div></header>
      <BuildUpdateNotice/>{storageIssue && <div className="storage-warning" role="alert">{storageIssue}</div>}{liveMode && plannerIssue && <div className="storage-warning" role="alert">启动检查：{plannerIssue}</div>}
      <main id="main-content" tabIndex={-1}><Routes><Route path="/" element={<Home/>}/><Route path="/assistant" element={<Assistant/>}/><Route path="/assistant/:id" element={<Assistant/>}/><Route path="/workbench" element={<WorkbenchStart/>}/><Route path="/workbench/:id" element={<Workbench/>}/><Route path="/create/:id" element={<LegacyCreation/>}/><Route path="/creations" element={<History/>}/><Route path="/assets" element={<Assets/>}/><Route path="/capabilities" element={<Capabilities/>}/><Route path="/evaluations" element={liveMode?<Navigate to="/" replace/>:<Evaluations/>}/><Route path="/team" element={liveMode?<Navigate to="/" replace/>:<Team/>}/><Route path="/help" element={<Help/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></main>
    </div><Toast/>
  </div>;
}
export default function App() { return <HashRouter><a href="#main-content" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>跳转到主内容</a><Shell/></HashRouter>; }
