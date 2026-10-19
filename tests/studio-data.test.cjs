const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Store}=require('../core/store.cjs');
const life=require('../web/life.js');

test('observation loading keeps confirmed evidence and pending counts without exporting pending document bodies',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'life-studio-data-'));
  const store=new Store(directory);
  try{
    for(const [key,kind,confirmed] of [['pending','file',undefined],['confirmed','file',true],['diary','diary',undefined],['unconfirmed-diary','diary',false],['numeric-flag','file',1]]){
      store.add({key,source:kind,kind,title:key,body:key==='pending'?'large document '.repeat(1000):'evidence text',occurredAt:'2026-10-19T04:30:00Z',meta:{confirmed,people:['朋友'],tags:['生活']}});
    }
    const full=store.export(),observations=store.export({confirmedOnly:true});
    assert.deepEqual(observations.entries,full.entries.filter(e=>e.confirmed));
    assert.equal(observations.entries.length,2);
    const pendingCount=store.db.prepare('SELECT count(*) n FROM records').get().n-observations.entries.length;
    assert.equal(pendingCount,3);
    assert.equal(life.overview(observations.entries).confirmed,life.overview(full.entries).confirmed);
    assert.equal(life.overview(observations.entries).pending+pendingCount,life.overview(full.entries).pending);
    assert(!JSON.stringify(observations).includes('large document'));
    assert(full.entries.some(e=>e.body.startsWith('large document')),'complete export retains original pending text');
  }finally{store.close();fs.rmSync(directory,{recursive:true,force:true});}
});
