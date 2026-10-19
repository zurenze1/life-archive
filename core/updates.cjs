const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');const exec=promisify(execFile);
const REPO='zurenze1/life-archive';
function version(v){const m=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v));return m?m.slice(1).map(Number):null;}
function newer(a,b){const x=version(a),y=version(b);if(!x||!y)return false;for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
function candidate(releases,current,arch){return releases.filter(r=>!r.draft&&!r.prerelease&&newer(r.tag_name,current)).sort((a,b)=>newer(a.tag_name,b.tag_name)?-1:1).map(r=>({version:r.tag_name.replace(/^v/,''),page:r.html_url,asset:r.assets?.find(a=>a.name===`LifeArchive-${r.tag_name.replace(/^v/,'')}-${arch}.zip`)})).find(r=>r.asset&&/^sha256:[a-f0-9]{64}$/.test(r.asset.digest??''))??null;}
class Updates{
  constructor(directory,current,arch=process.arch,fetcher=fetch){this.directory=path.join(directory,'updates');this.current=current;this.arch=arch;this.fetch=fetcher;this.state={status:'idle',current};this.busy=false;}
  async check(download=true){if(this.busy||this.state.status==='downloaded')return this.state;this.busy=true;try{
    this.state={status:'checking',current:this.current};const response=await this.fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`,{headers:{Accept:'application/vnd.github+json','User-Agent':'LifeArchive-Updater'},signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('暂时无法读取 GitHub 版本（'+response.status+'）');const body=await response.text();if(body.length>2000000)throw Error('更新信息过大');const next=candidate(JSON.parse(body),this.current,this.arch);this.state={status:next?'available':'current',current:this.current,checkedAt:new Date().toISOString(),next:next?{version:next.version,page:next.page}:null};if(next&&download)await this.download(next);return this.state;
  }catch(e){this.state={status:'error',current:this.current,error:e.message};return this.state;}finally{this.busy=false;}}
  async download(next){
    const a=next.asset,url=new URL(a.browser_download_url);if(url.protocol!=='https:'||url.hostname!=='github.com'||!url.pathname.startsWith('/'+REPO+'/releases/download/'))throw Error('更新地址不属于本项目');if(a.size>500*1024*1024)throw Error('更新包超出大小限制');
    await fsp.mkdir(this.directory,{recursive:true,mode:0o700});const target=path.join(this.directory,`LifeArchive-${next.version}-${this.arch}.zip`),temp=target+'.part';this.state={...this.state,status:'downloading',received:0,total:a.size};const response=await this.fetch(url,{signal:AbortSignal.timeout(15*60*1000)});if(!response.ok||!response.body)throw Error('更新包下载失败');const fd=await fsp.open(temp,'w',0o600),hash=crypto.createHash('sha256');let size=0;
    try{for await(const chunk of response.body){size+=chunk.length;if(size>500*1024*1024)throw Error('更新包过大');hash.update(chunk);await fd.write(chunk);this.state.received=size;}}finally{await fd.close();}
    if(size!==a.size||'sha256:'+hash.digest('hex')!==a.digest){await fsp.rm(temp,{force:true});throw Error('更新包校验失败，已停止安装');}await fsp.rename(temp,target);this.state={...this.state,status:'downloaded',file:target,version:next.version};
  }
  async prepare(){
    if(this.state.status!=='downloaded')throw Error('更新尚未下载完成');if(process.platform!=='darwin')throw Error('当前仅支持 Mac 安装更新');const file=this.state.file,unpack=path.join(this.directory,'stage-'+this.state.version);await fsp.mkdir(unpack,{recursive:true,mode:0o700});
    const listing=(await exec('/usr/bin/unzip',['-Z1',file],{maxBuffer:8*1024*1024})).stdout;if(listing.split('\n').some(p=>p.startsWith('/')||p.split('/').includes('..')))throw Error('更新包路径无效');await exec('/usr/bin/ditto',['-x','-k',file,unpack]);const application=path.join(unpack,'人生档案.app');await exec('/usr/bin/codesign',['--verify','--deep','--strict',application]);const plist=path.join(application,'Contents/Info.plist');const read=async key=>(await exec('/usr/libexec/PlistBuddy',['-c','Print :'+key,plist])).stdout.trim();if(await read('CFBundleIdentifier')!=='com.lifearchive.desktop'||await read('CFBundleShortVersionString')!==this.state.version)throw Error('更新包身份或版本不符');return application;
  }
}
module.exports={Updates,version,newer,candidate};
