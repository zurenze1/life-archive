const test=require('node:test');
const assert=require('node:assert/strict');
const {zipSync,strToU8}=require('fflate');
const model=()=>import('../web/model.mjs');
test('通用版迁移保留待确认线索、拒绝缺失附件与不支持的决策记录',async()=>{
  const {backupPayload}=await model();
  const desktop={version:1,entries:[{id:'desktop-test',sourceKey:'desktop:test',day:'2026-10-06',time:'12:30',title:'订单不是实际食用',body:'来自导出文件',source:'activity',confirmed:false,media:[]}],decisions:[]};
  const parsed=backupPayload(desktop);assert.equal(parsed.entries[0].confirmed,false);assert.equal(parsed.entries[0].sourceKey,'desktop:test');
  assert.throws(()=>backupPayload({...desktop,decisions:[{title:'不能静默忽略'}]}),/决策/);
  assert.throws(()=>backupPayload({...desktop,entries:[{...desktop.entries[0],media:[{key:'cloud-only'}]}]}),/云端/);
  const entry={...desktop.entries[0],attachmentId:'photo'};
  assert.throws(()=>backupPayload({format:'life-archive-web',version:1,entries:[entry],attachments:[]}),/缺少附件/);
  assert.throws(()=>backupPayload({format:'life-archive-web',version:1,entries:[entry],attachments:[{id:'photo',size:3,data:'dGVz'} ,{id:'photo',size:3,data:'dGVz'}]}),/重复/);
  assert.equal(backupPayload({format:'life-archive-web',version:1,entries:[entry],attachments:[{id:'photo',size:3,data:'dGVz'}]}).attachments[0].size,3);
});
test('通用版搜索排除回收站，日期不被自动纠正，录音类型适配 Safari 与安卓',async()=>{
  const {normalizeEntry,filterEntries,recordingMime,sniffType}=await model();
  assert.throws(()=>normalizeEntry({day:'2026-02-30',time:'12:00'}),/日期/);
  const e=normalizeEntry({id:'one',day:'2026-10-06',time:'12:30',title:'课程',body:'一起读书',fileName:'读书.pdf'});
  assert.equal(filterEntries([e,{...e,id:'trash',deletedAt:'2026-10-06'}],{query:'课程 读书'}).length,1);
  assert.equal(filterEntries([e],{day:'2026-10-05'}).length,0);
  assert.equal(recordingMime(t=>t==='audio/mp4'),'audio/mp4');
  assert.equal(recordingMime(t=>t==='audio/webm;codecs=opus'),'audio/webm;codecs=opus');
  assert.equal(sniffType({name:'录音.webm',type:'audio/webm;codecs=opus'}).kind,'audio');
  assert.equal(sniffType({name:'恶意.svg',type:'image/svg+xml'}).mime,'application/octet-stream');
});
test('浏览器 Office 解析保留空列与 Unicode，拒绝 ZIP 展开上限',async()=>{
  const {office,documentText}=await import('../web/documents.mjs');
  const docx=zipSync({'word/document.xml':strToU8('<w:document><w:p><w:t>示例测试课程</w:t></w:p><w:p><w:t>第二段</w:t></w:p></w:document>')});
  assert.match(office(docx,'docx').text,/示例测试课程\n第二段/);
  const xlsx=zipSync({'xl/worksheets/sheet1.xml':strToU8('<worksheet><row><c r="A1" t="inlineStr"><is><t>商品名称</t></is></c><c r="C1" t="inlineStr"><is><t>下单时间</t></is></c></row><row><c r="A2" t="inlineStr"><is><t>测试商品</t></is></c><c r="C2" t="inlineStr"><is><t>2026-10-06</t></is></c></row></worksheet>')});
  assert.match(office(xlsx,'xlsx').text,/测试商品 \|  \| 2026-10-06/);
  assert.throws(()=>office(zipSync({'word/document.xml':new Uint8Array(9*1024*1024)}),'docx'),/展开/);
  assert.match(documentText(strToU8('日期,标题\n2026-10-06,"课程,交流\n第二行"'),'csv').text,/课程,交流\n第二行/);
});
