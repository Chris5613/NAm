// Observe visible Grass points only. No fetch, cookie, token, or page bridge.
const RULES=[
 {key:"uptimePoints",re:/^uptime\s+points?\s*:?$/i},
 {key:"networkPoints",re:/^network\s+points?\s*:?$/i},
];
const visible=el=>{
 if(!el||!el.getClientRects().length)return false;
 const s=getComputedStyle(el);
 return s.visibility!=="hidden"&&s.display!=="none";
};
function number(text){
 const t=String(text||"").trim().replace(/\s+/g," ");
 if(!/^\d[\d,]*(?:\.\d+)?$/.test(t))return null;
 const v=Number(t.replace(/,/g,""));
 return Number.isFinite(v)&&v>=0&&v<1e12?v:null;
}
function read(label){
 const pos=label.getBoundingClientRect();
 for(let root=label.parentElement,depth=0;root&&depth<5;root=root.parentElement,depth++){
  if(!visible(root))continue;
  const nums=[];
  for(const item of root.querySelectorAll("span,div,p,strong,b,h1,h2,h3,h4,dd")){
   if(!visible(item)||item.contains(label))continue;
   const v=number(item.textContent);if(v===null)continue;
   if([...item.children].some(c=>visible(c)&&number(c.textContent)!==null))continue;
   const r=item.getBoundingClientRect();
   const dx=Math.abs(pos.left-r.left),dy=r.top-pos.bottom;
   if(dx>250||dy< -110||dy>130)continue;
   nums.push({v,score:Math.abs(dy)+dx*.2+(dy< -3?25:0)});
  }
  nums.sort((a,b)=>a.score-b.score);
  if(nums.length===1||nums.length>1&&nums[1].score-nums[0].score>23)return nums[0].v;
  if(nums.length)return null;
 }
 return null;
}
function sample(){
 const readings={source:"grass-visible-dashboard-v1",observedAt:new Date().toISOString()};
 let count=0;
 for(const el of document.querySelectorAll("span,div,p,strong,b,h1,h2,h3,h4,dt,dd,small,label")){
  if(!visible(el)||(el.textContent||"").length>75)continue;
  const t=(el.textContent||"").trim().replace(/\s+/g," ");
  const rule=RULES.find(r=>r.re.test(t));if(!rule)continue;
  if([...el.children].some(c=>visible(c)&&(c.textContent||"").trim()===t))continue;
  if(readings[rule.key]!==undefined)continue;
  const val=read(el);
  if(val!==null){readings[rule.key]=val;count++;}
 }
 if(!count){
  chrome.runtime.sendMessage({type:"GRASS_READ_ERROR",error:"No labeled Uptime or Network Points were recognized. Confirm you are signed in to the Grass rewards dashboard."}).catch(()=>{});
  return;
 }
 chrome.runtime.sendMessage({type:"GRASS_READING",reading:readings}).catch(()=>{});
}
chrome.runtime.onMessage.addListener(m=>{if(m?.type==="GRASS_SAMPLE")sample();});
sample();
let attempts=0;
const retry=setInterval(()=>{sample();if(++attempts>=40)clearInterval(retry);},1000);
