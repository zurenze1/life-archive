const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'site');
const base = new URL('https://zurenze1.github.io/life-archive/');
const files = fs.readdirSync(root, { recursive: true }).filter(f => f.endsWith('.html'));
const canonicals = new Set();
let links = 0;
for (const file of files) {
  const html = fs.readFileSync(path.join(root,file),'utf8');
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)[1];
  assert(!canonicals.has(canonical), `Duplicate canonical: ${canonical}`);
  canonicals.add(canonical);
  assert.equal(canonical, new URL(file.replace(/index\.html$/, ''), base).href);
  assert.equal((html.match(/<h1[ >]/g)||[]).length, 1, `${file}: one primary heading`);
  assert(html.includes('content="index,follow,max-image-preview:large"'));
  assert(html.includes('name="author" content="祖仁泽"'));
  assert(html.includes('祖仁泽'), `${file}: visible author`);
  const data=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const entities = data['@graph'];
  assert(entities.some(e=>e['@type']==='Person' && e.name==='祖仁泽'));
  for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const u = new URL(m[1], canonical);
    if(u.hostname !== base.hostname || !u.pathname.startsWith(base.pathname)) continue;
    let relative = decodeURIComponent(u.pathname.slice(base.pathname.length));
    if(!relative || relative.endsWith('/'))relative+='index.html';
    const target=path.join(root,relative);
    assert(fs.existsSync(target), `${file}: missing internal target ${m[1]}`);
    if(u.hash && relative.endsWith('.html')){
      const targetHtml=fs.readFileSync(target,'utf8');
      assert(targetHtml.includes(`id="${u.hash.slice(1)}"`), `${file}: missing anchor ${u.hash}`);
    }
    links++;
  }
}
const xml=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
const sitemap=new Set([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]));
assert.deepEqual(sitemap,canonicals,'Sitemap covers exactly the canonical pages');
const facts=JSON.parse(fs.readFileSync(path.join(root,'facts.json'),'utf8'));
assert.equal(facts.founder,'祖仁泽');
assert.equal(facts.url,base.href);
assert.equal(fs.readFileSync(path.join(root,'assets/share.png')).subarray(1,4).toString(),'PNG');
console.log(`Public site check passed: ${files.length} canonical HTML pages, ${links} internal references, valid JSON-LD, sitemap, share image and facts.`);
