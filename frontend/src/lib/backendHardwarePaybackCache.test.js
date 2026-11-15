import {
 validateBackendHardwarePayback,readBackendHardwarePaybackCache,
 writeBackendHardwarePaybackCache,clearBackendHardwarePaybackCache,HARDWARE_PREVIEW_TTL
} from "./backendHardwarePaybackCache";

const day="2026-11-14";
const report=()=>({
 sourceOfCalculation:"backend-dated-hardware-payback-v1",asOfDay:day,
 devices:[{id:"5080",name:"RTX 5080",startDay:"2026-11-13",
  sources:["Kryptex","Salad"],cashCostUsd:1250,
  observedCreditUsd:7.18542071,observedRemainingUsd:1242.81457929,
  observedProgressPct:.5748,provisionalRewardSubtotalUsd:.02784437,
  confirmedBeforeEarningsStartUsd:34.25480378,
  checkpointBaselineUnderstatesPriorRewards:true,
  complete:false,secret:"private" }],
 sumDeviceCashCostUsd:1250,sumObservedDeviceCreditsUsd:7.18542071,
 sumObservedRemainingUsd:1242.81457929,
 observedSelectedSourceRevenueUsd:7.18542071,
 repeatedDeviceCreditsUsd:0,unverifiedDeviceCreditsUsd:.02784437,
 mathReconciles:true,complete:false,reviewFlags:["stale-checkpoint"],
 secret:"private"
});
const storage=()=>{const data=new Map();return{
 getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),
 removeItem:k=>data.delete(k),
}};

test("accepts backend-observed credit but does not certify provisional salad",()=>{
 const value=validateBackendHardwarePayback(report(),day);
 expect(value.devices[0].observedCreditUsd).toBe(7.18542071);
 expect(value.devices[0].verifiedRecoveryUsd).toBeNull();
 expect(value.devices[0].complete).toBe(false);
 expect(value.devices[0].secret).toBeUndefined();
 expect(value.secret).toBeUndefined();
 expect(validateBackendHardwarePayback(report(),"2026-11-15")).toBeNull();
 expect(validateBackendHardwarePayback({...report(),sourceOfCalculation:"browser"},day)).toBeNull();
});
test("unknown credit cannot be cached as computed zero",()=>{
 const v=report();v.devices[0].observedCreditUsd=null;
 v.devices[0].observedRemainingUsd=null;
 v.devices[0].observedProgressPct=null;
 expect(validateBackendHardwarePayback(v,day).devices[0].observedCreditUsd).toBeNull();
 const bad=report();bad.devices[0].observedCreditUsd=null;
 expect(validateBackendHardwarePayback(bad,day)).toBeNull();
});
test("partition by authenticated account and Pacific day; expire preview",()=>{
 const s=storage(),now=Date.parse("2026-11-15T05:30:00Z");
 writeBackendHardwarePaybackCache(1,day,report(),s,now);
 expect(readBackendHardwarePaybackCache(1,day,s,now+100).data.devices[0].id).toBe("5080");
 expect(readBackendHardwarePaybackCache(2,day,s,now+100)).toBeNull();
 expect(readBackendHardwarePaybackCache(1,"2026-11-15",s,now+100)).toBeNull();
 expect(readBackendHardwarePaybackCache(1,day,s,now+HARDWARE_PREVIEW_TTL+1)).toBeNull();
});


test("logout clears cached device credits from every date without affecting other users",()=>{
 const s=storage();
 // Support standard Storage enumeration used by logout.
 const data=new Map();
 const browserStore={
   getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),
   removeItem:k=>data.delete(k),key:i=>[...data.keys()][i]||null,
   get length(){return data.size;}
 };
 const now=Date.parse("2026-11-15T05:30:00Z");
 writeBackendHardwarePaybackCache(1,day,report(),browserStore,now);
 writeBackendHardwarePaybackCache(2,day,report(),browserStore,now);
 clearBackendHardwarePaybackCache(1,browserStore);
 expect(readBackendHardwarePaybackCache(1,day,browserStore,now)).toBeNull();
 expect(readBackendHardwarePaybackCache(2,day,browserStore,now)).not.toBeNull();
});
