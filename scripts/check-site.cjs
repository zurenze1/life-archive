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
  assert(!/personal-site|#person|name="author"/.test(html), `${file}: no personal branding`);
  const data=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const entities = data['@graph'];
  assert(!entities.some(e=>e['@type']==='Person'));
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
assert.equal(facts.license,'MIT');assert.equal(facts.free,true);assert(!facts.founder);
assert.equal(facts.url,base.href);
assert.equal(fs.readFileSync(path.join(root,'assets/share.png')).subarray(1,4).toString(),'PNG');
console.log(`Public site check passed: ${files.length} canonical HTML pages, ${links} internal references, valid JSON-LD, sitemap, share image and facts.`);
