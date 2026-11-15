import { liveApi, liveMode } from './liveApi';
import { get, set } from 'idb-keyval';
import { LIMITS } from './data';
import type { Asset, Artifact, OutputKind } from './domain';
export const uid = () => crypto.randomUUID();
export function validateFile(file: Pick<File, 'type' | 'size'>) {
  if (liveMode && file.type.startsWith('video/')) return '当前真实运行服务仅支持图片素材，视频尚未接入。';
  if (!LIMITS.accepted.includes(file.type)) return '请选择 PNG、JPEG、WebP 图片或 MP4、WebM 视频。';
  if (file.size > (file.type.startsWith('image/') ? LIMITS.imageBytes : LIMITS.videoBytes)) return '文件过大：图片上限 20 MB，视频上限 200 MB。';
  return null;
}
export function assertUploadBatch(files: FileList | readonly File[], existingCount: number) {
  if(existingCount+files.length>LIMITS.maxAssets)throw new Error(`每次创作最多 ${LIMITS.maxAssets} 份素材；当前已有 ${existingCount} 份，请减少本次选择的文件。`);
  for(const file of Array.from(files)){const error=validateFile(file);if(error)throw new Error(`${file.name}：${error}`);}
}
export async function saveUpload(file: File): Promise<Asset> {
  const error = validateFile(file); if (error) throw new Error(error);
  let geometry: Pick<Asset, 'width' | 'height'> = {};
  if (file.type.startsWith('image/') && typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(file); } catch { throw new Error('图片无法解码，请重新导出为 PNG、JPEG 或 WebP。'); }
    geometry = { width: bitmap.width, height: bitmap.height }; bitmap.close();
  }
  if (liveMode) { const remote = await liveApi.upload(file); return { name:file.name, label:file.name.replace(/\.[^.]+$/, ''), kind:file.type.startsWith('video/')?'video':'image', role:'unassigned', size:file.size, mime:file.type, ...geometry, ...remote }; }
  const id = uid(); await set(`media:${id}`, file);
  return { id, name: file.name, label: file.name.replace(/\.[^.]+$/, ''), kind: file.type.startsWith('video/') ? 'video' : 'image', role: 'unassigned', size: file.size, mime: file.type, ...geometry };
}
export async function mediaBlob(media: Pick<Asset, 'id' | 'url'> | Pick<Artifact, 'id' | 'url'>): Promise<Blob> {
  if (media.url) { const r = await fetch(media.url); if (!r.ok) throw new Error('素材文件暂时无法读取。'); return r.blob(); }
  const blob = await get<Blob>(`media:${media.id}`); if (!blob) throw new Error('本地素材已丢失，请重新上传。'); return blob;
}
export async function mediaUrl(media: { id: string; url?: string }): Promise<{ url: string; revoke: boolean }> { return media.url ? { url: media.url, revoke: false } : { url: URL.createObjectURL(await mediaBlob(media)), revoke: true }; }
export async function downloadMedia(media: Asset | Artifact) { const blob = await mediaBlob(media); downloadBlob(blob, media.name); }
export function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000); }
export function downloadJSON(data: unknown, name: string) { downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), name); }
export async function makeVideo(poster: string): Promise<{ id: string; mime: string }> {
  if (!('MediaRecorder' in window) || !HTMLCanvasElement.prototype.captureStream) throw new Error('当前浏览器不支持演示视频编码，请使用新版 Chrome / Edge。');
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 800;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('无法初始化视频画面。');
  const img = new Image(); img.src = poster; await img.decode();
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const stream = canvas.captureStream(20);
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) { stream.getTracks().forEach(t => t.stop()); throw new Error('当前浏览器不支持 WebM 演示视频。'); }
  const recorder = new MediaRecorder(stream, { mimeType: mime }); const chunks: Blob[] = [];
  await new Promise<void>((resolve, reject) => {
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = () => reject(new Error('演示视频编码失败。'));
    const start = performance.now();
    const timer = window.setInterval(() => { const p = Math.min((performance.now() - start) / 2200, 1); const s = 1 + p * .045; ctx.drawImage(img, -(s - 1) * 320, -(s - 1) * 400, 640 * s, 800 * s); }, 50);
    recorder.onstop = () => { clearInterval(timer); resolve(); };
    recorder.start(); setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, 2300);
  }).finally(() => stream.getTracks().forEach(t => t.stop()));
  const id = uid(); await set(`media:${id}`, new Blob(chunks, { type: 'video/webm' })); return { id, mime: 'video/webm' };
}
export async function makeDemoArtifacts(runId: string, kind: OutputKind): Promise<Artifact[]> {
  if (kind === 'video') { const media = await makeVideo('/art/coast.svg'); return [{ ...media, name: 'ComfyTree-演示片段.webm', kind: 'video', poster: '/art/coast.svg', runId }]; }
  return ['/art/coast.svg', '/art/desert.svg'].map((url, i) => ({ id: uid(), name: `ComfyTree-演示作品-${i + 1}.svg`, kind: 'image', url, poster: url, mime: 'image/svg+xml', runId }));
}
