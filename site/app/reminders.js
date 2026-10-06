/* Shared local-time reminder policy for desktop and browser. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LifeArchiveReminders=factory();})(globalThis,()=>{
  const DEFAULTS={enabled:false,time:'21:30',strong:true};
  const pad=n=>String(n).padStart(2,'0');
  const localDay=(now=new Date())=>`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  function settings(value={}){const time=value.time??DEFAULTS.time;if(typeof time!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('请选择有效的提醒时间');return {enabled:value.enabled===true,time,strong:value.strong!==false};}
  function due(prefs,state={},now=new Date()){
    const p=settings(prefs),stamp=now.getTime(),day=localDay(now);
    if(!Number.isFinite(stamp)||!p.enabled||state.ackDay===day||Number(state.snoozeUntil)>stamp)return false;
    const [h,m]=p.time.split(':').map(Number);if(now.getHours()*60+now.getMinutes()<h*60+m)return false;
    if(state.lastFiredDay===day&&(!p.strong||stamp-Number(state.lastFiredAt)<300000))return false;
    return true;
  }
  const fired=(state={},now=new Date())=>({...state,lastFiredDay:localDay(now),lastFiredAt:now.getTime(),snoozeUntil:0});
  function respond(state={},action,now=new Date()){if(action==='done')return {...state,ackDay:localDay(now),snoozeUntil:0};if(action==='snooze')return {...state,snoozeUntil:now.getTime()+600000,lastFiredDay:'',lastFiredAt:0};throw new Error('提醒操作无效');}
  function calendar(prefs,now=new Date(),uid=globalThis.crypto.randomUUID()){
    const p=settings(prefs);if(!p.enabled)throw new Error('请先启用日记提醒');
    const [h,m]=p.time.split(':').map(Number),start=new Date(now.getFullYear(),now.getMonth(),now.getDate(),h,m);if(start<=now)start.setDate(start.getDate()+1);
    const date=localDay(start).replaceAll('-','')+'T'+pad(h)+pad(m)+'00';const stamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Life Archive//Diary Reminder//ZH','BEGIN:VEVENT','UID:'+String(uid).replace(/[^\w-]/g,'')+'@life-archive','DTSTAMP:'+stamp,'DTSTART:'+date,'DURATION:PT10M','RRULE:FREQ=DAILY','SUMMARY:写日记 · 人生档案','DESCRIPTION:留下一段今天的经历。提醒时间和删除请在日历中修改。','BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:PT0S','DESCRIPTION:记得写今天的日记',...(p.strong?['DURATION:PT5M','REPEAT:2']:[]),'END:VALARM','END:VEVENT','END:VCALENDAR'];
    return lines.map(line=>{let part='',size=0,out=[];for(const ch of line){const bytes=new TextEncoder().encode(ch).length;if(size+bytes>75){out.push(part);part=' ';size=1;}part+=ch;size+=bytes;}out.push(part);return out.join('\r\n');}).join('\r\n')+'\r\n';
  }
  return {DEFAULTS,localDay,settings,due,fired,respond,calendar};
});
