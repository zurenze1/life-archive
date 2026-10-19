const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const BEGIN='<!-- life-archive:begin -->',END='<!-- life-archive:end -->';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function sensitive(text){return /\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{12,}|(?:密码|口令|验证码|身份证号|api[_ -]?key|password|secret|token)\s*[:=：]\s*\S+/i.test(text);}
function highlighted(entry,s){const marks=(entry.highlights??[]).filter(h=>h.segmentId===s.id).sort((a,b)=>a.start-b.start);let at=0,out='';for(const h of marks){if(h.start<at)continue;out+=s.text.slice(at,h.start)+'=='+s.text.slice(h.start,h.end)+'==';at=h.end;}return out+s.text.slice(at);}
class Obsidian{
  constructor(store,journal){this.store=store;this.journal=journal;}
  config(){return this.store.setting('obsidian',{enabled:false,vault:''});}
  configure(vault,enabled=true){const full=fs.realpathSync(vault);if(!fs.statSync(full).isDirectory()||!fs.existsSync(path.join(full,'.obsidian')))throw Error('请选择包含 .obsidian 的 Obsidian 知识库');for(let p=full;;p=path.dirname(p)){if(fs.existsSync(path.join(p,'.git')))throw Error('知识库位于 Git 仓库中，不能自动同步私人日记');if(path.dirname(p)===p)break;}this.store.setSetting('obsidian',{enabled:!!enabled,vault:full});return this.sync();}
  sync(){
    const c=this.config();if(!c.enabled)return {enabled:false};
    try{
      if(!fs.existsSync(path.join(c.vault,'.obsidian')))throw Error('知识库暂不可用，日记仍已保存在本机');
      const root=path.join(c.vault,'人生档案'),folder=path.join(root,'日记'),audioFolder=path.join(root,'录音');fs.mkdirSync(folder,{recursive:true,mode:0o700});fs.mkdirSync(audioFolder,{recursive:true,mode:0o700});
      // No secrets are ever rendered into the Markdown output. The encrypted vault is separate.
      const all=this.journal.list(),groups=new Map();let skipped=0,written=0,conflicts=0;
      for(const e of all){if(e.private||sensitive(e.original+'\n'+e.title)){skipped++;continue;}if(!groups.has(e.day))groups.set(e.day,[]);groups.get(e.day).push(e);}
      const known=this.store.setting('obsidianManaged',{}),next={...known};
      for(const day of Object.keys(known))if(!groups.has(day))groups.set(day,[]);
      for(const [day,entries]of groups){
        const year=path.join(folder,day.slice(0,4));fs.mkdirSync(year,{recursive:true,mode:0o700});const file=path.join(year,day+'.md');
        const content=entries.reverse().map(e=>{
          const sections=e.summary.sections.map(s=>'#### '+s.title+'\n'+s.items.map(i=>'- '+i.text).join('\n')).join('\n\n');
          const raw=e.segments.map(s=>{let text='';if(s.appendedAt)text+='\n补充时间：'+s.appendedAt+'\n\n';text+=highlighted(e,s);if(s.audioId){const a=this.journal.audio(s.audioId);if(a&&fs.existsSync(a.path)){const name=a.id+path.extname(a.path);const target=path.join(audioFolder,name);if(!fs.existsSync(target))fs.copyFileSync(a.path,target,fs.constants.COPYFILE_EXCL);fs.chmodSync(target,0o600);text+='\n\n![[人生档案/录音/'+name+']]';}}return text;}).join('\n\n');
          return '## '+e.title.replace(/[\r\n]/g,' ')+'\n\n记录时间：'+e.createdAt+'  \n最后补充：'+e.updatedAt+'\n\n### 原话整理\n\n'+sections+'\n\n### 完整原文\n\n'+raw+'\n\n档案标识：`'+e.id+'`';
        }).join('\n\n---\n\n');
        const managed=BEGIN+'\n'+content+'\n'+END;let old=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';const a=old.indexOf(BEGIN),b=old.indexOf(END);let output;
        if(old&&((a<0||b<a)||!known[day]||hash(old.slice(a,b+END.length))!==known[day])){const pending=path.join(year,day+'.待合并.md');this.atomic(pending,'# '+day+' · 人生档案待合并\n\n'+managed+'\n');conflicts++;continue;}
        if(a>=0&&b>=a)output=old.slice(0,a)+managed+old.slice(b+END.length);else output='# '+day+'\n\n'+managed+'\n\n## 手动补充\n\n这里的内容不会被人生档案覆盖。\n';
        if(output!==old){this.atomic(file,output);written++;}next[day]=hash(managed);
      }
      this.store.setSetting('obsidianManaged',next);const result={enabled:true,syncedAt:new Date().toISOString(),written,skipped,conflicts,vault:c.vault};this.store.setSetting('obsidianStatus',result);return result;
    }catch(e){const result={enabled:true,error:e.message};this.store.setSetting('obsidianStatus',result);return result;}
  }
  atomic(file,text){const tmp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,text,{mode:0o600});fs.renameSync(tmp,file);}
}
module.exports={Obsidian,sensitive,highlighted};
