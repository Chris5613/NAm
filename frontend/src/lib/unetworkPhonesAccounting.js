// Business-use Unetwork phones. This is an opt-in register: ordinary personal
// phone inventory must not silently become business assets or revenue.
import { remoteStorage } from "@/lib/serverStore";
import { equipmentSchedule, moneyRound } from "@/lib/financialAccounting";
export const UNETWORK_PHONES_KEY="financials_unetwork_business_phones_v1";
export const PHONE_INVENTORY_KEY="networth_phones";
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||"")) &&
  !Number.isNaN(Date.parse(String(value)+"T12:00:00Z")) &&
  new Date(String(value)+"T12:00:00Z").toISOString().slice(0,10)===value;
export const readUnetworkPhones=()=>{
  try { const value=JSON.parse(remoteStorage.getItem(UNETWORK_PHONES_KEY)||"[]");return Array.isArray(value)?value:[]; }
  catch { return []; }
};
export const readPhoneInventory=()=>{
  try {const v=JSON.parse(remoteStorage.getItem(PHONE_INVENTORY_KEY)||"[]");return Array.isArray(v)?v:[];}
  catch {return [];}
};
export function validatePhoneAsset(value) {
  const name=String(value.name||"").trim();
  const cost=Number(value.businessValue);
  if(!name || name.length>90) return "Enter a phone name (up to 90 characters).";
  if(!validDate(value.purchaseDate) || !validDate(value.businessDate)) return "Enter valid purchase and business-use dates.";
  if(value.businessDate<value.purchaseDate) return "Business-use start cannot be earlier than purchase date.";
  if(value.businessDate>new Date().toISOString().slice(0,10)) return "Business-use start cannot be in the future.";
  if(!Number.isFinite(cost) || cost<=0 || cost>1000000) return "Enter a positive business value in USD.";
  if(!["equity","cash","payable"].includes(value.fundingAccount)) return "Choose how the business acquired the phone.";
  if(value.inventoryId && String(value.inventoryId).length>180) return "Invalid inventory reference.";
  return null;
}
export function makePhoneAsset(input,id) {
  const error=validatePhoneAsset(input);
  if(error) throw Error(error);
  return {
    id, inventoryId:String(input.inventoryId||""),
    name:String(input.name).trim(), purchaseDate:input.purchaseDate,
    businessDate:input.businessDate, startMonth:input.businessDate.slice(0,7),
    businessValue:moneyRound(input.businessValue),cost:moneyRound(input.businessValue),
    usefulLifeMonths:36, fundingAccount:input.fundingAccount,
    journalId:"unetwork-phone:"+id,
    source:"unetwork-business-phone",
  };
}
export function phoneJournal(phone) {
  const amount=moneyRound(phone.businessValue);
  return {
    id:phone.journalId,date:phone.businessDate,
    description:"Unetwork phone equipment — "+phone.name,
    amount,debitAccount:"equipment",creditAccount:phone.fundingAccount,
    phoneAssetId:phone.id,source:"unetwork-business-phone",
  };
}
export function phoneAssetRows(phones,month) {
  return (phones||[]).flatMap(phone=>{
    const value=equipmentSchedule(phone,month);
    if(!value) return [];
    return [{
      id:"unetwork-phone:"+phone.id,name:phone.name,
      category:"equipment",start:value.start,end:value.end,
      depreciation:value.depreciation,
      historicalCost:value.cost,acquisitionMonth:phone.startMonth,
      source:"unetwork-business-phone",fundingAccount:phone.fundingAccount,
    }];
  });
}
