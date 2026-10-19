const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
function findRunner(configured=''){
  const candidates=[configured,path.join(os.homedir(),'Library/Application Support/人生档案/speech-runtime/bin/transcribe'),path.join(os.homedir(),'.codex/skills/funasr-transcribe/bin/transcribe')].filter(Boolean);
  return candidates.find(p=>{try{return path.isAbsolute(p)&&fs.statSync(p).isFile()&&(fs.accessSync(p,fs.constants.X_OK),true);}catch{return false;}})||'';
}
async function transcribe(file,runner,{timeout=600000}={}){
  if(!runner)throw Error('本地语音识别尚未准备。录音已保留，可在设置选择 FunASR 转写程序后重试。');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'life-asr-')),output=path.join(tmp,'transcript.txt');
  try{return await new Promise((resolve,reject)=>{
    const root=path.dirname(path.dirname(runner)),python=path.join(root,'venv/bin/python'),cache=path.join(root,'.modelscope');
    const adapter=path.join(__dirname.replace(/app\.asar(?=[/\\]|$)/,'app.asar.unpacked'),'funasr_local.py');
    const cached=fs.existsSync(python)&&fs.existsSync(path.join(cache,'models/iic/SenseVoiceSmall'))&&fs.existsSync(adapter);
    const command=cached?python:runner,args=cached?[adapter,file,'--out',output,'--cache',cache]:[file,'--out',output,'--keep-fillers'];
    const child=spawn(command,args,{shell:false,stdio:['ignore','ignore','pipe'],env:{...process.env,PATH:'/Applications/Remotion与HyperFrames/bin:'+process.env.PATH,PYTORCH_ENABLE_MPS_FALLBACK:'1'}});let finished=false;
    const timer=setTimeout(()=>{child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),3000).unref();fail(Error('识别超时，录音仍已保存，请稍后重试。'));},timeout);
    function fail(e){if(finished)return;finished=true;clearTimeout(timer);reject(e);}
    child.stderr.on('data',()=>{});child.on('error',()=>fail(Error('无法启动本地转写程序，请检查设置。')));
    child.on('close',code=>{if(finished)return;if(code!==0)return fail(Error('本地识别未完成；录音原件已保留，可以重试。'));let text;try{text=fs.readFileSync(output,'utf8').trim();}catch{return fail(Error('未生成识别文字，录音原件仍保留。'));}if(!text)return fail(Error('没有识别到可用文字，请回听录音或补充文字。'));finished=true;clearTimeout(timer);resolve(text);});
  });}finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
module.exports={findRunner,transcribe};
