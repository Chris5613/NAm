function valid(r){return r&&r.source==="grass-visible-dashboard-v1"&&[r.uptimePoints,r.networkPoints].some(n=>typeof n==="number"&&Number.isFinite(n)&&n>=0);}
chrome.runtime.onMessage.addListener(m=>{
 if(m?.type==="NAm_GRASS_READING"&&valid(m.reading))window.postMessage({source:"nam-grass-extension",type:"GRASS_READING",reading:m.reading},location.origin);
});
chrome.runtime.sendMessage({type:"NAm_GRASS_READY"}).catch(()=>{});
window.addEventListener("message",e=>{
 if(e.source!==window||e.origin!==location.origin||e.data?.source!=="nam-grass-app")return;
 if(e.data.type==="REQUEST_LATEST")chrome.runtime.sendMessage({type:"NAm_GRASS_READY"}).catch(()=>{});
 if(e.data.type==="SAVED"&&typeof e.data.signature==="string")chrome.runtime.sendMessage({type:"NAm_GRASS_SAVED",signature:e.data.signature}).catch(()=>{});
});
