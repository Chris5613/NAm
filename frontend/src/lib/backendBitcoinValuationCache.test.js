import {
  validateBitcoinValuation,readBitcoinValuationCache,
  writeBitcoinValuationCache,clearBitcoinValuationCache,BTC_PREVIEW_TTL
} from "./backendBitcoinValuationCache";
const mem=()=>{const m=new Map();return{
  getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)
}};
const result=(userId=7)=>({
  version:1,userId,sourceOfCalculation:"backend-bitcoin-wallet-valuation",complete:true,
  projectTotalUsd:3945.30325102,cryptoTotalUsd:5330.41751782,
  bitcoin:{amountBtc:.01706226,priceUsd:81180,valueUsd:1385.1142668,
    quoteSource:"coingecko-backend",walletCount:7,missingWalletCount:0},
  calculatedAt:"2026-11-15T05:00:00Z",
});
test("backend single price and unique holdings sum must reconcile",()=>{
  expect(validateBitcoinValuation(result(),7)).not.toBeNull();
  expect(validateBitcoinValuation({...result(),cryptoTotalUsd:5000},7)).toBeNull();
  expect(validateBitcoinValuation({...result(),sourceOfCalculation:"browser"},7)).toBeNull();
  expect(validateBitcoinValuation({...result(),bitcoin:{...result().bitcoin,valueUsd:100}},7)).toBeNull();
});
test("cash and mining revenue are never cached as independently calculated keys",()=>{
  const v=validateBitcoinValuation({...result(),minedEarnings:90000,secret:"hidden"},7);
  expect(v.minedEarnings).toBeUndefined();
  expect(v.secret).toBeUndefined();
  expect(v.bitcoin.amountBtc).toBe(.01706226);
});
test("no cross-account cache, delayed price, or stale six hour valuation",()=>{
  const s=mem(),now=Date.parse("2026-11-15T05:01:00Z");
  writeBitcoinValuationCache(7,result(),s,now);
  expect(readBitcoinValuationCache(7,s,now+1).data.bitcoin.priceUsd).toBe(81180);
  expect(readBitcoinValuationCache(8,s,now+1)).toBeNull();
  writeBitcoinValuationCache(7,{...result(),calculatedAt:"2026-11-15T04:30:00Z",
    bitcoin:{...result().bitcoin,priceUsd:65000,valueUsd:1108.0469},
    cryptoTotalUsd:5053.35015102},s,now+10);
  expect(readBitcoinValuationCache(7,s,now+15).data.bitcoin.priceUsd).toBe(81180);
  expect(readBitcoinValuationCache(7,s,now+BTC_PREVIEW_TTL+1)).toBeNull();
  writeBitcoinValuationCache(7,result(),s,now);
  clearBitcoinValuationCache(7,s);
  expect(readBitcoinValuationCache(7,s,now)).toBeNull();
});
