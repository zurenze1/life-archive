import {documentText} from './documents.mjs?v=4b7db11495aa';
self.onmessage=({data})=>{try{self.postMessage(documentText(new Uint8Array(data.bytes),data.extension));}catch(error){self.postMessage({error:error.message});}};
