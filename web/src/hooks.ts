import { useEffect, useState } from 'react';
import { loadCatalog, type WorkflowDefinition } from './catalog';
export function useCatalog() { const [rows,setRows] = useState<WorkflowDefinition[]>([]); const [error,setError] = useState(''); useEffect(() => { let active = true; loadCatalog().then(c => { if (active) setRows(c); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []); return { rows, error }; }
