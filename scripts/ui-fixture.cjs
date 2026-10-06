const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {zipSync,strToU8}=require('fflate');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'life-archive-ui-'));fs.mkdirSync(path.join(root,'Documents'));
fs.writeFileSync(path.join(root,'Documents','示例课程.md'),'这是隔离测试资料：课程准备与分享。');
fs.writeFileSync(path.join(root,'Documents','示例订单.csv'),'下单时间,商品名称,备注\n2026-10-06 12:30,示例午餐,仅为测试夹具\n');
fs.writeFileSync(path.join(root,'Documents','示例课程.docx'),zipSync({'word/document.xml':strToU8('<w:document><w:p><w:t>示例 Word 课程</w:t></w:p></w:document>')}));
const text='BT /F1 16 Tf 60 730 Td (Life Archive PDF test) Tj ET';
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`];let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((body,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${body}\nendobj\n`;});const xref=Buffer.byteLength(pdf);pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n'+xref+'\n%%EOF\n';fs.writeFileSync(path.join(root,'Documents','示例PDF.pdf'),pdf);
console.log(root);
