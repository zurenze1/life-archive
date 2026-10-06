const CACHE='life-archive-universal-ee68833afd5a';
const CORE=['./','index.html','style.css','app.mjs','model.mjs','db.mjs','documents.mjs','doc-worker.mjs','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable.png','apple-touch-icon.png','vendor/fflate.mjs','vendor/pdf.mjs','vendor/pdf.worker.mjs'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE.map(p=>new Request(new URL(p+(/\.mjs$|\.css$/.test(p)?'?v=ee68833afd5a':''),self.registration.scope),{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('life-archive-universal-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||!url.href.startsWith(self.registration.scope))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(()=>caches.open(CACHE).then(cache=>cache.match(new URL('index.html',self.registration.scope)))));return;
  }
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(request);if(cached)return cached;
    const response=await fetch(request);if(response.ok&&response.type!=='opaque')await cache.put(request,response.clone());return response;
  }));
});
