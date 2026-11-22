import { api } from "@/lib/apiClient";

// Signed-in NAm shell receives labeled Grass dashboard observations without
// capturing passwords, session cookies or API responses.
let installed=false,inflight=false,last="";
const signature=r=>[r.uptimePoints??"",r.networkPoints??"",r.uptimeEpoch??"",r.networkEpoch??""].join(":");
function acknowledge(signature){
 window.postMessage({source:"nam-grass-app",type:"SAVED",signature},window.location.origin);
}
async function onReading(event){
 if(event.source!==window||event.origin!==window.location.origin)return;
 if(event.data?.source!=="nam-grass-extension"||event.data?.type!=="GRASS_READING")return;
 const r=event.data?.reading;
 if(!r||r.source!=="grass-visible-dashboard-v1")return;
 const good=n=>n===undefined||(typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<1e12);
 if(!good(r.uptimePoints)||!good(r.networkPoints)||r.uptimePoints===undefined&&r.networkPoints===undefined)return;
 const sig=signature(r);
 if(last===sig){acknowledge(sig);return;}
 if(inflight)return;
 inflight=true;
 try{
  await api.post("/api/grass/browser-ingest",{
   source:"grass-visible-dashboard-v1",
   ...(r.uptimePoints===undefined?{}:{uptimePoints:r.uptimePoints}),
   ...(r.networkPoints===undefined?{}:{networkPoints:r.networkPoints}),
   ...(r.uptimeEpoch===undefined?{}:{uptimeEpoch:r.uptimeEpoch}),
   ...(r.networkEpoch===undefined?{}:{networkEpoch:r.networkEpoch}),
  });
  last=sig;
  window.dispatchEvent(new Event("nam-grass-updated"));
  acknowledge(sig);
 }catch(error){console.warn("Grass observations not saved:",error?.message);}
 finally{inflight=false;}
}
export function installGrassExtensionListener(){
 if(installed)return;installed=true;
 window.addEventListener("message",onReading);
 const request=()=>window.postMessage({source:"nam-grass-app",type:"REQUEST_LATEST"},window.location.origin);
 request();window.setTimeout(request,1500);
}
