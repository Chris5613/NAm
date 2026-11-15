import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { getTodayKey } from "@/lib/yieldFarmingAccounting";
import {
  readBackendHardwarePaybackCache, writeBackendHardwarePaybackCache,
  validateBackendHardwarePayback,
} from "@/lib/backendHardwarePaybackCache";

const pending = new Map();
async function request(userId, day) {
  const key=String(userId)+":"+day;
  if(pending.has(key))return pending.get(key);
  const p=api.get("/api/project-tracking/hardware-payback-lifetime")
    .then(raw=>{
      const valid=validateBackendHardwarePayback(raw,day);
      if(!valid)throw new Error("Backend payback evidence does not match date");
      return valid;
    }).finally(()=>{if(pending.get(key)===p)pending.delete(key);});
  pending.set(key,p);
  return p;
}

/** Server computation only; never uses checkpoint arithmetic for presentation. */
export function useBackendHardwarePayback() {
  const { user } = useAuth(), userId=user?.id;
  const today=getTodayKey();
  const [state,setState]=useState(()=>{
    const previous=readBackendHardwarePaybackCache(userId,today);
    return {userId,day:today,data:previous?.data||null,error:null,isCached:!!previous};
  });
  useEffect(()=>{
    let active=true;
    const day=getTodayKey(), saved=readBackendHardwarePaybackCache(userId,day);
    setState({userId,day,data:saved?.data||null,error:null,isCached:!!saved});
    if(userId==null)return ()=>{active=false;};
    const refresh=async()=>{
      const requestedDay=getTodayKey();
      if(requestedDay!==day){
        if(active)setState({userId,day:requestedDay,data:null,error:null,isCached:false});
        return;
      }
      try {
        const result=await request(userId,requestedDay);
        if(!active||getTodayKey()!==requestedDay)return;
        const next=writeBackendHardwarePaybackCache(userId,requestedDay,result);
        setState({userId,day:requestedDay,data:next?.data||result,error:null,isCached:false});
      } catch {
        if(active)setState(previous=>previous.userId===userId?{
          ...previous,error:"Backend payback reconciliation unavailable",
        }:previous);
      }
    };
    refresh();
    const timer=window.setInterval(()=>{
      if(document.visibilityState==="visible")refresh();
    },60000);
    const focus=()=>refresh();
    const visible=()=>{if(document.visibilityState==="visible")refresh();};
    window.addEventListener("focus",focus);
    document.addEventListener("visibilitychange",visible);
    return ()=>{active=false;window.clearInterval(timer);
      window.removeEventListener("focus",focus);
      document.removeEventListener("visibilitychange",visible);};
  },[userId,today]);
  if(userId==null||state.userId!==userId||state.day!==today)
    return {data:null,isCached:false,error:null};
  return state;
}
