const crypto=require('node:crypto');
const {localDay}=require('../web/reminders.js');
const PROMPTS=[
  {id:'events',title:'今天发生了什么',question:'今天做了什么，或者发生了哪件想留下的事？'},
  {id:'learning',title:'学到与想到',question:'今天学到、读到或想明白了什么？没有也可以直接说。'},
  {id:'next',title:'接下来想做的事',question:'明天或接下来想做什么？还没想好，也可以如实说。'},
  {id:'free',title:'自由记录',question:'不按问题，直接说说今天。'}
];
function segments(value){
  if(!Array.isArray(value)||value.length>100)throw Error('记录片段无效');
  return value.map((s,i)=>{const text=String(s.text??'');if(text.length>50000)throw Error('单个片段不能超过 50,000 字');return {id:String(s.id??'segment-'+i).slice(0,100),promptId:PROMPTS.some(p=>p.id===s.promptId)?s.promptId:'free',text,source:s.source==='voice'?'voice':'text',audioId:String(s.audioId??'').slice(0,100),capturedAt:s.capturedAt||null};}).filter(s=>s.text.trim()||s.audioId);
}
function summarize(value){
  const source=segments(value),groups=new Map(),seen=new Set();let count=0,duplicates=0,fillers=0;
  for(const s of source){for(const m of s.text.matchAll(/[^。！？!?\n]+[。！？!?]*/g)){
    const text=m[0].trim();if(!text)continue;count++;
    if(/^(?:(?:嗯|呃|额|啊|哦|唔|那个|就是|然后|对)[，,、。！？!?\s]*)+$/.test(text)){fillers++;continue;}
    let id=s.promptId;if(id==='free')id=/^(?:明天|下次|以后|我明天|我计划|我打算|我准备)/.test(text)?'next':/^(?:我学到|我发现|我明白|我意识到|今天学到|学到的是)/.test(text)?'learning':'free';
    const key=id+'\0'+text;if(seen.has(key)){duplicates++;continue;}seen.add(key);
    const start=m.index+m[0].indexOf(text),item={text,segmentId:s.id,start,end:start+text.length};
    if(!groups.has(id))groups.set(id,[]);groups.get(id).push(item);
  }}
  return {mode:'extractive',sections:PROMPTS.filter(p=>groups.has(p.id)).map(p=>({id:p.id,title:p.title,items:groups.get(p.id)})),stats:{sentences:count,kept:seen.size,duplicatesRemoved:duplicates,fillerOnlyRemoved:fillers},notice:'按原话分段归类，只省略重复句和独立语气词；不补原因、情绪或结论。每一点都能回到原句。'};
}
function prefs(value={}){const time=value.time??'21:00';if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('请选择有效时间');return {enabled:value.enabled!==false,time,required:value.required!==false};}
function due(options={},state={},hasEntry=false,now=new Date()){
  const p=prefs(options),day=localDay(now),stamp=now.getTime();if(!p.enabled||hasEntry||!Number.isFinite(stamp)||Number(state.snoozeUntil)>stamp)return false;
  const [h,m]=p.time.split(':').map(Number);return now.getHours()*60+now.getMinutes()>=h*60+m;
}
class Journal{
  constructor(store){this.store=store;this.db=store.db;this.db.exec(`CREATE TABLE IF NOT EXISTS journals(id TEXT PRIMARY KEY,day TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS journals_day ON journals(day); CREATE TABLE IF NOT EXISTS journal_drafts(day TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS knowledge_cards(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS journal_audio(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,payload TEXT NOT NULL);`);}
  initialize(){if(this.store.setting('journalModeVersion',0)<1){this.store.setSetting('tracking',false);this.store.setSetting('diaryReminder',{enabled:true,time:'21:00',strong:true});this.store.setSetting('journalReminder',prefs());this.store.setSetting('journalModeVersion',1);}}
  hasToday(now=new Date()){return !!this.db.prepare('SELECT id FROM journals WHERE day=? LIMIT 1').get(localDay(now))||!!this.store.list({kind:'diary',day:localDay(now),limit:1}).total;}
  save(value,now=new Date()){
    const ss=segments(value.segments);if(!ss.some(s=>s.text.trim()))throw Error('先说几句话或写下一件事，再完成今天的日记。');
    if(ss.reduce((n,s)=>n+s.text.length,0)>200000)throw Error('本次日记过长，请分次保存');
    for(const s of ss)if(s.audioId&&!this.audio(s.audioId))throw Error('录音原件未保存，请稍后重试');
    const id=crypto.randomUUID(),stamp=now.toISOString(),day=localDay(now),entry={id,day,createdAt:stamp,updatedAt:stamp,title:String(value.title??'').slice(0,200)||day+' · 今日回顾',segments:ss,original:ss.map(s=>s.text).join('\n\n'),summary:summarize(ss),tags:[...new Set(String(value.tags??'').split(/[，,\n]/).map(t=>t.trim()).filter(Boolean))].slice(0,20)};
    const ownsTransaction=!this.db.isTransaction;if(ownsTransaction)this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO journals VALUES(?,?,?,?,?)').run(id,day,stamp,stamp,JSON.stringify(entry));if(!value.keepDraft)this.db.prepare('DELETE FROM journal_drafts WHERE day=?').run(day);this.store.setSetting('journalReminderState',{});if(ownsTransaction)this.db.exec('COMMIT');}catch(e){if(ownsTransaction)this.db.exec('ROLLBACK');throw e;}return entry;
  }
  list(query='',day=''){const term=String(query).toLocaleLowerCase();return this.db.prepare('SELECT payload FROM journals ORDER BY created_at DESC').all().map(r=>JSON.parse(r.payload)).filter(e=>(!day||e.day===day)&&(!term||(e.title+'\n'+e.original+'\n'+e.tags.join(' ')).toLocaleLowerCase().includes(term)));}
  get(id){const r=this.db.prepare('SELECT payload FROM journals WHERE id=?').get(String(id));return r?JSON.parse(r.payload):null;}
  write(entry){this.db.prepare('UPDATE journals SET updated_at=?,payload=? WHERE id=?').run(entry.updatedAt,JSON.stringify(entry),entry.id);return entry;}
  append(id,value,now=new Date()){
    const entry=this.get(id);if(!entry)throw Error('日记不存在');const extra=segments(value.segments);if(!extra.some(s=>s.text.trim()))throw Error('先写下或说出要补充的内容');
    for(const s of extra){if(s.audioId&&!this.audio(s.audioId))throw Error('录音原件未保存');s.id=crypto.randomUUID();s.appendedAt=now.toISOString();s.capturedAt=s.capturedAt||now.toISOString();}
    if(entry.segments.length+extra.length>500||entry.original.length+extra.map(s=>s.text).join('').length>1000000)throw Error('日记过长，请另建记录');
    entry.segments.push(...extra);entry.original=entry.segments.map(s=>s.text).join('\n\n');entry.summary=summarize(entry.segments.slice(0,100));if(entry.segments.length>100){const chunks=[];for(let i=0;i<entry.segments.length;i+=100)chunks.push(summarize(entry.segments.slice(i,i+100)));entry.summary={...chunks[0],sections:PROMPTS.map(p=>({id:p.id,title:p.title,items:chunks.flatMap(c=>c.sections.find(s=>s.id===p.id)?.items??[])})).filter(s=>s.items.length),stats:chunks.reduce((a,c)=>Object.fromEntries(Object.keys(c.stats).map(k=>[k,(a[k]||0)+c.stats[k]])),{})};}entry.updatedAt=now.toISOString();return this.write(entry);
  }
  highlight(id,value,now=new Date()){
    const e=this.get(id),s=e?.segments.find(s=>s.id===value.segmentId),start=Number(value.start),end=Number(value.end);if(!s||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>s.text.length)throw Error('请选择原文中需要高亮的文字');
    e.highlights??=[];const existing=e.highlights.find(h=>h.segmentId===s.id&&h.start===start&&h.end===end);if(value.remove){e.highlights=e.highlights.filter(h=>h!==existing);}else if(!existing)e.highlights.push({id:crypto.randomUUID(),segmentId:s.id,start,end,text:s.text.slice(start,end),createdAt:now.toISOString()});e.updatedAt=now.toISOString();return this.write(e);
  }
  setPrivate(id,value){const e=this.get(id);if(!e)throw Error('日记不存在');e.private=value===true;e.updatedAt=new Date().toISOString();return this.write(e);}
  draft(value,now=new Date()){const day=localDay(now);if(value!==undefined){const p={segments:segments(value.segments),title:String(value.title??'').slice(0,200),tags:String(value.tags??'').slice(0,1000),appendTo:String(value.appendTo??'').slice(0,100),private:value.private===true,updatedAt:now.toISOString()};this.db.prepare('INSERT INTO journal_drafts VALUES(?,?) ON CONFLICT(day) DO UPDATE SET payload=excluded.payload').run(day,JSON.stringify(p));return p;}const r=this.db.prepare('SELECT payload FROM journal_drafts WHERE day=?').get(day);return r?JSON.parse(r.payload):{segments:[],title:'',tags:''};}
  addAudio(payload,now=new Date()){const a={...payload,id:crypto.randomUUID(),createdAt:now.toISOString(),transcript:null,status:'saved'};this.db.prepare('INSERT INTO journal_audio VALUES(?,?,?)').run(a.id,a.createdAt,JSON.stringify(a));return a;}
  audio(id){const r=this.db.prepare('SELECT payload FROM journal_audio WHERE id=?').get(String(id));return r?JSON.parse(r.payload):null;}
  updateAudio(id,patch){const a=this.audio(id);if(!a)throw Error('录音不存在');const next={...a,...patch,id:a.id,path:a.path};this.db.prepare('UPDATE journal_audio SET payload=? WHERE id=?').run(JSON.stringify(next),id);return next;}
  audios(){return this.db.prepare('SELECT payload FROM journal_audio ORDER BY created_at DESC').all().map(r=>JSON.parse(r.payload));}
  addCard(value,now=new Date()){
    const e=this.get(value.entryId);if(!e)throw Error('来源日记不存在');const s=e.segments.find(s=>s.id===value.segmentId);if(!s)throw Error('来源原句不存在');const text=String(value.text??'');if(!text.trim()||!s.text.includes(text))throw Error('知识卡片必须来自原话，不能添加未表达的内容');
    const existing=this.cards().find(c=>c.entryId===e.id&&c.segmentId===s.id&&c.text===text);if(existing)return existing;
    const card={id:crypto.randomUUID(),entryId:e.id,segmentId:s.id,text,title:String(value.title??'').slice(0,100)||text.slice(0,45),tags:String(value.tags??'').split(/[，,\n]/).map(s=>s.trim()).filter(Boolean).slice(0,20),sourceDay:e.day,createdAt:now.toISOString()};this.db.prepare('INSERT INTO knowledge_cards VALUES(?,?,?)').run(card.id,card.createdAt,JSON.stringify(card));return card;
  }
  cards(query=''){return this.db.prepare('SELECT payload FROM knowledge_cards ORDER BY created_at DESC').all().map(r=>JSON.parse(r.payload)).filter(c=>!query||(c.title+c.text+c.tags.join(' ')).toLocaleLowerCase().includes(String(query).toLocaleLowerCase()));}
  markdown(entry){return '# '+entry.title+'\n\n记录时间：'+entry.createdAt+'\n\n## 原话整理\n\n'+entry.summary.sections.map(s=>'### '+s.title+'\n\n'+s.items.map(i=>'- '+i.text).join('\n')).join('\n\n')+'\n\n## 完整原文\n\n'+entry.original+'\n\n## 录音\n\n'+entry.segments.filter(s=>s.audioId).map(s=>'- 录音标识：'+s.audioId).join('\n')+'\n';}
  export(){return {format:'life-archive-journal',version:1,exportedAt:new Date().toISOString(),journals:this.list(),cards:this.cards(),audio:this.audios()};}
}
module.exports={Journal,PROMPTS,segments,summarize,prefs,due};
