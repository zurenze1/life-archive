const {app,BrowserWindow,ipcMain,dialog,shell,Tray,Menu,nativeImage,powerMonitor,systemPreferences,Notification,clipboard}=require('electron');
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {backup}=require('node:sqlite');
const {Store,clean}=require('./core/store.cjs');
const {Journal,PROMPTS,summarize,prefs,due}=require('./core/journal.cjs');
const speech=require('./core/speech.cjs');
const {Obsidian}=require('./core/obsidian.cjs'),{PrivateVault}=require('./core/vault.cjs'),{Updates}=require('./core/updates.cjs'),{Mobile}=require('./core/mobile.cjs');
const {execFile}=require('node:child_process');
let window,tray,store,journal,obsidian,privateVault,updates,mobile,locked=false,suspended=false,quitting=false,pending=false,testReminder=false,reminderDay='',asrBusy=false,reminderNotification;
const jobs=new Map(),timers=[];
const diagnostic=process.argv.includes('--diagnose');
const testData=process.argv.find(a=>a.startsWith('--test-data='))?.slice(12);
const forceReminder=process.argv.includes('--test-reminder');
const fakeAudio=!!testData&&process.argv.includes('--use-fake-device-for-media-stream');
const audioQueue=[];
app.setName('人生档案');if(testData)app.setPath('userData',path.resolve(testData));
if(!app.requestSingleInstanceLock()&&!diagnostic)app.quit();else{
  app.on('second-instance',()=>{show();checkReminder();});
  app.on('activate',()=>{if(app.isReady()&&store)show();});
  app.whenReady().then(async()=>{
    store=new Store(path.join(app.getPath('userData'),'data'));
    if(!store.setting('journalModeVersion',0)){
      const folder=path.join(store.directory,'backups');fs.mkdirSync(folder,{recursive:true,mode:0o700});
      const file=path.join(folder,'before-journal-1.4.sqlite');if(!fs.existsSync(file)){await backup(store.db,file);fs.chmodSync(file,0o600);}
    }
    journal=new Journal(store);journal.initialize();
    obsidian=new Obsidian(store,journal);privateVault=new PrivateVault(store.directory);updates=new Updates(store.directory,app.getVersion?.()??'1.4.0');mobile=new Mobile(store,receiveMobile);
    store.db.exec('CREATE TABLE IF NOT EXISTS mobile_inbox(id TEXT PRIMARY KEY,payload TEXT NOT NULL)');
    if(!store.setting('retiredActivityRemoved',false)){const removed=store.db.prepare("DELETE FROM records WHERE kind='activity'").run().changes;store.setSetting('retiredActivityRemoved',{count:removed,at:new Date().toISOString()});}
    if(diagnostic){let pdf='not tested';const fixture=process.argv.find(a=>a.startsWith('--pdf-fixture='))?.slice(14);if(fixture){const {extract}=require('./core/documents.cjs');pdf=(await extract(path.resolve(fixture))).text.includes('Life Archive PDF test')?'passed':'failed';}const voiceFixture=process.argv.find(a=>a.startsWith('--speech-fixture='))?.slice(17);const transcript=voiceFixture?await speech.transcribe(path.resolve(voiceFixture),speech.findRunner(store.setting('speechRunner',''))):undefined;console.log(JSON.stringify({packaged:app.isPackaged,version:app.getVersion(),sqlite:process.versions.sqlite,pdf,speechReady:!!speech.findRunner(store.setting('speechRunner','')),journalMode:true,automaticCollection:false,transcript}));store.close();app.quit();return;}
    createWindow();createTray();
    obsidian.sync();await mobile.start();for(const n of mobileInbox().filter(n=>!n.entryId)){const a=journal.audio(n.audioId);if(a?.transcript)finishMobile(n,a.transcript);else if(a){const runner=speech.findRunner(store.setting('speechRunner',''));if(runner){jobs.set(a.id,{status:'queued'});audioQueue.push({id:a.id,runner});}}}drainAudio();
    timers.push(setInterval(()=>{obsidian.sync();const wasOpen=!!privateVault.key;if(wasOpen&&!privateVault.status().unlocked)window?.webContents.send('vault-locked');},60000));
    if(!testData){setTimeout(()=>{if(store.setting('automaticUpdates',true))updates.check(true);},10000);timers.push(setInterval(()=>{if(store.setting('automaticUpdates',true))updates.check(true);},6*3600000));}
    timers.push(setInterval(checkReminder,1000));timers.push(setInterval(()=>{if(pending&&getPrefs().required&&!locked&&!suspended&&!window?.isFocused())focusReminder();},60000));
    setTimeout(()=>{if(forceReminder)fireReminder(true);else checkReminder();},1800);
    powerMonitor.on('lock-screen',()=>{locked=true;privateVault.lock();window?.webContents.send('vault-locked');});powerMonitor.on('unlock-screen',()=>{locked=false;checkReminder();});powerMonitor.on('suspend',()=>{suspended=true;privateVault.lock();window?.webContents.send('vault-locked');});powerMonitor.on('resume',()=>{suspended=false;checkReminder();});
    if(!testData)await configureSchedule();
  }).catch(e=>{dialog.showErrorBox('人生档案启动失败',clean(e.message,300));app.quit();});
}
function createWindow(){
  window=new BrowserWindow({width:1280,height:880,minWidth:900,minHeight:650,title:testData?'人生档案 · 隔离验证':'人生档案',backgroundColor:'#10100f',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.webContents.session.setPermissionRequestHandler((_w,permission,callback,details)=>callback(permission==='media'&&details.mediaTypes?.every(type=>type==='audio')===true));
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(e,url)=>{if(url!==window.webContents.getURL())e.preventDefault();});
  window.on('page-title-updated',e=>e.preventDefault());window.loadFile(path.join(__dirname,'ui/index.html'));window.on('close',e=>{if(!quitting){e.preventDefault();if(pending&&getPrefs().required)focusReminder();else window.hide();}});
  window.on('closed',()=>window=null);
}
function show(){if(!window||window.isDestroyed())createWindow();if(window.isMinimized())window.restore();window.show();window.focus();}
function createTray(){const icon=nativeImage.createFromPath(path.join(__dirname,'ui/tray.png')).resize({width:18,height:18});icon.setTemplateImage(true);tray=new Tray(icon);tray.setToolTip('人生档案 · 每天留下一点自己的知识');tray.setContextMenu(Menu.buildFromTemplate([{label:'打开人生档案',click:show},{label:'记录今天',click:()=>{show();window?.webContents.send('journal-open');}},{type:'separator'},{label:'退出人生档案',click:()=>app.quit()}]));tray.on('click',show);}
function getPrefs(){return prefs(store.setting('journalReminder',{}));}
function hasCompletedReminder(now=new Date()){
  const p=getPrefs(),[h,m]=p.time.split(':').map(Number),start=new Date(now.getFullYear(),now.getMonth(),now.getDate(),h,m).toISOString();
  return journal.list('',require('./web/reminders.js').localDay(now)).some(e=>e.createdAt>=start||e.segments.some(s=>s.appendedAt>=start));
}
function checkReminder(){if(!store||!journal||locked||suspended)return;if(pending){if(!testReminder&&hasCompletedReminder()){dismissReminder();return;}if(!testReminder&&reminderDay!==require('./web/reminders.js').localDay())dismissReminder();else return;}if(due(getPrefs(),store.setting('journalReminderState',{}),hasCompletedReminder()))fireReminder(false);}
function focusReminder(){show();if(getPrefs().required){window.setAlwaysOnTop?.(true,'floating');window.setFullScreen?.(true);}app.dock?.bounce('informational');}
function fireReminder(test=false){if(pending)return {ok:true};pending=true;testReminder=test;reminderDay=require('./web/reminders.js').localDay();focusReminder();window?.webContents.send('diary-reminder',{test,required:getPrefs().required});if(Notification.isSupported?.()){reminderNotification=new Notification({title:getPrefs().time+'，把今天留给自己',body:'说几句话，也是一份日记。原话保留，另外整理。',silent:false});reminderNotification.on('click',focusReminder);reminderNotification.show();}return {ok:true};}
function dismissReminder(){pending=false;testReminder=false;reminderNotification?.close();window?.setAlwaysOnTop?.(false);window?.setFullScreen?.(false);}
async function configureSchedule(){
  if(testData||process.platform!=='darwin')return {installed:false};
  const dir=path.join(os.homedir(),'Library/LaunchAgents'),file=path.join(dir,'com.lifearchive.diary.plist'),p=getPrefs();
  const exec=(args)=>new Promise(resolve=>execFile('/bin/launchctl',args,{timeout:10000},error=>resolve(!error)));
  await exec(['bootout','gui/'+process.getuid(),file]);
  if(!p.enabled){if(fs.existsSync(file))fs.unlinkSync(file);store.setSetting('scheduleStatus',{installed:false});return {installed:false};}
  const [hour,minute]=p.time.split(':').map(Number),application=app.isPackaged?path.resolve(process.execPath,'../../..'):'/Applications/人生档案.app';
  const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file,`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>com.lifearchive.diary</string><key>ProgramArguments</key><array><string>/usr/bin/open</string><string>-a</string><string>${xml(application)}</string><string>--args</string><string>--daily-journal</string></array><key>StartCalendarInterval</key><dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict></dict></plist>`,{mode:0o600});
  const installed=await exec(['bootstrap','gui/'+process.getuid(),file]);const result={installed,time:p.time};store.setSetting('scheduleStatus',result);return result;
}
function handle(name,fn){ipcMain.handle(name,async(event,...args)=>{if(event.sender!==window?.webContents)throw Error('来源无效');try{return await fn(...args);}catch(e){return {error:clean(e.message,350)};}});}
handle('state',()=>({version:app.getVersion(),prompts:PROMPTS,reminder:getPrefs(),pending,testReminder,speechReady:!!speech.findRunner(store.setting('speechRunner','')),schedule:store.setting('scheduleStatus',{}),hasToday:journal.hasToday(),counts:{journals:journal.list().length,cards:journal.cards().length,legacy:store.db.prepare('SELECT count(*) n FROM records').get().n},tracking:false,automaticCollection:false}));
handle('journal-list',value=>journal.list(value?.query??'',value?.day??''));
handle('journal-get',id=>{const e=journal.get(id);if(!e)throw Error('日记不存在');return {...e,audio:e.segments.filter(s=>s.audioId).map(s=>{const a=journal.audio(s.audioId);return a?{id:a.id,transcript:a.transcript,createdAt:a.createdAt}:null;}).filter(Boolean)};});
handle('journal-draft',value=>journal.draft(value));
handle('journal-summary',value=>summarize(value?.segments??[]));
handle('journal-save',value=>{let e;if(value.appendTo){e=journal.append(value.appendTo,value);journal.draft({segments:[]});}else e=journal.save(value);if(value.private)e=journal.setPrivate(e.id,true);if(testReminder||hasCompletedReminder())dismissReminder();const sync=obsidian.sync();return {ok:true,entry:e,sync};});
handle('journal-highlight',value=>{const e=journal.highlight(value.entryId,value);obsidian.sync();return e;});
handle('journal-private',value=>{const e=journal.setPrivate(value.id,value.private);obsidian.sync();return e;});
handle('obsidian-status',()=>({config:obsidian.config(),status:store.setting('obsidianStatus',{})}));
handle('obsidian-config',async value=>{if(value?.disable){store.setSetting('obsidian',{...obsidian.config(),enabled:false});return {enabled:false};}const r=await dialog.showOpenDialog(window,{title:'选择 Obsidian 知识库',properties:['openDirectory']});if(r.canceled)return {cancelled:true};return obsidian.configure(r.filePaths[0]);});
handle('obsidian-sync',()=>obsidian.sync());
handle('vault-status',()=>privateVault.status());
handle('vault-unlock',async password=>privateVault.unlock(password));
handle('vault-lock',()=>privateVault.lock());
handle('vault-list',query=>privateVault.list(query));
handle('vault-get',id=>privateVault.get(id));
handle('vault-save',value=>privateVault.save(value));
handle('mobile-status',()=>({...mobile.status(),pending:mobileInbox().filter(n=>!n.entryId).map(({id,audioId,receivedAt})=>({id,audioId,receivedAt}))}));
handle('mobile-config',enabled=>mobile.configure(enabled));
handle('mobile-pair',async value=>{const address=String(value??mobile.status().addresses[0]??'http://127.0.0.1:43127');const url=new URL(address);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('连接地址无效');if(url.protocol==='https:')store.setSetting('mobile',{...mobile.config(),privateOrigin:url.origin});url.pathname='/';url.search='';url.hash='pair='+mobile.pairing().token;const link=url.href;const qr=await require('qrcode').toDataURL(link,{width:260,margin:2,color:{dark:'#10130f',light:'#eeeadf'}});return {link,qr};});
handle('mobile-copy',value=>{const u=new URL(String(value));if(!['http:','https:'].includes(u.protocol))throw Error('连接地址无效');clipboard.writeText(u.href);return {ok:true};});
handle('update-status',()=>({...updates.state,automatic:store.setting('automaticUpdates',true)}));
handle('update-config',enabled=>{store.setSetting('automaticUpdates',!!enabled);return {ok:true};});
handle('update-check',()=>updates.check(true));
handle('update-install',async()=>{
  if(testData)throw Error('隔离测试不会替换已安装程序');const staged=await updates.prepare(),application=path.resolve(process.execPath,'../../..');await fsp.access(path.dirname(application),fs.constants.W_OK);const rollback=path.join(updates.directory,'rollback-'+Date.now()+'.app'),script=path.join(updates.directory,'install-update.sh');await fsp.copyFile(path.join(__dirname,'core/install-update.sh'),script);await fsp.chmod(script,0o700);const child=require('node:child_process').spawn('/bin/sh',[script,String(process.pid),application,staged,rollback],{detached:true,stdio:'ignore'});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();app.quit();return {ok:true};
});
handle('knowledge-list',query=>({cards:journal.cards(query),documents:store.list({source:'manual',query:String(query??'').slice(0,200),limit:100}).records}));
handle('knowledge-save',value=>journal.addCard(value));
handle('reminder-settings',async value=>{store.setSetting('journalReminder',prefs(value));if(!getPrefs().enabled)dismissReminder();const schedule=await configureSchedule();return {ok:true,schedule};});
handle('reminder-test',()=>fireReminder(true));
handle('reminder-response',action=>{
  if(testReminder&&action==='close-test'){dismissReminder();return {ok:true};}
  if(action==='emergency'){store.setSetting('journalReminderState',{snoozeUntil:Date.now()+300000});dismissReminder();return {ok:true};}
  throw Error('先留下一段真实记录，再完成今天；紧急情况可延后 5 分钟。');
});
handle('record-start',async()=>{if(!fakeAudio&&process.platform==='darwin'){const status=systemPreferences.getMediaAccessStatus('microphone');if(status==='denied'||status==='restricted')throw Error('麦克风未授权。请在系统设置 → 隐私与安全性 → 麦克风中允许人生档案；不会反复弹窗。');if(status!=='granted'&&!await systemPreferences.askForMediaAccess('microphone'))throw Error('麦克风未授权，仍可先用文字记录。');}return {allowed:true};});
handle('record-save',async value=>{
  const bytes=Buffer.from(value?.bytes??[]);if(bytes.length<20||bytes.length>100*1024*1024)throw Error('录音大小无效，最多 100 MB');const folder=path.join(store.directory,'recordings');await fsp.mkdir(folder,{recursive:true,mode:0o700});const ext=value.mime?.includes('wav')?'wav':value.mime?.includes('mp4')?'m4a':'webm',file=path.join(folder,crypto.randomUUID()+'.'+ext);await fsp.writeFile(file,bytes,{mode:0o600});const a=journal.addAudio({path:file,mime:value.mime||'audio/webm',size:bytes.length});return {ok:true,id:a.id,createdAt:a.createdAt};
});
handle('audio-import',async()=>{const r=await dialog.showOpenDialog(window,{title:'选择要转成日记的录音',properties:['openFile'],filters:[{name:'声音文件',extensions:['wav','m4a','mp3','webm','ogg','aac','mp4']}]});if(r.canceled)return {cancelled:true};const input=r.filePaths[0],s=await fsp.stat(input);if(s.size>100*1024*1024)throw Error('录音不能超过 100 MB');const folder=path.join(store.directory,'recordings');await fsp.mkdir(folder,{recursive:true,mode:0o700});const target=path.join(folder,crypto.randomUUID()+path.extname(input).toLowerCase());await fsp.copyFile(input,target);await fsp.chmod(target,0o600);const a=journal.addAudio({path:target,size:s.size,mime:'audio/'+path.extname(input).slice(1)});return {ok:true,id:a.id,createdAt:a.createdAt};});
async function drainAudio(){
  if(asrBusy||!audioQueue.length)return;asrBusy=true;const {id,runner}=audioQueue.shift(),a=journal.audio(id);jobs.set(id,{status:'transcribing',startedAt:Date.now()});journal.updateAudio(id,{status:'transcribing'});
  try{const text=await speech.transcribe(a.path,runner),current=journal.audio(id);journal.updateAudio(id,{status:'ready',transcript:current.transcript??text,latestTranscript:text});jobs.set(id,{status:'ready',text,originalTranscript:current.transcript??text});for(const n of mobileInbox().filter(n=>n.audioId===id&&!n.entryId))finishMobile(n,text);}
  catch(e){journal.updateAudio(id,{status:'failed'});jobs.set(id,{status:'failed',error:e.message});}
  finally{asrBusy=false;drainAudio();}
}
handle('audio-transcribe',id=>{
  const a=journal.audio(id);if(!a)throw Error('录音不存在');if(['queued','transcribing'].includes(jobs.get(id)?.status))return {started:true};const runner=speech.findRunner(store.setting('speechRunner',''));if(!runner)throw Error('本地语音识别尚未准备。录音已保存，可先在设置选择转写程序。');
  jobs.set(id,{status:'queued'});audioQueue.push({id,runner});drainAudio();return {started:true};
});
handle('audio-status',id=>{const a=journal.audio(id);if(!a)throw Error('录音不存在');return jobs.get(id)??{status:a.status==='ready'?'ready':'saved',text:a.latestTranscript??a.transcript??''};});
function mobileInbox(){return store.db.prepare('SELECT payload FROM mobile_inbox').all().map(r=>JSON.parse(r.payload));}
function putMobile(n){store.db.prepare('INSERT INTO mobile_inbox VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(n.id,JSON.stringify(n));}
function finishMobile(n,transcript=''){
  if(n.entryId)return n;const ss=[];if(n.text.trim())ss.push({id:crypto.randomUUID(),text:n.text,promptId:'free',source:'text',capturedAt:n.capturedAt});if(n.audioId){const text=transcript||journal.audio(n.audioId)?.transcript;if(!text?.trim())return n;ss.push({id:crypto.randomUUID(),text,promptId:'free',source:'voice',audioId:n.audioId,capturedAt:n.capturedAt});}
  store.db.exec('BEGIN IMMEDIATE');try{const e=journal.save({title:n.title,segments:ss,keepDraft:true},new Date(n.capturedAt));n.entryId=e.id;n.receivedAt??=new Date().toISOString();putMobile(n);store.db.exec('COMMIT');}catch(e){try{store.db.exec('ROLLBACK');}catch{}throw e;}obsidian.sync();return n;
}
function receiveMobile(note){
  const previous=store.db.prepare('SELECT payload FROM mobile_inbox WHERE id=?').get(note.id);if(previous){const n=JSON.parse(previous.payload);return {received:true,pending:!n.entryId};}
  let audioId='';if(note.bytes){const folder=path.join(store.directory,'recordings');fs.mkdirSync(folder,{recursive:true,mode:0o700});const ext=note.mime.includes('mp4')?'m4a':note.mime.includes('mpeg')?'mp3':note.mime.includes('wav')?'wav':note.mime.includes('ogg')?'ogg':note.mime.includes('3gpp')?'3gp':'webm',file=path.join(folder,crypto.randomUUID()+'.'+ext);fs.writeFileSync(file,note.bytes,{mode:0o600});audioId=journal.addAudio({path:file,size:note.bytes.length,mime:note.mime}).id;}
  let n={id:note.id,title:note.title,text:note.text,audioId,capturedAt:note.capturedAt,receivedAt:new Date().toISOString()};putMobile(n);if(!audioId)n=finishMobile(n);else{const runner=speech.findRunner(store.setting('speechRunner',''));if(runner){jobs.set(audioId,{status:'queued'});audioQueue.push({id:audioId,runner});drainAudio();}}return {received:true,pending:!n.entryId};
}
handle('audio-play',async id=>{const a=journal.audio(id);if(!a)throw Error('录音不存在');const e=await shell.openPath(a.path);if(e)throw Error(e);return {ok:true};});
handle('speech-config',async()=>{const r=await dialog.showOpenDialog(window,{title:'选择本地转写程序（FunASR transcribe）',properties:['openFile']});if(r.canceled)return {cancelled:true};if(!speech.findRunner(r.filePaths[0]))throw Error('请选择可执行的本地转写程序');store.setSetting('speechRunner',r.filePaths[0]);return {ok:true};});
handle('export',async()=>{const folder=await dialog.showOpenDialog(window,{title:'导出完整档案到文件夹',properties:['openDirectory','createDirectory']});if(folder.canceled)return {cancelled:true};const output=path.join(folder.filePaths[0],'人生档案-'+new Date().toISOString().replace(/[:.]/g,'-'));await fsp.mkdir(output,{mode:0o700});await backup(store.db,path.join(output,'archive.sqlite'));await fsp.chmod(path.join(output,'archive.sqlite'),0o600);if(fs.existsSync(privateVault.file))await fsp.copyFile(privateVault.file,path.join(output,'private-vault.json'));for(const folder of ['recordings','attachments']){const source=path.join(store.directory,folder);if(fs.existsSync(source))await fsp.cp(source,path.join(output,folder),{recursive:true});}const data=journal.export();data.audio=data.audio.map(({path:full,...a})=>({...a,file:'recordings/'+path.basename(full)}));await fsp.writeFile(path.join(output,'journal.json'),JSON.stringify(data,null,2),{mode:0o600});for(const e of data.journals)await fsp.writeFile(path.join(output,e.day+'-'+e.id.slice(0,8)+'.md'),journal.markdown(e),{mode:0o600});return {ok:true,path:output};});
handle('reveal-data',()=>shell.showItemInFolder(store.path));
handle('legacy-records',value=>store.list({query:String(value?.query??'').slice(0,200),limit:100,offset:Number(value?.offset??0)}));
handle('open-record',async id=>{const row=store.db.prepare('SELECT path FROM records WHERE id=?').get(String(id));if(!row||!row.path)throw Error('原始文件路径不可用');const error=await shell.openPath(row.path);if(error)throw Error(error);return {ok:true};});
handle('import',async()=>{const r=await dialog.showOpenDialog(window,{title:'选择自己的笔记或文档',properties:['openFile','multiSelections'],filters:[{name:'笔记与文档',extensions:['txt','md','pdf','docx','xlsx','csv']}]});if(r.canceled)return {cancelled:true};const {extract}=require('./core/documents.cjs');let count=0;for(const file of r.filePaths){const folder=path.join(store.directory,'attachments');await fsp.mkdir(folder,{recursive:true,mode:0o700});const target=path.join(folder,crypto.randomUUID()+path.extname(file).toLowerCase());await fsp.copyFile(file,target);await fsp.chmod(target,0o600);const result=await extract(target);store.add({key:'manual:'+crypto.randomUUID(),source:'manual',kind:'file',title:path.basename(file),body:result.text||'已保留原件，可打开查看。',path:target,meta:{confirmed:true,importedByUser:true,evidence:'使用者主动导入'}});count++;}return {ok:true,count};});
app.on('before-quit',()=>{quitting=true;privateVault?.lock();mobile?.stop();timers.forEach(clearInterval);});app.on('window-all-closed',()=>{});
