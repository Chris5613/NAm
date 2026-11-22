// MV3 periodic worker. We close ONLY extension-created temporary tabs.
const GRASS="https://app.grass.io/dashboard";
const NAM="https://nam-qyn8.onrender.com/";
const ALARM="nam-grass-five-minutes";
let ownedGrass=null,ownedNam=null,pending="";
function sig(r){return [r.uptimePoints??"",r.networkPoints??"",r.uptimeEpoch??"",r.networkEpoch??""].join(":");}
const grassUrl=url=>/^https:\/\/app\.grass\.io(?:\/|$)/.test(url||"");
const namUrl=url=>/^https:\/\/nam-qyn8\.onrender\.com(?:\/|$)/.test(url||"");
async function close(tab){if(Number.isInteger(tab)){try{await chrome.tabs.remove(tab);}catch{}}}
async function poll(){
 if(ownedGrass!==null)return;
 const open=await chrome.tabs.query({url:"https://app.grass.io/*"});
 if(open.length){for(const t of open)chrome.tabs.sendMessage(t.id,{type:"GRASS_SAMPLE"}).catch(()=>{});return;}
 const t=await chrome.tabs.create({url:GRASS,active:false});
 ownedGrass=t.id;
 setTimeout(()=>{if(ownedGrass===t.id){ownedGrass=null;close(t.id);chrome.storage.local.set({grassError:"Grass dashboard did not expose labeled points before timeout."});}},55000);
}
async function deliver(reading){
 const open=await chrome.tabs.query({url:NAM+"*"});
 if(open.length){for(const t of open)chrome.tabs.sendMessage(t.id,{type:"NAm_GRASS_READING",reading}).catch(()=>{});return;}
 if(ownedNam!==null)return;
 const t=await chrome.tabs.create({url:NAM,active:false});ownedNam=t.id;
 setTimeout(()=>{if(ownedNam===t.id){ownedNam=null;close(t.id);chrome.storage.local.set({grassError:"NAm did not confirm save; sign in to NAm."});}},60000);
}
async function setup(){await chrome.alarms.create(ALARM,{periodInMinutes:5});await poll();}
chrome.runtime.onInstalled.addListener(()=>{setup().catch(()=>{});});
chrome.runtime.onStartup.addListener(()=>{setup().catch(()=>{});});
chrome.alarms.onAlarm.addListener(a=>{if(a.name===ALARM)poll().catch(()=>{});});
chrome.runtime.onMessage.addListener((m,sender,respond)=>{
 if(m?.type==="GRASS_READING"){
  if(!grassUrl(sender.tab?.url))return;
  const r=m.reading;
  if(!r||r.source!=="grass-visible-dashboard-v1")return;
  const valid=n=>n===undefined||(typeof n==="number"&&Number.isFinite(n)&&n>=0);
  if(!valid(r.uptimePoints)||!valid(r.networkPoints)||r.uptimePoints===undefined&&r.networkPoints===undefined)return;
  if(sender.tab?.id===ownedGrass){const id=ownedGrass;ownedGrass=null;close(id);}
  chrome.storage.local.set({grassReading:r,grassError:null});
  pending=sig(r);deliver(r).catch(()=>{});
  respond({ok:true});
 }else if(m?.type==="GRASS_READ_ERROR"){
  if(grassUrl(sender.tab?.url))chrome.storage.local.set({grassError:m.error});
 }else if(m?.type==="NAm_GRASS_READY"){
  if(!namUrl(sender.tab?.url))return;
  chrome.storage.local.get("grassReading",({grassReading})=>{
   if(grassReading&&sender.tab?.id!=null)chrome.tabs.sendMessage(sender.tab.id,{type:"NAm_GRASS_READING",reading:grassReading}).catch(()=>{});
  });
 }else if(m?.type==="NAm_GRASS_SAVED"){
  if(!namUrl(sender.tab?.url)||m.signature!==pending)return;
  chrome.storage.local.set({grassSavedAt:new Date().toISOString(),grassError:null});
  if(sender.tab?.id===ownedNam){const id=ownedNam;ownedNam=null;close(id);}
 }else if(m?.type==="GRASS_POLL_NOW"){poll().catch(()=>{});respond({ok:true});}
});
