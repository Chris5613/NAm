chrome.storage.local.get(["grassReading","grassError","grassSavedAt"],d=>{
 const r=d.grassReading;
 document.getElementById("status").textContent=r?
  "Uptime"+(r.uptimeEpoch!==undefined?" (Epoch "+r.uptimeEpoch+")":"")+": "+(r.uptimePoints??"unavailable")+" points · Network: "+(r.networkPoints??"unavailable")+" points. "+(d.grassSavedAt?"Last saved: "+d.grassSavedAt:"NAm save not confirmed.") :
  (d.grassError||"Waiting for first dashboard reading.");
});
