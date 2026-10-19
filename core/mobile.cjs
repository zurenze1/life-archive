const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const ASSETS=new Map([['/',['index.html','text/html; charset=utf-8']],['/mobile.js',['mobile.js','application/javascript']],['/mobile.css',['mobile.css','text/css']],['/sw.js',['sw.js','application/javascript']],['/manifest.json',['manifest.json','application/manifest+json']],['/icon.svg',['icon.svg','image/svg+xml']]]);
function validNote(v){if(!v||! /^[a-zA-Z0-9_-]{8,100}$/.test(v.id??''))throw Error('记录标识无效');const text=String(v.text??'');if(text.length>100000)throw Error('文字过长');if(!text.trim()&&!v.audioBase64)throw Error('先留下文字或录音');const captured=new Date(v.capturedAt);if(!Number.isFinite(captured.getTime())||captured.getTime()>Date.now()+86400000||captured.getTime()<Date.now()-5*365*86400000)throw Error('手机时间无效，请检查日期');let bytes=null;if(v.audioBase64){if(!/^[A-Za-z0-9+/]*={0,2}$/.test(v.audioBase64))throw Error('录音格式无效');bytes=Buffer.from(v.audioBase64,'base64');if(bytes.length<20||bytes.length>40*1024*1024)throw Error('录音最多 40 MB');}return {id:v.id,text,title:String(v.title??'').slice(0,200),capturedAt:captured.toISOString(),bytes,mime:['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/3gpp'].includes(String(v.mime??'').split(';')[0])?v.mime:'audio/webm'};}
class Mobile{
  constructor(store,receive,assets=path.join(__dirname,'../ui/mobile')){this.store=store;this.receive=receive;this.assets=assets;this.server=null;this.inflight=new Map();this.error='';}
  config(){return this.store.setting('mobile',{enabled:false,port:47831});}
  async configure(enabled){await this.stop();const c={...this.config(),enabled:!!enabled,port:47831};if(enabled&&!c.token)c.token=crypto.randomBytes(32).toString('base64url');this.store.setSetting('mobile',c);if(enabled)await this.start();return this.status();}
  status(){const c=this.config();return {enabled:c.enabled,running:!!this.server?.listening,port:c.port,error:this.error,addresses:Object.values(os.networkInterfaces()).flat().filter(i=>i?.family==='IPv4'&&!i.internal&&/^(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.)/.test(i.address)).map(i=>'http://'+i.address+':'+c.port),offlineReadyNeedsHTTPS:true};}
  pairing(){const c=this.config();if(!c.enabled)throw Error('先开启手机联动');return {token:c.token};}
  async start(){if(this.server)return;const c=this.config();if(!c.enabled)return;let selected=c.port;
    // macOS may let a wildcard listener coexist with a different loopback listener.
    // Check loopback first, since the HTTPS private-network proxy connects there.
    if(selected){const probe=require('node:net').createServer();const available=await new Promise(resolve=>{probe.once('error',()=>resolve(false));probe.listen(selected,'127.0.0.1',()=>probe.close(()=>resolve(true)));});if(!available)selected=0;}
    const s=http.createServer((req,res)=>this.request(req,res));s.requestTimeout=120000;s.headersTimeout=15000;this.server=s;await new Promise(resolve=>{s.once('error',()=>{this.error='手机连接端口不可用，请稍后重试';this.server=null;resolve();});s.listen(selected,'0.0.0.0',()=>{this.error='';this.store.setSetting('mobile',{...c,port:s.address().port});resolve();});});}
  async stop(){if(this.server){const s=this.server;this.server=null;s.closeAllConnections?.();await new Promise(resolve=>s.close(resolve));}}
  async request(req,res){
    const send=(code,data,type='application/json')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; frame-ancestors 'none'"});res.end(typeof data==='string'?data:JSON.stringify(data));};
    try{const url=new URL(req.url,'http://localhost');if(req.method==='GET'&&ASSETS.has(url.pathname)){const [file,type]=ASSETS.get(url.pathname);return send(200,fs.readFileSync(path.join(this.assets,file),'utf8'),type);}
      const supplied=String(req.headers.authorization??'').replace(/^Bearer /,''),expected=this.config().token??'',a=Buffer.from(supplied),b=Buffer.from(expected);if(!expected||a.length!==b.length||!crypto.timingSafeEqual(a,b))return send(401,{error:'请用电脑上的配对链接连接'});
      // Reject browser requests initiated from an unrelated site. Tokens never appear in URL queries.
      const origin=req.headers.origin;const localProxy=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);if(origin&&new URL(origin).host!==req.headers.host&&!(localProxy&&origin===this.config().privateOrigin))return send(403,{error:'来源无效'});
      if(req.method==='GET'&&url.pathname==='/api/status')return send(200,{ok:true,time:new Date().toISOString()});
      if(req.method!=='POST'||url.pathname!=='/api/inbox')return send(404,{error:'接口不存在'});
      let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>56*1024*1024){send(413,{error:'记录过大'});req.destroy();return;}chunks.push(chunk);}
      const note=validNote(JSON.parse(Buffer.concat(chunks).toString('utf8')));if(!this.inflight.has(note.id))this.inflight.set(note.id,Promise.resolve().then(()=>this.receive(note)).finally(()=>this.inflight.delete(note.id)));const result=await this.inflight.get(note.id);send(200,{ok:true,...result});
    }catch{if(!res.headersSent)send(400,{error:'未能接收，记录仍保存在手机，请重试'});}
  }
}
module.exports={Mobile,validNote};
