let bridge;
function frontmost(){
  if(process.platform!=='darwin')return null;
  if(!bridge){const koffi=require('koffi');koffi.load('/System/Library/Frameworks/AppKit.framework/AppKit');const objc=koffi.load('/usr/lib/libobjc.A.dylib');bridge={class:objc.func('void *objc_getClass(const char *name)'),selector:objc.func('void *sel_registerName(const char *name)'),send:objc.func('void *objc_msgSend(void *self, void *selector)'),string:objc.func('const char *objc_msgSend(void *self, void *selector)'),void:objc.func('void objc_msgSend(void *self, void *selector)')};}
  const b=bridge,send=(object,name)=>b.send(object,b.selector(name));const pool=send(b.class('NSAutoreleasePool'),'new');
  try{const app=send(send(b.class('NSWorkspace'),'sharedWorkspace'),'frontmostApplication');if(!app)return null;const text=property=>{const value=send(app,property);return value?b.string(value,b.selector('UTF8String')):'';};return {name:text('localizedName'),bundleId:text('bundleIdentifier')};}finally{if(pool)b.void(pool,b.selector('drain'));}
}
module.exports={frontmost};
