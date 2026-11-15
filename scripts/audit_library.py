#!/usr/bin/env python3
"""Read-only inventory of workflow hashes, declared mappings and obvious media loaders."""
import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

LOADERS={'LoadImage':'image','LoadImageMask':'mask','LoadVideo':'video','VHS_LoadVideo':'video','VHS_LoadVideoPath':'video','LoadAudio':'audio'}
def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--library',type=Path,required=True);args=ap.parse_args()
    root=args.library.resolve();folder=root/'cards'
    if not folder.is_dir(): print('cards directory not found',file=sys.stderr);return 2
    rows=[];seen=set()
    for file in sorted(folder.glob('*.json')):
        try:
            card=json.loads(file.read_text(encoding='utf-8')); wid=card['id']
            if wid in seen: raise ValueError('duplicate ID')
            seen.add(wid); path=(root/card['api_graph']).resolve()
            if not path.is_relative_to(root): raise ValueError('graph path escapes library')
            raw=path.read_bytes();graph=json.loads(raw)
            counts=Counter(LOADERS[n['class_type']] for n in graph.values() if isinstance(n,dict) and n.get('class_type') in LOADERS)
            declared=Counter(x.get('type') for x in card.get('inputs',[]) if x.get('type') in ('image','mask','video','audio'))
            rows.append({'id':wid,'hash_matches':hashlib.sha256(raw).hexdigest()==card.get('sha256'),
                         'execution_verified':card.get('execution',{}).get('verified') is True,
                         'recognized_media_nodes':dict(counts),'declared_media_slots':dict(declared),
                         'review_media_loaders':sum(counts.values())>sum(declared.values())})
        except Exception as exc: rows.append({'file':file.name,'error':str(exc)})
    print(json.dumps({'count':len(rows),'unverified':sum(not r.get('execution_verified',False) for r in rows),
                      'hash_mismatch_or_error':sum(not r.get('hash_matches',False) for r in rows),
                      'potential_missing_media_inputs':sum(r.get('review_media_loaders',False) for r in rows),
                      'method_note':'Loader-count comparison is a heuristic only; manually inspect every graph, text slot, model and mask semantics.',
                      'cards':rows},ensure_ascii=False,indent=2))
    return 1 if any('error' in r or not r.get('hash_matches',False) for r in rows) else 0
if __name__=='__main__':sys.exit(main())
