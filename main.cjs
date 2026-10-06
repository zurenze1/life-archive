const life=require('./web/life.js');
const {app,BrowserWindow,ipcMain,dialog,shell,Tray,Menu,nativeImage,powerMonitor,systemPreferences,Notification}=require('electron');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {Store,hash,clean,safeUrl}=require('./core/store.cjs');
const {Collector,extensions}=require('./core/collectors.cjs');
const {extract,rowRecords}=require('./core/documents.cjs');
const {frontmost}=require('./core/native.cjs');
let window,tray,store,collector,session,locked=false,quitting=false,suspended=false;
const timers=[];
const reminders=require('./web/reminders.js');
let reminderPending=false,reminderTest=false,diaryEditing=false,reminderNotification,notificationProblem='';
app.setName('人生档案');
const diagnostic=process.argv.includes('--diagnose');
const testData=process.argv.find(arg=>arg.startsWith('--test-data='))?.slice(12);
const testHome=process.argv.find(arg=>arg.startsWith('--test-home='))?.slice(12);
if(testData)app.setPath('userData',path.resolve(testData));
if(!app.requestSingleInstanceLock()&&!diagnostic){app.quit();}else{
app.on('second-instance',()=>show());
app.whenReady().then(async()=>{
  store=new Store(path.join(app.getPath('userData'),'data'));
  collector=new Collector(store,{home:testHome?path.resolve(testHome):os.homedir(),onProgress:progress=>{if(window&&!window.isDestroyed())window.webContents.send('scan-progress',progress);}});
  if(diagnostic){let pdf='not tested';const fixture=process.argv.find(arg=>arg.startsWith('--pdf-fixture='))?.slice(14);if(fixture)pdf=(await extract(path.resolve(fixture))).text.includes('Life Archive PDF test')?'passed':'failed';console.log(JSON.stringify({electron:process.versions.electron,node:process.versions.node,sqlite:process.versions.sqlite,native:frontmost()?.name,packaged:app.isPackaged,pdf}));store.close();app.quit();return;}
  createWindow();createTray();
  timers.push(setInterval(checkReminder,10000));setTimeout(checkReminder,1500);
  powerMonitor.on('lock-screen',()=>{locked=true;flushSession();});powerMonitor.on('unlock-screen',()=>{locked=false;sample();checkReminder();});powerMonitor.on('suspend',()=>{suspended=true;flushSession();});powerMonitor.on('resume',()=>{suspended=false;sample();scan();checkReminder();});
  timers.push(setInterval(sample,15000));timers.push(setInterval(()=>{if(session)flushSession(false);},60000));timers.push(setInterval(scan,30*60*1000));
  setTimeout(()=>{sample();scan();},800);
}).catch(error=>{dialog.showErrorBox('人生档案启动失败',clean(error.message,500));app.quit();});
}
function createWindow(){window=new BrowserWindow({width:1250,height:860,minWidth:900,minHeight:640,title:testData?'人生档案 · 隔离测试':'人生档案',backgroundColor:'#11100e',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});window.webContents.session.setPermissionRequestHandler((_wc,permission,callback,details)=>callback(permission==='media'&&details.mediaTypes?.every(type=>type==='audio')===true));window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(url!==window.webContents.getURL())event.preventDefault();});window.loadFile(path.join(__dirname,'ui/index.html'));window.on('close',event=>{if(!quitting){event.preventDefault();window.hide();}});}
function show(){if(!window||window.isDestroyed())createWindow();window.show();window.focus();}
function createTray(){const icon=nativeImage.createFromPath(path.join(__dirname,'ui/tray.png')).resize({width:18,height:18});icon.setTemplateImage(true);tray=new Tray(icon);tray.setToolTip('人生档案 · 本机采集');tray.setContextMenu(Menu.buildFromTemplate([{label:'打开人生档案',click:show},{label:'立即整理',click:()=>{show();scan();}},{type:'separator'},{label:'退出并停止采集',click:()=>app.quit()}]));tray.on('click',show);}
async function scan(){if(!store.setting('tracking',true)||collector.running||suspended)return;try{await collector.scan();}catch(error){store.source('system',{name:'采集任务',status:'error',detail:'本次整理未完成：'+clean(error.message,180)});}}
function flushSession(end=true){if(!session)return;const duration=session.samples*15;store.add({key:'activity:'+session.started+':'+session.bundleId,source:'activity',kind:'activity',title:'使用 '+session.name,body:`前台采样约 ${Math.max(1,Math.round(duration/60))} 分钟。每 15 秒观察一次应用；时间是采样估计，不代表完整操作或聊天内容。`,occurredAt:session.started,meta:{bundleId:session.bundleId,seconds:duration,lastSeen:session.lastSeen,evidence:'前台应用采样'}});if(end)session=null;}
function sample(){if(!store?.setting('tracking',true)||store.setting('disabledSources',[]).includes('activity')||locked||suspended||powerMonitor.getSystemIdleTime()>120){flushSession();return;}try{const current=frontmost();if(!current||current.bundleId==='com.lifearchive.desktop'||current.name==='人生档案'){flushSession();return;}const now=new Date().toISOString();if(!session||session.bundleId!==current.bundleId){flushSession();session={...current,started:now,lastSeen:now,samples:1};}else{session.samples++;session.lastSeen=now;}}catch(error){store.source('activity',{name:'应用使用时间',status:'error',detail:'前台应用读取失败：'+clean(error.message,160)});}}
function handle(name,fn){ipcMain.handle(name,async(event,...args)=>{if(event.sender!==window?.webContents)throw new Error('来源无效');try{return await fn(...args);}catch(error){return {error:clean(error.message,300)};}});}
handle('state',()=>({summary:store.summary(),tracking:store.setting('tracking',true),scanning:collector.running,folders:store.setting('folders',[]),disabled:store.setting('disabledSources',[]),login:app.getLoginItemSettings().openAtLogin,apps:store.setting('installedApps',[]),webUrl:store.setting('webUrl',''),reminder:reminders.settings(store.setting('diaryReminder',{})),reminderPending,reminderTest,notificationProblem,version:app.getVersion()}));
handle('records',options=>store.list({query:String(options?.query??'').slice(0,200),source:String(options?.source??''),kind:String(options?.kind??''),day:String(options?.day??''),limit:100,offset:Number(options?.offset??0)}));
handle('scan',()=>{scan();return {started:true};});
handle('tracking',value=>{store.setSetting('tracking',!!value);if(!value){collector.cancelled=true;flushSession();}else{sample();scan();}return {tracking:!!value};});
handle('source-toggle',(id,enabled)=>{if(!store.sources().some(item=>item.id===id))throw new Error('来源无效');const disabled=new Set(store.setting('disabledSources',[]));enabled?disabled.delete(id):disabled.add(id);store.setSetting('disabledSources',[...disabled]);if(id==='activity'&&!enabled)flushSession();return {ok:true};});
handle('folder-add',async()=>{const result=await dialog.showOpenDialog(window,{title:'选择自动整理的文件夹',properties:['openDirectory','multiSelections']});if(result.canceled)return {cancelled:true};const folders=[...new Set([...store.setting('folders',[]),...result.filePaths])];store.setSetting('folders',folders);scan();return {folders};});
handle('folder-remove',folder=>{store.setSetting('folders',store.setting('folders',[]).filter(item=>item!==folder));return {ok:true};});
async function importFile(file){const stat=await fsp.stat(file);if(!stat.isFile()||!extensions.has(path.extname(file).toLowerCase()))return false;let result;try{result=await extract(file);}catch(error){result={text:'',detail:'原件索引；解析未完成：'+clean(error.message,100)};}const media=/\.(jpe?g|png|heic|gif|webp|mov|mp4|m4v|mp3|m4a|wav|aac|ogg)$/i.test(file);store.add({key:'file:'+file,source:'files',kind:media?'media':'file',title:path.basename(file),body:result.text||result.detail||'原件索引',occurredAt:stat.mtime,path:file,meta:{size:stat.size,evidence:'文件修改时间'}});for(const record of rowRecords(result.rows,file))store.add({...record,source:'files',path:file});return true;}
handle('import',async()=>{const result=await dialog.showOpenDialog(window,{title:'导入照片、影音或文档',properties:['openFile','multiSelections'],filters:[{name:'支持的文件',extensions:[...extensions].map(ext=>ext.slice(1))}]});let count=0;for(const file of result.filePaths)if(await importFile(file))count++;return {count};});
handle('export',async()=>{flushSession(false);const result=await dialog.showSaveDialog(window,{title:'导出个人档案',defaultPath:path.join(app.getPath('downloads'),'人生档案-'+new Date().toISOString().slice(0,10)+'.json'),filters:[{name:'JSON 档案',extensions:['json']}]});if(result.canceled)return {cancelled:true};await fsp.writeFile(result.filePath,JSON.stringify(store.export(),null,2),{mode:0o600});return {path:result.filePath};});
handle('open-record',async id=>{const row=store.db.prepare('SELECT path,url FROM records WHERE id=?').get(String(id));if(!row)throw new Error('记录不存在');if(row.path){const error=await shell.openPath(row.path);if(error)throw new Error(error);}else if(row.url)await shell.openExternal(safeUrl(row.url));return {ok:true};});
handle('reveal-data',()=>shell.showItemInFolder(store.path));
handle('privacy',()=>shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'));
handle('website',()=>{const url=safeUrl(store.setting('webUrl',''));if(!url)throw new Error('请先在设置中填写自己的网页版地址。');return shell.openExternal(url);});
handle('web-url',value=>{const url=String(value).trim();if(url&&!safeUrl(url))throw new Error('请输入有效的 https 或 http 地址。');store.setSetting('webUrl',safeUrl(url));return {ok:true};});
handle('android-help',()=>shell.openExternal('https://developer.android.com/tools/releases/platform-tools'));
handle('login',value=>{app.setLoginItemSettings({openAtLogin:!!value,path:app.getPath('exe')});const actual=app.getLoginItemSettings().openAtLogin;return {enabled:actual,error:actual!==!!value?'系统未启用登录启动。可在系统设置 → 通用 → 登录项手动添加本工具。':undefined};});
handle('record-start',async()=>{if(process.platform==='darwin'){const allowed=await systemPreferences.askForMediaAccess('microphone');if(!allowed)throw new Error('麦克风未授权，请在系统隐私设置中允许人生档案使用麦克风。');}return {allowed:true};});
handle('record-save',async bytes=>{const buffer=Buffer.from(bytes);if(buffer.length>100*1024*1024||buffer.length<20)throw new Error('录音大小无效');const folder=path.join(store.directory,'recordings');await fsp.mkdir(folder,{recursive:true,mode:0o700});const now=new Date(),file=path.join(folder,now.toISOString().replace(/[:.]/g,'-')+'.webm');await fsp.writeFile(file,buffer,{mode:0o600});store.add({key:'recording:'+hash(file),source:'recordings',kind:'media',title:'录音 '+new Intl.DateTimeFormat('zh-CN',{dateStyle:'short',timeStyle:'short'}).format(now),body:'已保存原始录音，可打开播放；本版未自动转写或推断内容。',occurredAt:now,path:file});store.source('recordings',{name:'自己的录音',status:'ready',detail:'由录音按钮主动保存的声音原件'});return {ok:true};});

function dismissReminder(){reminderPending=false;reminderTest=false;reminderNotification?.close();reminderNotification=null;}
function checkReminder(){if(!store||locked||suspended||reminderPending||diaryEditing)return;const prefs=reminders.settings(store.setting('diaryReminder',{}));if(reminders.due(prefs,store.setting('diaryReminderState',{})))fireReminder(false);}
function fireReminder(test=false){
  if(reminderPending)return {ok:true};const prefs=reminders.settings(store.setting('diaryReminder',{}));reminderPending=true;reminderTest=test;
  if(!test)store.setSetting('diaryReminderState',reminders.fired(store.setting('diaryReminderState',{})));
  if(prefs.strong){show();app.dock?.bounce('informational');}window?.webContents.send('diary-reminder',{test});
  notificationProblem='';if(Notification.isSupported()){reminderNotification?.close();reminderNotification=new Notification({title:'该写今天的日记了',body:'留下一段今天的经历。可稍后提醒，或确认今天已写。',silent:!prefs.strong,sound:prefs.strong?'default':undefined});reminderNotification.on('click',show);reminderNotification.on('failed',()=>{notificationProblem='系统通知未送达；应用内提醒仍可使用。请检查系统通知设置。';});reminderNotification.show();}else notificationProblem='本系统不支持通知；应用内提醒仍可使用。';return {ok:true};
}
handle('reminder-settings',value=>{const prefs=reminders.settings(value);store.setSetting('diaryReminder',prefs);if(!prefs.enabled)dismissReminder();return {ok:true};});
handle('reminder-test',()=>fireReminder(true));
handle('reminder-response',action=>{if(!reminderPending)return {ok:true};if(!['done','snooze','write','disable'].includes(action))throw new Error('提醒操作无效');if(action==='disable')store.setSetting('diaryReminder',{...reminders.settings(store.setting('diaryReminder',{})),enabled:false});if(!reminderTest){if(action!=='disable'&&action!=='write')store.setSetting('diaryReminderState',reminders.respond(store.setting('diaryReminderState',{}),action));}if(action==='write')diaryEditing=true;dismissReminder();return {ok:true};});
handle('diary-editing',value=>{diaryEditing=!!value;return {ok:true};});
handle('diary-save',value=>{
  const body=String(value?.body??'').trim();if(!body||body.length>20000)throw new Error('请填写日记内容（最多 20,000 字）');
  const day=String(value?.day??reminders.localDay());if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new Error('日记日期无效');const date=new Date(day+'T12:00:00');if(!Number.isFinite(date.getTime())||reminders.localDay(date)!==day)throw new Error('日记日期无效');
  const now=new Date();if(day===reminders.localDay(now))date.setHours(now.getHours(),now.getMinutes(),now.getSeconds());
  const key='diary:'+require('node:crypto').randomUUID();store.add({key,source:'diary',kind:'diary',title:String(value?.title??'').trim()||day+' 的日记',body,occurredAt:date,meta:{...life.metadata(value?.meta),confirmed:true,evidence:'使用者主动记录'}});store.source('diary',{name:'我的日记',status:'ready',detail:'主动写下并确认的经历'});
  if(day===reminders.localDay(now))store.setSetting('diaryReminderState',reminders.respond(store.setting('diaryReminderState',{}),'done',now));diaryEditing=false;dismissReminder();return {ok:true};
});


handle('life-state',()=>{const data=store.export();return {entries:data.entries.map(e=>({...e,legacy:life.metadata(e)})),decisions:store.setting('decisions',[])};});
handle('decision-save',value=>{const d=life.normalizeDecision(value),list=store.setting('decisions',[]);if(!d.id)throw Error('选择标识缺失');const index=list.findIndex(x=>x.id===d.id);if(index<0)list.push(d);else list[index]=d;store.setSetting('decisions',list);return {ok:true};});
handle('record-detail',id=>{const row=store.db.prepare('SELECT id,title,body,occurred_at,kind,meta FROM records WHERE id=?').get(String(id));if(!row)throw Error('记录不存在');return {...row,meta:JSON.parse(row.meta)};});
handle('record-metadata',value=>{const row=store.db.prepare('SELECT meta FROM records WHERE id=?').get(String(value?.id));if(!row)throw Error('记录不存在');const meta={...JSON.parse(row.meta),...life.metadata(value?.meta),confirmed:value?.confirmed===true};store.db.prepare('UPDATE records SET meta=? WHERE id=?').run(JSON.stringify(meta),String(value.id));return {ok:true};});
handle('clear',async()=>{const result=await dialog.showMessageBox(window,{type:'warning',title:'清空本机档案',message:'删除本工具中的全部记录和录音？',detail:'电脑与手机中的源文件不受影响。清空后会暂停采集；删除的档案无法撤销，请先导出备份。',buttons:['取消','清空并暂停'],defaultId:0,cancelId:0});if(result.response!==1)return {cancelled:true};collector.cancelled=true;store.setSetting('tracking',false);session=null;if(collector.running)throw new Error('正在停止整理，请稍后再次清空。');store.db.exec("DELETE FROM records; DELETE FROM settings WHERE key LIKE 'file:%';");await fsp.rm(path.join(store.directory,'recordings'),{recursive:true,force:true});return {ok:true};});
app.on('before-quit',()=>{quitting=true;timers.forEach(clearInterval);if(store){flushSession();collector.cancelled=true;}});
app.on('window-all-closed',()=>{});
process.on('uncaughtException',error=>{if(store)try{store.source('system',{name:'运行状态',status:'error',detail:clean(error.message,160)});}catch{};});
