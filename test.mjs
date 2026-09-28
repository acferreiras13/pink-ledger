import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {freshState,entries,summarize,reviseRule,endRecurring,goalStats,checkGoals,windowFor,migrateV1,validateState,setBudget,budgetAt,shiftMonth,cardStats,paymentAccount} from './engine.mjs';
const salary=()=>({id:'salary',name:'Monthly pay',type:'income',cents:500000,category:'Income',day:1,start:'2026-09',end:''});
const tx=(id,type,cents,date='2026-09-15',goalId='')=>({id,type,cents,date,goalId,name:id,category:type==='expense'?'Travel':'Income',note:'',payment:'',incomeKind:'Bonus'});
test('$5,000 repeats exactly once per month, survives reload, and extras add to it',()=>{
  let d=freshState();d.rules=[salary()];d.transactions.push(tx('bonus','income',20000));
  assert.equal(summarize(entries(d,'2026-09','2026-09')).income,520000);
  assert.equal(summarize(entries(d,'2026-10','2026-10')).income,500000);
  assert.equal(summarize(entries(d,'2026-09','2026-11')).income,1520000);
  const before=JSON.stringify(d);for(let i=0;i<10;i++)entries(d,'2026-09','2026-11');assert.equal(JSON.stringify(d),before);
  d=validateState(JSON.parse(JSON.stringify(d)));assert.equal(entries(d,'2026-09','2026-09').length,2);
});
test('one-month adjustments, skipping, and future salary changes preserve history',()=>{
  const d=freshState();d.rules=[salary()];d.overrides['auto:salary:2026-09']={name:'Monthly pay',cents:490000,date:'2026-09-01',note:''};
  reviseRule(d,'salary',{cents:550000},'2026-11');
  assert.equal(summarize(entries(d,'2026-09','2026-09')).income,490000);
  assert.equal(summarize(entries(d,'2026-10','2026-10')).income,500000);
  assert.equal(summarize(entries(d,'2026-11','2026-11')).income,550000);
  d.overrides['auto:salary:2026-10']=null;assert.equal(entries(d,'2026-10','2026-10').length,0);
  delete d.overrides['auto:salary:2026-10'];assert.equal(entries(d,'2026-10','2026-10').length,1);
  endRecurring(d,'salary','2026-10');assert.equal(entries(d,'2026-10','2027-01').length,0);assert.equal(entries(d,'2026-09','2026-09').length,1);
});
test('fixed bills use shorter months correctly and count within category spending',()=>{
  const d=freshState();d.rules=[{...salary(),id:'bill',type:'expense',name:'Rent',category:'Housing',cents:60000,day:31,start:'2026-01'}];
  assert.equal(entries(d,'2026-02','2026-02')[0].date,'2026-02-28');assert.equal(entries(d,'2028-02','2028-02')[0].date,'2028-02-29');
  const t=summarize(entries(d,'2026-09','2026-09'));assert.equal(t.expenses,60000);assert.equal(t.fixed,60000);assert.equal(t.variable,0);
});
test('goal purchases are not deducted twice and withdrawals are not income',()=>{
  const d=freshState(),g=d.goals[0];d.rules=[salary()];d.transactions=[tx('saved','saving',100000,'2026-09-02',g.id),tx('ticket','expense',20000,'2026-09-03',g.id),tx('return','withdrawal',10000,'2026-09-04',g.id)];
  const t=summarize(entries(d,'2026-09','2026-09'));assert.equal(t.income,500000);assert.equal(t.expenses,20000);assert.equal(t.netSaved,70000);assert.equal(t.left,410000);assert.equal(goalStats(d,g.id).balance,70000);assert.equal(t.left+goalStats(d,g.id).balance,480000);checkGoals(d);
  d.transactions.push(tx('tooMuch','expense',80000,'2026-09-05',g.id));assert.throws(()=>checkGoals(d),/below zero/);
});
test('prior goal funds can finance a later purchase without using later income',()=>{
  const d=freshState(),g=d.goals[0];d.transactions=[tx('saved','saving',100000,'2026-08-02',g.id),tx('ticket','expense',60000,'2026-09-03',g.id)];
  const t=summarize(entries(d,'2026-09','2026-09'));assert.equal(t.left,0);assert.equal(t.netSaved,-60000);assert.equal(goalStats(d,g.id).balance,40000);
});
test('budgets change forward without retroactively changing earlier months',()=>{
  const d=freshState();setBudget(d,'Shopping',20000,'2026-09');setBudget(d,'Shopping',30000,'2026-11');assert.equal(budgetAt(d,'Shopping','2026-08'),0);assert.equal(budgetAt(d,'Shopping','2026-10'),20000);assert.equal(budgetAt(d,'Shopping','2026-12'),30000);
});
test('all-time window includes earlier activity and stops at current month',()=>{
  const d=freshState();d.rules=[salary()];d.transactions=[tx('old','income',100,'2026-02-01')];assert.deepEqual(windowFor(d,'all','2027-08','2026-09'),['2026-02','2026-09']);assert.deepEqual(windowFor(d,'year','2027-08'),['2027-01','2027-12']);assert.equal(shiftMonth('2026-12',1),'2027-01');
});
test('v1 import preserves records, applies fixed income, and prevents duplicated logged bills',()=>{
  const raw={version:1,plannedIncome:5000,goals:[],budgets:{Housing:650},recurring:[{id:'rent',name:'Rent',type:'expense',category:'Housing',amount:600,day:1,active:true}],transactions:[{id:'paid',date:'2026-09-01',type:'expense',name:'Rent',amount:600,category:'Housing',goalId:'',note:''}]};
  const d=validateState(migrateV1(raw,'2026-09')),t=summarize(entries(d,'2026-09','2026-09'));assert.equal(t.income,500000);assert.equal(t.expenses,60000);assert.equal(d.transactions.length,1);assert.equal(budgetAt(d,'Housing','2026-09'),65000);
});
test('malformed imports, impossible dates, and negative amounts fail validation',()=>{
  const d=freshState();d.transactions=[tx('bad','income',-1)];assert.throws(()=>validateState(d));d.transactions=[tx('bad','income',1,'2026-02-30')];assert.throws(()=>validateState(d));assert.throws(()=>validateState({version:2}));
});
test('cards track charges, payments, cash and merchant metadata without double counting',()=>{
  let d=freshState();const card=d.accounts.find(a=>a.id==='savor');card.opening=20000;card.start='2026-09-01';
  d.transactions=[{...tx('old','expense',5000,'2026-08-31'),payment:'savor'}, {...tx('shop','expense',10000),payment:'savor',merchant:'Target'},{...tx('cash','expense',3000),payment:'cash'},{...tx('pay','card_payment',15000),payment:'savor'}];
  d=validateState(d);const s=cardStats(d,'savor','2026-09-28');assert.equal(s.balance,15000);assert.equal(s.available,185000);assert.equal(s.utilization,7.5);assert.equal(summarize(entries(d,'2026-09','2026-09')).expenses,13000);assert.equal(summarize(entries(d,'2026-09','2026-09')).left,-13000);assert.equal(d.transactions.find(t=>t.id==='shop').merchant,'Target');
  assert.equal(cardStats(d,'disney','2026-09-28').balance,null);assert.equal(paymentAccount(d,'Capital One Savor').id,'savor');assert.equal(paymentAccount(d,'Card'),undefined);
  d.rules=[{...salary(),id:'sub',type:'expense',cents:2500,payment:'savor',day:30}];d=validateState(d);assert.equal(cardStats(d,'savor','2026-09-28').balance,15000);assert.equal(cardStats(d,'savor','2026-09-30').balance,17500);
  const restored=validateState(JSON.parse(JSON.stringify(d)));assert.equal(restored.accounts[0].opening,20000);assert.equal(restored.rules[0].payment,'savor');
});
test('older backups gain accounts and retain unrecognized payment labels',()=>{
  const d=freshState();delete d.accounts;d.transactions=[{...tx('old','expense',1000),payment:'Old card'}];const restored=validateState(d);assert.equal(restored.accounts.length,4);assert.equal(restored.transactions[0].payment,'Old card');assert.equal(restored.accounts.reduce((s,a)=>s+a.limit,0),500000);
});
test('every screen and dedicated form renders with sample data; income form applies $5k',()=>{
  const html=fs.readFileSync(new URL('index.html',import.meta.url),'utf8');const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];const nodes=new Map(),events={};
  const node=()=>({innerHTML:'',textContent:'',hidden:false,open:false,dataset:{},focus(){},close(){this.open=false},showModal(){this.open=true},addEventListener(){}});
  const document={querySelector(s){if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);},addEventListener(e,fn){events[e]=fn;},activeElement:node()};const stored=new Map();
  const ctx={document,window:{scrollTo(){}},console,Intl,Date,Math,Number,String,JSON,Map,Set,Array,Error,structuredClone,localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},setTimeout:()=>0,clearTimeout(){},confirm:()=>true,FormData:class{constructor(form){return form.values;}}};vm.createContext(ctx);
  const exposed=script.replace(/\}\)\(\);\s*$/,'globalThis.testApi={go:(p)=>{page=p;render()},sample:()=>{db=sampleState()},ruleModal,entryModal,accountModal,get:()=>db,select:(s,m)=>{scope=s;month=m;render()},settingsView};})();');vm.runInContext(exposed,ctx);const api=ctx.testApi;
  api.select('month','2026-09');api.ruleModal('income');const form=document.querySelector('#editForm');form.onsubmit({preventDefault(){},target:{values:new Map([['name','Monthly pay'],['amount','5000'],['start','2026-09'],['day','1']])}});
  assert.equal(summarize(entries(api.get(),'2026-09','2026-09')).income,500000);assert.equal(stored.size,1);
  api.accountModal();document.querySelector('#editForm').onsubmit({preventDefault(){},target:{values:new Map([['name','Future card'],['limit','3000'],['opening','0'],['start','2026-09-01']])}});
  const added=api.get().accounts.find(a=>a.name==='Future card');assert(added);assert.equal(added.limit,300000);assert.equal(validateState(JSON.parse(JSON.stringify(api.get()))).accounts.length,5);
  api.entryModal('expense');assert(document.querySelector('#dialogContent').innerHTML.includes('Future card'));
  api.accountModal(added.id);document.querySelector('#editForm').onsubmit({preventDefault(){},target:{values:new Map([['name','Renamed card'],['limit','4000'],['opening','0'],['start','2026-09-01']])}});assert.equal(api.get().accounts.find(a=>a.id===added.id).name,'Renamed card');
  api.entryModal('expense');assert.match(document.querySelector('#dialogTitle').textContent,/expense/);assert(!document.querySelector('#dialogContent').innerHTML.includes('name="type"'));
  api.entryModal('income');assert(!document.querySelector('#dialogContent').innerHTML.includes('name="category"'));
  api.sample();for(const p of ['dashboard','income','expenses','budgets','cards','goals','activity','settings']){api.go(p);assert(document.querySelector('#view').innerHTML.length>200,p);}
  api.go('goals');assert(!document.querySelector('#view').innerHTML.includes('Monthly category budgets'));
  api.go('dashboard');api.select('all','2026-09');assert(document.querySelector('#view').innerHTML.includes('Monthly history'));
});
