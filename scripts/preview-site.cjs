const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../site');
const prefix='/life-archive/';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.xml':'application/xml','.txt':'text/plain','.bcmap':'application/octet-stream','.ttf':'font/ttf','.pfb':'application/octet-stream'};
const server=http.createServer((req,res)=>{
  let requested;try{requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
  if(!requested.startsWith(prefix)){res.writeHead(404).end();return;}
  let file=path.resolve(root,requested.slice(prefix.length));if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');const bytes=fs.readFileSync(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'}).end(bytes);}catch{res.writeHead(404).end();}
});
const port=Number(process.env.LIFE_ARCHIVE_PORT)||5197;
server.listen(port,'127.0.0.1',()=>console.log(`Local URL: http://127.0.0.1:${port}${prefix}app/`));
