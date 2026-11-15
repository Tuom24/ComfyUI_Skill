import type { Asset, Draft } from './domain';
export function assetLabel(asset: Asset) { return asset.label?.trim() || asset.name; }
export function resourceIssues(assets: Asset[]) {
  const issues: { code: string; message: string }[] = [];
  const labels = new Set<string>();
  for (const asset of assets) {
    const label = assetLabel(asset).toLowerCase();
    if (labels.has(label)) issues.push({ code: 'duplicate_label', message: `素材名称「${assetLabel(asset)}」重复，请命名为不同名称后再绑定。` });
    labels.add(label);
    if (asset.role === 'unassigned') issues.push({ code: 'undefined_role', message: `请说明「${assetLabel(asset)}」的用途。上传文件不等于指定输入。` });
    if (['source','reference','start_frame','end_frame'].includes(asset.role) && asset.kind !== 'image' || ['video','driving'].includes(asset.role) && asset.kind !== 'video') issues.push({ code: 'media_contract', message: `「${assetLabel(asset)}」的文件类型与用途不兼容。` });
    if (asset.role === 'mask') {
      const target = assets.find(a => a.id === asset.targetAssetId && a.id !== asset.id && a.role !== 'mask');
      if (!target) issues.push({ code: 'mask_target', message: `请为遮罩「${assetLabel(asset)}」指定对应的原图或视频。` });
      if (!asset.maskMode) issues.push({ code: 'mask_semantics', message: `请指定「${assetLabel(asset)}」的白色区域表示修改还是保护。` });
      if (asset.kind === 'image' && asset.mime !== 'image/png') issues.push({ code: 'mask_format', message: '图片遮罩需要 PNG 格式；视频遮罩需与输入视频逐帧对应。' });
      if (target && asset.kind !== target.kind) issues.push({ code: 'mask_pairing', message: '图片遮罩需要关联图片，视频遮罩需要关联视频。' });
      if (target && asset.width && target.width && (asset.width !== target.width || asset.height !== target.height)) issues.push({ code: 'mask_geometry', message: `遮罩「${assetLabel(asset)}」的尺寸与目标不一致。` });
    }
  }
  return issues;
}
export function roleForBackend(asset: Asset): 'image' | 'video' | 'mask' { return asset.role === 'mask' ? 'mask' : asset.kind; }
export function requestManifest(draft: Draft) {
  const resources = draft.assets.map((a, i) => {
    const extension = a.mime === 'image/png' ? '.png' : a.mime === 'image/jpeg' ? '.jpg' : a.mime === 'image/webp' ? '.webp' : a.mime === 'image/svg+xml' ? '.svg' : a.mime === 'video/mp4' ? '.mp4' : a.kind === 'video' ? '.webm' : '.png';
    const name = `${String(i + 1).padStart(2, '0')}_${a.name.replace(/[^\p{L}\p{N}_.-]+/gu,'_').replace(/\.[^.]+$/, '')}${extension}`;
    return name;
  });
  const bindings = draft.assets.map((a, i) => ({ resource: resources[i], asset_id: a.id, name: assetLabel(a), role: a.role, purpose: a.description ?? '', mask_for: a.role==='mask'?(a.targetAssetId??null):null, mask_role: a.role!=='mask'?null:a.maskMode === 'preserve' ? 'preserve_region' : a.maskMode === 'edit' ? 'edit_region' : null }));
  const hasVideo = draft.assets.some(a => a.kind === 'video' && a.role !== 'mask');
  const hasImage = draft.assets.some(a => a.kind === 'image' && a.role !== 'mask');
  const modality = draft.output === 'image' ? hasImage ? 'i2i' : 't2i' : hasVideo ? 'v2v' : hasImage ? 'i2v' : 't2v';
  const definitions = bindings.map(b => `${b.resource} = ${b.name}；用途 ${b.role}${b.purpose ? `；说明 ${b.purpose}` : ''}${b.mask_for ? `；关联素材 ${draft.assets.find(a => a.id === b.mask_for)?.name}` : ''}${b.mask_role ? `；白色区域 ${b.mask_role}` : ''}`);
  return { schema: 'comfypilot-request-2', task: { instruction: [draft.text, draft.negativePrompt ? `不要出现：${draft.negativePrompt}` : '', definitions.length ? `输入定义：\n${definitions.join('\n')}` : ''].filter(Boolean).join('\n\n'), modality, category: 'user_creation', resources, input_types: draft.assets.map(roleForBackend), evaluation_criteria: [] as string[] }, bindings, manual_stage_edits: draft.stageEdits ?? {}, resourceFilesIncluded: false };
}
