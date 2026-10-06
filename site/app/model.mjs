import './life.js?v=7865ea711740';
const Life=globalThis.LifeArchiveLife;
export const MAX_FILE = 50 * 1024 * 1024;
export const MAX_BACKUP = 100 * 1024 * 1024;
export function localParts(value = Date.now()) {
  const d = new Date(value), pad = v => String(v).padStart(2,'0');
  if(!Number.isFinite(d.getTime()))throw new Error('日期无法读取');
  return {day:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,time:`${pad(d.getHours())}:${pad(d.getMinutes())}`};
}
export function validDay(day) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
  const d=new Date(day+'T12:00:00');return Number.isFinite(d.getTime()) && localParts(d).day===day;
}
export function normalizeEntry(input, now=new Date().toISOString()) {
  if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('备份记录格式不正确');
  const day=String(input.day??''), time=String(input.time??'12:00');
  if(!validDay(day)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('备份中的日期或时间不正确');
  const title=String(input.title??'一条生活线索').slice(0,200);
  const body=String(input.body??'').slice(0,30000);
  const kind=['note','image','audio','video','document','imported'].includes(input.kind)?input.kind: ['manual','daily','diary'].includes(input.source)?'note':'imported';
  const attachmentId=typeof input.attachmentId==='string'?input.attachmentId.slice(0,200):null;
  const legacyInput=input.legacy??input;
  const mood=typeof legacyInput.mood==='string'?legacyInput.mood.slice(0,200):typeof legacyInput.mood==='number'&&Number.isFinite(legacyInput.mood)?legacyInput.mood:null;
  const legacy={category:String(legacyInput.category??'').slice(0,100),mood,people:Array.isArray(legacyInput.people)?legacyInput.people.slice(0,100).map(p=>String(p).slice(0,200)):[],tags:Array.isArray(legacyInput.tags)?legacyInput.tags.slice(0,100).map(p=>String(p).slice(0,200)):[],place:String(legacyInput.place??'').slice(0,1000),pinned:legacyInput.pinned===true,evidenceIds:Array.isArray(legacyInput.evidenceIds)?legacyInput.evidenceIds.slice(0,100).map(p=>String(p).slice(0,200)):[]};
  return {id:String(input.id??'').slice(0,200),sourceKey:String(input.sourceKey??'').slice(0,300),day,time,title,body,kind,confirmed:input.confirmed===true,source:String(input.source??'备份导入').slice(0,200),detail:String(input.detail??'').slice(0,2000),attachmentId,fileName:String(input.fileName??'').slice(0,300),fileType:String(input.fileType??'').slice(0,200),fileSize:Math.max(0,Number(input.fileSize)||0),createdAt:typeof input.createdAt==='string'?input.createdAt:now,updatedAt:now,deletedAt:typeof input.deletedAt==='string'?input.deletedAt:null,legacy};
}
export function backupPayload(value) {
  if(!value||typeof value!=='object'||!Array.isArray(value.entries))throw new Error('请选择人生档案导出的 JSON 备份');
  if(value.entries.length>10000)throw new Error('每次最多导入 10,000 条，请分批');
  if(value.decisions!==undefined&&!Array.isArray(value.decisions))throw new Error('选择记录格式不正确');
  if((value.decisions?.length??0)>1000)throw new Error('每次最多导入 1,000 条选择记录');
  const decisions=(value.decisions??[]).map(d=>Life.normalizeDecision(d));
  if(value.format && value.format!=='life-archive-web')throw new Error('不支持这个备份格式');
  if(value.format==='life-archive-web' && ![1,2].includes(value.version))throw new Error('这个备份版本暂不支持');
  if(value.entries.some(e=>e?.media?.length))throw new Error('此备份的附件只含云端引用。请在原云端版保留原件，再单独导入通用版。');
  const entries=value.entries.map(e=>normalizeEntry(e));
  const attachments=Array.isArray(value.attachments)?value.attachments:[];
  const ids=new Set();
  for(const a of attachments){
    if(!a||typeof a.id!=='string'||typeof a.data!=='string'||!Number.isSafeInteger(a.size)||a.size<0||a.size>MAX_FILE)throw new Error('备份附件格式或大小不正确');
    if(a.data.length!==4*Math.ceil(a.size/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(a.data))throw new Error('备份附件内容不完整');
    if(ids.has(a.id))throw new Error('备份附件标识重复');ids.add(a.id);
  }
  for(const e of entries)if(e.attachmentId&&!ids.has(e.attachmentId))throw new Error('备份缺少附件，未导入；请使用完整备份');
  return {entries,attachments,decisions};
}
export function filterEntries(entries,{query='',kind='',day='',person='',tag='',pinned=false}={}) {
  const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter(e=>!e.deletedAt&&(!kind||e.kind===kind)&&(!day||e.day===day)&&(!person||e.legacy?.people?.includes(person))&&(!tag||e.legacy?.tags?.includes(tag))&&(!pinned||e.legacy?.pinned)&&words.every(w=>`${e.title}\n${e.body}\n${e.fileName}\n${(e.legacy?.people??[]).join(' ')}\n${(e.legacy?.tags??[]).join(' ')}\n${e.legacy?.category??''}`.toLocaleLowerCase().includes(w))).sort((a,b)=>Number(b.legacy?.pinned===true)-Number(a.legacy?.pinned===true)||(b.day+b.time).localeCompare(a.day+a.time)||b.createdAt.localeCompare(a.createdAt));
}
export function sniffType(file) {
  const extension=file.name.split('.').pop().toLowerCase();
  const map={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',avif:'image/avif',heic:'image/heic',heif:'image/heif',mp4:'video/mp4',mov:'video/quicktime',m4v:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',aac:'audio/aac',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pdf:'application/pdf',txt:'text/plain',md:'text/plain',csv:'text/csv',ics:'text/calendar'};
  const actual=String(file.type??'').split(';')[0];
  const mime=(extension==='webm'&&actual.startsWith('audio/'))?'audio/webm':map[extension]??(['audio/webm','audio/mp4','audio/ogg'].includes(actual)?actual:'application/octet-stream');
  return {mime,kind:mime.startsWith('image/')?'image':mime.startsWith('audio/')?'audio':mime.startsWith('video/')?'video':'document'};
}
export function recordingMime(isSupported) {
  return ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(isSupported)??'';
}
export function csv(text) {
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
  if(quoted)throw new Error('CSV 引号未闭合');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows.slice(0,5000);
}
