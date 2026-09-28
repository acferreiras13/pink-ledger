export const CATEGORIES=['Housing','Tithing','Subscriptions','Dining','Shopping','Entertainment','Transport','Beauty','Health','Travel','Groceries','Gifts','Other'];
export const ICONS={Housing:'🏠',Tithing:'🤍',Subscriptions:'📺',Dining:'🍓',Shopping:'🛍️',Entertainment:'🎬',Transport:'🚌',Beauty:'💄',Health:'💊',Travel:'✈️',Groceries:'🧺',Gifts:'🎁',Other:'✨'};
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const newId=()=>globalThis.crypto?.randomUUID?.()||`id${Date.now()}${Math.random().toString(36).slice(2)}`;
export const cents=n=>Math.round(Number(n)*100);
export function defaultAccounts(){return [{id:'savor',name:'Capital One Savor',limit:200000},{id:'disney',name:'Chase Disney Visa Rewards',limit:250000},{id:'afcu',name:'AFCU Credit Card',limit:50000}].map(a=>({...a,kind:'credit',opening:null,start:today()})).concat([{id:'cash',name:'Cash',kind:'cash',limit:0,opening:null,start:today()}]);}
export function paymentAccount(db,payment){const p=String(payment||'').trim().toLowerCase();const aliases={savor:'savor','capital one savor':'savor',disney:'disney','disney visa':'disney','chase disney visa rewards':'disney',afcu:'afcu','afcu credit card':'afcu',cash:'cash'};return (db.accounts||defaultAccounts()).find(a=>a.id===p||a.name.toLowerCase()===p||a.id===aliases[p]);}
export function cardStats(db,id,asOf=today()){
  const a=(db.accounts||defaultAccounts()).find(a=>a.id===id);if(!a)return null;
  const rows=entries(db,a.start.slice(0,7),asOf.slice(0,7)).filter(t=>t.date>=a.start&&t.date<=asOf&&paymentAccount(db,t.payment)?.id===id);
  const charges=sumC(rows.filter(t=>t.type==='expense')),payments=sumC(rows.filter(t=>t.type==='card_payment'));
  const balance=a.opening===null?null:a.opening+charges-payments;
  return {charges,payments,balance,available:balance===null?null:a.limit-balance,utilization:balance===null||!a.limit?null:Math.max(0,balance)/a.limit*100};
}
export const sumC=rows=>rows.reduce((s,r)=>s+r.cents,0);
export function shiftMonth(m,n){const [y,mo]=m.split('-').map(Number),d=new Date(y,mo-1+n,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
export const lastDay=m=>new Date(Number(m.slice(0,4)),Number(m.slice(5)),0).getDate();
export function monthsBetween(a,b){const out=[];for(let m=a;m<=b&&out.length<2412;m=shiftMonth(m,1))out.push(m);return out;}
export function freshState(now=today().slice(0,7)){return {version:2,accounts:defaultAccounts(),transactions:[],rules:[],overrides:{},budgets:[],goals:[{id:newId(),name:'NYC / SNL standby',emoji:'🗽',target:0,opening:0,due:''},{id:newId(),name:'Disneyland / LA',emoji:'🏰',target:0,opening:0,due:''},{id:newId(),name:'Long-term savings',emoji:'💖',target:0,opening:0,due:''}],categories:[...CATEGORIES]};}
export function windowFor(db,scope,month,now=today().slice(0,7)){
  if(scope==='month')return [month,month];
  if(scope==='year')return [month.slice(0,4)+'-01',month.slice(0,4)+'-12'];
  const dates=[now,...db.transactions.map(t=>t.date.slice(0,7)),...db.rules.map(r=>r.start)].filter(m=>m<=now);
  return [dates.sort()[0],now];
}
export function entries(db,start,end){
  const rows=db.transactions.filter(t=>t.date.slice(0,7)>=start&&t.date.slice(0,7)<=end).map(t=>({...t,automatic:false}));
  for(const r of db.rules){for(const m of monthsBetween(start>r.start?start:r.start,r.end&&r.end<end?r.end:end)){
    const id=`auto:${r.id}:${m}`,override=db.overrides[id];if(override===null)continue;
    const date=`${m}-${String(Math.min(r.day,lastDay(m))).padStart(2,'0')}`;
    rows.push({id,ruleId:r.id,date,type:r.type,name:r.name,cents:r.cents,category:r.category||'Income',goalId:'',note:'',payment:r.payment||'',merchant:r.name,incomeKind:'Recurring',...override,automatic:true});
  }}
  return rows.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
}
export function summarize(rows){
  const by=t=>sumC(rows.filter(r=>r.type===t));
  const income=by('income'),expenses=by('expense'),contributions=by('saving'),withdrawals=by('withdrawal'),goalSpent=sumC(rows.filter(r=>r.type==='expense'&&r.goalId));
  const fixed=sumC(rows.filter(r=>r.type==='expense'&&r.automatic)),regularIncome=sumC(rows.filter(r=>r.type==='income'&&r.automatic));
  const netSaved=contributions-withdrawals-goalSpent;
  return {income,expenses,contributions,withdrawals,goalSpent,netSaved,fixed,variable:expenses-fixed,regularIncome,extraIncome:income-regularIncome,left:income-expenses-netSaved,count:rows.length,expenseCount:rows.filter(r=>r.type==='expense').length};
}
export function categoryTotals(rows){const result=new Map();for(const t of rows)if(t.type==='expense')result.set(t.category,(result.get(t.category)||0)+t.cents);return [...result].sort((a,b)=>b[1]-a[1]);}
export function budgetAt(db,cat,m){return db.budgets.filter(b=>b.category===cat&&b.start<=m&&(!b.end||b.end>=m)).sort((a,b)=>b.start.localeCompare(a.start))[0]?.cents||0;}
export function budgetAcross(db,cat,a,b){return monthsBetween(a,b).reduce((s,m)=>s+budgetAt(db,cat,m),0);}
export function setBudget(db,category,amount,start){
  for(const b of db.budgets)if(b.category===category&&b.start<start&&(!b.end||b.end>=start))b.end=shiftMonth(start,-1);
  db.budgets=db.budgets.filter(b=>!(b.category===category&&b.start>=start));
  db.budgets.push({id:newId(),category,cents:amount,start,end:''});
}
export function goalStats(db,id,through='2100-12-31'){
  const g=db.goals.find(g=>g.id===id);const rows=db.transactions.filter(t=>t.goalId===id&&t.date<=through);
  const added=sumC(rows.filter(t=>t.type==='saving')),spent=sumC(rows.filter(t=>t.type==='expense')),withdrawn=sumC(rows.filter(t=>t.type==='withdrawal'));
  return {added,spent,withdrawn,balance:(g?.opening||0)+added-spent-withdrawn,funded:(g?.opening||0)+added-withdrawn,rows};
}
export function checkGoals(db){
  for(const g of db.goals){let balance=g.opening;const rows=db.transactions.filter(t=>t.goalId===g.id).sort((a,b)=>a.date.localeCompare(b.date)||(a.type==='saving'?-1:1));
    for(const t of rows){balance+=t.type==='saving'?t.cents:-t.cents;if(balance<0)throw Error(`“${g.name}” would go below zero on ${t.date}. Add funds or reduce the withdrawal/purchase.`);}
  }
}
export function reviseRule(db,id,changes,effective){
  const r=db.rules.find(r=>r.id===id);if(!r)throw Error('Recurring item not found.');
  if(effective<r.start)throw Error('Choose the start month or a later month.');
  if(r.end&&effective>r.end)throw Error('This item has already ended. Create a new recurring item.');
  if(effective===r.start){Object.assign(r,changes);return r.id;}
  const previousEnd=r.end;r.seriesId=r.seriesId||r.id;r.end=shiftMonth(effective,-1);const next={...r,...changes,id:newId(),start:effective,end:previousEnd};db.rules.push(next);
  for(const key of Object.keys(db.overrides)){const parts=key.split(':');if(parts[1]===id&&parts[2]>=effective){db.overrides[`auto:${next.id}:${parts[2]}`]=db.overrides[key];delete db.overrides[key];}}
  return next.id;
}
export function endRecurring(db,id,stop){
  const rule=db.rules.find(r=>r.id===id);if(!rule)throw Error('Recurring item not found.');
  const series=rule.seriesId||rule.id;
  const first=db.rules.filter(r=>(r.seriesId||r.id)===series).map(r=>r.start).sort()[0];
  if(stop<first)throw Error('Choose the start month or a later month.');
  const removed=new Set();
  db.rules=db.rules.filter(r=>{if((r.seriesId||r.id)!==series)return true;if(r.start>=stop){removed.add(r.id);return false;}if(!r.end||r.end>=stop)r.end=shiftMonth(stop,-1);return true;});
  for(const key of Object.keys(db.overrides))if(removed.has(key.split(':')[1]))delete db.overrides[key];
}
export function migrateV1(x,now=today().slice(0,7)){
  const db=freshState(now);db.goals=(x.goals||[]).map(g=>({id:g.id,name:g.name,emoji:g.emoji||'🎀',target:cents(g.target||0),opening:0,due:''}));
  db.transactions=(x.transactions||[]).map(t=>({id:t.id,date:t.date,type:t.type,name:t.name,cents:cents(t.amount),category:t.category||'Other',goalId:t.goalId||'',note:t.note||'',payment:t.payment||'',incomeKind:'Other'}));
  db.categories=[...new Set([...CATEGORIES,...db.transactions.filter(t=>t.type==='expense').map(t=>t.category)])];
  for(const [category,value] of Object.entries(x.budgets||{}))if(Number(value)>0)db.budgets.push({id:newId(),category,cents:cents(value),start:now,end:''});
  for(const r of x.recurring||[])if(r.active!==false)db.rules.push({id:r.id,name:r.name,cents:cents(r.amount),type:r.type,category:r.category||'Other',day:Number(r.day)||1,start:now,end:''});
  if(Number(x.plannedIncome)>0&&!db.rules.some(r=>r.type==='income'))db.rules.push({id:newId(),name:'Monthly income',cents:cents(x.plannedIncome),type:'income',category:'Income',day:1,start:now,end:''});
  // Old logged recurring rows were manual. Suppress a matching auto occurrence so migration cannot double count it.
  for(const r of db.rules)for(const t of db.transactions)if(t.type===r.type&&t.name===r.name&&t.date.slice(0,7)>=r.start)db.overrides[`auto:${r.id}:${t.date.slice(0,7)}`]=null;
  return db;
}
export function validateState(raw){
  if(!raw||![1,2].includes(raw.version))throw Error('Choose a Pink Ledger backup (version 1 or 2).');
  const x=raw.version===1?migrateV1(raw):raw;
  const str=(s,max=200)=>typeof s==='string'&&s.length<=max;
  const mon=m=>typeof m==='string'&&/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(m);
  const date=d=>str(d)&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&mon(d.slice(0,7))&&Number(d.slice(8))>=1&&Number(d.slice(8))<=lastDay(d.slice(0,7));
  const amt=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000000;
  const id=s=>str(s,120)&&/^[a-zA-Z0-9_.-]+$/.test(s);
  for(const k of ['transactions','rules','goals','budgets','categories'])if(!Array.isArray(x[k])||x[k].length>20000)throw Error('The backup has an invalid '+k+' list.');
  if(!x.overrides||typeof x.overrides!=='object'||Array.isArray(x.overrides))throw Error('Invalid recurring adjustments.');
  if(!x.categories.every(c=>str(c,60)&&c.trim()))throw Error('Invalid categories.');
  for(const list of [x.transactions,x.rules,x.goals,x.budgets])if(new Set(list.map(x=>x.id)).size!==list.length||!list.every(x=>id(x.id)))throw Error('Invalid or duplicate entry IDs.');
  for(const g of x.goals)if(!str(g.name,100)||!g.name.trim()||!str(g.emoji,16)||!amt(g.target)||!amt(g.opening)||!(g.due===''||date(g.due)))throw Error('Invalid savings goal.');
  const gids=new Set(x.goals.map(g=>g.id));
  for(const t of x.transactions)if(!date(t.date)||!['income','expense','saving','withdrawal','card_payment'].includes(t.type)||!amt(t.cents)||!t.cents||!str(t.name,100)||!t.name.trim()||!str(t.category,60)||!str(t.note||'',500)||!str(t.payment||'',60)||!str(t.merchant||'',100)||(t.type==='card_payment'&&(!paymentAccount(x,t.payment)||paymentAccount(x,t.payment).kind!=='credit'||t.goalId))||!str(t.incomeKind||'',60)||(!str(t.goalId,120))||(t.goalId&&!gids.has(t.goalId))||(['saving','withdrawal'].includes(t.type)&&!t.goalId))throw Error('Invalid transaction.');
  for(const r of x.rules)if(!['income','expense'].includes(r.type)||!amt(r.cents)||!r.cents||!str(r.name,100)||!r.name.trim()||!str(r.category,60)||!str(r.payment||'',60)||!Number.isInteger(r.day)||r.day<1||r.day>31||!mon(r.start)||(r.seriesId&&!id(r.seriesId))||(r.end!==''&&(!mon(r.end)||r.end<r.start)))throw Error('Invalid recurring item.');
  for(const b of x.budgets)if(!str(b.category,60)||!amt(b.cents)||!mon(b.start)||(b.end!==''&&(!mon(b.end)||b.end<b.start)))throw Error('Invalid budget.');
  const accounts=x.accounts||defaultAccounts();
  if(!Array.isArray(accounts)||accounts.length>100||new Set(accounts.map(a=>a.id)).size!==accounts.length||accounts.some(a=>!id(a.id)||!str(a.name,60)||!a.name.trim()||!['credit','cash'].includes(a.kind)||!amt(a.limit)||!(a.opening===null||amt(a.opening))||!date(a.start)))throw Error('Invalid payment accounts.');
  const clean={version:2,accounts:accounts.map(a=>({id:a.id,name:a.name,kind:a.kind,limit:a.limit,opening:a.opening,start:a.start})),categories:[...x.categories],transactions:x.transactions.map(t=>({id:t.id,date:t.date,type:t.type,name:t.name,cents:t.cents,category:t.category,goalId:t.goalId,note:t.note||'',payment:t.payment||'',merchant:t.merchant||'',incomeKind:t.incomeKind||'Other'})),rules:x.rules.map(r=>({id:r.id,seriesId:r.seriesId||r.id,type:r.type,name:r.name,cents:r.cents,category:r.category,day:r.day,start:r.start,end:r.end,payment:r.payment||''})),budgets:x.budgets.map(b=>({id:b.id,category:b.category,cents:b.cents,start:b.start,end:b.end})),goals:x.goals.map(g=>({id:g.id,name:g.name,emoji:g.emoji,target:g.target,opening:g.opening,due:g.due})),overrides:{}};
  for(const [key,v] of Object.entries(x.overrides)){const p=key.split(':');if(p.length!==3||p[0]!=='auto'||!x.rules.some(r=>r.id===p[1])||!mon(p[2]))throw Error('Invalid recurring adjustment key.');if(v===null){clean.overrides[key]=null;continue;}if(!v||!amt(v.cents)||!v.cents||!str(v.name,100)||!v.name.trim()||!date(v.date)||v.date.slice(0,7)!==p[2]||!str(v.note||'',500))throw Error('Invalid recurring adjustment.');clean.overrides[key]={cents:v.cents,name:v.name,date:v.date,note:v.note||''};}
  checkGoals(clean);return clean;
}
