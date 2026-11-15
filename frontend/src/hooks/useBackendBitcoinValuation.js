import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import {
  readBitcoinValuationCache,writeBitcoinValuationCache,
  validateBitcoinValuation,
} from "@/lib/backendBitcoinValuationCache";

const pending = new Map();
async function requestBitcoinValuation(userId) {
  const k=String(userId);
  if(pending.has(k))return pending.get(k);
  const p=api.get("/api/project-tracking/bitcoin-valuation").then(result=>{
    const valid=validateBitcoinValuation(result,userId);
    if(!valid)throw new Error("Untrusted BTC valuation response");
    return valid;
  }).finally(()=>{if(pending.get(k)===p)pending.delete(k);});
  pending.set(k,p);return p;
}
export async function prefetchBackendBitcoinValuation(userId,isCurrent=()=>true){
  if(userId==null)return null;
  const saved=readBitcoinValuationCache(userId);
  if(saved&&Date.now()-saved.cachedAt<30_000)return saved;
  const next=await requestBitcoinValuation(userId);
  if(!isCurrent())return null;
  return writeBitcoinValuationCache(userId,next);
}
/** One server market quote; no browser BTC conversion, no USD income write. */
export function useBackendBitcoinValuation(){
  const {user}=useAuth(),userId=user?.id;
  const [state,setState]=useState(()=>{
    const c=readBitcoinValuationCache(userId);
    return {userId,data:c?.data||null,cachedAt:c?.cachedAt||0,isCached:Boolean(c),error:null};
  });
  const refresh=useCallback(async()=>{
    if(userId==null)return;
    try{
      const next=await requestBitcoinValuation(userId);
      if(userId==null)return;
      setState(previous=>{
        if(String(previous.userId)!==String(userId))return previous;
        const saved=writeBitcoinValuationCache(userId,next);
        return {userId,data:saved?.data||next,cachedAt:saved?.cachedAt||Date.now(),
          isCached:false,error:null};
      });
    }catch{
      setState(previous=>String(previous.userId)!==String(userId)?previous:{
        ...previous,error:"Backend BTC valuation unavailable; showing saved data if available.",
      });
    }
  },[userId]);
  useEffect(()=>{
    const c=readBitcoinValuationCache(userId);
    setState({userId,data:c?.data||null,cachedAt:c?.cachedAt||0,isCached:Boolean(c),error:null});
    if(userId==null)return;
    let live=true;
    const tick=()=>{if(live)refresh();};
    tick();
    const timer=window.setInterval(()=>{if(document.visibilityState==="visible")tick();},60000);
    const visible=()=>{if(document.visibilityState==="visible")tick();};
    window.addEventListener("focus",visible);
    document.addEventListener("visibilitychange",visible);
    return ()=>{live=false;window.clearInterval(timer);
      window.removeEventListener("focus",visible);
      document.removeEventListener("visibilitychange",visible);};
  },[userId,refresh]);
  if(userId==null||String(state.userId)!==String(userId))return {data:null,isCached:false,error:null,refresh};
  return {...state,refresh};
}
