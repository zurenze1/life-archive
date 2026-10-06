const DB_NAME='life-archive-universal-v1';
let opening;
export function openDb(){
  if(opening)return opening;
  opening=new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(new Error('此浏览器不能保存本机档案，请换用支持 IndexedDB 的浏览器'));return;}
    const request=indexedDB.open(DB_NAME,2);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('entries'))db.createObjectStore('entries',{keyPath:'id'});if(!db.objectStoreNames.contains('attachments'))db.createObjectStore('attachments',{keyPath:'id'});if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings',{keyPath:'key'});};
    request.onerror=()=>{opening=null;reject(new Error('浏览器存储不可用。请退出隐私浏览模式，或换一个浏览器。'));};
    request.onblocked=()=>reject(new Error('另一窗口正在更新档案，请关闭旧窗口后重试'));
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();opening=null;};resolve(request.result);};
  });return opening;
}
export async function allEntries(){const db=await openDb();return new Promise((resolve,reject)=>{const r=db.transaction('entries').objectStore('entries').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function getAttachment(id){const db=await openDb();return new Promise((resolve,reject)=>{const r=db.transaction('attachments').objectStore('attachments').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function saveBatch(entries,attachments=[],settings={}){
  const db=await openDb();return new Promise((resolve,reject)=>{
    const tx=db.transaction(['entries','attachments','settings'],'readwrite');
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(new Error(tx.error?.name==='QuotaExceededError'?'设备存储空间不足，材料没有保存。请先备份档案，或减少文件大小。':'本次保存未完成，请重试。'));
    tx.onerror=()=>{};
    for(const [key,value] of Object.entries(settings))tx.objectStore('settings').put({key,value});
    for(const a of attachments)tx.objectStore('attachments').put(a);
    for(const e of entries)tx.objectStore('entries').put(e);
  });
}

export async function getSetting(key,fallback){const db=await openDb();return new Promise((resolve,reject)=>{const r=db.transaction('settings').objectStore('settings').get(key);r.onsuccess=()=>resolve(r.result?.value??fallback);r.onerror=()=>reject(r.error);});}
export async function setSetting(key,value){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({key,value});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('提醒设置未保存'));tx.onerror=()=>{};});}
export async function claimReminder(now=new Date()){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite'),os=tx.objectStore('settings');let claimed=false;const p=os.get('diaryReminder'),s=os.get('diaryReminderState');s.onsuccess=()=>{const prefs=globalThis.LifeArchiveReminders.settings(p.result?.value??{}),state=s.result?.value??{};if(globalThis.LifeArchiveReminders.due(prefs,state,now)){claimed=true;os.put({key:'diaryReminderState',value:globalThis.LifeArchiveReminders.fired(state,now)});}};tx.oncomplete=()=>resolve(claimed);tx.onabort=()=>reject(tx.error??new Error('提醒暂不可用'));tx.onerror=()=>{};});}
