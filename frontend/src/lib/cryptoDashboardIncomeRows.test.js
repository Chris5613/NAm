import {backendCryptoProviderIncomeRows} from "./cryptoDashboardIncomeRows";
const earnings={sourceOfCalculation:"backend-postgres",monthlySources:{
  Kryptex:40.978029,Unetwork:6.945253,Lulo:5.33,RollerCoin:5.038029
},todaySources:{Kryptex:3.43,Unetwork:.62}};
const portfolio={projects:[
  {name:"Kryptex",inactive:false},
  {name:"Unity Network",inactive:false},
  {name:"Lulo",inactive:true},
  {name:"RollerCoin",inactive:false},
]};
test("top rows use backend monthly and today earnings, not local tracker estimates",()=>{
  const rows=backendCryptoProviderIncomeRows(earnings,portfolio);
  expect(rows[0].amount).toBe(40.978029);
  expect(rows[0].daily).toBe(3.43);
  expect(rows.find(row=>row.platform==="Unetwork").daily).toBe(.62);
  expect(rows.find(row=>row.platform==="Lulo").inactive).toBe(true);
  expect(rows.find(row=>row.platform==="RollerCoin").daily).toBeNull();
});
test("unknown provider status is not falsely displayed as active",()=>{
  expect(backendCryptoProviderIncomeRows({...earnings,monthlySources:{NewProvider:2}},portfolio)[0].inactive).toBeNull();
});
test("rejects browser-earned data",()=>{
  expect(backendCryptoProviderIncomeRows({...earnings,sourceOfCalculation:"browser"},portfolio)).toEqual([]);
});
