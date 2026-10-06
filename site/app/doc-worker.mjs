import {documentText} from './documents.mjs?v=6366242b0483';
self.onmessage=({data})=>{try{self.postMessage(documentText(new Uint8Array(data.bytes),data.extension));}catch(error){self.postMessage({error:error.message});}};
