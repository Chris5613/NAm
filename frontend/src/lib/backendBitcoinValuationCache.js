/** Server-derived BTC valuation display preview; never an accounting writer. */
export const BTC_PREVIEW_PREFIX = "nam:crypto-dashboard:btc:v1:user:";
export const BTC_PREVIEW_TTL = 10 * 60 * 1000;
const storageFor = storage => {
  if (storage) return storage;
  try {return typeof window === "undefined" ? null : window.sessionStorage;}
  catch {return null;}
};
const cacheKey = id => id == null ? null : BTC_PREVIEW_PREFIX + encodeURIComponent(String(id));
const money = value => value == null || (typeof value === "number" &&
  Number.isFinite(value) && value >= 0);
export function validateBitcoinValuation(raw, userId) {
  const b=raw?.bitcoin;
  if (!raw || raw.version!==1 ||
      String(raw.userId)!==String(userId) ||
      raw.sourceOfCalculation!=="backend-bitcoin-wallet-valuation" ||
      !b || !money(raw.projectTotalUsd) || !money(raw.cryptoTotalUsd) ||
      !money(b.amountBtc) || !money(b.priceUsd) || !money(b.valueUsd) ||
      !Number.isFinite(Date.parse(raw.calculatedAt||"")) ||
      !Number.isInteger(b.walletCount) || b.walletCount < 0 ||
      !Number.isInteger(b.missingWalletCount) || b.missingWalletCount < 0 ||
      typeof b.quoteSource!=="string") return null;
  if (raw.complete && (raw.cryptoTotalUsd === null || b.valueUsd === null ||
      b.amountBtc === null || b.priceUsd === null ||
      Math.abs(b.amountBtc*b.priceUsd-b.valueUsd)>.02 ||
      Math.abs(raw.projectTotalUsd+b.valueUsd-raw.cryptoTotalUsd)>.02))
    return null;
  return {
    version:1,userId:raw.userId,
    sourceOfCalculation:raw.sourceOfCalculation, complete:raw.complete===true,
    projectTotalUsd:raw.projectTotalUsd,cryptoTotalUsd:raw.cryptoTotalUsd,
    bitcoin:{
      amountBtc:b.amountBtc, priceUsd:b.priceUsd,valueUsd:b.valueUsd,
      quoteSource:b.quoteSource, quoteAt:b.quoteAt||null,
      walletEvidenceAt:b.walletEvidenceAt||null,
      walletCount:b.walletCount,missingWalletCount:b.missingWalletCount,
      staleWalletCount:b.staleWalletCount||0,
    },
    calculatedAt:raw.calculatedAt,
  };
}
export function readBitcoinValuationCache(userId,store,now=Date.now()) {
  const k=cacheKey(userId),s=storageFor(store);if(!k||!s)return null;
  try {
    const v=JSON.parse(s.getItem(k)||"null");
    if(!v||!Number.isFinite(v.cachedAt)||v.cachedAt>now||now-v.cachedAt>BTC_PREVIEW_TTL){
      s.removeItem(k);return null;
    }
    const data=validateBitcoinValuation(v.data,userId);
    if(!data){s.removeItem(k);return null;}
    return {data,cachedAt:v.cachedAt};
  }catch{return null;}
}
export function writeBitcoinValuationCache(userId,raw,store,now=Date.now()){
  const k=cacheKey(userId),s=storageFor(store),
    data=validateBitcoinValuation(raw,userId);
  if(!k||!s||!data)return null;
  try{
    const previous=readBitcoinValuationCache(userId,s,now);
    if(previous&&Date.parse(previous.data.calculatedAt)>Date.parse(data.calculatedAt))
      return previous;
    s.setItem(k,JSON.stringify({data,cachedAt:now}));
  }catch{/* cache is optional */}
  return {data,cachedAt:now};
}
export function clearBitcoinValuationCache(userId,store){
  const k=cacheKey(userId),s=storageFor(store);if(!k||!s)return;
  try{s.removeItem(k);}catch{}
}
