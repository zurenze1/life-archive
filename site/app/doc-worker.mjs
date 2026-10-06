import {documentText} from './documents.mjs?v=ee68833afd5a';
self.onmessage=({data})=>{try{self.postMessage(documentText(new Uint8Array(data.bytes),data.extension));}catch(error){self.postMessage({error:error.message});}};
