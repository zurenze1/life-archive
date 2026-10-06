const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {Store}=require('../core/store.cjs');
const {Collector}=require('../core/collectors.cjs');
const {extract,rowRecords}=require('../core/documents.cjs');
const {zipSync,strToU8}=require('fflate');

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'life-archive-release-'));
  const store=new Store(path.join(root,'archive'));
  return {root,store,close(){this.store.close();fs.rmSync(root,{recursive:true,force:true});}};
}

test('local records persist after restart and exports mark collected clues as unconfirmed',()=>{
  const f=fixture();
  try{
    const row={key:'release-fixture',source:'chrome',kind:'browser',title:'测试页面',body:'仅用于发布测试',occurredAt:new Date(2026,9,6,9,0,0).toISOString(),url:'https://example.org/path?token=secret#private'};
    assert.equal(f.store.add(row),true);
    assert.equal(f.store.add(row),false);
    assert.equal(f.store.list().total,1);
    assert.equal(f.store.list().records[0].url,'https://example.org/path');
    assert.equal(f.store.export().entries[0].confirmed,false);
    f.store.close();
    f.store=new Store(path.join(f.root,'archive'));
    assert.equal(f.store.list().total,1);
    assert.equal(f.store.export().entries[0].time,'09:00');
    assert.equal(fs.statSync(f.store.path).mode&0o777,0o600);
  }finally{f.close();}
});

test('browser collection reads an isolated history database without changing it and deduplicates visits',async()=>{
  const f=fixture();
  try{
    const profile=path.join(f.root,'browser','Default');fs.mkdirSync(profile,{recursive:true});
    const database=path.join(profile,'History');const db=new DatabaseSync(database);
    db.exec('CREATE TABLE urls(id INTEGER PRIMARY KEY,url TEXT,title TEXT); CREATE TABLE visits(id INTEGER PRIMARY KEY,url INTEGER,visit_time INTEGER);');
    db.prepare('INSERT INTO urls VALUES(?,?,?)').run(1,'https://example.org/article?private=value','测试文章');
    const date='2026-10-06T01:00:00Z';
    db.prepare('INSERT INTO visits VALUES(?,?,?)').run(1,1,(new Date(date).getTime()+11644473600000)*1000);db.close();
    const before=fs.readFileSync(database);
    const collector=new Collector(f.store,{home:f.root});collector.stats={added:0,files:0,skipped:0};
    assert.equal((await collector.chromium('chrome',path.dirname(profile))).status,'ready');
    assert.equal(f.store.list().total,1);
    assert.equal(f.store.list().records[0].occurredAt,date.replace('Z','.000Z'));
    assert.equal(f.store.list().records[0].url,'https://example.org/article');
    await collector.chromium('chrome',path.dirname(profile));assert.equal(f.store.list().total,1);
    assert.deepEqual(fs.readFileSync(database),before);
  }finally{f.close();}
});

test('selected folders keep permitted text and order clues while skipping credentials and the archive itself',async()=>{
  const f=fixture();
  try{
    const input=path.join(f.root,'input');fs.mkdirSync(input);
    fs.writeFileSync(path.join(input,'memory.txt'),'一段用于发布测试的经历');
    fs.writeFileSync(path.join(input,'passwords.txt'),'this must not be collected');
    fs.writeFileSync(path.join(input,'orders.csv'),'商品名称,下单时间\n测试商品,2026-10-05 12:30\n');
    f.store.setSetting('folders',[input,f.store.directory]);
    const collector=new Collector(f.store,{home:f.root});collector.stats={added:0,files:0,skipped:0};
    await collector.files();
    const records=f.store.list().records;
    assert.ok(records.some(r=>r.title==='memory.txt'&&r.body.includes('一段用于发布测试')));
    assert.ok(records.some(r=>r.kind==='order'&&r.title==='测试商品'));
    assert.ok(records.every(r=>r.title!=='passwords.txt'&&!r.path.startsWith(f.store.directory)));
    const count=f.store.list().total;await collector.files();assert.equal(f.store.list().total,count);
  }finally{f.close();}
});

test('Excel rows retain empty column positions when extracting dated order clues',async()=>{
  const f=fixture();
  try{
    const file=path.join(f.root,'sparse-orders.xlsx');
    const xml='<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>商品名称</t></is></c><c r="B1" t="inlineStr"><is><t>备注</t></is></c><c r="C1" t="inlineStr"><is><t>下单时间</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>测试商品</t></is></c><c r="C2" t="inlineStr"><is><t>2026-10-05 12:30</t></is></c></row></sheetData></worksheet>';
    fs.writeFileSync(file,zipSync({'xl/worksheets/sheet1.xml':strToU8(xml)}));
    const data=await extract(file);
    assert.equal(data.rows[1][1],'');
    assert.equal(data.rows[1][2],'2026-10-05 12:30');
    assert.equal(rowRecords(data.rows,file)[0].title,'测试商品');
  }finally{f.close();}
});
