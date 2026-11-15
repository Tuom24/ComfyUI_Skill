import { useEffect, useState, useSyncExternalStore } from 'react';
import { RefreshCw } from 'lucide-react';
import { buildSnapshot, subscribeBuild, watchBuild } from './buildGuard';
import { preserveVisibleComposer } from './composerDrafts';

export function BuildUpdateNotice() {
  const update=useSyncExternalStore(subscribeBuild,buildSnapshot);
  const [error,setError]=useState('');
  useEffect(watchBuild,[]);
  if(!update)return null;
  return <div className="build-update-notice" role="alert"><div><strong>界面有更新</strong><span>{error||'更新后再继续操作，创作记录和输入内容会保留。'}</span></div><button onClick={()=>{if(preserveVisibleComposer())window.location.reload();else setError('输入暂时无法保存，请先复制未发送内容后再更新。');}}><RefreshCw size={14}/>更新界面</button></div>;
}
