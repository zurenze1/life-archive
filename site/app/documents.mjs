import {unzipSync,strFromU8} from './vendor/fflate.mjs?v=ee68833afd5a';
import {csv} from './model.mjs?v=ee68833afd5a';
const entities=s=>s.replace(/&#x([\da-f]+);/gi,(_,x)=>String.fromCodePoint(parseInt(x,16))).replace(/&#(\d+);/g,(_,x)=>String.fromCodePoint(Number(x))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
const text=s=>entities(s.replace(/<\/(?:w:p|w:tr|si)>/g,'\n').replace(/<[^>]*>/g,' ')).replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').trim();
export function office(bytes,extension){
  let total=0;
  const files=unzipSync(bytes,{filter:f=>{
    if(!/^(word\/document\.xml|xl\/sharedStrings\.xml|xl\/worksheets\/sheet\d+\.xml)$/.test(f.name))return false;
    total+=f.originalSize;if(f.originalSize>8*1024*1024||total>20*1024*1024)throw new Error('文档展开后较大，本次仅保留原件');return true;
  }});
  if(extension==='docx'){
    if(!files['word/document.xml'])throw new Error('不是有效的 DOCX 文档');
    return {text:text(strFromU8(files['word/document.xml'])).slice(0,30000),detail:'已提取 Word 文字；保留原件'};
  }
  const sheets=Object.keys(files).filter(f=>f.startsWith('xl/worksheets/')).sort().slice(0,10);
  if(!sheets.length)throw new Error('不是有效的 XLSX 文档');
  const shared=strFromU8(files['xl/sharedStrings.xml']??new Uint8Array());
  const strings=[...shared.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>text(m[1]));
  const output=[];
  for(const name of sheets){const rows=[];const xml=strFromU8(files[name]);for(const row of [...xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)].slice(0,2000)){
    const values=[];for(const c of row[1].matchAll(/<c(\s[^>]*?)>([\s\S]*?)<\/c>/g)){
      const letters=c[1].match(/\br="([A-Z]+)\d+"/)?.[1];let index=values.length;if(letters){index=0;for(const l of letters)index=index*26+l.charCodeAt(0)-64;index--;}
      if(index>1000)continue;while(values.length<=index)values.push('');const v=c[2].match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1]??'';
      values[index]=/\bt="s"/.test(c[1])?strings[Number(v)]??'':/\bt="inlineStr"/.test(c[1])?text(c[2]):entities(v);
    }rows.push(values.join(' | '));
  }output.push(rows.join('\n'));}
  return {text:output.join('\n\n').slice(0,30000),detail:'已提取 Excel 文字；数值日期保留原值，行内容不是已确认经历'};
}
export function documentText(bytes,extension){
  if(['docx','xlsx'].includes(extension))return office(bytes,extension);
  let value=new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/,'');
  if(extension==='csv')value=csv(value).map(r=>r.join(' | ')).join('\n');
  return {text:value.slice(0,30000),detail:'已提取可读文字；最多保留 30,000 字符'};
}
