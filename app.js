
/* Nova Peptide Research Dashboard — v4 (Firebase) */
'use strict';
const KIT=10;
const APP_SCHEMA=3;
const CAPS={red:'#c8202a',purple:'#7a3fc4',silver:'#a9b0b8',gold:'#d49a1c',teal:'#16968a',yellow:'#e6c619',blue:'#3a8fd6',green:'#2e9d3c',pink:'#d6458a',orange:'#e26a12',amber:'#c97b17'};
const S={photos:{},products:[],purchases:[],sales:[],adjustments:[],fx:null,tab:'purchases',salesQ:'',invQ:'',invF:'all',saveErr:false,cleared:false,schema:APP_SCHEMA};
const TABS=['purchases','sales','unpaid','inventory','financials'];

/* ---------- helpers ---------- */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{const n=parseFloat(v);return Number.isFinite(n)?n:0};
const r2=n=>Math.round((n+Number.EPSILON)*100)/100;
const fmt2=n=>Math.abs(n||0).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});
const money=n=>(r2(n)<0?'−':'')+'$'+fmt2(n);
const cad=n=>(r2(n)<0?'−':'')+'CA$'+fmt2(n);
const cadS=n=>{const a=Math.abs(r2(n));return a>=1000?(r2(n)<0?'−':'')+'CA$'+Math.round(a).toLocaleString('en-CA'):cad(n)};
const usd=n=>'US$'+fmt2(n);
const cur=(n,c)=>c==='USD'?usd(n):cad(n);
const pct=n=>Number.isFinite(n)?(Math.round(n*10)/10).toLocaleString('en-CA')+'%':'—';
const sum=(a,f)=>a.reduce((t,x)=>t+num(f(x)),0);
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const fmtDate=s=>{if(!s)return'';const [y,m,d]=String(s).split('-').map(Number);if(!y)return s;return new Date(y,(m||1)-1,d||1).toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'})};
const fmtMonth=s=>{const [y,m]=s.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('en-CA',{month:'short',year:'2-digit'})};
const byDateDesc=(a,b)=>String(b.date||'').localeCompare(String(a.date||''))||num(b.createdAt)-num(a.createdAt);
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'item';
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const initials=s=>String(s).trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
const prod=id=>S.products.find(p=>p.id===id);
const photoOf=p=>p?(S.photos[p.id]||(window.NOVA_PHOTOS||{})[p.id]||null):null;
const label=p=>p?(p.name+(p.strength?' '+p.strength:'')):'Unknown item';
const capColor=p=>CAPS[p?.cap]||p?.cap||'var(--teal)';
const CAT_ORDER={peptide:0,bac:1,other:2};
const CAT_LABEL={peptide:'Peptide',bac:'BAC water',other:'Non-peptide item'};
const sortedProducts=()=>[...S.products].sort((a,b)=>(CAT_ORDER[a.category]??3)-(CAT_ORDER[b.category]??3)||a.name.localeCompare(b.name)||num(a.strength)-num(b.strength));
const unitWord=p=>p?.category==='bac'?'bottle':(p?.category==='other'?'unit':'vial');
const plural=(n,w)=>`${n} ${w}${n==1?'':'s'}`;
const ST=s=>s.status||'completed';
// Sales saved before paid/unpaid tracking have no `paid` field: treat a finished one as paid. Read-only default, nothing is written.
const isPaid=s=>s.paid===undefined?ST(s)==='completed':!!s.paid;
const REASONS={personal:'Personal use',damaged:'Damaged / lost',recount:'Recount / correction',returned:'Returned to stock',added:'Added stock'};
const itemsSummary=s=>(s.items||[]).map(i=>`${i.qty} × ${i.name}`).join(', ');

/* ---------- stock & money ---------- */
function stats(excludeSaleId){
  const m={};
  const blank=()=>({bought:0,cost:0,sold:0,soldPaid:0,revPaid:0,adjIn:0,adjOut:0,personal:0,damaged:0,recount:0,pending:0});
  const g=id=>m[id]||(m[id]=blank());
  S.purchases.forEach(p=>(p.items||[]).forEach(it=>{const s=g(it.productId);s.bought+=num(it.units);s.cost+=num(it.landedCAD)}));
  S.sales.forEach(sa=>{const st=ST(sa);if(st==='cancelled')return;const f=1-num(sa.discountPct)/100;
    (sa.items||[]).forEach(it=>{const s=g(it.productId),q=num(it.qty);
      if(st==='open'){if(sa.id!==excludeSaleId)s.pending+=q}
      else{s.sold+=q;if(isPaid(sa)){s.soldPaid+=q;s.revPaid+=q*num(it.unitPrice)*f}}})});
  S.adjustments.forEach(a=>{const s=g(a.productId),q=num(a.qty);if(q>=0)s.adjIn+=q;else{s.adjOut+=-q;s[a.reason==='personal'?'personal':a.reason==='damaged'?'damaged':'recount']+=-q}});
  const fin=s=>{s.avg=s.bought?s.cost/s.bought:0;s.onHand=s.bought+s.adjIn-s.adjOut-s.sold;s.available=s.onHand-s.pending;return s};
  Object.values(m).forEach(fin);
  Object.defineProperty(m,'get',{value:id=>m[id]||fin(blank()),enumerable:false});
  return m;
}
const status=n=>n<0?['out',`Short ${-n}`]:n===0?['out','Out']:n<=3?['low','Low']:['ok','In stock'];
/* What a sale needs that isn't physically on hand. First come, first served: only stock on the shelf counts, other open orders don't hold it back. */
function shortages(lines,saleId){const st=stats(saleId),need={};lines.forEach(l=>{if(num(l.qty)>0)need[l.pid]=(need[l.pid]||0)+num(l.qty)});
  return Object.entries(need).map(([pid,q])=>({pid,need:q,onHand:Math.max(0,st.get(pid).onHand),short:Math.max(0,q-Math.max(0,st.get(pid).onHand))})).filter(x=>x.short>0)}
const saleLines=s=>(s.items||[]).map(i=>({pid:i.productId,qty:i.qty}));
const shortText=list=>list.map(x=>`${x.short} × ${label(prod(x.pid))}`).join(', ');
/* Other open orders that would be left short if this sale took its stock now */
function knockOn(lines,saleId){const st=stats(saleId),need={};lines.forEach(l=>{if(num(l.qty)>0)need[l.pid]=(need[l.pid]||0)+num(l.qty)});const out=[];
  S.sales.filter(s=>ST(s)==='open'&&s.id!==saleId).forEach(o=>{(o.items||[]).forEach(i=>{if(!need[i.productId])return;const left=st.get(i.productId).onHand-need[i.productId];
    const others=sum(S.sales.filter(x=>ST(x)==='open'&&x.id!==saleId).flatMap(x=>x.items||[]).filter(y=>y.productId===i.productId),y=>y.qty);
    if(left<others&&!out.some(z=>z.cust===o.customer&&z.pid===i.productId))out.push({cust:o.customer,pid:i.productId,short:Math.min(num(i.qty),others-Math.max(0,left))})})});return out}

function finance(){
  const st=stats();
  const done=S.sales.filter(s=>ST(s)==='completed');
  const F={st,paid:done.filter(isPaid),unpaid:done.filter(s=>!isPaid(s)),open:S.sales.filter(s=>ST(s)==='open')};
  F.revenue=sum(F.paid,s=>s.total);F.grossSales=sum(F.paid,s=>s.subtotal);F.discounts=sum(F.paid,s=>s.discount);
  F.owed=sum(F.unpaid,s=>s.total);F.openValue=sum(F.open,s=>s.total);
  F.expenses=sum(S.purchases,p=>p.totalCAD);F.shipping=sum(S.purchases,p=>p.shippingCAD);
  F.cat={peptide:0,bac:0,other:0};
  S.purchases.forEach(p=>(p.items||[]).forEach(i=>{const c=prod(i.productId)?.category||i.category||'peptide';F.cat[c]=(F.cat[c]||0)+num(i.lineCAD)}));
  F.usdOrders=S.purchases.filter(p=>(p.items||[]).some(i=>i.currency==='USD')||(p.shippingCurrency==='USD'&&num(p.shipping))).length;
  Object.assign(F,{cogs:0,unpaidCost:0,personalCost:0,damagedCost:0,recountCost:0,stockValue:0,addedValue:0,negUnits:0,
    personalUnits:0,damagedUnits:0,recountUnits:0,unitsOnHand:0,pendingUnits:0,soldPaidUnits:0,rows:[]});
  const ids=new Set([...S.products.map(p=>p.id),...Object.keys(st)]);
  ids.forEach(id=>{const s=st.get(id),p=prod(id)||{id,name:'(deleted item)',strength:''};
    const cg=s.soldPaid*s.avg;F.cogs+=cg;F.unpaidCost+=(s.sold-s.soldPaid)*s.avg;F.soldPaidUnits+=s.soldPaid;
    F.personalCost+=s.personal*s.avg;F.damagedCost+=s.damaged*s.avg;F.recountCost+=s.recount*s.avg;
    F.personalUnits+=s.personal;F.damagedUnits+=s.damaged;F.recountUnits+=s.recount;
    F.stockValue+=Math.max(0,s.onHand)*s.avg;F.addedValue+=s.adjIn*s.avg;F.unitsOnHand+=Math.max(0,s.onHand);F.pendingUnits+=s.pending;
    if(s.onHand<0)F.negUnits+=-s.onHand;
    if(s.bought||s.sold||s.adjIn)F.rows.push({p,s,cogs:cg,profit:s.revPaid-cg})});
  F.lossCost=F.personalCost+F.damagedCost+F.recountCost;
  F.gross=F.revenue-F.cogs;F.net=F.gross-F.lossCost;
  F.markup=F.cogs?F.gross/F.cogs*100:NaN;F.margin=F.revenue?F.gross/F.revenue*100:NaN;F.netMargin=F.revenue?F.net/F.revenue*100:NaN;
  F.cash=F.revenue-F.expenses;
  // monthly: revenue in the month it was paid, expenses in the month bought, net = revenue − cost of those vials − stock used/lost that month
  const M={};const mo=k=>M[k]||(M[k]={r:0,e:0,c:0,l:0});
  F.paid.forEach(s=>{const k=String(s.paidDate||s.date||'').slice(0,7);if(k.length!==7)return;const x=mo(k);x.r+=num(s.total);
    (s.items||[]).forEach(i=>x.c+=num(i.qty)*st.get(i.productId).avg)});
  S.purchases.forEach(p=>{const k=String(p.date||'').slice(0,7);if(k.length===7)mo(k).e+=num(p.totalCAD)});
  S.adjustments.forEach(a=>{const q=num(a.qty);const k=String(a.date||'').slice(0,7);if(q<0&&k.length===7)mo(k).l+=-q*st.get(a.productId).avg});
  F.months=Object.keys(M).sort().reverse().map(k=>({k,...M[k],n:M[k].r-M[k].c-M[k].l}));
  F.rows.sort((a,b)=>b.s.revPaid-a.s.revPaid||b.s.bought-a.s.bought);
  return F;
}

/* ---------- toast & two-tap ---------- */
let toastT;
function toast(msg){let t=$('#toast');if(!t){t=document.createElement('div');t.id='toast';t.className='toast';t.setAttribute('role','status');document.body.appendChild(t)}t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,2600)}
function armed(btn,msg='Tap again to confirm'){if(btn.dataset.armed)return true;btn.dataset.armed='1';const old=btn.textContent;btn.textContent=msg;btn.classList.add('armed');setTimeout(()=>{if(btn.isConnected){delete btn.dataset.armed;btn.textContent=old;btn.classList.remove('armed')}},3500);return false}

/* ---------- header & nav ---------- */
function renderHeader(){
  const fx=S.fx;
  $('#fxrate').textContent=fx?('1 USD = '+num(fx.rate).toFixed(4)):'Set rate';
  $('#fxdate').textContent=fx?('CAD · '+fmtDate(fx.asOf)):'USD → CAD';
}
function renderBadges(){
  const open=S.sales.filter(s=>ST(s)==='open').length,unpaid=S.sales.filter(s=>ST(s)==='completed'&&!isPaid(s)).length;
  const set=(tab,n,cls)=>{const a=document.querySelector(`nav.tabs a[data-tab="${tab}"]`);let b=a.querySelector('.badge');if(!n){b&&b.remove();return}if(!b){b=document.createElement('span');a.appendChild(b)}b.className='badge '+cls;b.textContent=n>99?'99+':n};
  set('sales',open,'teal');set('unpaid',unpaid,'');
}

/* ---------- shared bits ---------- */
const kpiVal=v=>typeof v==='string'&&/^−?(CA)?\$\d{1,3}(,\d{3})+\.\d\d$/.test(v)?v.slice(0,-3):v;
const kpi=(l,v,cls='',sub='')=>`<div class="kpi ${cls}"><span>${l}</span><b title="${esc(v)}">${kpiVal(v)}</b>${sub?`<i>${sub}</i>`:''}</div>`;
const tile=(k,l,v,cls='',sub='')=>`<button class="kpi ${cls}" data-act="explain" data-k="${k}" aria-label="${esc(l)}: ${esc(v)}. Tap for how this is worked out"><span>${l}</span><b>${kpiVal(v)}</b>${sub?`<i>${sub}</i>`:''}</button>`;
const empty=(t,p)=>`<div class="empty"><b>${t}</b><p>${p}</p></div>`;
const chev=`<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>`;
const banner=()=>S.dbErr?`<div class="banner">${esc(S.dbErr)}</div>`:(!ready()?`<div class="note">Loading your records…</div>`:(writeErr?`<div class="banner">Some changes haven’t saved yet. Check your connection.</div>`:''));
const salePill=s=>{const st=ST(s);if(st==='open')return'<span class="pill open">Open</span>';if(st==='cancelled')return'<span class="pill cancelled">Cancelled</span>';return isPaid(s)?'<span class="pill paid">Paid</span>':'<span class="pill unpaid">Unpaid</span>'};

/* ---------- Purchases ---------- */
function vPurchases(){
  const list=[...S.purchases].sort(byDateDesc);
  const total=sum(list,p=>p.totalCAD),units=sum(list,p=>sum(p.items||[],i=>i.units));
  return `${banner()}
  <div class="head"><div><h1>Purchases</h1><p>USD converts to CAD at the rate saved on each order. BAC water is logged in CAD.</p></div>
  <button class="btn primary" data-act="new-purchase">+ New purchase</button></div>
  <div class="kpis">${kpi('Spent (CAD)',cad(total),'hl')}${kpi('Orders',list.length)}${kpi('Units in',units)}</div>
  <div class="list">${list.length?list.map(cardPurchase).join(''):empty('No purchases logged yet','Tap New purchase to log an order. Choose Kit for 10 vials or Single for one item.')}</div>`;
}
function cardPurchase(p){
  const items=p.items||[],units=sum(items,i=>i.units);
  const names=items.map(i=>i.name).slice(0,3).join(', ')+(items.length>3?` +${items.length-3} more`:'');
  return `<details class="card"><summary>
    <div class="sum-main"><b>${esc(fmtDate(p.date))}${p.supplier?' · '+esc(p.supplier):''}</b><small>${esc(names)||'Shipping only'}</small></div>
    <div class="sum-amt">${cad(p.totalCAD)}<small>${units} units</small></div>${chev}</summary>
    <div class="detail"><div class="lines">
    ${items.map(i=>`<div class="line"><div>${esc(i.name)}<small>${i.mode==='kit'?`${i.qty} kit${i.qty==1?'':'s'} · ${i.units} vials`:`${i.qty} single${i.qty==1?'':'s'}`} @ ${cur(num(i.unitCost),i.currency)}${i.mode==='kit'?'/kit':''}</small></div><div class="money">${cad(i.lineCAD)}<small style="text-align:right">${cad(num(i.landedCAD)/(num(i.units)||1))}/unit landed</small></div></div>`).join('')}
    ${num(p.shipping)?`<div class="line"><div>Shipping<small>${cur(num(p.shipping),p.shippingCurrency)}</small></div><div class="money">${cad(p.shippingCAD)}</div></div>`:''}
    </div>
    <div class="sub"><label>Date <input class="dateedit" type="date" data-editdate="purchases" data-id="${esc(p.id)}" value="${esc(p.date)}"></label></div>
    <div class="sub"><span>${items.some(i=>i.currency==='USD')||p.shippingCurrency==='USD'?`Rate 1 USD = ${num(p.fxRate).toFixed(4)} CAD`:'Paid in CAD'}${p.note?' · '+esc(p.note):''}</span>
    <button class="btn danger" data-act="del" data-col="purchases" data-id="${esc(p.id)}">Delete</button></div></div></details>`;
}

/* ---------- Sales ---------- */
function customers(filter){
  const map=new Map();
  S.sales.filter(filter).forEach(s=>{const n=String(s.customer||'Walk-in').trim()||'Walk-in',k=n.toLowerCase();if(!map.has(k))map.set(k,{name:n,sales:[]});map.get(k).sales.push(s)});
  const arr=[...map.values()];
  arr.forEach(c=>{c.sales.sort(byDateDesc);c.paid=sum(c.sales.filter(s=>ST(s)==='completed'&&isPaid(s)),s=>s.total);c.owed=sum(c.sales.filter(s=>ST(s)==='completed'&&!isPaid(s)),s=>s.total);c.last=c.sales[0]?.date||''});
  return arr.sort((a,b)=>String(b.last).localeCompare(String(a.last)));
}
function vSales(){
  const F=finance(),opens=[...F.open].sort(byDateDesc);
  return `${banner()}
  <div class="head"><div><h1>Sales</h1><p>Open orders hold stock until pickup. Finished sales stay unpaid until you mark them paid.</p></div>
  <button class="btn primary" data-act="new-sale">+ New sale</button></div>
  <div class="kpis">${kpi('Paid sales',cad(F.revenue),'hl')}${kpi('Owed to you',cad(F.owed))}${kpi('Open orders',opens.length)}</div>
  ${opens.length?`<h2>Open orders · waiting for pickup</h2><div class="list">${opens.map(cardOpen).join('')}</div>`:''}
  <h2>Customers</h2>
  <div class="toolbar"><input class="search" id="salesQ" type="search" placeholder="Search customers" value="${esc(S.salesQ)}" aria-label="Search customers"></div>
  <div class="list" id="sales-list">${salesList()}</div>`;
}
function cardOpen(s){
  const units=sum(s.items||[],i=>i.qty);
  const sh=shortages(saleLines(s),s.id);
  return `<div class="order-wrap ${sh.length?'waiting':''}"><button class="order" data-act="edit-order" data-id="${esc(s.id)}"><div class="avatar">${esc(initials(s.customer))}</div>
    <div class="sum-main"><b>${esc(s.customer)}</b><small>${esc(fmtDate(s.date))} · ${esc(itemsSummary(s))}</small>
    <small>${sh.length?`<span class="pill unpaid">Waiting on stock</span> short ${esc(shortText(sh))}`:'<span class="pill paid">Ready for pickup</span>'}</small></div>
    <div class="sum-amt">${cad(s.total)}<small>${plural(units,'item')}</small></div>${chev}</button>
    <div class="order-acts"><button class="btn sm" data-act="doc" data-kind="order" data-id="${esc(s.id)}">Order confirmation (JPEG)</button></div></div>`;
}
function saleRow(s){
  const st=ST(s);
  let actions='';
  if(st==='completed'&&!isPaid(s))actions=`<button class="btn teal sm" data-act="pay" data-id="${esc(s.id)}">Mark as paid</button>`;
  else if(st==='completed')actions=`<span class="note">Paid ${esc(fmtDate(s.paidDate||s.date))}</span><button class="btn ghost sm" data-act="unpay" data-id="${esc(s.id)}">Mark unpaid</button>`;
  if(st==='completed')actions+=`<button class="btn sm" data-act="doc" data-kind="receipt" data-id="${esc(s.id)}">Receipt (JPEG)</button>`;
  return `<div class="sale"><div class="sale-h"><span>${esc(fmtDate(s.date))} ${salePill(s)}</span><span class="money">${cad(s.total)}</span></div>
    <div class="sale-items">${(s.items||[]).map(i=>`${i.qty} × ${esc(i.name)} @ ${cad(i.unitPrice)}`).join('<br>')}</div>
    <div class="sub"><span>${num(s.discountPct)?`${num(s.discountPct)}% off · saved ${cad(s.discount)}`:'No discount'}${s.note?' · '+esc(s.note):''}</span>
    <label>Date <input class="dateedit" type="date" data-editdate="sales" data-id="${esc(s.id)}" value="${esc(s.date)}"></label></div>
    <div class="sale-actions">${actions}<span style="flex:1"></span><button class="btn danger sm" data-act="del" data-col="sales" data-id="${esc(s.id)}">Delete</button></div></div>`;
}
function salesList(){
  const q=S.salesQ.trim().toLowerCase();
  const cs=customers(s=>ST(s)!=='open').filter(c=>!q||c.name.toLowerCase().includes(q));
  if(!cs.length)return S.sales.some(s=>ST(s)!=='open')?empty('No matching customers','Try another name.'):empty('No finished sales yet','Tap New sale. Save it as an open order until pickup, or finish it right away.');
  return cs.map(c=>`<details class="card"><summary><div class="avatar">${esc(initials(c.name))}</div>
    <div class="sum-main"><b>${esc(c.name)}</b><small>${plural(c.sales.length,'sale')} · last ${esc(fmtDate(c.last))}${c.owed?` · <span style="color:var(--bad);font-weight:700">owes ${cad(c.owed)}</span>`:''}</small></div>
    <div class="sum-amt">${cad(c.paid+c.owed)}</div>${chev}</summary>
    <div class="detail">${c.sales.map(saleRow).join('')}</div></details>`).join('');
}

/* ---------- Unpaid ---------- */
function vUnpaid(){
  const F=finance();const cs=customers(s=>ST(s)==='completed'&&!isPaid(s)).sort((a,b)=>b.owed-a.owed);
  return `${banner()}
  <div class="head"><div><h1>Unpaid</h1><p>Finished sales that haven’t been paid yet. Tap Mark as paid when the money comes in.</p></div></div>
  <div class="kpis">${kpi('Owed to you',cad(F.owed),'hl')}${kpi('Unpaid sales',F.unpaid.length)}${kpi('Customers',cs.length)}</div>
  <div class="list">${cs.length?cs.map(c=>`<div class="card"><div style="display:flex;gap:12px;align-items:center;padding:14px">
    <div class="avatar">${esc(initials(c.name))}</div><div class="sum-main"><b>${esc(c.name)}</b><small>${plural(c.sales.length,'unpaid sale')}</small></div>
    <div class="sum-amt" style="color:var(--bad)">${cad(c.owed)}</div></div>
    <div class="detail">${c.sales.map(saleRow).join('')}
    ${c.sales.length>1?`<div class="sale-actions"><button class="btn outline-red sm" data-act="pay-all" data-cust="${esc(c.name)}">Mark all ${c.sales.length} as paid</button></div>`:''}</div></div>`).join('')
    :empty('Nothing owed','Every finished sale has been paid. New sales show up here until you mark them paid.')}</div>`;
}

/* ---------- Inventory ---------- */
function vInventory(){
  const F=finance();
  const lowN=sortedProducts().filter(p=>{const s=F.st.get(p.id);return s.bought+s.adjIn>0&&s.available<=3}).length;
  return `${banner()}
  <div class="head"><div><h1>Inventory</h1><p>Stock on hand. Items in open orders show as pending until pickup.</p></div>
  <div class="row"><button class="btn" data-act="add-item">+ Item</button><button class="btn primary" data-act="adjust">Adjust stock</button></div></div>
  <div class="kpis">${kpi('Units on hand',F.unitsOnHand,'hl')}${kpi('Pending',F.pendingUnits,'',F.pendingUnits?'in open orders':'')}${kpi('Value at cost',cad(F.stockValue))}</div>
  <div class="toolbar"><input class="search" id="invQ" type="search" placeholder="Search items" value="${esc(S.invQ)}" aria-label="Search items">
  <div class="chips">${[['all','All'],['stock','In stock'],['low','Low / out'],['pending','Pending'],['short','Short / to order']].map(([k,l])=>`<button class="chip" data-act="invF" data-v="${k}" aria-pressed="${S.invF===k}">${l}</button>`).join('')}</div></div>
  <div class="inv" id="inv-list">${invList()}</div>
  ${lowN?`<div class="note">${plural(lowN,'item')} low or out of available stock.</div>`:''}
  ${adjLog()}`;
}
function invList(){
  const st=stats(),q=S.invQ.trim().toLowerCase();
  let ps=sortedProducts().filter(p=>!q||label(p).toLowerCase().includes(q));
  if(S.invF==='stock')ps=ps.filter(p=>st.get(p.id).available>0);
  if(S.invF==='low')ps=ps.filter(p=>st.get(p.id).available<=3);
  if(S.invF==='pending')ps=ps.filter(p=>st.get(p.id).pending>0);
  if(S.invF==='short')ps=ps.filter(p=>st.get(p.id).available<0);
  if(!ps.length)return S.products.length?empty('Nothing matches','Clear the search or filter.'):empty('No items yet','Add an item, or log a purchase and your stock appears here.');
  let last=null;
  return ps.map(p=>{
    const s=st.get(p.id),[k,l]=status(s.available),never=s.bought+s.adjIn===0;
    let h='';if(p.category!==last){last=p.category;h=`<h2>${p.category==='peptide'?'Peptides':p.category==='bac'?'Bacteriostatic water':'Supplies & other'}</h2>`}
    return h+`<button class="item" data-act="product" data-id="${esc(p.id)}">${photoOf(p)?`<img class="thumb" src="${photoOf(p)}" alt="">`:`<span class="cap" style="background:${capColor(p)}"></span>`}
      <div class="sum-main"><b>${esc(p.name)} <span style="color:var(--muted);font-weight:500">${esc(p.strength||'')}</span></b>
      <small>${s.avg?`${cad(s.avg)} cost`:'No cost yet'} · ${num(p.price)?`sells ${cad(p.price)}`:'no sale price'}${s.personal?` · ${s.personal} personal`:''}</small></div>
      <div class="stock"><b>${s.onHand}</b>${never?'<span class="pill neu">Not bought</span>':`<span class="pill ${k}">${l}</span>`}${s.pending?`<span class="pend" style="${s.available<0?'color:var(--bad)':''}">${s.pending} pending · ${s.available<0?`short ${-s.available}`:`${s.available} free`}</span>`:''}</div></button>`}).join('');
}
function adjLog(){
  const a=[...S.adjustments].sort(byDateDesc).slice(0,12);
  if(!a.length)return'';
  return `<h2>Recent stock adjustments</h2><div class="card"><div class="detail" style="border:0;background:var(--surface)"><div class="lines">${a.map(adjRow).join('')}</div></div></div>`;
}
const adjRow=a=>`<div class="line"><div>${esc(a.name||label(prod(a.productId)))}<small>${esc(fmtDate(a.date))} · ${esc(REASONS[a.reason]||a.reason)}${a.note?' · '+esc(a.note):''}</small></div>
  <div class="row" style="flex-wrap:nowrap"><b class="money" style="color:${num(a.qty)<0?'var(--bad)':'var(--good)'}">${num(a.qty)>0?'+':''}${num(a.qty)}</b><button class="btn danger sm" data-act="del" data-col="adjustments" data-id="${esc(a.id)}">Delete</button></div></div>`;

/* ---------- Financials ---------- */
function vFinancials(){
  const F=finance();
  const sign=v=>r2(v)<0?'neg':'';
  const mx=Math.max(1,...F.months.slice(0,12).map(m=>Math.max(m.r,m.e)));
  return `${banner()}
  <div class="head"><div><h1>Financials</h1><p>Tap any figure to see how it’s worked out.</p></div><span class="cadtag">All amounts in CAD</span></div>
  <button class="netcard ${sign(F.net)}" data-act="explain" data-k="net"><span>Net profit</span><b>${cad(F.net)}</b>
    <i>${F.revenue?`${pct(F.netMargin)} of paid sales · `:''}paid sales − cost of vials sold − stock used or lost</i></button>
  <div class="kpis k4">
    ${tile('revenue','Revenue',cad(F.revenue),'hl',F.discounts?`after ${cadS(F.discounts)} discounts`:'paid sales')}
    ${tile('cogs','Cost of goods sold',cad(F.cogs),'',`${plural(F.soldPaidUnits,'unit')} sold`)}
    ${tile('gross','Gross profit',cad(F.gross),sign(F.gross)?'neg':'','revenue − cost of goods')}
    ${tile('markup','Avg markup',pct(F.markup),'',`margin ${pct(F.margin)}`)}</div>
  <div class="kpis k4">
    ${tile('expenses','Expenses',cad(F.expenses),'',plural(S.purchases.length,'order'))}
    ${tile('cash','Cash position',cad(F.cash),sign(F.cash)?'neg':'','paid sales − expenses')}
    ${tile('owed','Owed to you',cad(F.owed),'',F.unpaid.length?plural(F.unpaid.length,'unpaid sale'):'all paid')}
    ${tile('stock','Stock at cost',cad(F.stockValue),'',plural(F.unitsOnHand,'unit'))}
  </div>
  <div class="kpis k4 two">
    ${tile('losses','Used or lost',cad(F.lossCost),'',plural(F.personalUnits+F.damagedUnits+F.recountUnits,'unit'))}
    ${tile('margin','Margin',pct(F.margin),'',`net ${pct(F.netMargin)}`)}
  </div>
  ${F.negUnits?`<div class="banner">${plural(F.negUnits,'unit')} more sold or pulled than bought. Check Inventory for items below zero.</div>`:''}
  <h2>Where the money went</h2>
  <div class="panel split"><div class="lines">
    <div class="line"><div>Peptides</div><div class="money">${cad(F.cat.peptide)}</div></div>
    <div class="line"><div>BAC water</div><div class="money">${cad(F.cat.bac)}</div></div>
    <div class="line"><div>Supplies & other</div><div class="money">${cad(F.cat.other)}</div></div>
    <div class="line"><div>Shipping</div><div class="money">${cad(F.shipping)}</div></div>
    <div class="line"><div><b>Total expenses</b></div><div class="money">${cad(F.expenses)}</div></div>
  </div></div>
  <h2>By month</h2>
  ${F.months.length?`<button class="panel" data-act="explain" data-k="months" style="text-align:left;font:inherit;color:inherit;cursor:pointer;width:100%">
  <div class="legend" style="margin-bottom:10px;flex-wrap:wrap"><span><i style="background:var(--teal)"></i>Paid sales</span><span><i style="background:var(--navy);opacity:.55"></i>Purchases</span><span>Net profit below each month · tap for details</span></div>
  <div class="months">${F.months.slice(0,12).map(m=>`<div class="month"><span>${fmtMonth(m.k)}</span><div class="bars">
  <div class="bar"><i class="r" style="width:${m.r/mx*70}%"></i>${cad(m.r)}</div>
  <div class="bar"><i class="e" style="width:${m.e/mx*70}%"></i>${cad(m.e)}</div>
  <div class="net ${r2(m.n)<0?'neg':'pos'}">Net ${cad(m.n)}</div></div></div>`).join('')}</div></button>`:empty('No activity yet','Monthly figures appear once you log purchases or paid sales.')}
  <h2>Markup by product</h2>
  ${F.rows.length?`<div class="tbl-wrap"><table><thead><tr><th>Item</th><th class="n">Bought</th><th class="n">Sold (paid)</th><th class="n">Avg cost</th><th class="n">Revenue</th><th class="n">Profit</th><th class="n">Markup</th></tr></thead><tbody>
  ${F.rows.map(({p,s,cogs,profit})=>`<tr><td>${esc(label(p))}</td><td class="n">${s.bought}</td><td class="n">${s.soldPaid}</td><td class="n">${cad(s.avg)}</td><td class="n">${cad(s.revPaid)}</td><td class="n ${r2(profit)>=0?'pos':'neg'}">${cad(profit)}</td><td class="n">${cogs?pct(profit/cogs*100):'—'}</td></tr>`).join('')}
  </tbody></table></div>`:empty('Nothing to compare yet','Per-product markup shows after your first purchase.')}
  <div class="foot">Research only · Not for human use</div>`;
}

/* ---------- explanations ---------- */
const ln=(op,l,v,res)=>`<div class="ln${res?' res':''}"><span><span class="op">${op}</span>${l}</span><b>${v}</b></div>`;
const inex=(yes,no)=>`<div class="inex"><div class="yes"><b>Included</b><ul>${yes.map(x=>`<li>${x}</li>`).join('')}</ul></div><div class="no"><b>Not included</b><ul>${no.map(x=>`<li>${x}</li>`).join('')}</ul></div></div>`;
function topRows(rows,f,n=6){return rows.filter(r=>f(r)>0.004).sort((a,b)=>f(b)-f(a)).slice(0,n)}
function explain(k){
  const F=finance();
  const T={
    net:['Net profit',`Net profit = Paid sales − Cost of the vials sold − Cost of stock used or lost`,
      ln('','Revenue (paid sales, after discounts)',cad(F.revenue))+ln('−','Cost of goods sold',cad(F.cogs))+ln('=','Gross profit',cad(F.gross),1)+
      ln('−',`Personal use (${plural(F.personalUnits,'unit')})`,cad(F.personalCost))+ln('−',`Damaged / lost (${plural(F.damagedUnits,'unit')})`,cad(F.damagedCost))+ln('−',`Recount corrections (${plural(F.recountUnits,'unit')})`,cad(F.recountCost))+
      ln('=','Net profit',cad(F.net),1),
      inex(['Sales you’ve marked paid','The landed cost of every vial sold, shipping included','Stock pulled for personal use, damaged or lost, at its cost'],
        ['Unpaid sales (they’re in Owed to you)','Open orders that haven’t been picked up','Stock still on your shelf: it’s money spent, but not a loss']),
      `<div class="note">Net profit counts a vial’s cost only when it’s sold or used. Cash position shows the money in vs. money out.${F.revenue?` Net profit is ${pct(F.netMargin)} of paid sales.`:''}</div>`],
    revenue:['Revenue',`Revenue = Total of all paid sales, after discounts`,
      ln('','Paid sales before discounts',cad(F.grossSales))+ln('−','Discounts given',cad(F.discounts))+ln('=',`Revenue (${plural(F.paid.length,'paid sale')})`,cad(F.revenue),1),
      inex(['Finished sales marked paid','Discounts already taken off'],[`Unpaid sales: ${cad(F.owed)} owed`,`Open orders: ${cad(F.openValue)}`,'Cancelled orders']),
      topRows(F.rows,r=>r.s.revPaid).length?`<h2>Top items by revenue</h2><div class="eq">${topRows(F.rows,r=>r.s.revPaid).map(r=>ln('',`${esc(label(r.p))} · ${r.s.soldPaid} sold`,cad(r.s.revPaid))).join('')}</div>`:''],
    cogs:['Cost of goods sold',`Cost of goods sold = Units sold (paid) × that item’s average cost per unit`,
      topRows(F.rows,r=>r.cogs,40).map(r=>ln('+',`${esc(label(r.p))}: ${r.s.soldPaid} × ${cad(r.s.avg)}`,cad(r.cogs))).join('')+ln('=','Cost of goods sold',cad(F.cogs),1),
      inex(['Each item’s average landed cost: purchase price converted to CAD at the order’s rate, plus its share of shipping','Only items in paid sales'],['Items in unpaid sales (their cost moves here once paid)','Personal use, damaged or lost stock (shown under Used or lost)']),
      `<div class="note">Average cost = everything you’ve paid for an item, shipping included ÷ the number of units bought.</div>`],
    gross:['Gross profit',`Gross profit = Revenue − Cost of goods sold`,
      ln('','Revenue (paid sales)',cad(F.revenue))+ln('−','Cost of goods sold',cad(F.cogs))+ln('=','Gross profit',cad(F.gross),1),
      inex(['Paid sales and the cost of what was sold in them'],['Stock used or lost (taken off in Net profit)','Unsold stock, unpaid sales and open orders']),''],
    markup:['Average markup',`Markup = Gross profit ÷ Cost of goods sold × 100`,
      ln('','Gross profit',cad(F.gross))+ln('÷','Cost of goods sold',cad(F.cogs))+ln('=','Markup',pct(F.markup),1),
      inex(['Paid sales only'],['Unpaid and open orders']),F.cogs?`<div class="note">For every CA$1.00 of stock cost you sell, you get back ${cad(F.revenue/F.cogs)}.</div>`:''],
    margin:['Margin',`Margin = Gross profit ÷ Revenue × 100`,
      ln('','Gross profit',cad(F.gross))+ln('÷','Revenue',cad(F.revenue))+ln('=','Gross margin',pct(F.margin),1)+ln('','Net margin (Net profit ÷ Revenue)',pct(F.netMargin)),
      inex(['Paid sales only'],['Unpaid and open orders']),`<div class="note">Margin is the share of each sale you keep after the vial’s cost. Markup compares profit to cost instead.</div>`],
    expenses:['Expenses',`Expenses = Every purchase order, in CAD, including shipping`,
      ln('','Peptides',cad(F.cat.peptide))+ln('+','BAC water',cad(F.cat.bac))+ln('+','Supplies & other',cad(F.cat.other))+ln('+','Shipping',cad(F.shipping))+ln('=',`Expenses (${plural(S.purchases.length,'order')})`,cad(F.expenses),1),
      inex([`USD amounts converted at the rate saved on each order (${plural(F.usdOrders,'order')} in USD)`,'CAD purchases like BAC water as paid','Shipping'],['Stock added by hand (it has no purchase cost)']),
      `<h2>Where that money is now</h2><div class="eq">${ln('','Sold and paid (cost of goods sold)',cad(F.cogs))+ln('+','Sold, waiting for payment',cad(F.unpaidCost))+ln('+','Used or lost',cad(F.lossCost))+ln('+','Still in stock',cad(F.stockValue))+
      (r2(F.addedValue)?ln('−','Stock added by hand, valued at average cost',cad(F.addedValue)):'')+ln('=','Accounted for',cad(F.cogs+F.unpaidCost+F.lossCost+F.stockValue-F.addedValue),1)}</div>
      ${Math.abs(r2(F.cogs+F.unpaidCost+F.lossCost+F.stockValue-F.addedValue-F.expenses))>0.01?`<div class="note">The small difference comes from items sold or pulled below zero stock.</div>`:''}`],
    cash:['Cash position',`Cash position = Money in from paid sales − Money spent on purchases`,
      ln('','Paid sales',cad(F.revenue))+ln('−','All purchases, shipping included',cad(F.expenses))+ln('=','Cash position',cad(F.cash),1),
      inex(['Money actually received','Every purchase order'],[`Unpaid sales: ${cad(F.owed)}`,'Open orders']),
      `<div class="note">This isn’t profit. If it’s negative, the money is tied up in stock on your shelf (${cad(F.stockValue)} at cost) and unpaid sales (${cad(F.owed)}).</div>`],
    owed:['Owed to you',`Owed to you = Total of finished sales not yet marked paid`,
      customers(s=>ST(s)==='completed'&&!isPaid(s)).sort((a,b)=>b.owed-a.owed).map(c=>ln('+',`${esc(c.name)} · ${plural(c.sales.length,'sale')}`,cad(c.owed))).join('')+ln('=','Owed to you',cad(F.owed),1),
      inex(['Finished sales marked unpaid'],['Open orders (not finished yet)','Paid sales']),
      `<div class="note">These sales count in Revenue once they’re marked paid. The cost of the vials in them is ${cad(F.unpaidCost)}.</div>`],
    stock:['Stock at cost',`Stock at cost = Units on hand × each item’s average cost`,
      topRows(F.rows,r=>Math.max(0,r.s.onHand)*r.s.avg,40).map(r=>ln('+',`${esc(label(r.p))}: ${r.s.onHand} × ${cad(r.s.avg)}`,cad(Math.max(0,r.s.onHand)*r.s.avg))).join('')+ln('=','Stock at cost',cad(F.stockValue),1),
      inex(['Everything on your shelf, including items set aside for open orders','Shipping, as part of each unit’s cost'],['Items in finished sales','Anything below zero']),''],
    losses:['Used or lost',`Used or lost = Units pulled from stock × each item’s average cost`,
      ln('',`Personal use · ${plural(F.personalUnits,'unit')}`,cad(F.personalCost))+ln('+',`Damaged / lost · ${plural(F.damagedUnits,'unit')}`,cad(F.damagedCost))+ln('+',`Recount corrections down · ${plural(F.recountUnits,'unit')}`,cad(F.recountCost))+ln('=','Used or lost',cad(F.lossCost),1),
      inex(['Every “pull from stock” for personal use, damage, loss or a recount down'],['Stock added back in','Sales']),
      `<div class="note">This cost is taken off in Net profit.</div>`],
    months:['By month',`Each month: Paid sales (in the month they were paid) − cost of the vials in them − stock used or lost that month = Net profit`,
      F.months.slice(0,12).map(m=>`<div class="ln"><span><b>${fmtMonth(m.k)}</b><br><small class="note">Paid ${cad(m.r)} − cost ${cad(m.c)} − used/lost ${cad(m.l)} · purchases ${cad(m.e)}</small></span><b style="color:${r2(m.n)<0?'var(--bad)':'var(--good)'}">${cad(m.n)}</b></div>`).join(''),
      inex(['Sales by the date they were marked paid','Purchases by order date (shown for reference)'],['Unpaid sales and open orders']),
      `<div class="note">Purchases are shown beside each month so you can see spending, but they aren’t taken off Net profit. Only the vials actually sold or used are.</div>`]
  };
  const t=T[k];if(!t)return;
  openSheet(t[0],()=>{body().innerHTML=`<span class="cadtag">All amounts in CAD</span><div class="formula">${t[1]}</div><h2>With your numbers</h2><div class="eq">${t[2]}</div>${t[3]}${t[4]||''}`});
}

/* ---------- render & routing ---------- */
function render(){
  if(!ready()&&!S.dbErr){$('#view').innerHTML=`<div class="empty"><b>Loading your records…</b><p>Getting everything from your Nova database.</p></div>`;renderBadges();return}
  $('#view').innerHTML=({sales:vSales,unpaid:vUnpaid,inventory:vInventory,financials:vFinancials}[S.tab]||vPurchases)();
  document.querySelectorAll('nav.tabs a').forEach(a=>a.setAttribute('aria-current',a.dataset.tab===S.tab?'page':'false'));
  renderBadges();
  if(!$('#sheet').hidden&&SHEET.refresh)SHEET.refresh();
}
function route(){const h=location.hash.slice(1);S.tab=TABS.includes(h)?h:'purchases';render();window.scrollTo(0,0)}

/* ---------- sheet ---------- */
const SHEET={refresh:null};
function openSheet(title,fn,opts={}){$('#sheet-title').textContent=title;SHEET.refresh=opts.liveRefresh?fn:null;$('#sheet').hidden=false;document.body.style.overflow='hidden';fn();$('#sheet').scrollTop=0}
function closeSheet(){$('#sheet').hidden=true;document.body.style.overflow='';SHEET.refresh=null;PF=null;SF=null;AF=null;NI=null;IMP=null;RS=null}
const body=()=>$('#sheet-body');

function productOptions(sel,{withNew=false,sale=null}={}){
  const st=sale?stats(sale.id):null;
  const groups={peptide:'Peptides',bac:'BAC water',other:'Supplies & other'};
  let h=`<option value="">Choose an item…</option>`;
  for(const c of ['peptide','bac','other']){
    let ps=sortedProducts().filter(p=>(p.category||'peptide')===c);
    if(!ps.length)continue;
    h+=`<optgroup label="${groups[c]}">${ps.map(p=>`<option value="${esc(p.id)}" ${p.id===sel?'selected':''}>${esc(label(p))}${sale?(v=>v>0?` — ${v} available`:` — ${v<0?0:v} available (back-order)`)(st.get(p.id).available-sum(sale.lines.filter(l=>l.pid===p.id),l=>l.qty)):''}</option>`).join('')}</optgroup>`;
  }
  if(withNew)h+=`<option value="__new">+ Add a new item…</option>`;
  return h;
}

/* new item mini form */
let NI=null;
function newItemForm(){
  return `<div class="newitem"><b style="font-family:var(--f-display)">New item</b>
  <div class="grid2"><label class="field"><span>Name</span><input id="ni-name" value="${esc(NI.name)}" placeholder="e.g. BPC-157" data-ni="name"></label>
  <label class="field"><span>Strength / size</span><input id="ni-str" value="${esc(NI.strength)}" placeholder="e.g. 10mg" data-ni="strength"></label></div>
  <div class="grid2"><label class="field"><span>Type</span><select id="ni-cat" data-ni="category">
    <option value="peptide" ${NI.category==='peptide'?'selected':''}>Peptide (kits of 10)</option>
    <option value="bac" ${NI.category==='bac'?'selected':''}>BAC water</option>
    <option value="other" ${NI.category==='other'?'selected':''}>Non-peptide item</option></select></label>
  <label class="field"><span>Sale price (CAD)</span><input id="ni-price" inputmode="decimal" value="${esc(NI.price)}" placeholder="0.00" data-ni="price"></label></div>
  <div class="ni-photo">${NI.photo?`<img class="thumb" src="${NI.photo}" alt="New item photo">`:`<span class="thumb empty-photo"><span class="cap" style="background:var(--teal)"></span></span>`}
    <label class="btn" for="ni-photo-in">${NI.photo?'Change photo':'Add photo'}</label><input id="ni-photo-in" type="file" accept="image/*" hidden>
    ${NI.photo?`<button class="btn ghost sm" data-act="ni-photo-x">Remove</button>`:'<span class="note">Optional · from your gallery or camera</span>'}</div>
  <div class="row"><button class="btn teal" data-act="ni-save">Save item</button><button class="btn ghost" data-act="ni-cancel">Cancel</button></div></div>`;
}
function saveNewItem(){
  const name=NI.name.trim();if(!name){toast('Give the item a name');return null}
  const caps={peptide:'teal',bac:'pink',other:'silver'};
  const id=slug(name+'-'+NI.strength)+'-'+Math.random().toString(36).slice(2,6);
  S.products.push({id,name,strength:NI.strength.trim(),category:NI.category,price:r2(num(NI.price)),cap:caps[NI.category]||'teal',createdAt:Date.now()});
  if(NI.photo)S.photos[id]=NI.photo;
  commit();toast('Item added');return id;
}

/* ---------- purchase form ---------- */
let PF=null;
function newLine(pid=''){const p=prod(pid);const c=p?.category||'peptide';return{pid,mode:c==='peptide'?'kit':'single',cur:c==='bac'?'CAD':'USD',qty:'1',cost:''}}
function calcPF(){
  const fx=num(PF.fx)||0;
  const lines=PF.lines.map(l=>{const q=num(l.qty),c=num(l.cost);const units=Math.round(q*(l.mode==='kit'?KIT:1)*1000)/1000;const cad=q*c*(l.cur==='USD'?fx:1);return{...l,units,cad}});
  const shipCAD=num(PF.ship)*(PF.shipCur==='USD'?fx:1),items=sum(lines,l=>l.cad);
  lines.forEach(l=>l.landed=l.cad+(items?shipCAD*l.cad/items:(lines.length?shipCAD/lines.length:0)));
  return{lines,shipCAD,items,total:items+shipCAD};
}
function openPurchase(){PF={date:today(),supplier:'',fx:S.fx?String(S.fx.rate):'1.40',lines:[newLine()],ship:'',shipCur:'USD',note:''};openSheet('New purchase',renderPF)}
function renderPF(){
  const c=calcPF(),usesUSD=PF.lines.some(l=>l.cur==='USD')||PF.shipCur==='USD';
  body().innerHTML=`
  <div class="grid2"><label class="field"><span>Date</span><input type="date" id="pf-date" data-pf="date" value="${esc(PF.date)}"></label>
  <label class="field"><span>Supplier (optional)</span><input id="pf-sup" data-pf="supplier" value="${esc(PF.supplier)}" placeholder="Supplier"></label></div>
  <label class="field"><span>Exchange rate for this order · 1 USD =</span><input id="pf-fx" data-pf="fx" inputmode="decimal" value="${esc(PF.fx)}"></label>
  <div class="note">${S.fx?`Today’s rate ${num(S.fx.rate).toFixed(4)} (as of ${esc(fmtDate(S.fx.asOf))}) is filled in. Change it if your card charged a different rate. It stays locked to this order.`:'Enter the USD → CAD rate for this order.'}</div>
  <h2>Items</h2>
  ${PF.lines.map((l,i)=>{const p=prod(l.pid),cl=c.lines[i];
    if(NI&&NI.line===i)return newItemForm();
    return `<div class="lineform">
    <div class="top-row"><select class="inp" id="pf-pid-${i}" data-pfl="pid" data-i="${i}" aria-label="Item">${productOptions(l.pid,{withNew:true})}</select>
    ${PF.lines.length>1?`<button class="x" data-act="pf-rm" data-i="${i}" aria-label="Remove line">×</button>`:''}</div>
    <div class="opts">
      <div class="seg" role="group" aria-label="Kit or single">${['kit','single'].map(v=>`<button data-act="pf-set" data-k="mode" data-v="${v}" data-i="${i}" aria-pressed="${l.mode===v}">${v==='kit'?'Kit (10)':'Single'}</button>`).join('')}</div>
      <div class="seg" role="group" aria-label="Currency">${['USD','CAD'].map(v=>`<button data-act="pf-set" data-k="cur" data-v="${v}" data-i="${i}" aria-pressed="${l.cur===v}">${v}</button>`).join('')}</div>
    </div>
    <div class="grid2"><label class="field"><span>Qty (${l.mode==='kit'?'kits':'units'})</span><input id="pf-qty-${i}" data-pfl="qty" data-i="${i}" inputmode="decimal" value="${esc(l.qty)}"></label>
    <label class="field"><span>Cost per ${l.mode==='kit'?'kit':'unit'} (${l.cur})</span><input id="pf-cost-${i}" data-pfl="cost" data-i="${i}" inputmode="decimal" value="${esc(l.cost)}" placeholder="0.00"></label></div>
    <div class="calc" data-calc="${i}">${calcText(cl,p)}</div></div>`}).join('')}
  <button class="btn" data-act="pf-add">+ Add another item</button>
  <h2>Shipping</h2>
  <div class="lineform"><div class="opts" style="align-items:end">
    <label class="field" style="flex:1"><span>Shipping cost</span><input id="pf-ship" data-pf="ship" inputmode="decimal" value="${esc(PF.ship)}" placeholder="0.00"></label>
    <div class="seg" role="group" aria-label="Shipping currency">${['USD','CAD'].map(v=>`<button data-act="pf-shipcur" data-v="${v}" aria-pressed="${PF.shipCur===v}">${v}</button>`).join('')}</div></div>
    <div class="note">Shipping is spread across the items by value, so each vial’s cost includes its share.</div></div>
  <label class="field"><span>Note (optional)</span><input id="pf-note" data-pf="note" value="${esc(PF.note)}"></label>
  <div class="totals" id="pf-totals">${pfTotals(c,usesUSD)}</div>
  <button class="btn primary block" data-act="pf-save">Save purchase</button>`;
}
function calcText(cl,p){return `<span>${cl.units?plural(cl.units,unitWord(p)):'—'}${cl.units&&cl.landed?` · ${cad(cl.landed/cl.units)}/${unitWord(p)} landed`:''}</span><b>${cad(cl.cad)}</b>`}
function pfTotals(c,usesUSD){return `<div class="line"><span>Items</span><b class="money">${cad(c.items)}</b></div>
  <div class="line"><span>Shipping</span><b class="money">${cad(c.shipCAD)}</b></div>
  <div class="line grand"><span>Total (CAD)</span><span class="money">${cad(c.total)}</span></div>${usesUSD?`<div class="note">USD converted at ${num(PF.fx).toFixed(4)}</div>`:''}`}
function updatePF(){const c=calcPF();c.lines.forEach((cl,i)=>{const el=document.querySelector(`[data-calc="${i}"]`);if(el)el.innerHTML=calcText(cl,prod(cl.pid))});$('#pf-totals').innerHTML=pfTotals(c,PF.lines.some(l=>l.cur==='USD')||PF.shipCur==='USD')}
function buildPurchase({date,supplier,note,fx,lines,ship,shipCur}){
  // lines: [{pid,mode,cur,qty,cost,units?,lineCAD?,landedCAD?}]
  const L=lines.map(l=>{const q=num(l.qty),c=num(l.cost);const units=l.units!=null&&l.units!==''?num(l.units):Math.round(q*(l.mode==='kit'?KIT:1)*1000)/1000;
    const lineCAD=l.lineCAD!=null&&l.lineCAD!==''?num(l.lineCAD):q*c*(l.cur==='USD'?num(fx):1);return{...l,q,c,units,lineCAD}});
  const shipCAD=num(ship.cad!=null&&ship.cad!==''?ship.cad:num(ship.amt)*(shipCur==='USD'?num(fx):1));
  const items=sum(L,l=>l.lineCAD);
  return{date:date||today(),supplier:supplier||'',note:note||'',fxRate:num(fx),
    items:L.map(l=>{const p=prod(l.pid);const landed=l.landedCAD!=null&&l.landedCAD!==''?num(l.landedCAD):l.lineCAD+(items?shipCAD*l.lineCAD/items:(L.length?shipCAD/L.length:0));
      return{productId:l.pid,name:label(p),category:p?.category||'peptide',mode:l.mode,currency:l.cur,qty:l.q,unitCost:r2(l.c),units:l.units,lineCAD:r2(l.lineCAD),landedCAD:r2(landed)}}),
    shipping:r2(num(ship.amt)),shippingCurrency:shipCur,shippingCAD:r2(shipCAD),itemsCAD:r2(items),totalCAD:r2(items+shipCAD),createdAt:Date.now()};
}
function savePF(){
  const c=calcPF(),lines=c.lines.filter(l=>l.pid&&num(l.qty)>0);
  if(!lines.length&&!c.shipCAD)return toast('Add at least one item');
  if(lines.some(l=>l.cost===''))return toast('Enter a cost for each item');
  if((lines.some(l=>l.cur==='USD')||(PF.shipCur==='USD'&&c.shipCAD))&&!(num(PF.fx)>0))return toast('Enter the exchange rate');
  const doc=buildPurchase({date:PF.date,supplier:PF.supplier.trim(),note:PF.note.trim(),fx:PF.fx,lines,ship:{amt:PF.ship},shipCur:PF.shipCur});
  S.purchases.push({id:uid(),...doc});commit();toast('Purchase saved');closeSheet();
}

/* ---------- sale form ---------- */
let SF=null;
function openSale(id){
  const s=id?S.sales.find(x=>x.id===id):null;
  SF=s?{id:s.id,customer:s.customer,date:s.date,pick:'',qty:'1',price:'',lines:(s.items||[]).map(i=>({pid:i.productId,qty:String(i.qty),price:String(i.unitPrice)})),discount:String(num(s.discountPct)),note:s.note||'',createdAt:s.createdAt}
     :{id:null,customer:'',date:today(),pick:'',qty:'1',price:'',lines:[],discount:'0',note:''};
  openSheet(s?'Open order':'New sale',renderSF);
}
function sfCalc(){const sub=sum(SF.lines,l=>num(l.qty)*num(l.price));const d=Math.min(100,Math.max(0,num(SF.discount)));const disc=sub*d/100;return{sub,d,disc,total:sub-disc,count:sum(SF.lines,l=>l.qty)}}
function sfAvail(pid){return stats(SF.id).get(pid).available-sum(SF.lines.filter(l=>l.pid===pid),l=>l.qty)}
function renderSF(){
  SF.koOk=false;
  const c=sfCalc(),pp=prod(SF.pick),left=pp?sfAvail(pp.id):0,st=stats(SF.id);
  const names=[...new Set(S.sales.map(s=>String(s.customer||'').trim()).filter(Boolean))].sort();
  const anyStock=sortedProducts().some(p=>st.get(p.id).available>0);
  body().innerHTML=`
  ${SF.id?`<div class="note"><span class="pill open">Open order</span> These items are set aside as pending. Finish the sale at pickup, or cancel to put them back in stock.</div>`:''}
  <div class="grid2"><label class="field"><span>Customer</span><input id="sf-cust" data-sf="customer" list="custlist" value="${esc(SF.customer)}" placeholder="Customer name" autocomplete="off"></label>
  <label class="field"><span>Date</span><input type="date" id="sf-date" data-sf="date" value="${esc(SF.date)}"></label></div>
  <datalist id="custlist">${names.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
  <h2>Add items</h2>
  <div class="lineform">
    <div class="pick-row">${photoOf(pp)?`<img class="thumb" src="${photoOf(pp)}" alt="">`:''}<select class="inp" id="sf-pick" data-sf="pick" aria-label="Item">${productOptions(SF.pick,{sale:SF})}</select></div>
    <div class="grid2"><label class="field"><span>Qty (${unitWord(pp)}s)</span><input id="sf-qty" data-sf="qty" inputmode="numeric" value="${esc(SF.qty)}"></label>
    <label class="field"><span>Price each (CAD)</span><input id="sf-price" data-sf="price" inputmode="decimal" value="${esc(SF.price)}" placeholder="0.00"></label></div>
    ${pp?`<div class="${num(SF.qty)>left?'warn':'note'}">${Math.max(0,left)} available${st.get(pp.id).pending?` · ${st.get(pp.id).pending} pending in other open orders`:''}${num(SF.qty)>left?` · you can still add it as a back-order`:''}</div>`:''}
    <button class="btn teal" data-act="sf-add" ${SF.pick?'':'disabled'}>Add to sale</button>
  </div>
  ${!anyStock&&!SF.lines.length?`<div class="note">Nothing is in stock right now. You can still start an open order — it can be finished once the stock comes in.</div>`:''}
  <h2>This sale</h2>
  <div class="panel">${SF.lines.length?SF.lines.map((l,i)=>`<div class="cart-line"><div class="cart-name">${photoOf(prod(l.pid))?`<img class="thumb sm" src="${photoOf(prod(l.pid))}" alt="">`:''}<div><b>${esc(label(prod(l.pid)))}</b><small>${cad(num(l.qty)*num(l.price))}</small></div></div>
    <input class="inp" id="sf-lq-${i}" data-sfl="qty" data-i="${i}" inputmode="numeric" value="${esc(l.qty)}" aria-label="Quantity">
    <input class="inp" id="sf-lp-${i}" data-sfl="price" data-i="${i}" inputmode="decimal" value="${esc(l.price)}" aria-label="Price each">
    <button class="x" data-act="sf-rm" data-i="${i}" aria-label="Remove">×</button></div>`).join(''):`<div class="note">No items yet. Pick from the list above — add as many as you like.</div>`}</div>
  <label class="field"><span>Discount % (type any amount)</span><input id="sf-disc" data-sf="discount" inputmode="decimal" value="${esc(SF.discount)}"></label>
  <div class="chips">${[[0,'No discount'],[20,'20% · 10-vial deal']].map(([v,l])=>`<button class="chip" data-act="sf-disc" data-v="${v}" aria-pressed="${num(SF.discount)===v}">${l}</button>`).join('')}</div>
  <label class="field"><span>Note (optional)</span><input id="sf-note" data-sf="note" value="${esc(SF.note)}"></label>
  <div class="totals" id="sf-totals">${sfTotals(c)}</div>
  ${(sh=>sh.length?`<div class="warnbox"><b>Can’t finish yet</b><div>Short ${esc(shortText(sh))}. Save it as an open order, then finish it once you log a purchase or adjust stock.</div></div>`:'')(shortages(SF.lines,SF.id))}
  <div class="note">Finished sales stay <b>unpaid</b> until you tap Mark as paid.</div>
  <div class="grid2"><button class="btn block" data-act="sf-open">${SF.id?'Save changes':'Save as open order'}</button>
  <button class="btn primary block" data-act="sf-finish">Finish sale</button></div>
  ${SF.id?`<button class="btn block" data-act="doc" data-kind="order" data-id="${esc(SF.id)}">Order confirmation (JPEG)</button><div class="note">The confirmation uses the order as last saved. Save changes first if you’ve edited it.</div>
  <button class="btn outline-red block" data-act="sf-cancel">Cancel order · put items back in stock</button>`:''}`;
}
function sfTotals(c){return `<div class="line"><span>Subtotal · ${plural(c.count,'item')}</span><b class="money">${cad(c.sub)}</b></div>
 ${c.d?`<div class="line"><span>Discount ${pct(c.d)}</span><b class="money">−${cad(c.disc)}</b></div>`:''}
 <div class="line grand"><span>Total (CAD)</span><span class="money">${cad(c.total)}</span></div>`}
function saveSF(mode){
  if(!SF.customer.trim())return toast('Enter the customer’s name');
  const lines=SF.lines.filter(l=>num(l.qty)>0);
  if(!lines.length)return toast('Add at least one item');
  const finish=mode==='finish';
  if(finish){const sh=shortages(lines,SF.id);if(sh.length)return toast(`Can’t finish yet: short ${shortText(sh)}. Log a purchase or adjust stock first.`);
    const ko=knockOn(lines,SF.id);if(ko.length&&!SF.koOk){SF.koOk=true;const b=document.querySelector('[data-act="sf-finish"]');if(b){b.textContent='Tap again to finish';b.classList.add('armed')}
      return toast(`Finishing this leaves ${ko.map(k=>`${k.cust}’s order short ${k.short} × ${label(prod(k.pid))}`).join('; ')}`)}}
  const c=sfCalc();
  const prev=SF.id?S.sales.find(x=>x.id===SF.id):null;
  const doc={id:SF.id||uid(),customer:SF.customer.trim(),date:SF.date||today(),note:SF.note.trim(),
    items:lines.map(l=>({productId:l.pid,name:label(prod(l.pid)),qty:num(l.qty),unitPrice:r2(num(l.price))})),
    subtotal:r2(c.sub),discountPct:c.d,discount:r2(c.disc),total:r2(c.sub-c.disc),
    status:finish?'completed':'open',paid:false,paidDate:null,completedDate:finish?today():null,createdAt:prev?.createdAt||Date.now()};
  if(prev)Object.assign(prev,doc);else S.sales.push(doc);
  commit();afterSave(doc,finish);
}

/* ---------- product / adjust ---------- */
let AF=null;
function openAdjust(pid=''){AF={pid,dir:'out',qty:'1',reason:'personal',date:today(),note:'',edit:null};openSheet(pid?label(prod(pid)):'Adjust stock',renderAF,{liveRefresh:true})}
function renderAF(){
  const st=stats(),p=prod(AF.pid),s=p?st.get(p.id):null;
  if(p&&!AF.edit)AF.edit={name:p.name,strength:p.strength||'',price:String(p.price??''),category:p.category||'peptide'};
  const reasons=AF.dir==='out'?['personal','damaged','recount']:['returned','added','recount'];
  if(!reasons.includes(AF.reason))AF.reason=reasons[0];
  const hist=p?S.adjustments.filter(a=>a.productId===p.id).sort(byDateDesc):[];
  const holds=p?S.sales.filter(x=>ST(x)==='open'&&(x.items||[]).some(i=>i.productId===p.id)):[];
  body().innerHTML=`
  ${p?(photoOf(p)?`<img class="hero-vial" src="${photoOf(p)}" alt="${esc(label(p))} vial">`:`<div class="hero-vial empty-photo"><span class="cap" style="background:${capColor(p)}"></span><span>No photo yet</span></div>`):''}
  ${p?`<div class="kpis">${kpi('On hand',s.onHand,'hl')}${kpi('Pending',s.pending)}${kpi('Available',s.available)}</div>
  <div class="kpis">${kpi('Avg cost',s.avg?cad(s.avg):'—')}${kpi('Sold',s.sold)}${kpi('Used / lost',s.personal+s.damaged+s.recount)}</div>
  ${holds.length?`<div class="note">Set aside for: ${holds.map(h=>`${esc(h.customer)} (${sum((h.items||[]).filter(i=>i.productId===p.id),i=>i.qty)})`).join(', ')}</div>`:''}`:
  `<label class="field"><span>Item</span><select id="af-pid" data-af="pid">${productOptions(AF.pid)}</select></label>`}
  <h2>${AF.dir==='out'?'Pull from stock':'Add to stock'}</h2>
  <div class="lineform">
    <div class="seg" role="group" aria-label="Direction">${[['out','Pull out'],['in','Add in']].map(([v,l])=>`<button data-act="af-dir" data-v="${v}" aria-pressed="${AF.dir===v}">${l}</button>`).join('')}</div>
    <div class="grid2"><label class="field"><span>Qty (${unitWord(p)}s)</span><input id="af-qty" data-af="qty" inputmode="numeric" value="${esc(AF.qty)}"></label>
    <label class="field"><span>Reason</span><select id="af-reason" data-af="reason">${reasons.map(r=>`<option value="${r}" ${AF.reason===r?'selected':''}>${REASONS[r]}</option>`).join('')}</select></label></div>
    <div class="grid2"><label class="field"><span>Date</span><input type="date" id="af-date" data-af="date" value="${esc(AF.date)}"></label>
    <label class="field"><span>Note</span><input id="af-note" data-af="note" value="${esc(AF.note)}" placeholder="Optional"></label></div>
    ${AF.dir==='in'?`<div class="note">Added stock carries no cost. To record stock you paid for, log a purchase instead.</div>`:`<div class="note">Pulled stock is counted at its average cost under Used or lost in Financials.</div>`}
    <button class="btn teal" data-act="af-save" ${AF.pid?'':'disabled'}>${AF.dir==='out'?'Pull':'Add'} ${num(AF.qty)||''} ${unitWord(p)}${num(AF.qty)==1?'':'s'}</button>
  </div>
  ${p?`<h2>Item details</h2><div class="lineform">
    <div class="grid2"><label class="field"><span>Name</span><input id="pe-name" data-pe="name" value="${esc(AF.edit.name)}"></label>
    <label class="field"><span>Strength / size</span><input id="pe-str" data-pe="strength" value="${esc(AF.edit.strength)}"></label></div>
    <div class="grid2"><label class="field"><span>Sale price (CAD)</span><input id="pe-price" data-pe="price" inputmode="decimal" value="${esc(AF.edit.price)}"></label>
    <label class="field"><span>Type</span><select id="pe-cat" data-pe="category">${Object.entries(CAT_LABEL).map(([v,l])=>`<option value="${v}" ${AF.edit.category===v?'selected':''}>${l}</option>`).join('')}</select></label></div>
    <div class="row"><label class="btn" for="pe-photo">${photoOf(p)?'Change photo':'Add photo'}</label><input id="pe-photo" type="file" accept="image/*" hidden>
    ${S.photos[p.id]?`<button class="btn ghost" data-act="pe-photo-reset">${(window.NOVA_PHOTOS||{})[p.id]?'Use original photo':'Remove photo'}</button>`:''}</div>
    <div class="row" style="justify-content:space-between"><button class="btn" data-act="pe-save">Save details</button>
    ${s.bought+s.sold+s.adjIn+s.adjOut+s.pending===0?`<button class="btn danger" data-act="del" data-col="products" data-id="${esc(p.id)}">Delete item</button>`:''}</div></div>
    ${hist.length?`<h2>Adjustments</h2><div class="panel"><div class="lines">${hist.map(adjRow).join('')}</div></div>`:''}`:''}`;
}
function saveAF(){
  const q=Math.round(num(AF.qty));if(!AF.pid)return toast('Choose an item');if(q<=0)return toast('Enter a quantity');
  S.adjustments.push({id:uid(),productId:AF.pid,name:label(prod(AF.pid)),qty:AF.dir==='out'?-q:q,reason:AF.reason,date:AF.date||today(),note:AF.note.trim(),createdAt:Date.now()});
  commit();toast(AF.dir==='out'?`Pulled ${q}`:`Added ${q}`);AF.qty='1';AF.note='';renderAF();
}
function savePE(){
  const e=AF.edit,p=prod(AF.pid);if(!e.name.trim())return toast('Name can’t be empty');
  Object.assign(p,{name:e.name.trim(),strength:e.strength.trim(),price:r2(num(e.price)),category:e.category});commit();toast('Item updated');
}
function rerenderNI(){if(PF&&NI&&NI.line>=0)renderPF();else if(NI)renderAddItem()}
function renderAddItem(){body().innerHTML=newItemForm()+`<div class="note">Peptides are bought in kits of 10. BAC water and non-peptide items are bought as singles. All items are kept in stock for resale and can be pulled for personal use.</div>`}
function openAddItem(){NI={line:-1,name:'',strength:'',category:'peptide',price:'',photo:null};openSheet('Add an item',renderAddItem)}

/* ---------- rate, backup, Excel, clear ---------- */
function openFx(){
  const f={rate:S.fx?String(S.fx.rate):'',asOf:today()};
  openSheet('Rate & backup',()=>{body().innerHTML=`
  <h2>Exchange rate</h2>
  <div class="note">${S.fx?`Current rate ${num(S.fx.rate).toFixed(4)} CAD per USD, as of ${esc(fmtDate(S.fx.asOf))}${S.fx.source?` (${esc(S.fx.source)})`:''}. ${S.fx.source==='manual'?'You set this rate yourself today.':'The live rate is fetched each time the app opens (it isn’t saved unless you save it below).'} New purchases start with this rate; past purchases keep the rate they were saved with.`:'No rate saved yet.'}</div>
  <label class="field"><span>Or set it yourself · 1 USD = ? CAD</span><input id="fx-rate" inputmode="decimal" value="${esc(f.rate)}"></label>
  <label class="field"><span>As of</span><input id="fx-date" type="date" value="${esc(f.asOf)}"></label>
  <button class="btn primary block" data-act="fx-save">Save rate</button>
  <h2>Excel</h2>
  <div class="backup">
  <div class="note">One workbook with sheets for purchases, sales, customers, inventory, stock adjustments, products and a financial summary. You can edit it and import it back.</div>
  <button class="btn" data-act="xlsx-export">Export to Excel (.xlsx)</button>
  <label class="btn" for="xlsxfile">Import from Excel…</label><input id="xlsxfile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
  </div>
  <h2>Backup</h2>
  <div class="backup">
  <div class="note">Your records are saved in your own Firebase database and kept on this phone for offline use. A backup file is still a good idea now and then, and it keeps photos you’ve added. Import a backup to restore it exactly.</div>
  <button class="btn" data-act="export">Export backup (.json)</button>
  <label class="btn" for="importfile">Import backup…</label><input id="importfile" type="file" accept="application/json,.json" hidden>
  </div>
  <h2>Account</h2>
  <div class="backup"><div class="note">Signed in as <b>${esc(window.NovaCloud?.user()?.email||'')}</b>.</div>
  <button class="btn" data-act="signout">Sign out</button></div>
  <h2>Danger zone</h2>
  <div class="danger-zone"><b>Clear purchases &amp; sales</b><div class="note" style="color:var(--fg)">Erases every purchase, sale and stock adjustment. Your products, prices and photos stay.</div>
  <button class="btn outline-red" data-act="clear-1">Clear purchases &amp; sales…</button></div>`});
}
function openClear(){
  openSheet('Clear purchases & sales',()=>{body().innerHTML=`
  <div class="warnbox"><b>This will permanently erase:</b><ul>
    <li>${plural(S.purchases.length,'purchase order')}</li>
    <li>${plural(S.sales.length,'sale')}, including open orders and customer history</li>
    <li>${plural(S.adjustments.length,'stock adjustment')}, including personal use</li></ul>
    <div>You’ll be back to <b>CA$0 revenue, CA$0 expenses and 0 inventory</b>. This can’t be undone.</div></div>
  <div class="okbox"><b>These stay:</b><ul><li>All ${S.products.length} products, with names, strengths and sale prices</li><li>All vial photos, including ones you added</li><li>Your exchange-rate setting</li></ul></div>
  <h2>Save a copy first</h2>
  <div class="grid2"><button class="btn" data-act="export">Export backup</button><button class="btn" data-act="xlsx-export">Export to Excel</button></div>
  <h2>Step 2 · Confirm</h2>
  <label class="field"><span>Type DELETE to confirm</span><input id="clear-confirm" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="DELETE"></label>
  <button class="btn red block" data-act="clear-2" id="clear-go" disabled>Erase purchases &amp; sales</button>
  <button class="btn ghost block" data-act="close">Cancel</button>`});
}
function doClear(){
  S.purchases=[];S.sales=[];S.adjustments=[];S.cleared=true;commit();closeSheet();toast('Purchases & sales cleared');
}

/* ---------- receipts & order confirmations (JPEG, made on the phone, read-only) ---------- */
const EMAIL='novapeptideresearchcanada@gmail.com';
const docNo=id=>{let h=5381;for(const ch of String(id))h=(Math.imul(h,33)^ch.charCodeAt(0))>>>0;return 'NPR-'+h.toString(36).toUpperCase().padStart(6,'0').slice(-6)};
const loadImg=src=>new Promise(r=>{if(!src)return r(null);const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=src});
function spaced(g,t,x,y,sp){for(const ch of t){g.fillText(ch,x,y);x+=g.measureText(ch).width+sp}}
function fitText(g,t,w){t=String(t??'');if(g.measureText(t).width<=w)return t;while(t.length&&g.measureText(t+'…').width>w)t=t.slice(0,-1);return t+'…'}
function rrect(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath()}
async function makeDoc(s,kind){
  const order=kind==='order';
  try{await Promise.all(['800 48px Montserrat','700 24px Montserrat','600 24px Montserrat','400 26px "Plus Jakarta Sans"','600 26px "Plus Jakarta Sans"','700 30px "Plus Jakarta Sans"'].map(f=>document.fonts.load(f)))}catch(e){}
  const items=s.items||[],W=1080,P=64,ROW=128;
  const short=order?Object.fromEntries(shortages(saleLines(s),s.id).map(x=>[x.pid,x.short])):{};
  const H=360+120+56+items.length*ROW+420+(s.note?120:0)+60;
  const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  const NAVY='#1b2a6b',TEAL='#0f9fb0',INK='#12204a',MUTED='#5d6b86',LINE='#d9e4ec',SOFT='#eef5f9',GOOD='#1a8a5a',BAD='#c23a3a',WARN='#b06d00';
  const MF='Montserrat, Arial, sans-serif',BF='"Plus Jakarta Sans", Arial, sans-serif',font=(w,px,f=BF)=>g.font=`${w} ${px}px ${f}`;
  const band=(y,h)=>{const gr=g.createLinearGradient(0,0,W,0);gr.addColorStop(0,NAVY);gr.addColorStop(1,TEAL);g.fillStyle=gr;g.fillRect(0,y,W,h)};
  g.fillStyle='#fff';g.fillRect(0,0,W,H);band(0,16);
  // letterhead
  let y=56,lx=P;const hx=await loadImg(window.NOVA_HELIX);
  if(hx){const h=150,w=hx.width*h/hx.height;g.drawImage(hx,P,y,w,h);lx=P+w+22}
  g.textBaseline='alphabetic';g.textAlign='left';
  font(800,46,MF);g.fillStyle=NAVY;g.fillText('NOVA',lx,y+64);const nw=g.measureText('NOVA ').width;g.fillStyle=TEAL;g.fillText('PEPTIDE',lx+nw,y+64);
  font(600,20,MF);g.fillStyle=MUTED;spaced(g,'RESEARCH',lx+2,y+100,10);
  font(500,22);g.fillStyle=MUTED;g.fillText(EMAIL,lx,y+140);
  g.textAlign='right';font(800,order?30:38,MF);g.fillStyle=INK;g.fillText(order?'ORDER CONFIRMATION':'RECEIPT',W-P,y+40);
  font(600,22);g.fillStyle=MUTED;g.fillText((order?'Order #':'Receipt #')+docNo(s.id),W-P,y+78);g.fillText(fmtDate(s.date),W-P,y+110);
  g.textAlign='left';
  y=244;g.fillStyle=NAVY;g.fillRect(P,y,W-2*P,4);g.fillStyle=TEAL;g.fillRect(P,y+4,Math.round((W-2*P)*0.32),4);
  // customer + status
  y+=58;font(700,18,MF);g.fillStyle=MUTED;spaced(g,order?'ORDER FOR':'SOLD TO',P,y,3);
  font(700,34);g.fillStyle=INK;g.fillText(fitText(g,s.customer||'Customer',520),P,y+44);
  const st=order?['AWAITING PICKUP',WARN]:(isPaid(s)?[`PAID · ${fmtDate(s.paidDate||s.date)}`,GOOD]:['UNPAID · BALANCE DUE',BAD]);
  font(800,22,MF);const pw=g.measureText(st[0]).width+44;g.fillStyle=st[1]+'1f';rrect(g,W-P-pw,y-10,pw,52,26);g.fill();g.fillStyle=st[1];g.textAlign='right';g.fillText(st[0],W-P-22,y+24);g.textAlign='left';
  // table
  y+=92;g.fillStyle=SOFT;rrect(g,P,y,W-2*P,56,12);g.fill();
  font(700,18,MF);g.fillStyle=MUTED;const cQ=640,cP=820,cT=W-P-20;
  spaced(g,'ITEM',P+20,y+36,2);g.textAlign='center';g.fillText('QTY',cQ,y+36);g.textAlign='right';g.fillText('PRICE',cP,y+36);g.fillText('TOTAL',cT,y+36);g.textAlign='left';
  y+=56;
  for(const it of items){const p=prod(it.productId);const ph=await loadImg(photoOf(p));const px=P+14,py=y+16,ps=96;
    g.save();rrect(g,px,py,ps,ps,14);g.clip();g.fillStyle='#fff';g.fillRect(px,py,ps,ps);
    if(ph){const sd=Math.min(ph.width,ph.height);g.drawImage(ph,(ph.width-sd)/2,(ph.height-sd)/2,sd,sd,px,py,ps,ps)}else{g.fillStyle=SOFT;g.fillRect(px,py,ps,ps);g.fillStyle=CAPS[p?.cap]||TEAL;g.beginPath();g.arc(px+ps/2,py+ps/2,22,0,7);g.fill()}
    g.restore();g.strokeStyle=LINE;g.lineWidth=2;rrect(g,px,py,ps,ps,14);g.stroke();
    const tx=px+ps+22;font(700,28);g.fillStyle=INK;g.fillText(fitText(g,p?p.name:String(it.name||'').replace(/ [^ ]+$/,''),cQ-60-tx),tx,y+56);
    font(500,22);g.fillStyle=MUTED;g.fillText(fitText(g,p?(p.strength||''):'',cQ-60-tx),tx,y+90);
    if(short[it.productId]){font(700,20);g.fillStyle=WARN;const t=`On order · ${short[it.productId]} not in stock yet`;g.fillText(fitText(g,t,cQ-40-tx),tx,y+118)}
    font(600,28);g.fillStyle=INK;g.textAlign='center';g.fillText(String(it.qty),cQ,y+66);g.textAlign='right';
    font(500,26);g.fillStyle=MUTED;g.fillText(cad(it.unitPrice),cP,y+66);font(700,28);g.fillStyle=INK;g.fillText(cad(num(it.qty)*num(it.unitPrice)),cT,y+66);g.textAlign='left';
    y+=ROW;g.fillStyle=LINE;g.fillRect(P,y-2,W-2*P,2);
  }
  // totals
  y+=36;const vials=sum(items,i=>i.qty),allPep=items.every(i=>(prod(i.productId)?.category||'peptide')==='peptide');
  font(600,24);g.fillStyle=MUTED;g.fillText(plural(vials,allPep?'vial':'item'),P,y+8);
  if(order){font(600,22);g.fillStyle=WARN;const msg=Object.keys(short).length?'Some items are on order. We’ll be in touch when they arrive.':'Ready for pickup.';
    const words=msg.split(' ');let ln2='',yy=y+48;for(const w of words){if(g.measureText(ln2+w).width>420){g.fillText(ln2.trim(),P,yy);yy+=30;ln2=''}ln2+=w+' '}g.fillText(ln2.trim(),P,yy)}
  const lx2=540,line=(l,v,opt={})=>{font(opt.vw||600,opt.px||26);const vw=g.measureText(v).width,room=W-P-20-vw-18-lx2;
    let px=opt.px||26;font(opt.w||500,px);while(g.measureText(l).width>room&&px>17){px--;font(opt.w||500,px)}
    g.fillStyle=opt.c||MUTED;g.fillText(l,lx2,y);g.textAlign='right';font(opt.vw||600,opt.px||26);g.fillStyle=opt.vc||INK;g.fillText(v,W-P-20,y);g.textAlign='left';y+=opt.gap||46};
  line('Subtotal',cad(s.subtotal));
  if(num(s.discountPct))line(num(s.discountPct)===20?'Discount 20% · 10-vial deal':`Discount ${pct(num(s.discountPct))}`,'−'+cad(s.discount),{vc:GOOD});
  y+=6;g.fillStyle=INK;g.fillRect(lx2,y-26,W-P-20-lx2,3);y+=22;
  line('Total (CAD)',cad(s.total),{w:800,vw:800,px:34,c:INK,gap:52});
  if(!order&&!isPaid(s))line('Balance due',cad(s.total),{c:BAD,vc:BAD,vw:800});
  font(500,20);g.fillStyle=MUTED;g.fillText('All amounts in Canadian dollars (CAD)',lx2,y);y+=30;
  if(s.note){y+=20;font(700,18,MF);g.fillStyle=MUTED;spaced(g,'NOTE',P,y,3);font(500,24);g.fillStyle=INK;g.fillText(fitText(g,s.note,W-2*P),P,y+36);y+=60}
  // trim to the content, then add the footer
  const H2=Math.max(y+40,900)+200,c2=document.createElement('canvas');c2.width=W;c2.height=H2;const g2=c2.getContext('2d');
  g2.fillStyle='#fff';g2.fillRect(0,0,W,H2);g2.drawImage(c,0,0,W,Math.min(H,H2-200),0,0,W,Math.min(H,H2-200));
  return footer(g2,W,H2,P,order,{NAVY,TEAL,MUTED,LINE,MF,BF});
}
function footer(g,W,H,P,order,{NAVY,TEAL,MUTED,LINE,MF,BF}){
  const font=(w,px,f=BF)=>g.font=`${w} ${px}px ${f}`;
  let y=H-170;g.fillStyle=LINE;g.fillRect(P,y,W-2*P,2);
  g.textAlign='center';font(700,28);g.fillStyle=NAVY;g.fillText(order?'Thank you for your order.':'Thank you for your business.',W/2,y+54);
  font(500,22);g.fillStyle=MUTED;g.fillText(`Questions? ${EMAIL}`,W/2,y+92);
  font(600,18,MF);g.fillStyle=MUTED;g.fillText('FOR RESEARCH PURPOSES ONLY · NOT FOR HUMAN USE',W/2,y+128);g.textAlign='left';
  const gr=g.createLinearGradient(0,0,W,0);gr.addColorStop(0,NAVY);gr.addColorStop(1,TEAL);g.fillStyle=gr;g.fillRect(0,H-16,W,16);
  return new Promise(r=>g.canvas.toBlob(r,'image/jpeg',0.92));
}
async function saveDoc(id,kind,btn){
  const s=S.sales.find(x=>x.id===id);if(!s)return;
  if(btn){btn.disabled=true}
  try{const blob=await makeDoc(s,kind);const nm=`Nova-${kind==='order'?'order':'receipt'}-${slug(s.customer||'customer')}-${s.date||today()}.jpg`;showDoc(blob,nm,kind)}
  catch(e){toast('Couldn’t make the image — try again')}
  finally{if(btn)btn.disabled=false}
}
function afterSave(doc,finish){
  const s=S.sales.find(x=>x.id===doc.id)||doc;
  openSheet(finish?'Sale finished':'Order saved',()=>{body().innerHTML=`<div class="okbox"><b>${esc(s.customer)} · ${cad(s.total)}</b><div>${finish?'This sale is <b>unpaid</b> until you tap Mark as paid.':'The items are set aside as pending until pickup.'}</div>
    ${!finish&&shortages(saleLines(s),s.id).length?`<div class="warn">Waiting on stock: short ${esc(shortText(shortages(saleLines(s),s.id)))}</div>`:''}</div>
    <button class="btn primary block" data-act="doc" data-kind="${finish?'receipt':'order'}" data-id="${esc(s.id)}">${finish?'Receipt (JPEG)':'Order confirmation (JPEG)'}</button>
    <button class="btn ghost block" data-act="close">Done</button>`});
}

/* Restore a backup exactly as it was saved */
let RS=null;
const canonById=list=>{const m=new Map();(list||[]).forEach(r=>{if(r&&r.id!=null)m.set(String(r.id),canon({...r,id:String(r.id)}))});return m};
async function startRestore(file){
  try{const j=JSON.parse(await file.text());
    if(!Array.isArray(j.products)||!Array.isArray(j.purchases))throw 0;
    const bad=[];['products','purchases','sales','adjustments'].forEach(c=>(j[c]||[]).forEach(r=>{if(!okId(String(r?.id??'')))bad.push(`${c}: ${r?.id}`)}));
    RS={file:file.name,j,bad};openRestore();
  }catch(_){toast('That file isn’t a Nova Tracker backup')}
}
function openRestore(){
  const j=RS.j;
  openSheet('Restore backup',()=>{body().innerHTML=`<div class="note">${esc(RS.file)}${j.exportedAt?` · saved ${esc(fmtDate(String(j.exportedAt).slice(0,10)))}`:''}</div>
  <div class="okbox"><b>This backup has</b><ul><li>${plural(j.purchases.length,'purchase order')}</li><li>${plural((j.sales||[]).length,'sale')}</li><li>${plural((j.adjustments||[]).length,'stock adjustment')}</li><li>${plural(j.products.length,'product')}</li><li>${plural(Object.keys(j.photos||{}).length,'photo')} you added</li></ul></div>
  ${RS.bad.length?`<div class="warnbox"><b>${plural(RS.bad.length,'record')} can’t be stored and will be left out</b><ul class="problems">${RS.bad.slice(0,20).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
  <div class="warnbox"><b>Replace everything with this backup</b><div>Your purchases, sales, stock adjustments, products and added photos become exactly what’s in this file. Nothing in the file is changed or recalculated.</div>
  ${S.purchases.length+S.sales.length+S.adjustments.length?`<div>This replaces ${plural(S.purchases.length,'purchase')}, ${plural(S.sales.length,'sale')} and ${plural(S.adjustments.length,'adjustment')} already here.</div>`:''}</div>
  <button class="btn primary block" data-act="restore-go" id="restore-go">Restore this backup</button>
  <button class="btn ghost block" data-act="close">Cancel</button>`});
}
async function applyRestore(btn){
  const j=RS.j;btn.disabled=true;btn.textContent='Restoring…';
  const keep=r=>r&&okId(String(r.id??''));
  ['products','purchases','sales','adjustments'].forEach(c=>S[c]=clone((j[c]||[]).filter(keep)).map(r=>(r.id=String(r.id),r)));
  S.photos={};Object.entries(j.photos||{}).forEach(([k,v])=>{if(okId(k)&&typeof v==='string')S.photos[k]=v});
  if(j.fx&&num(j.fx.rate)>0)S.fx=clone(j.fx);
  if(j.cleared)S.cleared=true;
  const ok=await commit();
  if(!ok){btn.disabled=false;btn.textContent='Try again';return}
  // verify: what's stored now is identical to the file
  const diffs=[];['products','purchases','sales','adjustments'].forEach(c=>{const want=canonById((j[c]||[]).filter(keep)),have=new Map([...SYNC[c]]);
    if(want.size!==have.size)diffs.push(`${c}: ${have.size} stored vs ${want.size} in file`);else for(const [id,v] of want)if(have.get(id)!==v){diffs.push(`${c}: ${id} differs`);break}});
  RS.result=diffs;openSheet('Restore backup',()=>{body().innerHTML=(diffs.length?`<div class="warnbox"><b>Restore finished, but check these</b><ul>${diffs.map(d=>`<li>${esc(d)}</li>`).join('')}</ul></div>`
    :`<div class="okbox"><b>Restored and checked</b><div>Every record now matches your backup exactly: ${plural(S.purchases.length,'purchase')}, ${plural(S.sales.length,'sale')}, ${plural(S.adjustments.length,'adjustment')}, ${plural(S.products.length,'product')}.</div></div>`)+`<button class="btn primary block" data-act="close">Done</button>`});
}

/* Excel export */
const STATUS_LABEL={open:'Open',completed:'Completed',cancelled:'Cancelled'};
function workbook(){
  const F=finance();
  const purchRows=[];
  [...S.purchases].sort((a,b)=>String(a.date).localeCompare(String(b.date))).forEach(p=>{const items=p.items?.length?p.items:[{}];items.forEach((i,ix)=>{const first=ix===0;
    purchRows.push([p.id,p.date,first?p.supplier||'':'',i.productId||'',i.name||'',CAT_LABEL[prod(i.productId)?.category||i.category]||'',i.mode==='kit'?'Kit':(i.mode?'Single':''),num(i.qty),num(i.units),num(i.unitCost),i.currency||'',num(p.fxRate),num(i.lineCAD),num(i.landedCAD),i.units?r2(num(i.landedCAD)/num(i.units)):'',
      first?num(p.shipping):'',first?p.shippingCurrency||'':'',first?num(p.shippingCAD):'',first?num(p.totalCAD):'',first?p.note||'':''])})});
  const saleRows=[];
  [...S.sales].sort((a,b)=>String(a.date).localeCompare(String(b.date))).forEach(s=>(s.items||[]).forEach((i,ix)=>{const first=ix===0;
    saleRows.push([s.id,s.date,s.customer,STATUS_LABEL[ST(s)],ST(s)==='completed'?(isPaid(s)?'Yes':'No'):'',isPaid(s)?s.paidDate||s.date||'':'',i.productId,i.name,num(i.qty),num(i.unitPrice),r2(num(i.qty)*num(i.unitPrice)),first?num(s.discountPct):'',first?num(s.discount):'',first?num(s.total):'',first?s.note||'':''])}));
  const cs=customers(()=>true);
  return [
    {name:'Summary',cols:[{h:'Figure (all amounts in CAD)',w:44},{h:'Value',w:18,t:'money'},{h:'How it’s worked out',w:70}],rows:[
      ['Exported',{v:today(),t:'date'},'Nova Peptide Tracker'],
      ['Revenue (paid sales)',r2(F.revenue),'Paid sales after discounts'],['Discounts given',r2(F.discounts),'On paid sales'],
      ['Cost of goods sold',r2(F.cogs),'Units in paid sales × average landed cost'],['Gross profit',r2(F.gross),'Revenue − cost of goods sold'],
      ['Used or lost',r2(F.lossCost),'Personal use, damaged/lost and recounts down, at average cost'],['NET PROFIT',r2(F.net),'Gross profit − used or lost'],
      ['Average markup',{v:Number.isFinite(F.markup)?F.markup/100:'',t:'pct'},'Gross profit ÷ cost of goods sold'],['Gross margin',{v:Number.isFinite(F.margin)?F.margin/100:'',t:'pct'},'Gross profit ÷ revenue'],
      ['Expenses (all purchases)',r2(F.expenses),'Every purchase order in CAD, shipping included'],['Cash position',r2(F.cash),'Paid sales − expenses'],
      ['Owed to you',r2(F.owed),'Finished sales not yet paid'],['Open orders',r2(F.openValue),'Not counted anywhere above'],['Stock at cost',r2(F.stockValue),'Units on hand × average cost'],
      [],['Month','','Paid sales / cost of goods / used or lost / NET / purchases'],
      ...F.months.map(m=>[fmtMonth(m.k),r2(m.n),`Paid ${cad(m.r)} · cost ${cad(m.c)} · used/lost ${cad(m.l)} · purchases ${cad(m.e)}`])]},
    {name:'Purchases',cols:[{h:'Order ID',w:16},{h:'Date',w:12,t:'date'},{h:'Supplier',w:16},{h:'Item ID',w:20},{h:'Item',w:28},{h:'Type',w:16},{h:'Kit or single',w:12},{h:'Qty',w:8,t:'num'},{h:'Units',w:8,t:'num'},{h:'Unit cost',w:11,t:'money'},{h:'Currency',w:9},{h:'Exchange rate',w:12,t:'rate'},{h:'Line cost CAD',w:13,t:'money'},{h:'Landed cost CAD',w:14,t:'money'},{h:'Landed per unit CAD',w:16,t:'money'},{h:'Shipping',w:10,t:'money'},{h:'Shipping currency',w:14},{h:'Shipping CAD',w:12,t:'money'},{h:'Order total CAD',w:14,t:'money'},{h:'Note',w:30}],rows:purchRows},
    {name:'Sales',cols:[{h:'Order ID',w:16},{h:'Date',w:12,t:'date'},{h:'Customer',w:20},{h:'Status',w:11},{h:'Paid',w:7},{h:'Paid date',w:12,t:'date'},{h:'Item ID',w:20},{h:'Item',w:28},{h:'Qty',w:7,t:'num'},{h:'Price each CAD',w:13,t:'money'},{h:'Line subtotal CAD',w:15,t:'money'},{h:'Discount %',w:10,t:'num'},{h:'Discount CAD',w:12,t:'money'},{h:'Order total CAD',w:14,t:'money'},{h:'Note',w:30}],rows:saleRows},
    {name:'Customers',cols:[{h:'Customer',w:24},{h:'Finished sales',w:14,t:'int'},{h:'Paid CAD',w:14,t:'money'},{h:'Owed CAD',w:14,t:'money'},{h:'Open orders',w:12,t:'int'},{h:'Last sale',w:12,t:'date'}],
      rows:cs.map(c=>[c.name,c.sales.filter(s=>ST(s)==='completed').length,r2(c.paid),r2(c.owed),c.sales.filter(s=>ST(s)==='open').length,c.last])},
    {name:'Inventory',cols:[{h:'Item ID',w:20},{h:'Item',w:28},{h:'Type',w:16},{h:'On hand',w:9,t:'num'},{h:'Pending',w:9,t:'num'},{h:'Available',w:10,t:'num'},{h:'Avg cost CAD',w:13,t:'money'},{h:'Stock value CAD',w:15,t:'money'},{h:'Sale price CAD',w:14,t:'money'}],
      rows:sortedProducts().map(p=>{const s=F.st.get(p.id);return[p.id,label(p),CAT_LABEL[p.category]||'',s.onHand,s.pending,s.available,r2(s.avg),r2(Math.max(0,s.onHand)*s.avg),num(p.price)]})},
    {name:'Stock adjustments',cols:[{h:'ID',w:16},{h:'Date',w:12,t:'date'},{h:'Item ID',w:20},{h:'Item',w:28},{h:'Qty (+ in / − out)',w:16,t:'num'},{h:'Reason',w:20},{h:'Note',w:30}],
      rows:[...S.adjustments].sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(a=>[a.id,a.date,a.productId,a.name||label(prod(a.productId)),num(a.qty),REASONS[a.reason]||a.reason,a.note||''])},
    {name:'Products',cols:[{h:'Item ID',w:20},{h:'Name',w:24},{h:'Strength',w:14},{h:'Type',w:16},{h:'Sale price CAD',w:14,t:'money'}],
      rows:sortedProducts().map(p=>[p.id,p.name,p.strength||'',CAT_LABEL[p.category]||'Peptide',num(p.price)])}
  ];
}
async function exportExcel(){let blob;try{blob=NovaXLSX.write(workbook())}catch(e){return toast('Couldn’t create the Excel file')}await saveBlob(blob,'nova-tracker-'+today()+'.xlsx')}

/* Excel import */
let IMP=null;
const normH=h=>String(h??'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9%+−-]+/g,' ').trim();
function sheetObjects(rows){
  if(!rows||!rows.length)return[];
  const head=(rows[0]||[]).map(normH);
  return rows.slice(1).map((r,i)=>{const o={_row:i+2};head.forEach((h,ci)=>{if(h)o[h]=r?.[ci]});return o}).filter(o=>Object.keys(o).some(k=>k!=='_row'&&o[k]!==null&&o[k]!==undefined&&o[k]!==''));
}
const pick=(o,...keys)=>{for(const k of keys){const v=o[normH(k)];if(v!==undefined&&v!==null&&v!=='')return v}return''};
function toISO(v){
  if(v===''||v==null)return null;
  if(typeof v==='number')return NovaXLSX.serialToISO(v);
  const s=String(v).trim();if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
  const m=/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(s);if(m){let y=+m[3];if(y<100)y+=2000;return `${y}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`}
  const d=new Date(s);return isNaN(d)?null:d.toISOString().slice(0,10);
}
const isNum=v=>v!==''&&v!=null&&Number.isFinite(Number(v));
const catFrom=v=>{const s=String(v||'').toLowerCase();return s.includes('bac')?'bac':(s.includes('non')||s.includes('suppl')||s.includes('other'))?'other':'peptide'};
function parseWorkbook(sheets){
  const find=n=>{const k=Object.keys(sheets).find(x=>x.toLowerCase().trim()===n.toLowerCase());return k?sheets[k]:null};
  const P=[],problems=[],out={products:[],purchases:[],sales:[],adjustments:[]};
  const prob=(sheet,row,msg)=>problems.push({sheet,row,msg});
  const known=new Map(S.products.map(p=>[p.id,{...p}]));
  const byLabel=()=>{const m=new Map();known.forEach(p=>m.set(label(p).toLowerCase(),p.id));return m};
  // products
  sheetObjects(find('Products')).forEach(o=>{const name=String(pick(o,'Name')).trim();if(!name)return prob('Products',o._row,'No name');
    let id=String(pick(o,'Item ID')).trim();const strength=String(pick(o,'Strength')).trim();
    if(!id){id=byLabel().get((name+(strength?' '+strength:'')).toLowerCase())||slug(name+'-'+strength)}
    const ex=known.get(id)||{id,cap:{peptide:'teal',bac:'pink',other:'silver'}[catFrom(pick(o,'Type'))],createdAt:Date.now()};
    const p={...ex,name,strength,category:catFrom(pick(o,'Type')),price:r2(num(pick(o,'Sale price CAD','Sale price')))};known.set(id,p);out.products.push(p)});
  const resolve=(o,sheet)=>{let id=String(pick(o,'Item ID')).trim();if(id&&known.has(id))return id;const nm=String(pick(o,'Item')).trim().toLowerCase().replace(/ \(15% off\)$/,'');const hit=byLabel().get(nm);if(hit)return hit;prob(sheet,o._row,`Unknown item “${pick(o,'Item ID')||pick(o,'Item')}” — add it to the Products sheet`);return null};
  // purchases
  const pg=new Map();
  sheetObjects(find('Purchases')).forEach(o=>{const k=String(pick(o,'Order ID')).trim()||('row'+o._row);if(!pg.has(k))pg.set(k,[]);pg.get(k).push(o)});
  pg.forEach((rows,k)=>{const f=rows[0];const date=toISO(pick(f,'Date'));if(!date)return prob('Purchases',f._row,'Missing or unreadable date — order skipped');
    const fx=num(pick(f,'Exchange rate'))||num(S.fx?.rate)||1.4;let bad=false;const lines=[];
    rows.forEach(o=>{if(!pick(o,'Item ID')&&!pick(o,'Item'))return;const pid=resolve(o,'Purchases');if(!pid){bad=true;return}
      const qty=pick(o,'Qty');if(!isNum(qty)){bad=true;return prob('Purchases',o._row,'Qty isn’t a number')}
      const curr=String(pick(o,'Currency')||'USD').toUpperCase().includes('CAD')?'CAD':'USD';
      lines.push({pid,mode:String(pick(o,'Kit or single')).toLowerCase().startsWith('k')?'kit':'single',cur:curr,qty:num(qty),cost:num(pick(o,'Unit cost')),
        units:isNum(pick(o,'Units'))?num(pick(o,'Units')):null,lineCAD:isNum(pick(o,'Line cost CAD'))?num(pick(o,'Line cost CAD')):null,landedCAD:isNum(pick(o,'Landed cost CAD'))?num(pick(o,'Landed cost CAD')):null})});
    if(bad)return prob('Purchases',f._row,`Order ${k.startsWith('row')?'':k+' '}skipped because of the problem(s) above`);
    const shipCur=String(pick(f,'Shipping currency')||'USD').toUpperCase().includes('CAD')?'CAD':'USD';
    const doc=buildPurchase({date,supplier:String(pick(f,'Supplier')),note:String(pick(f,'Note')),fx,lines,ship:{amt:pick(f,'Shipping'),cad:isNum(pick(f,'Shipping CAD'))?num(pick(f,'Shipping CAD')):null},shipCur});
    out.purchases.push({id:k.startsWith('row')?uid():k,...doc})});
  // sales
  const sg=new Map();
  sheetObjects(find('Sales')).forEach(o=>{const k=String(pick(o,'Order ID')).trim()||('row'+o._row);if(!sg.has(k))sg.set(k,[]);sg.get(k).push(o)});
  sg.forEach((rows,k)=>{const f=rows[0];const date=toISO(pick(f,'Date'));if(!date)return prob('Sales',f._row,'Missing or unreadable date — sale skipped');
    const customer=String(pick(f,'Customer')).trim();if(!customer)return prob('Sales',f._row,'No customer — sale skipped');
    let bad=false;const items=[];
    rows.forEach(o=>{const pid=resolve(o,'Sales');if(!pid){bad=true;return}const qty=pick(o,'Qty');if(!isNum(qty)){bad=true;return prob('Sales',o._row,'Qty isn’t a number')}
      items.push({productId:pid,name:label(known.get(pid)),qty:num(qty),unitPrice:r2(num(pick(o,'Price each CAD','Price each')))})});
    if(bad||!items.length)return prob('Sales',f._row,'Sale skipped because of the problem(s) above');
    const stx=String(pick(f,'Status')).toLowerCase(),status=stx.startsWith('o')?'open':stx.startsWith('c')&&stx.includes('anc')?'cancelled':'completed';
    const paid=status==='completed'&&/^(y|yes|true|paid|1)$/i.test(String(pick(f,'Paid')).trim());
    const sub=sum(items,i=>i.qty*i.unitPrice),d=Math.min(100,Math.max(0,num(pick(f,'Discount %')))),disc=sub*d/100;
    out.sales.push({id:k.startsWith('row')?uid():k,customer,date,note:String(pick(f,'Note')),items,subtotal:r2(sub),discountPct:d,discount:r2(disc),total:r2(sub-disc),
      status,paid,paidDate:paid?(toISO(pick(f,'Paid date'))||date):null,completedDate:status==='completed'?date:null,createdAt:Date.now()})});
  // adjustments
  const RMAP=Object.fromEntries(Object.entries(REASONS).map(([k,v])=>[v.toLowerCase(),k]));
  sheetObjects(find('Stock adjustments')).forEach(o=>{const pid=resolve(o,'Stock adjustments');if(!pid)return;const date=toISO(pick(o,'Date'));if(!date)return prob('Stock adjustments',o._row,'Missing date');
    const q=pick(o,'Qty (+ in / − out)','Qty');if(!isNum(q)||!num(q))return prob('Stock adjustments',o._row,'Qty must be a number like 2 or -2');
    const rs=String(pick(o,'Reason')).toLowerCase().trim();const reason=RMAP[rs]||(REASONS[rs]?rs:(num(q)<0?(rs.includes('pers')?'personal':rs.includes('dam')||rs.includes('lost')?'damaged':'recount'):'added'));
    out.adjustments.push({id:String(pick(o,'ID')).trim()||uid(),productId:pid,name:label(known.get(pid)),qty:num(q),reason,date,note:String(pick(o,'Note')),createdAt:Date.now()})});
  if(!find('Purchases')&&!find('Sales')&&!find('Products'))problems.unshift({sheet:'—',row:'',msg:'This workbook doesn’t have Purchases, Sales or Products sheets. Export from the app first to see the layout.'});
  return{...out,problems};
}
async function startImportExcel(file){
  try{const sheets=await NovaXLSX.read(file);IMP={file:file.name,mode:'replace',...parseWorkbook(sheets)};openImport()}
  catch(e){toast(e&&e.message?e.message:'Couldn’t read that file')}
}
function openImport(){
  openSheet('Import from Excel',()=>{const I=IMP;const nothing=!I.purchases.length&&!I.sales.length&&!I.adjustments.length&&!I.products.length;
  body().innerHTML=`<div class="note">${esc(I.file)}</div>
  <div class="okbox"><b>Found in the file</b><ul><li>${plural(I.purchases.length,'purchase order')}</li><li>${plural(I.sales.length,'sale')} (${I.sales.filter(s=>s.status==='open').length} open, ${I.sales.filter(s=>s.status==='completed'&&!isPaid(s)).length} unpaid)</li><li>${plural(I.adjustments.length,'stock adjustment')}</li><li>${plural(I.products.length,'product')}</li></ul></div>
  ${I.problems.length?`<div class="warnbox"><b>${plural(I.problems.length,'problem')} found — those rows will be skipped</b><ul class="problems">${I.problems.slice(0,80).map(p=>`<li>${esc(p.sheet)}${p.row?` · row ${p.row}`:''}: ${esc(p.msg)}</li>`).join('')}</ul></div>`:''}
  <h2>How to import</h2>
  <label class="radio"><input type="radio" name="impmode" value="replace" ${I.mode==='replace'?'checked':''}><span><b>Replace everything</b><small>Your purchases, sales and adjustments become exactly what’s in this file. Best for restoring a backup.</small></span></label>
  <label class="radio"><input type="radio" name="impmode" value="add" ${I.mode==='add'?'checked':''}><span><b>Add to what’s there</b><small>Keeps your current records and adds the ones from the file. Orders already in the app are skipped.</small></span></label>
  <div class="note">Products in the file update names and prices, and new ones are added. Photos aren’t changed. Inventory and financials are recalculated.</div>
  <button class="btn primary block" data-act="imp-go" ${nothing?'disabled':''}>Import</button>
  <button class="btn ghost block" data-act="close">Cancel</button>`});
}
function applyImport(){
  const I=IMP;if(!I)return;
  I.products.forEach(p=>{const i=S.products.findIndex(x=>x.id===p.id);if(i>=0)S.products[i]={...S.products[i],...p};else S.products.push(p)});
  let added={p:0,s:0,a:0},skipped=0;
  if(I.mode==='replace'){S.purchases=I.purchases;S.sales=I.sales;S.adjustments=I.adjustments;added={p:I.purchases.length,s:I.sales.length,a:I.adjustments.length}}
  else{const has=(c,id)=>S[c].some(x=>x.id===id);
    I.purchases.forEach(x=>{if(has('purchases',x.id))skipped++;else{S.purchases.push(x);added.p++}});
    I.sales.forEach(x=>{if(has('sales',x.id))skipped++;else{S.sales.push(x);added.s++}});
    I.adjustments.forEach(x=>{if(has('adjustments',x.id))skipped++;else{S.adjustments.push(x);added.a++}})}
  commit();closeSheet();toast(`Imported ${added.p} purchases, ${added.s} sales, ${added.a} adjustments${skipped?` · ${skipped} already there`:''}`);
}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;
  const a=b.dataset.act,i=+b.dataset.i,find=id=>S.sales.find(x=>x.id===id);
  switch(a){
    case 'close':closeSheet();break;
    case 'explain':explain(b.dataset.k);break;
    case 'fx':openFx();break;
    case 'signout':if(window.NovaCloud)window.NovaCloud.signOut();break;
    case 'doc-share':shareDoc(b);break;
    case 'doc-dl':if(DOCF)saveBlob(DOCF.blob,DOCF.name);break;
    case 'fx-save':{const r=num($('#fx-rate').value);if(!(r>0))return toast('Enter a rate above 0');S.fx={rate:r,asOf:$('#fx-date').value||today(),source:'manual',fetchedAt:Date.now()};commit();toast('Rate saved');closeSheet();break}
    case 'export':exportBackup();break;
    case 'xlsx-export':exportExcel();break;
    case 'imp-go':applyImport();break;
    case 'restore-go':applyRestore(b);break;
    case 'doc':saveDoc(b.dataset.id,b.dataset.kind,b);break;
    case 'clear-1':openClear();break;
    case 'clear-2':if(($('#clear-confirm')?.value||'').trim().toUpperCase()==='DELETE')doClear();break;
    case 'new-purchase':openPurchase();break;
    case 'new-sale':openSale();break;
    case 'edit-order':openSale(b.dataset.id);break;
    case 'pay':{const s=find(b.dataset.id);if(s){s.paid=true;s.paidDate=today();commit();toast(`Marked paid · ${cad(s.total)}`)}break}
    case 'unpay':{if(!armed(b,'Tap again'))return;const s=find(b.dataset.id);if(s){s.paid=false;s.paidDate=null;commit();toast('Marked unpaid')}break}
    case 'pay-all':{if(!armed(b,'Tap again to mark all paid'))return;const n=b.dataset.cust.toLowerCase();let t=0;S.sales.forEach(s=>{if(ST(s)==='completed'&&!isPaid(s)&&String(s.customer||'').trim().toLowerCase()===n){s.paid=true;s.paidDate=today();t+=num(s.total)}});commit();toast(`Marked paid · ${cad(t)}`);break}
    case 'adjust':openAdjust();break;
    case 'add-item':openAddItem();break;
    case 'product':openAdjust(b.dataset.id);break;
    case 'invF':S.invF=b.dataset.v;document.querySelectorAll('[data-act="invF"]').forEach(c=>c.setAttribute('aria-pressed',c.dataset.v===S.invF));$('#inv-list').innerHTML=invList();break;
    case 'del':{if(!armed(b,'Tap again to delete'))return;const col=b.dataset.col,id=b.dataset.id;S[col]=S[col].filter(x=>x.id!==id);commit();toast('Deleted');if(col==='products')closeSheet();break}
    case 'pf-add':PF.lines.push(newLine());renderPF();break;
    case 'pf-rm':PF.lines.splice(i,1);renderPF();break;
    case 'pf-set':PF.lines[i][b.dataset.k]=b.dataset.v;renderPF();break;
    case 'pf-shipcur':PF.shipCur=b.dataset.v;renderPF();break;
    case 'pf-save':savePF();break;
    case 'ni-photo-x':NI.photo=null;rerenderNI();break;
    case 'ni-cancel':if(PF&&NI.line>=0){PF.lines[NI.line].pid='';NI=null;renderPF()}else closeSheet();break;
    case 'ni-save':{const line=NI.line;const id=saveNewItem();if(!id)return;if(PF&&line>=0){PF.lines[line]=newLine(id);NI=null;renderPF()}else{NI=null;closeSheet();openAdjust(id)}break}
    case 'sf-add':{const q=num(SF.qty);if(!SF.pick)return;if(q<=0)return toast('Enter a quantity');const left=sfAvail(SF.pick);
      if(q>left)toast(left>0?`Only ${left} in stock — this order will be short ${q-left} until you restock`:`None in stock — ${q} on back-order until you restock`);
      const ex=SF.lines.find(l=>l.pid===SF.pick&&num(l.price)===num(SF.price));
      if(ex)ex.qty=String(num(ex.qty)+q);else SF.lines.push({pid:SF.pick,qty:String(q),price:SF.price||'0'});
      SF.pick='';SF.qty='1';SF.price='';renderSF();break}
    case 'sf-rm':SF.lines.splice(i,1);renderSF();break;
    case 'sf-disc':SF.discount=b.dataset.v;renderSF();break;
    case 'sf-open':saveSF('open');break;
    case 'sf-finish':saveSF('finish');break;
    case 'sf-cancel':{if(!armed(b,'Tap again to cancel this order'))return;const s=find(SF.id);if(s){s.status='cancelled';s.cancelledDate=today();commit();toast('Order cancelled · items back in stock');closeSheet()}break}
    case 'af-dir':AF.dir=b.dataset.v;renderAF();break;
    case 'af-save':saveAF();break;
    case 'pe-save':savePE();break;
    case 'pe-photo-reset':delete S.photos[AF.pid];commit();renderAF();toast('Photo updated');break;
  }
});
document.addEventListener('input',e=>{
  const t=e.target,d=t.dataset;
  if(t.id==='salesQ'){S.salesQ=t.value;$('#sales-list').innerHTML=salesList();return}
  if(t.id==='invQ'){S.invQ=t.value;$('#inv-list').innerHTML=invList();return}
  if(t.id==='clear-confirm'){$('#clear-go').disabled=t.value.trim().toUpperCase()!=='DELETE';return}
  if(d.ni&&NI){NI[d.ni]=t.value;return}
  if(PF&&d.pf){PF[d.pf]=t.value;if(['fx','ship'].includes(d.pf))updatePF();return}
  if(PF&&d.pfl&&d.pfl!=='pid'){PF.lines[+d.i][d.pfl]=t.value;updatePF();return}
  if(SF&&d.sf&&d.sf!=='pick'){SF[d.sf]=t.value;if(d.sf==='discount'){$('#sf-totals').innerHTML=sfTotals(sfCalc());document.querySelectorAll('[data-act="sf-disc"]').forEach(c=>c.setAttribute('aria-pressed',num(c.dataset.v)===num(t.value)))}return}
  if(SF&&d.sfl){SF.lines[+d.i][d.sfl]=t.value;$('#sf-totals').innerHTML=sfTotals(sfCalc());const sm=t.closest('.cart-line')?.querySelector('.cart-name small');const l=SF.lines[+d.i];if(sm)sm.textContent=cad(num(l.qty)*num(l.price));return}
  if(AF&&d.af&&d.af!=='pid'&&d.af!=='reason'){AF[d.af]=t.value;if(d.af==='qty'){const btn=document.querySelector('[data-act="af-save"]');const p=prod(AF.pid);if(btn)btn.textContent=`${AF.dir==='out'?'Pull':'Add'} ${num(AF.qty)||''} ${unitWord(p)}${num(AF.qty)==1?'':'s'}`}return}
  if(AF&&d.pe){AF.edit[d.pe]=t.value;return}
});
document.addEventListener('change',async e=>{
  const t=e.target,d=t.dataset;
  if(t.name==='impmode'&&IMP){IMP.mode=t.value;return}
  if(PF&&d.pfl==='pid'){const i=+d.i;if(t.value==='__new'){NI={line:i,name:'',strength:'',category:'peptide',price:'',photo:null};renderPF();return}PF.lines[i]=Object.assign(newLine(t.value),{qty:PF.lines[i].qty,cost:PF.lines[i].cost});renderPF();return}
  if(SF&&d.sf==='pick'){SF.pick=t.value;const p=prod(t.value);SF.price=p&&num(p.price)?String(p.price):'';renderSF();return}
  if(AF&&d.af==='pid'){AF.pid=t.value;AF.edit=null;renderAF();return}
  if(AF&&d.af==='reason'){AF.reason=t.value;return}
  if(AF&&d.pe==='category'){AF.edit.category=t.value;return}
  if(d.ni==='category'&&NI){NI.category=t.value;return}
  if(d.editdate&&t.value){const o=S[d.editdate].find(x=>x.id===d.id);if(o){o.date=t.value;commit();toast('Date updated')}return}
  if(t.id==='ni-photo-in'&&t.files&&t.files[0]&&NI){try{NI.photo=await shrinkPhoto(t.files[0]);rerenderNI()}catch(_){toast('Couldn’t use that image — try a JPG or PNG')}return}
  if(t.id==='pe-photo'&&t.files&&t.files[0]&&AF){try{S.photos[AF.pid]=await shrinkPhoto(t.files[0]);commit();renderAF();toast('Photo saved')}catch(_){toast('Couldn’t use that image — try a JPG or PNG')}return}
  if(t.id==='xlsxfile'&&t.files&&t.files[0]){const f=t.files[0];t.value='';startImportExcel(f);return}
  if(t.id==='importfile'&&t.files&&t.files[0]){const f=t.files[0];t.value='';startRestore(f);return}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#sheet').hidden)closeSheet()});
window.addEventListener('hashchange',route);

/* ---------- storage: your Firebase database (Firestore, via cloud.js) ----------
   Rules (Conan, 2026-10-29): opening the app never writes anything. Records are saved exactly as entered;
   a save writes only the records that changed. Nothing is migrated, topped up or "fixed" on load. */
const COLS=['products','purchases','sales','adjustments'];
let DB=null,DL=null;
const SYNC={products:new Map(),purchases:new Map(),sales:new Map(),adjustments:new Map(),photos:new Map(),fx:null,meta:null};
const LOADED=new Set();
const canon=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort().reduce((o,kk)=>(o[kk]=x[kk],o),{}):x);
const clone=v=>JSON.parse(JSON.stringify(v));
const okId=id=>typeof id==='string'&&/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(id)&&id!=='.'&&id!=='..';
const ready=()=>COLS.every(c=>LOADED.has(c))&&LOADED.has('photos');
let writing=0,writeErr=false;
async function pool(jobs,onStep){let i=0,done=0;const N=Math.min(4,jobs.length);
  await Promise.all(Array.from({length:N},async()=>{while(i<jobs.length){const j=jobs[i++];let tries=0;
    for(;;){try{await j();break}catch(e){if((e?.code==='unavailable'||e?.code==='resource_exhausted'||e?.code==='resource-exhausted'||e?.code==='aborted')&&tries++<4){await new Promise(r=>setTimeout(r,400*tries+Math.random()*300));continue}throw e}}
    done++;onStep&&onStep(done,jobs.length)}}))}
/* Write only what differs from what's stored. Called after every action in the app — never on load. */
async function commit(){
  render();renderHeader();
  if(!DB){toast('Sign in to save changes');return false}
  if(!ready()){toast('Still loading your records — try again in a moment');return false}
  const jobs=[];
  for(const c of COLS){const cur=new Map();
    for(const r of S[c]){if(!okId(r.id))r.id=uid();const j=canon(r);cur.set(r.id,j);if(SYNC[c].get(r.id)!==j){const body=clone(r);jobs.push(()=>DB.doc(c+'/'+r.id).set(body));SYNC[c].set(r.id,j)}}
    for(const id of [...SYNC[c].keys()])if(!cur.has(id)){jobs.push(()=>DB.doc(c+'/'+id).delete());SYNC[c].delete(id)}}
  const pc=new Map(Object.entries(S.photos));
  for(const [id,d] of pc)if(SYNC.photos.get(id)!==d&&okId(id)){jobs.push(()=>DB.doc('photos/'+id).set({data:d}));SYNC.photos.set(id,d)}
  for(const id of [...SYNC.photos.keys()])if(!pc.has(id)){jobs.push(()=>DB.doc('photos/'+id).delete());SYNC.photos.delete(id)}
  if(S.fx&&canon(S.fx)!==SYNC.fx){const b=clone(S.fx);jobs.push(()=>DB.doc('settings/fx').set(b));SYNC.fx=canon(S.fx)}
  const meta={cleared:!!S.cleared};if(canon(meta)!==SYNC.meta&&(S.cleared||SYNC.meta)){jobs.push(()=>DB.doc('settings/meta').set(meta));SYNC.meta=canon(meta)}
  if(!jobs.length)return true;
  writing++;const big=jobs.length>8;
  try{await pool(jobs,big?(d,n)=>showProgress(`Saving ${d} of ${n}…`):null);writeErr=false;if(big)showProgress('');return true}
  catch(e){writeErr=true;showProgress('');toast(e?.code==='permission-denied'?'This account isn’t allowed to save — check your Firebase rules':(e?.code==='quota_exceeded'||e?.code==='resource-exhausted')?'Firebase daily limit reached — try again tomorrow':'Couldn’t save — check your connection. Your change will show again once it saves.');return false}
  finally{writing--;render()}
}
function showProgress(t){let el=$('#progress');if(!el){el=document.createElement('div');el.id='progress';el.className='toast';el.style.bottom='auto';el.style.top='calc(env(safe-area-inset-top,0px) + 70px)';document.body.appendChild(el)}el.textContent=t;el.hidden=!t}
function subscribe(){
  const onErr=c=>e=>{console.warn(c,e);if(e?.code==='permission-denied')S.dbErr='This Google account doesn’t have access to the Nova database yet.';else S.dbErr='Lost connection to your records. Reload the page.';render()};
  COLS.forEach(c=>DB.collection(c).onSnapshot(snap=>{
    S[c]=snap.docs.map(d=>{const o=clone(d.data());o.id=d.id;return o});
    SYNC[c]=new Map(S[c].map(r=>[r.id,canon(r)]));LOADED.add(c);render()},onErr(c)));
  DB.collection('photos').onSnapshot(snap=>{S.photos={};SYNC.photos=new Map();snap.docs.forEach(d=>{const v=d.data()?.data;if(typeof v==='string'){S.photos[d.id]=v;SYNC.photos.set(d.id,v)}});LOADED.add('photos');render()},onErr('photos'));
  DB.doc('settings/fx').onSnapshot(d=>{FX_STORED=d.exists?clone(d.data()):null;pickFx()},()=>{});
  DB.doc('settings/meta').onSnapshot(d=>{const m=d.exists?d.data():null;S.cleared=!!m?.cleared;SYNC.meta=m?canon({cleared:!!m.cleared}):null},()=>{});
}
function shrinkPhoto(file){return new Promise((res,rej)=>{const url=URL.createObjectURL(file);const im=new Image();
  im.onload=()=>{const side=Math.min(im.width,im.height),c=document.createElement('canvas');c.width=c.height=360;
    c.getContext('2d').drawImage(im,(im.width-side)/2,(im.height-side)/2,side,side,0,0,360,360);URL.revokeObjectURL(url);res(c.toDataURL('image/jpeg',0.8))};
  im.onerror=()=>{URL.revokeObjectURL(url);rej()};im.src=url})}
let DOCF=null;
function showDoc(blob,name,kind){
  if(DOCF?.url)URL.revokeObjectURL(DOCF.url);DOCF={blob,name,url:URL.createObjectURL(blob)};
  const canShare=!!(navigator.canShare&&navigator.canShare({files:[new File([blob],name,{type:'image/jpeg'})]}));
  openSheet(kind==='order'?'Order confirmation':'Receipt',()=>{body().innerHTML=`<img src="${DOCF.url}" alt="${esc(name)}" style="width:100%;border-radius:12px;border:1px solid var(--line);margin-bottom:12px">
    ${canShare?`<button class="btn primary block" data-act="doc-share">Share (text, WhatsApp, email…)</button>`:''}
    <button class="btn ${canShare?'ghost':'primary'} block" data-act="doc-dl">Download JPEG</button>`});
}
async function shareDoc(b){if(!DOCF)return;b.disabled=true;
  try{await DL.share({filename:DOCF.name,data:DOCF.blob,type:'image/jpeg'})}catch(e){if(e?.code!=='declined')saveBlob(DOCF.blob,DOCF.name)}finally{b.disabled=false}}
window.novaSaveFailed=e=>{writeErr=true;render()};
async function saveBlob(blob,name){
  if(DL){try{await DL.save({filename:name,data:blob});toast('Saved '+name);return true}
    catch(e){if(e?.code==='declined')return false;if(e?.code!=='unavailable'&&e?.code!=='not_granted'){toast('Couldn’t save the file — try again');return false}}}
  showFile(blob,name);return false;
}
function showFile(blob,name){
  const url=URL.createObjectURL(blob);
  openSheet(name,()=>{body().innerHTML=/^image\//.test(blob.type)?`<div class="note">Press and hold the image to save or share it.</div><img src="${url}" alt="${esc(name)}" style="width:100%;border-radius:12px;border:1px solid var(--line)">`
    :`<div class="banner">Couldn’t download ${esc(name)} here. Try again from Chrome.</div>`});
}
function exportBackup(){
  return saveBlob(new Blob([JSON.stringify({version:3,exportedAt:new Date().toISOString(),cleared:S.cleared,products:S.products,purchases:S.purchases,sales:S.sales,adjustments:S.adjustments,fx:S.fx,photos:S.photos},null,1)],{type:'application/json'}),'nova-dashboard-backup-'+today()+'.json');
}
let FX_STORED=null,FX_LIVE=null;
/* Use the rate he saved himself today; otherwise the live rate. The live rate is never written. */
function pickFx(){
  const st=FX_STORED,lv=FX_LIVE;
  S.fx=st&&(st.source==='manual'&&st.asOf===today()||!lv)?st:(lv||st||null);
  SYNC.fx=S.fx?canon(S.fx):null;renderHeader();
}
async function loadLiveFx(){
  const srcs=[['https://api.frankfurter.dev/v1/latest?base=USD&symbols=CAD',j=>[j.rates?.CAD,j.date],'Frankfurter (ECB)'],
    ['https://api.frankfurter.app/latest?from=USD&to=CAD',j=>[j.rates?.CAD,j.date],'Frankfurter (ECB)'],
    ['https://open.er-api.com/v6/latest/USD',j=>[j.rates?.CAD,new Date((j.time_last_update_unix||0)*1000).toISOString().slice(0,10)],'open.er-api.com']];
  for(const [u,f,src] of srcs){try{const r=await fetch(u,{cache:'no-store'});if(!r.ok)continue;const [rate,asOf]=f(await r.json());
    if(rate>0){FX_LIVE={rate:Math.round(rate*10000)/10000,asOf:asOf||today(),source:src,fetchedAt:Date.now()};pickFx();return}}catch(_){}}
}
async function boot(){
  route();renderHeader();
  const c=await window.NovaCloudReady;
  DB=c.db;DL=c.downloads;
  subscribe();loadLiveFx();
}
boot();

