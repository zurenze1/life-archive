const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {promisify}=require('node:util');const scrypt=promisify(crypto.scrypt);
class PrivateVault{
  constructor(directory){this.file=path.join(directory,'private-vault.json');this.key=null;this.items=null;this.expires=0;}
  status(){if(this.key&&Date.now()>this.expires)this.lock();return {exists:fs.existsSync(this.file),unlocked:!!this.key};}
  lock(){this.key?.fill(0);this.key=null;this.items=null;this.expires=0;return this.status();}
  async unlock(password){
    this.lock();password=String(password??'');const exists=fs.existsSync(this.file);if(!exists&&password.length<10)throw Error('首次设置的主密码至少 10 位，请自行妥善保管');
    let data,salt,key;try{data=exists?JSON.parse(fs.readFileSync(this.file,'utf8')):null;salt=data?Buffer.from(data.salt,'base64'):crypto.randomBytes(16);key=await scrypt(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});if(data){const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(data.iv,'base64'));d.setAuthTag(Buffer.from(data.tag,'base64'));this.items=JSON.parse(Buffer.concat([d.update(Buffer.from(data.ciphertext,'base64')),d.final()]).toString('utf8'));}else this.items=[];this.key=key;this.salt=salt;this.expires=Date.now()+300000;if(!exists)this.persist();return this.status();}catch(e){key?.fill(0);this.lock();throw Error(exists?'主密码不正确，或加密文件已损坏':'无法建立加密保险箱');}
  }
  require(){if(!this.status().unlocked)throw Error('保险箱已锁定，请先输入主密码');this.expires=Date.now()+300000;}
  persist(){this.require();const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',this.key,iv),ciphertext=Buffer.concat([c.update(JSON.stringify(this.items),'utf8'),c.final()]);const data={format:'life-archive-private-vault',version:1,kdf:'scrypt-N32768-r8-p1',salt:this.salt.toString('base64'),iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});fs.renameSync(tmp,this.file);}
  list(query=''){this.require();return this.items.filter(i=>(i.title+' '+i.kind+' '+(i.kind==='password'?'':i.body)).toLowerCase().includes(String(query).toLowerCase())).map(({body,...i})=>({...i,preview:i.kind==='password'?'••••••••':body.slice(0,200)}));}
  get(id){this.require();const i=this.items.find(i=>i.id===id);if(!i)throw Error('信息不存在');return i;}
  save(value){this.require();const old=value.id?this.items.find(i=>i.id===value.id):null;if(value.id&&!old)throw Error('信息不存在');const title=String(value.title??'').trim().slice(0,150),body=String(value.body??'').slice(0,50000);if(!title||!body.trim())throw Error('填写名称和内容后再保存');const i={id:old?.id??crypto.randomUUID(),kind:['password','event','info'].includes(value.kind)?value.kind:'info',title,body,createdAt:old?.createdAt??new Date().toISOString(),updatedAt:new Date().toISOString()};if(old)this.items[this.items.indexOf(old)]=i;else this.items.push(i);this.persist();return {id:i.id};}
}
module.exports={PrivateVault};
