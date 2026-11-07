"use strict";
// Case-study game server. Zero dependencies. Run: node server.js
const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto");
const bank=JSON.parse(fs.readFileSync(path.join(__dirname,"bank.json"),"utf8"));
const PORT=process.env.PORT||3000,PW=process.env.ADMIN_PASSWORD||"kamadP";
const BUILD="2026.11.07-v7.0",TK=["j","s","n"],PHS=["lobby","story","r1","show","twist","r2","show2","twist3","r3","show3","twist4","r4","show4","twist5","r5","show5","twist6","r6","show6","win","thanks"],RL=bank.RL;
const showRound=ph=>"r"+(ph==="show"?"1":ph.slice(4));
const isShow=ph=>/^show[2-6]?$/.test(ph);
const reviewEntries=ph=>S.sub.filter(x=>x.r===showRound(ph));
const reviewDuration=ph=>Math.max(75,reviewEntries(ph).length*8);
const reviewStep=ph=>Math.max(1,Math.floor(reviewDuration(ph)/Math.max(1,reviewEntries(ph).length)));
const isR=p=>/^r[1-6]$/.test(p),rr=()=>1+Math.floor(Math.random()*5),pick=a=>a[Math.floor(Math.random()*a.length)];
const sha=s=>crypto.createHash("sha256").update(String(s)).digest();
const toks=new Set(),viewToks=new Set(),cl=new Map(),kickRestrictions=new Map();
const TEST3="67420",TEST4="67421",KICK_MS=20000;
const fresh=(demo,pl)=>({ph:"lobby",t:RL,pause:0,lock:0,fl:0,shown:0,wn:0,age:0,locked:0,demo:demo||0,auto:0,rw:0,bi:0,event4:0,pl:pl||[],cm:{},my:{},sub:[],cr:{},sid:0,sv:1});
let S=fresh();

function setPh(p){S.ph=p;S.age=0;S.fl=0;S.lock=0;S.t=RL;S.bi=0;S.pause=0;S.shown=0;S.rw=0;
 if(p==="r4"){S.event4=0;S.pl.forEach(x=>{x.r4Ack=false;x.pre4=null;delete x.sent.r4})}
 if(p==="win")S.wn=0;
}
function next(){const i=PHS.indexOf(S.ph);if(i<PHS.length-1){S.locked=1;setPh(PHS[i+1])}}
function addSub(x){x.id=++S.sid;S.sub.push(x);S.sv++;if(S.demo)S.cr[x.id]={_1:rr(),_2:rr()}}
function bot(n){}
function order(){const L=TK.map(t=>S.sub.filter(x=>x.t===t)),o=[];for(let i=0;i<Math.max(0,...L.map(l=>l.length));i++)L.forEach(l=>{if(l[i])o.push(l[i])});return o}
function winners(){return TK.map(t=>{let b=null;S.sub.filter(x=>x.t===t).forEach(x=>{const v=Object.values(S.cr[x.id]||{});if(!v.length)return;const a=v.reduce((p,q)=>p+q,0)/v.length;if(!b||a>b.v||(a===b.v&&v.length>b.n))b={t,a:x.a,by:x.by,v:a,n:v.length}});return b})}
const inn=()=>S.pl.filter(p=>p.st==="in"&&p.online&&Date.now()-p.last<10500);
const np=()=>inn().length; // Only approved, connected players; commanders are never counted.
const nc=()=>new Set([...cl.values()].filter(c=>c.role==="c").map(c=>c.id)).size;
const ros=()=>inn().map(p=>({n:p.n,t:p.t}));

function act(a,k){
 if(a==="nx")next();
 else if(a==="ps")S.pause=S.pause?0:1;
 else if(a==="cl"&&isR(S.ph)&&!S.lock){S.t=0;S.lock=1;bot(99);next()}
 else if(a==="tm"&&isR(S.ph)&&!S.lock)S.t+=30;
 else if(a==="tw"&&isR(S.ph)&&S.ph!=="r4")S.fl=1;
 else if(a==="sn"&&isShow(S.ph)){const n=reviewEntries(S.ph).length;if(n){S.shown=Math.min(S.shown+1,n-1);S.age=Math.min(reviewDuration(S.ph)-1,S.shown*reviewStep(S.ph))}}
 else if(a==="sa"&&isShow(S.ph)){S.shown=Math.max(0,reviewEntries(S.ph).length-1);S.age=reviewDuration(S.ph)-1}
 else if(a==="wn"&&S.ph==="win"){S.wn=Math.min(3,S.wn+1);S.age=0}
 else if(a==="ki"){const p=S.pl.find(x=>x.id===k&&x.st==="in");if(p){p.online=false;p.st="kicked";p.last=0;p.kickUntil=Date.now()+KICK_MS;if(p.device)kickRestrictions.set(p.device,{until:p.kickUntil,name:p.n});}}
 else if(a==="ok"||a==="no"){const p=S.pl.find(x=>x.id===k&&x.st==="wait");if(p){p.st=a==="ok"?"in":"no";if(p.st==="in"&&[...cl.values()].some(c=>c.role==="p"&&c.id===p.id)){p.online=true;p.last=Date.now()}}}
 else if(a==="lk")S.locked=S.locked?0:1;
 else if(a==="dm"){}
 else if(a==="au"){S.auto=S.auto?0:1;S.rw=0;S.pause=0}
 else if(a==="rs"){const o=S;S=fresh(o.demo,o.pl.filter(p=>p.st==="in"&&p.online).map(p=>({...p,sent:{}})));S.cm=o.cm}
 push()}

let lastPresenceCheck=0;
function tick(){
 const now=Date.now();
 if(now-lastPresenceCheck>=5000){lastPresenceCheck=now;for(const p of S.pl)if(p.online&&now-p.last>9500)p.online=false;}
 if(!S.pause){
  if(S.ph!=="lobby")S.age++;
  if(S.auto){
   if(S.ph==="lobby")next();
   else if(S.ph==="story"||S.ph.startsWith("twist")){if(S.age>=(bank.CINEND[S.ph]||38)+4)next()}
   else if(isR(S.ph)&&!S.lock&&S.t>9)S.t=9;
   else if(isShow(S.ph)){S.shown=Math.min(Math.max(0,reviewEntries(S.ph).length-1),S.shown+1);if(S.age>=Math.max(4,reviewEntries(S.ph).length+2))next()}
   else if(S.ph==="win"){S.wn=Math.min(3,Math.floor(S.age/2));if(S.age>=9)next()}
   else if(S.ph==="thanks")S.auto=0;
  }
  if(isR(S.ph)&&!S.lock){
   // Day 20: a server-side, single global surprise exactly at 1:30 remaining.
   // Grant extra 30 seconds once; individual players must acknowledge it.
   if(S.ph==="r4"&&!S.event4&&S.t<=90){S.event4=1;S.t+=30;S.fl=1}
   S.t--;
   if(S.t<=0){S.t=0;S.lock=1;next()}
  }
  if(!S.auto){
   if((S.ph==="story"||S.ph.startsWith("twist"))&&S.age>=(bank.CINEND[S.ph]||38)+4)next();
   else if(isShow(S.ph)&&S.age>=reviewDuration(S.ph))next();
   else if(S.ph==="win"){
    S.wn=Math.max(S.wn,Math.min(3,Math.floor(S.age/14)));
    if(S.age>=75)next();
   }
  }
  if(isShow(S.ph)&&!S.auto){const n=reviewEntries(S.ph).length;S.shown=Math.min(Math.max(0,n-1),Math.floor(S.age/reviewStep(S.ph)))}
 }
 push();
}
setInterval(tick,1000);

function snap(c){
 const g={build:BUILD,serverNow:Date.now(),ph:S.ph,t:S.t,pause:S.pause,lock:S.lock,fl:S.fl,shown:S.shown,reviewDuration:isShow(S.ph)?reviewDuration(S.ph):75,event4:S.event4,wn:S.wn,age:S.age,locked:S.locked,demo:S.demo,auto:S.auto,cn:S.sub.filter(x=>x.r===S.ph).length,np:np(),nc:nc(),ros:ros()};
 if(S.ph==="win")g.W=winners();
 const all=c.role==="a"||c.role==="c"||c.role==="v"||c.role==="s",subs=all;
 if(c.sv!==S.sv||c.sh!==(c.role==="s"?S.ph:subs)){g.sub=subs?(c.role==="s"?(isShow(S.ph)?reviewEntries(S.ph):[]):S.sub):[];c.sv=S.sv;c.sh=c.role==="s"?S.ph:subs}
 if(c.role==="p"){const p=S.pl.find(x=>x.id===c.id);g.me=p?{st:p.st,trk:p.t,name:p.n,sent:p.sent,kickUntil:p.kickUntil||0,r4Ack:!!p.r4Ack,pre4:p.pre4||null}:null}
 if(c.role==="c")g.my=S.my[c.id]||{};
 if(c.role==="s"||c.role==="v")g.codes={TC:bank.TC};
 if(c.role==="a"){g.people=inn().map(p=>({id:p.id,n:p.n,t:p.t}));g.codes={TC:bank.TC,CC:bank.CC};g.pend=S.pl.filter(p=>p.st==="wait").map(p=>({id:p.id,n:p.n,t:p.t}));g.rc=Object.values(S.cr).reduce((a,o)=>a+Object.keys(o).length,0)}
 return g}
function push(){for(const c of cl.values())c.res.write("data:"+JSON.stringify(snap(c))+"\n\n")}

const send=(r,o,code)=>{r.writeHead(code||200,{"Content-Type":"application/json; charset=utf-8"});r.end(JSON.stringify(o))};
const body=q=>new Promise(ok=>{let d="";q.on("data",x=>{d+=x;if(d.length>20000)q.destroy()});q.on("end",()=>{try{const x=JSON.parse(d||"{}");ok(x&&typeof x==="object"&&!Array.isArray(x)?x:{})}catch(e){ok({})}})});

http.createServer(async(q,r)=>{
 const u=new URL(q.url,"http://x"),P=u.pathname;
 if(q.method==="GET"&&(P==="/"||P==="/index.html")){r.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store, max-age=0","Pragma":"no-cache"});return r.end(fs.readFileSync(path.join(__dirname,"public","index.html")))}
 if(q.method==="GET"&&P==="/api/stream"){
  const role=u.searchParams.get("role"),id=u.searchParams.get("id")||"",tok=u.searchParams.get("tok")||"";
  if(!["a","p","c","s","v"].includes(role)||(role==="a"&&!toks.has(tok))||(role==="p"&&!S.pl.some(p=>p.id===id&&!["left","kicked","no"].includes(p.st)))||(role==="c"&&!S.cm[id])||(role==="v"&&!viewToks.has(id)))return send(r,{err:"no"},role==="a"?401:404);
  r.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive","X-Accel-Buffering":"no"});
  const c={res:r,role,id,sv:0,sh:null},k=crypto.randomUUID();cl.set(k,c);if(role==="p"){const p=S.pl.find(x=>x.id===id);if(p&&p.st==="in"){p.online=true;p.last=Date.now()}}
  r.write("data:"+JSON.stringify(snap(c))+"\n\n");q.on("close",()=>{cl.delete(k);if(role==="p"){const p=S.pl.find(x=>x.id===id);if(p&&!Array.from(cl.values()).some(c=>c.role==="p"&&c.id===id)){p.last=Date.now();setTimeout(()=>{if(!Array.from(cl.values()).some(c=>c.role==="p"&&c.id===id)&&p.online&&Date.now()-p.last>=4500){p.online=false;push()}},4700)}}});push();return}
 if(q.method!=="POST")return send(r,{err:"not found"},404);
 const b=await body(q);
 if(P==="/api/login"){const ok=crypto.timingSafeEqual(sha(b.pw),sha(PW));if(!ok)return send(r,{err:"bad"},401);const t=crypto.randomUUID();toks.add(t);return send(r,{tok:t})}
 if(P==="/api/join"){
  const c=String(b.code||"").trim(),n=String(b.name||"").trim().slice(0,20),device=String(b.device||"").slice(0,100);
  if(c===TEST3||c===TEST4){const id=crypto.randomUUID();viewToks.add(id);return send(r,{role:"v",id,mode:c===TEST3?3:4});}
  const restriction=kickRestrictions.get(device);
  if(restriction){const remaining=Math.ceil((restriction.until-Date.now())/1000);if(remaining>0)return send(r,{err:`הכניסה תתאפשר בעוד ${remaining} שניות. לאחר מכן יש לבחור שם חדש.`,cooldown:restriction.until,previousName:restriction.name});if(n.trim().toLocaleLowerCase("he")===restriction.name.trim().toLocaleLowerCase("he"))return send(r,{err:"יש לבחור שם שונה מזה שהיה לפני ההוצאה.",previousName:restriction.name});kickRestrictions.delete(device);}
  if(c===bank.CC){
   // A device switching from player to commander must cease being a player immediately.
   const old=S.pl.find(p=>p.id===String(b.previousPlayerId||""));
   if(old){old.online=false;old.st="left"}
   const id=crypto.randomUUID();S.cm[id]=n||"מפקד";push();return send(r,{role:"c",id,name:S.cm[id]})
  }
  const t=TK.find(k=>bank.TC[k]===c);
  if(!t)return send(r,{err:"הקוד שגוי. בדקו את חמש הספרות."});
  if(!n)return send(r,{err:"הזינו שם או כינוי."});
  const returning=S.pl.some(p=>p.st==="kicked"&&p.t===t&&p.device===device&&device);
  const id=crypto.randomUUID(),st=returning||S.ph==="lobby"&&!S.locked?"in":"wait";
  S.pl.push({id,n,t,st,device,sent:{},online:false,last:Date.now()});push();return send(r,{role:"p",id,trk:t,name:n,st})}
 if(P==="/api/ping"){const p=S.pl.find(x=>x.id===b.id&&x.st==="in");if(!p){const k=S.pl.find(x=>x.id===b.id);return send(r,{err:"inactive",kickUntil:k?.kickUntil||0,previousName:k?.st==="kicked"?k.n:""},403)}p.last=Date.now();p.online=true;return send(r,{ok:1})}
 if(P==="/api/leave"){const p=S.pl.find(x=>x.id===b.id);if(p){p.online=false;if(!b.temporary)p.st="left";push()}return send(r,{ok:1})}
 if(P==="/api/ack-r4"){
  const p=S.pl.find(x=>x.id===b.id&&x.st==="in");
  if(!p||S.ph!=="r4"||!S.event4)return send(r,{err:"העדכון עדיין לא התקבל."},409);
  p.r4Ack=true;if(p.sent.r4==="holding")delete p.sent.r4;
  push();return send(r,{ok:1});
 }
 if(P==="/api/sub"){
  const p=S.pl.find(x=>x.id===b.id);
  if(!p||p.st!=="in"||!p.online||Date.now()-p.last>13000||!isR(S.ph)||S.lock||p.sent[S.ph])return send(r,{err:"לא ניתן לשלוח עכשיו."});
  const a=(Array.isArray(b.a)?b.a:[]).map(x=>String(x).trim().slice(0,2600)).filter(Boolean).slice(0,2);
  if(!a.length)return send(r,{err:"הטקסט ריק."});
  // Journalism and networks require two texts. Spokespeople submit exactly one.
  if(p.t==="s"&&a.length!==1)return send(r,{err:"בדוברות מגישים תוצר אחד בלבד: תגובה לכתב או SMS."},400);
  if(p.t!=="s"&&a.length!==2)return send(r,{err:"יש למלא את שני השדות."},400);
  if(p.t==="s"&&(S.ph==="r4"||S.ph==="r6")&&a[0].length>320)return send(r,{err:"SMS מבצעי חייב להיות קצר (עד 320 תווים)."},400);
  if(S.ph==="r4"){
   if(!S.event4){p.pre4=a;p.sent.r4="holding";push();return send(r,{ok:1,pending:1})}
   if(!p.r4Ack)return send(r,{err:"קודם יש לאשר את עדכון החמ״ל."},409);
  }
  addSub({t:p.t,r:S.ph,a,by:p.n});p.sent[S.ph]=1;push();return send(r,{ok:1})}
 if(P==="/api/rate"){
  const n=Math.round(+b.n),sid=+b.sid;
  if(!S.cm[b.cid]||!(n>=1&&n<=5)||!S.sub.some(x=>x.id===sid))return send(r,{err:"bad"},400);
  (S.cr[sid]=S.cr[sid]||{})[b.cid]=n;(S.my[b.cid]=S.my[b.cid]||{})[sid]=n;push();return send(r,{ok:1})}
 if(P==="/api/act"){if(!toks.has(q.headers["x-tok"]))return send(r,{err:"auth"},401);act(String(b.a||""),b.k);return send(r,{ok:1})}
 send(r,{err:"not found"},404);
}).listen(PORT,()=>console.log("Server on http://localhost:"+PORT+"  (admin: /#admin, screen: /#screen)"));
