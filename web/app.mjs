import {MAX_FILE,MAX_BACKUP,localParts,normalizeEntry,backupPayload,filterEntries,sniffType,recordingMime} from './model.mjs';
import {allEntries,getAttachment,saveBatch,openDb,getSetting,setSetting,claimReminder} from './db.mjs';
const $=id=>document.getElementById(id);
$('entry-metadata').innerHTML=LifeArchiveStudio.fields('entry');
const studio=LifeArchiveStudio.start({load:async()=>({entries:await allEntries(),decisions:await getSetting('decisions',[])}),saveDecision:async d=>{const list=await getSetting('decisions',[]);const index=list.findIndex(x=>x.id===d.id);if(index<0)list.push(d);else list[index]=d;await setSetting('decisions',list);},edit:id=>openEditor(id),toast});
for(const b of document.querySelectorAll('[data-page]'))b.onclick=async()=>{const name=b.dataset.page;document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('[data-timeline]').forEach(x=>x.hidden=name!=='timeline');$('life-studio').hidden=name==='timeline';if(name!=='timeline')await studio.activate(name);};
const kinds={note:'文字',image:'照片',audio:'录音',video:'视频',document:'文档',imported:'导入线索'};
let entries=[],limit=80,busy=false,editing=null,previewUrls=[],backupUrls=[],installer=null,decisions=[],recorder=null,stream=null,timer=null,recordSeconds=0,recordPending=false;
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>$('toast').hidden=true,7000);}
function problem(error){toast(error?.message??'这次操作没有完成，请重试。');}
async function job(fn){if(busy){toast('正在处理材料，请稍等。');return;}if(recorder?.state==='recording'){toast('请先停止并保存录音，再处理其他材料。');return;}busy=true;try{await fn();}catch(error){problem(error);}finally{busy=false;}}
function show(id){if(!$(id).open)$(id).showModal();}
function revokePreviews(){previewUrls.forEach(URL.revokeObjectURL);previewUrls=[];}
async function refresh(){entries=await allEntries();decisions=await getSetting('decisions',[]);render();await studio.update();}
function render(){
  const filters={query:$('search').value,kind:$('kind').value,day:$('day').value};
  const matches=filterEntries(entries,filters);const total=entries.filter(e=>!e.deletedAt).length;
  $('total').textContent=total.toLocaleString();$('result-count').textContent=total?`${matches.length.toLocaleString()} 条匹配线索`:'从一份已有材料开始，不必一次记完。';
  $('reset-filter').hidden=!Object.values(filters).some(Boolean);$('more').hidden=matches.length<=limit;
  const host=$('records');host.replaceChildren();
  if(!matches.length){const box=node('div','empty');box.append(node('span','','◎'),node('h3','',total?'还没有匹配的生活线索。':'还没有线索，正好从今天开始。'),node('p','',total?'试试其他关键词或清除筛选。':'选几张照片，导入一份文档，\n或者留下一段声音。'));host.append(box);return;}
  for(const e of matches.slice(0,limit)){
    const article=node('article','record');const date=node('div','record-date',e.day.slice(0,4));date.append(node('strong','',e.day.slice(5)),node('span','',e.time));
    const copy=node('div','');const h=node('h3','');h.append(node('span','badge',kinds[e.kind]??'线索'),document.createTextNode(e.title));
    if(e.legacy?.pinned)h.append(node('span','badge','置顶'));const p=node('p','',e.body.slice(0,230)||e.fileName||'留下一份原始材料，等待以后回看。');
    const foot=node('div','record-footer');foot.append(node('span','',e.source),node('span',e.confirmed?'':'pending',e.confirmed?'已确认':'待确认线索'));
    const edit=node('button','link-button','查看 / 修改 →');edit.type='button';edit.onclick=()=>openEditor(e.id);foot.append(edit);const tags=node('div','record-tags');for(const t of [...(e.legacy?.people??[]),...(e.legacy?.tags??[])])tags.append(node('span','',t));copy.append(h,p,tags,foot);article.append(date,copy);host.append(article);
  }
}
async function openEditor(id=null){
  if(busy)return toast('正在处理材料，请稍等。');
  try{
    editing=id?entries.find(e=>e.id===id):null;revokePreviews();const parts=editing??localParts();
    $('editor-title').textContent=editing?'回看这一条线索':'留住这一刻';$('entry-title').value=editing?.title??'';$('entry-body').value=editing?.body??'';$('entry-day').value=parts.day;$('entry-time').value=parts.time;$('entry-confirmed').checked=editing?editing.confirmed:true;$('remove-entry').hidden=!editing;
    $('attachment').replaceChildren();LifeArchiveStudio.fillFields('entry',editing?.legacy??{});$('entry-source').textContent=editing?[editing.source,editing.detail].filter(Boolean).join(' · '):'文字记录由你确认；也可以只写一个标题。';show('editor');
    if(editing?.attachmentId){
      const e=editing;const attachment=await getAttachment(e.attachmentId);if(editing?.id!==e.id||!$('editor').open)return;
      if(!attachment?.blob){$('attachment').append(node('p','','原件暂不可读，请保留备份并重新导入。'));return;}
      const url=URL.createObjectURL(attachment.blob);previewUrls.push(url);
      let media;
      if(e.kind==='image' && !['image/heic','image/heif'].includes(e.fileType)){media=node('img','attachment-preview');media.alt=e.fileName;media.onerror=()=>toast('当前浏览器不能预览此照片，仍可下载原件。');}
      if(e.kind==='audio'||e.kind==='video'){media=node(e.kind==='audio'?'audio':'video','attachment-preview');media.controls=true;media.preload='metadata';media.setAttribute('playsinline','');media.onerror=()=>toast('当前浏览器不能播放此格式，仍可下载原件。');}
      if(media){media.src=url;$('attachment').append(media);}
      const download=node('a','','下载原件：'+e.fileName);download.href=url;download.download=e.fileName||'人生档案原件';$('attachment').append(node('p','',`${(attachment.blob.size/1024/1024).toFixed(2)} MB · 原件保存在当前浏览器`),download);
    }
  }catch(error){problem(error);}
}
async function hashFile(file){const bytes=await file.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function officeText(bytes,extension){return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./doc-worker.mjs',import.meta.url),{type:'module'});const timeout=setTimeout(()=>{worker.terminate();reject(new Error('文档解析超时，仅保留原件'));},12000);
  const finish=()=>{clearTimeout(timeout);worker.terminate();};worker.onmessage=({data})=>{finish();data.error?reject(new Error(data.error)):resolve(data);};worker.onerror=()=>{finish();reject(new Error('当前浏览器无法解析此文档，原件仍可保存'));};worker.postMessage({bytes,extension},[bytes]);
});}
async function pdfText(file){
  const pdf=await import('./vendor/pdf.mjs');pdf.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
  const loading=pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,standardFontDataUrl:new URL('./vendor/standard_fonts/',import.meta.url).href,cMapUrl:new URL('./vendor/cmaps/',import.meta.url).href,cMapPacked:true,disableFontFace:true});
  let timeout;const parse=async()=>{const doc=await loading.promise;const out=[];for(let i=1;i<=Math.min(doc.numPages,30);i++){const page=await doc.getPage(i);const text=await page.getTextContent();out.push(text.items.map(item=>item.str??'').join(' '));page.cleanup();}const text=out.join('\n').slice(0,30000);return {text,detail:text.trim()?'已提取 PDF 可读文字，最多 30 页；保留原件':'PDF 无可读文字层，仅保存原件，尚无扫描件 OCR'};};
  try{return await Promise.race([parse(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('PDF 解析超时，仅保留原件')),20000);})]);}finally{clearTimeout(timeout);await loading.destroy();}
}
async function extraction(file){
  const extension=file.name.split('.').pop().toLowerCase();
  if(!['txt','md','csv','ics','docx','xlsx','pdf'].includes(extension))return {text:'',detail:['doc','xls'].includes(extension)?'旧版 Office 格式，仅保存原件':'保存原件；没有画面识别或声音转写'};
  if(file.size>12*1024*1024)return {text:'',detail:'文档超过 12 MB，仅保存原件'};
  try{return extension==='pdf'?await pdfText(file):await officeText(await file.arrayBuffer(),extension);}catch(error){return {text:'',detail:error.message+'；原件已保留'};}
}
async function importFiles(files){
  let added=0,duplicates=0,failed=[];const selected=[...files];
  if(selected.length>30)throw new Error('每次最多导入 30 个文件，请分批选择');
  for(let i=0;i<selected.length;i++){
    const file=selected[i];$('progress').textContent=`正在整理 ${i+1}/${selected.length}：${file.name}`;
    try{
      if(file.size>MAX_FILE)throw new Error('超过单文件 50 MB 上限');
      const key='file:'+await hashFile(file);if(entries.some(e=>e.sourceKey===key&&!e.deletedAt)){duplicates++;continue;}
      const old=entries.find(e=>e.sourceKey===key);if(old){await saveBatch([{...old,deletedAt:null,updatedAt:new Date().toISOString()}]);added++;await refresh();continue;}
      const result=await extraction(file);const type=sniffType(file);const parts=localParts(file.lastModified>0?file.lastModified:Date.now());const id=crypto.randomUUID(),attachmentId=crypto.randomUUID();
      const e=normalizeEntry({id,sourceKey:key,...parts,title:file.name.replace(/\.[^.]+$/,'')||file.name,body:result.text,kind:type.kind,source:'文件导入',confirmed:false,detail:result.detail+'；日期来自文件修改时间，不等于实际经历日期',attachmentId,fileName:file.name,fileType:type.mime,fileSize:file.size});
      await saveBatch([e],[{id:attachmentId,name:file.name,type:type.mime,blob:new Blob([file],{type:type.mime})}]);added++;await refresh();
    }catch(error){failed.push(`${file.name}：${error.message}`);}
  }
  $('progress').textContent=`已保存 ${added} 份原件与线索${duplicates?`，跳过 ${duplicates} 个重复文件`:''}${failed.length?`；${failed.length} 个未保存`:'。'}`;
  if(failed.length)toast(failed.slice(0,4).join('\n'));else if(added)toast('材料已保存在这个设备的浏览器里。');
}
function blobBase64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(new Error('附件读取失败，备份未完成'));r.onload=()=>resolve(String(r.result).split(',')[1]);r.readAsDataURL(blob);});}
function base64Blob(data,type,size){const raw=atob(data);if(raw.length!==size)throw new Error('备份附件长度不匹配，未导入');const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type});}
async function exportBackup(){
  await refresh();const downloads=$('backup-downloads');downloads.replaceChildren();backupUrls.forEach(URL.revokeObjectURL);backupUrls=[];
  if(!entries.length&&!decisions.length)return toast('当前没有需要备份的记录。');
  const groups=[];let group=[],estimate=0;
  for(const e of entries){const size=new TextEncoder().encode(JSON.stringify(e)).length+(e.attachmentId?4*Math.ceil(e.fileSize/3)+500:0);if(group.length&&(estimate+size>80*1024*1024||group.length>=1000)){groups.push(group);group=[];estimate=0;}group.push(e);estimate+=size;}if(group.length)groups.push(group);if(!groups.length&&decisions.length)groups.push([]);
  for(let i=0;i<groups.length;i++){
    $('progress').textContent=`正在准备完整备份 ${i+1}/${groups.length}…`;
    const records=groups[i],attachments=[];
    for(const e of records)if(e.attachmentId){const a=await getAttachment(e.attachmentId);if(!a?.blob)throw new Error('一份原件缺失，完整备份未完成，请先检查该记录');attachments.push({id:a.id,name:a.name,type:a.type,size:a.blob.size,data:await blobBase64(a.blob)});}
    const blob=new Blob([JSON.stringify({format:'life-archive-web',version:2,exportedAt:new Date().toISOString(),part:i+1,parts:groups.length,entries:records,attachments,decisions:i===0?decisions:[]})],{type:'application/json'});if(blob.size>MAX_BACKUP)throw new Error('本部分备份过大，请减少本次记录数量后重试');
    const url=URL.createObjectURL(blob);backupUrls.push(url);const a=node('a','','下载备份'+(groups.length>1?` ${i+1}/${groups.length}`:'')+`（${(blob.size/1024/1024).toFixed(2)} MB）`);a.href=url;a.download=`人生档案-${localParts().day}${groups.length>1?'-'+(i+1):''}.json`;const p=node('p','');p.append(a);downloads.append(p);
  }
  $('progress').textContent=`完整备份已准备，共 ${groups.length} 个文件，请在“备份与迁移”窗口逐个下载。`;
  toast(groups.length>1?'备份已分成多个文件，请全部下载。':'备份已准备，请点击下载链接保存。');
}
async function importBackup(file){
  if(file.size>MAX_BACKUP)throw new Error('备份超过 100 MB，请使用分批导出的文件');
  const parsed=JSON.parse(await file.text());const value=parsed.buckets?LifeArchiveLife.activityWatch(parsed):backupPayload(parsed);await refresh();
  const used=new Set(entries.map(e=>e.sourceKey||'id:'+e.id));const knownIds=new Set(entries.map(e=>e.id));const idMap=new Map();const records=[];const requestedAttachments=new Set();let skipped=0;
  for(const e of value.entries){const fingerprint=()=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([e.day,e.time,e.title,e.body]))).then(buffer=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join(''));const key=e.sourceKey||(e.id?'id:'+e.id:'import:'+await fingerprint());if(used.has(key)){const old=entries.find(x=>(x.sourceKey||'id:'+x.id)===key);if(old)idMap.set(e.id,old.id);skipped++;continue;}used.add(key);const id=e.id&&!knownIds.has(e.id)?e.id:crypto.randomUUID();knownIds.add(id);idMap.set(e.id,id);const copy={...e,id,sourceKey:key};records.push(copy);if(copy.attachmentId)requestedAttachments.add(copy.attachmentId);}
  const attachments=[];
  const attachmentMap=new Map();for(const a of value.attachments){if(!requestedAttachments.has(a.id))continue;const id=crypto.randomUUID();attachmentMap.set(a.id,id);const type=sniffType({name:a.name??'',type:a.type??''}).mime;attachments.push({id,name:String(a.name??'原始附件').slice(0,300),type,blob:base64Blob(a.data,type,a.size)});}
  for(const e of records)if(e.attachmentId){e.attachmentId=attachmentMap.get(e.attachmentId);const a=attachments.find(a=>a.id===e.attachmentId);e.fileType=a.type;e.fileSize=a.blob.size;e.fileName=a.name;e.kind=sniffType({name:a.name,type:a.type}).kind;}
  const restored=[...decisions];for(const d of value.decisions??[]){if(restored.some(x=>x.id===d.id))continue;restored.push({...d,id:d.id||crypto.randomUUID(),evidenceIds:d.evidenceIds.map(id=>idMap.get(id)??id)});}await saveBatch(records,attachments,{decisions:restored});await refresh();$('progress').textContent=`已导入 ${records.length} 条记录，跳过 ${skipped} 条重复记录，保留 ${restored.length} 条选择记录。`;toast($('progress').textContent);
}
async function dataDialog(){try{show('data-dialog');await refresh();const deleted=entries.filter(e=>e.deletedAt);$('trash-count').textContent=String(deleted.length);$('trash').replaceChildren();for(const e of deleted.slice(0,100)){const row=node('div','trash-row');row.append(node('span','',e.title));const button=node('button','quiet','恢复');button.onclick=()=>job(async()=>{await saveBatch([{...e,deletedAt:null,updatedAt:new Date().toISOString()}]);await dataDialog();toast('这条记录已恢复。');});row.append(button);$('trash').append(row);}if(deleted.length>100)$('trash').append(node('p','small','每次显示 100 条，恢复后继续查看。'));$('decision-trash').replaceChildren();for(const d of decisions.filter(x=>x.deletedAt)){const row=node('div','trash-row');row.append(node('span','',d.title));const b=node('button','quiet','恢复选择');b.onclick=()=>job(async()=>{await setSetting('decisions',decisions.map(x=>x.id===d.id?{...x,deletedAt:null}:x));await dataDialog();});row.append(b);$('decision-trash').append(row);}await storageStatus();}catch(error){problem(error);}}
async function storageStatus(){const estimate=await navigator.storage?.estimate?.();const persisted=await navigator.storage?.persisted?.();$('storage-status').textContent=(estimate?`已用约 ${(estimate.usage/1024/1024).toFixed(1)} MB · `:'')+(persisted?'浏览器已同意保留':'仍需定期备份');}
function endMic(){clearInterval(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;recordPending=false;$('record').classList.remove('recording');$('record').replaceChildren(node('span','','●'),node('strong','','说一段话'),node('small','','点击录音，保存原始声音'));}
async function recordAudio(){
  if(recorder?.state==='recording'){recorder.stop();return;}
  if(busy||recordPending)return toast('正在处理材料，请稍等。');
  if(!navigator.mediaDevices?.getUserMedia||!globalThis.MediaRecorder){toast('当前浏览器不支持直接录音，可用系统录音后导入文件。');return;}
  recordPending=true;
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:true});const mime=recordingMime(t=>MediaRecorder.isTypeSupported(t));recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);const chunks=[];let bytes=0,failed=false;
    recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);bytes+=e.data.size;if(bytes>MAX_FILE&&recorder.state==='recording')recorder.stop();}};
    recorder.onerror=()=>{failed=true;endMic();toast('录音中断，请用系统录音后导入。');};
    recorder.onstop=()=>{const type=recorder.mimeType||mime||'audio/webm';endMic();if(failed||!chunks.length)return;const ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';const file=new File(chunks,`录音-${localParts().day}-${Date.now()}.${ext}`,{type,lastModified:Date.now()});job(async()=>{await importFiles([file]);$('progress').textContent='原始录音已保存，尚未自动转写。';});};
    recorder.start(1000);recordSeconds=0;$('record').classList.add('recording');const update=()=>{$('record').replaceChildren(node('span','','■'),node('strong','','停止并保存'),node('small','',`${Math.floor(recordSeconds/60)}:${String(recordSeconds%60).padStart(2,'0')} · 最长 30 分钟`));};update();timer=setInterval(()=>{recordSeconds++;update();if(recordSeconds>=1800&&recorder.state==='recording')recorder.stop();},1000);
  }catch(error){endMic();toast(error.name==='NotAllowedError'?'没有获得麦克风权限。你仍可导入系统录音文件。':'录音暂不可用，请导入已有录音。');}
}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());$('editor').addEventListener('close',revokePreviews);
$('new-note').onclick=()=>openEditor();$('record').onclick=()=>recordAudio();$('add-files').onclick=()=>{if(!busy)$('file-input').click();};$('camera').onclick=()=>{if(!busy)$('camera-input').click();};
for(const input of ['file-input','camera-input'])$(input).onchange=()=>{const files=[...$(input).files];$(input).value='';if(files.length)job(()=>importFiles(files));};
$('entry-form').onsubmit=event=>{event.preventDefault();job(async()=>{
  const body=$('entry-body').value.trim(),title=$('entry-title').value.trim()||body.split(/[\n。！？]/)[0]?.slice(0,100)||editing?.fileName;
  if(!title&&!body)throw new Error('写一点内容、一个标题，或者先导入原件。');
  const e=normalizeEntry({...editing,id:editing?.id??crypto.randomUUID(),sourceKey:editing?.sourceKey??'note:'+crypto.randomUUID(),title,body,day:$('entry-day').value,time:$('entry-time').value,kind:editing?.kind??'note',source:editing?.source??'主动记录',confirmed:$('entry-confirmed').checked,legacy:LifeArchiveStudio.readFields('entry')});
  await saveBatch([e]);if(e.kind==='note'&&e.day===LifeArchiveReminders.localDay())await setSetting('diaryReminderState',LifeArchiveReminders.respond(await getSetting('diaryReminderState',{}),'done'));$('editor').close();await refresh();toast('这一刻已经留下。');
});};
$('remove-entry').onclick=()=>job(async()=>{if(!editing)return;await saveBatch([{...editing,deletedAt:new Date().toISOString()}]);$('editor').close();await refresh();toast('已移到回收站，可在“备份与迁移”恢复。');});
for(const id of ['backup','backup-top'])$(id).onclick=()=>dataDialog();$('help').onclick=()=>show('help-dialog');
$('export').onclick=()=>job(exportBackup);$('restore').onclick=()=>{if(!busy)$('backup-input').click();};$('backup-input').onchange=()=>{const file=$('backup-input').files[0];$('backup-input').value='';if(file)job(()=>importBackup(file));};
$('persist').onclick=()=>job(async()=>{const kept=await navigator.storage?.persist?.();await storageStatus();toast(kept?'浏览器已同意保留档案。仍建议备份。':'浏览器未同意保留，请定期导出备份。');});
for(const id of ['search','kind','day'])$(id).addEventListener(id==='search'?'input':'change',()=>{limit=80;render();});$('reset-filter').onclick=()=>{for(const id of ['search','kind','day'])$(id).value='';render();};$('more').onclick=()=>{limit+=80;render();};
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installer=event;$('install').textContent='安装到桌面';});$('install').onclick=async()=>{if(installer){try{await installer.prompt();await installer.userChoice;installer=null;}catch{show('help-dialog');}}else show('help-dialog');};window.addEventListener('appinstalled',()=>{$('install').textContent='已添加到桌面';installer=null;});
window.addEventListener('pagehide',()=>{if(recorder?.state==='recording')recorder.stop();});window.addEventListener('beforeunload',event=>{if(busy||recorder?.state==='recording'){event.preventDefault();event.returnValue='';}});
window.addEventListener('online',()=>{$('connection').textContent='已联网';});window.addEventListener('offline',()=>{$('connection').textContent='离线使用';});
window.addEventListener('focus',()=>{if(!busy&&!$('editor').open)refresh().catch(problem);});
async function init(){
  try{await openDb();await refresh();}catch(error){$('records').replaceChildren(node('p','fatal',error.message));toast(error.message);return;}
  $('connection').textContent=navigator.onLine?'已联网':'离线使用';
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;$('connection').textContent=navigator.onLine?'离线已准备':'离线使用';}catch{$('connection').textContent='在线可用';}}
}
init().then(()=>{checkDiaryReminder();setInterval(checkDiaryReminder,10000);});

let reminderPending=false,reminderPreview=false,reminderTickBusy=false,reminderAudio,calendarUrl;
const R=globalThis.LifeArchiveReminders;
function reminderForm(){return R.settings({enabled:$('reminder-enabled').checked,time:$('reminder-time').value,strong:$('reminder-strong').checked});}
async function reminderStatus(){const p=R.settings(await getSetting('diaryReminder',{}));$('reminder-status').textContent=(p.enabled?'每天 '+p.time+' · '+(p.strong?'强提醒':'普通提醒'):'提醒已关闭')+' · 系统通知：'+(('Notification' in window)?({granted:'已允许',denied:'未允许',default:'未申请'}[Notification.permission]):'当前浏览器不支持');}
function prepareSound(){try{reminderAudio??=new (window.AudioContext||window.webkitAudioContext)();reminderAudio.resume().catch(()=>{});}catch{}}
function reminderSound(){if(!reminderAudio||reminderAudio.state!=='running')return;for(let i=0;i<3;i++){const oscillator=reminderAudio.createOscillator(),gain=reminderAudio.createGain(),t=reminderAudio.currentTime+i*.22;oscillator.frequency.value=660;gain.gain.setValueAtTime(.07,t);gain.gain.exponentialRampToValueAtTime(.001,t+.13);oscillator.connect(gain);gain.connect(reminderAudio.destination);oscillator.start(t);oscillator.stop(t+.15);}}
async function fireDiaryReminder(test=false){if(reminderPending)return;const p=R.settings(await getSetting('diaryReminder',{}));reminderPending=true;reminderPreview=test;$('reminder-preview').textContent=test?'这是测试提醒，不会改变今天的记录状态。':'';p.strong?show('reminder-prompt'):$('reminder-prompt').show();if(p.strong)reminderSound();
 if('Notification' in window&&Notification.permission==='granted'){try{const options={body:'留下一段今天的经历。可以稍后提醒，或确认今天已写。',tag:'life-archive-diary',silent:!p.strong,requireInteraction:p.strong,data:{url:location.href}};const registration=await navigator.serviceWorker?.getRegistration();if(registration)await registration.showNotification('该写今天的日记了',options);else{const n=new Notification('该写今天的日记了',options);n.onclick=()=>{window.focus();n.close();};}}catch{toast('系统通知未送达；应用内提醒仍可使用。');}}
}
async function checkDiaryReminder(){if(reminderTickBusy||reminderPending||busy||recorder?.state==='recording'||[...document.querySelectorAll('dialog')].some(d=>d.open))return;reminderTickBusy=true;try{const notes=await allEntries();if(notes.some(e=>e.kind==='note'&&!e.deletedAt&&e.day===R.localDay())){const state=await getSetting('diaryReminderState',{});if(state.ackDay!==R.localDay())await setSetting('diaryReminderState',R.respond(state,'done'));return;}if(await claimReminder())await fireDiaryReminder();}catch(error){problem(error);}finally{reminderTickBusy=false;}}
$('reminder-settings').onclick=()=>job(async()=>{const p=R.settings(await getSetting('diaryReminder',{}));$('reminder-enabled').checked=p.enabled;$('reminder-time').value=p.time;$('reminder-strong').checked=p.strong;await reminderStatus();show('reminder-options');});
$('reminder-form').onsubmit=event=>{event.preventDefault();if($('reminder-strong').checked)prepareSound();job(async()=>{await setSetting('diaryReminder',reminderForm());await reminderStatus();toast('提醒设置已保存');});};
$('reminder-permission').onclick=async()=>{if(!('Notification' in window))return toast('此浏览器不支持系统通知，请使用应用内弹窗或系统日历。');try{await Notification.requestPermission();await reminderStatus();}catch{toast('请在浏览器或系统设置中允许通知。');}};
$('reminder-test').onclick=()=>{prepareSound();$('reminder-options').close();fireDiaryReminder(true).catch(problem);};
async function respondToReminder(action){try{if(action==='disable')await setSetting('diaryReminder',{...R.settings(await getSetting('diaryReminder',{})),enabled:false});if(!reminderPreview){if(action!=='disable'&&action!=='write')await setSetting('diaryReminderState',R.respond(await getSetting('diaryReminderState',{}),action));}reminderPending=false;reminderPreview=false;$('reminder-prompt').close();const registration=await navigator.serviceWorker?.getRegistration();if(registration)for(const notification of await registration.getNotifications({tag:'life-archive-diary'}))notification.close();if(action==='write'){openEditor();$('editor-title').textContent='写下今天的日记';$('entry-confirmed').checked=true;}}catch(error){problem(error);}}
for(const [id,action] of [['reminder-write','write'],['reminder-snooze','snooze'],['reminder-done','done'],['reminder-disable','disable']])$(id).onclick=()=>respondToReminder(action);$('reminder-prompt').addEventListener('cancel',event=>{event.preventDefault();respondToReminder('snooze');});
$('reminder-calendar').onclick=()=>job(async()=>{const prefs=reminderForm();const contents=R.calendar(prefs);await setSetting('diaryReminder',prefs);if(calendarUrl)URL.revokeObjectURL(calendarUrl);calendarUrl=URL.createObjectURL(new Blob([contents],{type:'text/calendar;charset=utf-8'}));const link=node('a','','下载日记提醒.ics，再用系统日历打开');link.href=calendarUrl;link.download='人生档案-每日日记提醒.ics';$('calendar-download').replaceChildren(link);await reminderStatus();toast('请下载并导入系统日历，导入后可在日历中管理。');});
window.addEventListener('focus',checkDiaryReminder);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkDiaryReminder();});

const cinema=document.querySelector('.archive-cinema video'),motion=matchMedia('(prefers-reduced-motion: reduce)');function syncCinema(){if(document.hidden||motion.matches)cinema.pause();else cinema.play().catch(()=>{});}document.addEventListener('visibilitychange',syncCinema);motion.addEventListener('change',syncCinema);syncCinema();
