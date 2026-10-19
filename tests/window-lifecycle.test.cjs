const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('Mac activation restores a hidden or minimized window and recreates a destroyed one',async()=>{
  const windows=[];const os=require('node:os');const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'life-window-'));const {Store}=require('../core/store.cjs');const storage=new Store(path.join(temporary,'data'));storage.setSetting('journalModeVersion',1);storage.setSetting('retiredActivityRemoved',true);
  let ready=false;
  const app=Object.assign(new EventEmitter(),{
    setName(){},setPath(){},requestSingleInstanceLock:()=>true,isReady:()=>ready,
    whenReady:()=>Promise.resolve().then(()=>{ready=true;}),getPath:()=>temporary,quit(){}
  });
  class Window extends EventEmitter{
    constructor(){super();windows.push(this);this.visible=true;this.destroyed=false;this.minimized=false;
      this.webContents={send(){},session:{setPermissionRequestHandler(){}},setWindowOpenHandler(){},on(){}};
    }
    loadFile(){} isDestroyed(){return this.destroyed;} isMinimized(){return this.minimized;}
    hide(){this.visible=false;} show(){this.visible=true;} focus(){this.focused=true;}
    restore(){this.minimized=false;this.restored=true;}
  }
  const electron={app,BrowserWindow:Window,ipcMain:{handle(){}},dialog:{showErrorBox(...args){throw Error(args.join(':'));}},
    shell:{},Tray:class{setToolTip(){}setContextMenu(){}on(){}},Menu:{buildFromTemplate:items=>items},
    nativeImage:{createFromPath:()=>({resize:()=>({setTemplateImage(){}})})},powerMonitor:new EventEmitter(),systemPreferences:{},Notification:{}};
  const context=vm.createContext({console,process:{argv:['--test-data='+temporary],on(){}},__dirname:path.resolve(__dirname,'..'),
    setInterval:()=>1,setTimeout:()=>1,clearInterval(){},
    require(id){
      if(id==='electron')return electron;
      if(id==='./core/store.cjs')return {...require('../core/store.cjs'),Store:class{constructor(){return storage;}}};
      if(id.startsWith('./core/')&&!['./core/documents.cjs','./core/native.cjs','./core/collectors.cjs'].includes(id))return require('../'+id.slice(2));
      if(id==='./core/collectors.cjs')return {Collector:class{},extensions:new Set()};
      if(id==='./core/documents.cjs')return {};
      if(id==='./core/native.cjs')return {};
      if(id==='./web/reminders.js')return require('../web/reminders.js');
      if(id==='./web/life.js')return {};
      return require(id);
    }});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../main.cjs'),'utf8'),context);
  app.emit('activate');
  assert.equal(windows.length,0,'activation before readiness does not create a premature window');
  await new Promise(setImmediate);
  assert.equal(windows.length,1);
  const first=windows[0];let prevented=false;
  first.emit('close',{preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(first.visible,false);
  app.emit('activate');
  assert.equal(first.visible,true);assert.equal(first.focused,true);assert.equal(windows.length,1);
  const {Journal}=require('../core/journal.cjs');const journals=new Journal(storage);journals.draft({segments:[{text:'电脑上尚未完成的合成草稿'}]});
  const note={id:'mobile_synthetic_once',title:'手机合成灵感',text:'我还没有确定这个想法。',capturedAt:new Date().toISOString()};
  context.mobileNote=note;const received=vm.runInContext('receiveMobile(mobileNote)',context);assert.equal(received.pending,false);vm.runInContext('receiveMobile(mobileNote)',context);assert.equal(journals.list().length,1,'mobile retries do not duplicate entries');assert.equal(journals.draft().segments[0].text,'电脑上尚未完成的合成草稿','phone sync never clears a desktop draft');
  first.minimized=true;app.emit('activate');
  assert.equal(first.minimized,false);assert.equal(first.restored,true);
  first.destroyed=true;app.emit('activate');
  assert.equal(windows.length,2);assert.equal(windows[1].visible,true);
  windows[1].hide();app.emit('second-instance');
  assert.equal(windows[1].visible,true);storage.close();fs.rmSync(temporary,{recursive:true,force:true});
});
