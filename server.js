"use strict";
/* NEWS404 / KAMAD concepts: synchronized, zero-dependency classroom game. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const BUILD = '2026.11.11-concepts.5';
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'kamadP';
const COMMAND_CODE = '18608';
const TEST3 = '67420', TEST4 = '67421';
const KICK_MS = 20_000;
const ONLINE_MS = 11_000;
const DURATIONS = [60,300,75,60,15,300,75,60,15,300,75,60,15,90];
const PHASES = ['intro','write1','reveal1','vote1','results1','write2','reveal2','vote2','results2','write3','reveal3','vote3','results3','finale'];
const CONCEPTS = [
 {title:'המוצר שלא ידענו שאנחנו צריכים',short:'מוצר לקמ״ד',prompt:'המציאו מוצר שפותר בעיה שכולם מכירים בקמ״ד, בדרך הכי מופרכת שאפשר. תנו לו שם והסבירו מה הוא עושה ולמה חייבים אותו.',hint:'הסגל והקהל יחפשו מקוריות, רעיון ברור, והכי חשוב: משהו שבאמת מצחיק.'},
 {title:'הריאליטי שאף ערוץ לא יעז לשדר',short:'ריאליטי בקמ״ד',prompt:'המציאו תוכנית ריאליטי שמתרחשת בקמ״ד. מה הפורמט שלה, מה עושים המשתתפים ומה גורם לצופים להמשיך לראות?',hint:'לא צריך להפיק סרטון. ממציאים רעיון ומנסחים אותו בצורה שמישהו יכול להבין מיד.'},
 {title:'ההקפצה שאף אחד לא ביקש',short:'הקפצת הסיום',prompt:'המציאו את ההקפצה הכי אבסורדית שאפשר להעלות על הדעת בקמ״ד. תנו לה שם ותארו מה קורה בה. זו המצאה קומית בלבד, לא משהו שמבצעים באמת.',hint:'לכו רחוק עם הרעיון, אבל בלי בדיחות על אדם מסוים ובלי להעמיד פנים שמדובר באירוע חירום אמיתי.'}
];
const GROUP_COLORS = ['#5dbaf2','#e9ac54','#c393fc'];
const sessions = new Map(), connections = new Map(), deviceLocks = new Map();
const secret = () => crypto.randomBytes(24).toString('hex');
const shuffle = arr => {const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
const generateCode = () => {let x;do{x=String(crypto.randomInt(10000,99999))}while([COMMAND_CODE,TEST3,TEST4].includes(x));return x};
function fresh(){return {code:generateCode(),phaseIndex:-1,started:false,paused:false,deadline:0,remaining:0,locked:false,submissions:[{},{},{}],slots:[[],[],[]],votes:[{},{},{}],ratings:[{},{},{}],version:1,resetAt:Date.now()}}
let game = fresh();
function phase(){return game.phaseIndex<0?'lobby':PHASES[game.phaseIndex]||'finale'}
function roundIndex(){const m=phase().match(/[123]$/);return m?Number(m[0])-1:phase()==='finale'?2:-1}
function duration(){return game.phaseIndex<0?0:DURATIONS[game.phaseIndex]}
function remaining(){return game.phaseIndex<0?0:game.paused?game.remaining:Math.max(0,Math.ceil((game.deadline-Date.now())/1000))}
function bump(){game.version++}
function advance(){if(game.phaseIndex===PHASES.length-1)return;
 game.phaseIndex++;game.paused=false;game.remaining=DURATIONS[game.phaseIndex];game.deadline=Date.now()+game.remaining*1000;
 const p=phase();const m=p.match(/^reveal([123])$/);
 if(m){const r=Number(m[1])-1;game.slots[r]=shuffle([1,2,3]);}
 bump();pushAll();}
function start(){if(game.started)return false;game.started=true;advance();return true}
// Manual stage progression: the timer stops at 00:00 and only the admin can advance.
function tick(){pushAll()}
const interval=setInterval(tick,1000);interval.unref?.();
function sessionFor(token){return typeof token==='string'?sessions.get(token):null}
function alive(s){return s&&!s.kicked&&s.approved&&Date.now()-s.lastSeen<ONLINE_MS}
function activePlayers(){return [...sessions.values()].filter(s=>s.role==='player'&&alive(s))}
function roster(){return activePlayers().map(s=>({id:s.id,name:s.name,group:s.group})).sort((a,b)=>a.group-b.group||a.name.localeCompare(b.name,'he'))}
function groupCounts(){return [1,2,3].map(g=>activePlayers().filter(x=>x.group===g).length)}
function assignGroup(){const counts=groupCounts(),min=Math.min(...counts),candidates=[1,2,3].filter(g=>counts[g-1]===min);return candidates[crypto.randomInt(candidates.length)]}
function ensureSlots(r){return game.slots[r].length===3?game.slots[r]:[1,2,3]}
const slotLabel = i => ['א','ב','ג'][i];
function audienceScore(r,g){let sum=0,part=0;
 for(const source of [1,2,3].filter(x=>x!==g)){
  const votes=Object.entries(game.votes[r]).filter(([id,by])=>by.group===source&&by.scores[g]!==undefined).map(([,by])=>by.scores[g]);
  if(votes.length){sum+=votes.reduce((a,b)=>a+b,0)/votes.length;part++}
 }
 return part?sum/part:null;
}
function judgeScore(r,g){const a=Object.values(game.ratings[r]).map(v=>v.scores[g]?.score).filter(x=>x!==undefined);return a.length?a.reduce((x,y)=>x+y,0)/a.length:null}
function calc(r,g){if(!game.submissions[r][g])return {audience:null,judges:null,total:0,n:0};
 const audience=audienceScore(r,g),judges=judgeScore(r,g);
 const total=audience===null?(judges||0):judges===null?audience:judges*.7+audience*.3;
 return {audience,judges,total:Number(total.toFixed(2)),n:Object.values(game.votes[r]).filter(x=>x.scores[g]!==undefined).length};}
function ranking(){return [1,2,3].map(g=>({group:g,score:Number([0,1,2].reduce((t,r)=>t+calc(r,g).total,0).toFixed(2))})).sort((a,b)=>b.score-a.score||a.group-b.group)}
function exposeJudges(r){return Object.values(game.ratings[r]).flatMap(j=>Object.entries(j.scores).map(([g,x])=>({name:j.name,group:Number(g),score:x.score,reason:x.reason}))) }
function view(s){const p=phase(),r=roundIndex(),left=remaining();const base={build:BUILD,phase:p,round:r+1,remaining:left,duration:duration(),paused:game.paused,started:game.started,version:game.version,serverTime:Date.now(),concept:r>=0?CONCEPTS[r]:null,groups:groupCounts(),members:roster().map(({name,group})=>({name,group})),finished:game.phaseIndex===PHASES.length-1};
 if(s.role==='admin'){base.code=game.code;base.locked=game.locked;base.roster=roster();base.pending=[...sessions.values()].filter(x=>x.role==='player'&&!x.approved&&!x.kicked).map(x=>({id:x.id,name:x.name,group:x.group}));base.submissions=game.submissions;base.slots=game.slots;base.ratings=game.ratings;base.votes=game.votes;base.ranking=ranking();base.judgesOnline=[...sessions.values()].filter(x=>x.role==='judge'&&alive(x)).length;}
 if(s.role==='player'){base.myGroup=s.group;base.myName=s.name;base.approved=s.approved;base.mySubmission=r>=0?game.submissions[r][s.group]||null:null;base.myVotes=r>=0?game.votes[r][s.id]?.scores||{}:{};}
 if(s.role==='judge'){base.myName=s.name;base.myRatings=r>=0?game.ratings[r][s.id]?.scores||{}:{};}
 if(['admin','screen','judge','preview'].includes(s.role)){
  base.slots=r>=0?ensureSlots(r):[1,2,3];
  if(['reveal1','reveal2','reveal3','vote1','vote2','vote3','results1','results2','results3'].includes(p))base.display=base.slots.map((g,i)=>({slot:i,group:['admin','screen'].includes(s.role)&&p.startsWith('results')?g:null,submission:game.submissions[r][g]||null}));
  if(p.startsWith('results')||p==='finale'){base.results=[0,1,2].map(k=>[1,2,3].map(g=>({group:g,...calc(k,g)})));base.ranking=ranking();base.judgeNotes=[0,1,2].flatMap(k=>exposeJudges(k).map(e=>({...e,round:k+1})));}
  if(s.role==='preview'){
   base.previewRound=CONCEPTS;base.previewSubmissions=game.submissions;base.previewSlots=game.slots;
  }
 }
 if(s.role==='player'&&p.startsWith('vote'))base.ballot=ensureSlots(r).map((g,i)=>({slot:i,label:slotLabel(i),group:g===s.group?'self':null,submitted:!!game.submissions[r][g],myScore:game.votes[r][s.id]?.scores[g]??null}));
 if(s.role==='judge'&&['reveal1','reveal2','reveal3','vote1','vote2','vote3'].includes(p))base.ballot=ensureSlots(r).map((g,i)=>({slot:i,label:slotLabel(i),group:g,submission:game.submissions[r][g]||null}));
 if(s.role==='screen'&&p==='lobby')base.code=game.code;
 if(s.role==='preview')base.mode=s.mode;
 return base;
}
function json(res,code,obj){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj))}
function readBody(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',d=>{raw+=d;if(raw.length>100_000){reject(new Error('large body'));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'))}catch{reject(new Error('invalid JSON'))}});req.on('error',reject)})}
function sendSnapshot(token,res){const s=sessionFor(token);if(!s||s.kicked){try{res.write(`event: revoked\ndata: ${JSON.stringify({error:'נותקת מהמשחק',kickUntil:s?.kickUntil||0,previousName:s?.name||''})}\n\n`)}catch{};res.end();return false}
 const data=JSON.stringify(view(s));try{res.write(`event: state\ndata: ${data}\n\n`);return true}catch{return false}}
function pushAll(){for(const [token,set] of connections){for(const res of set){if(!sendSnapshot(token,res))set.delete(res)}if(!set.size)connections.delete(token)}}
function destroySession(s){if(s){s.kicked=true;s.kickUntil=Date.now()+KICK_MS;bump();pushAll()}}
function checkAuth(req,body){return sessionFor(req.headers['x-session']||body?.token)}
function bad(res,err,code=400,extra={}){json(res,code,{error:err,...extra})}
function adminAction(action,data){switch(action){
 case 'start':return start();
 case 'next':if(game.started){advance();return true}return false;
 case 'pause':if(!game.started)return false;if(game.paused){game.deadline=Date.now()+game.remaining*1000;game.paused=false}else{game.remaining=remaining();game.paused=true}bump();return true;
 case 'add30':if(!game.started||phase()==='finale')return false;if(game.paused)game.remaining+=30;else game.deadline=Math.max(game.deadline,Date.now())+30_000;bump();return true;
 case 'lock':game.locked=!game.locked;bump();return true;
 case 'reset':game=fresh();bump();return true;
 case 'approve':{const s=[...sessions.values()].find(x=>x.id===data.id&&x.role==='player');if(!s||s.kicked)return false;s.approved=true;bump();return true}
 case 'reject':{const s=[...sessions.values()].find(x=>x.id===data.id&&x.role==='player');if(!s)return false;destroySession(s);return true}
 case 'kick':{const s=[...sessions.values()].find(x=>x.id===data.id&&x.role==='player');if(!s)return false;deviceLocks.set(s.device,{until:Date.now()+KICK_MS,name:s.name});destroySession(s);return true}
 case 'deleteConcept':{
  const r=Number(data.round),g=Number(data.group);
  if(!Number.isInteger(r)||r<0||r>2||!Number.isInteger(g)||g<1||g>3||!game.submissions[r][g])return false;
  delete game.submissions[r][g];
  // Never leave votes or judge scores counting a deleted concept.
  for(const ballot of Object.values(game.votes[r]))delete ballot.scores[g];
  for(const ballot of Object.values(game.ratings[r]))delete ballot.scores[g];
  bump();return true;
 }
 default:return false;
}}
async function handle(req,res){const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);const endpoint=u.pathname;
 if(req.method==='GET'&&['/','/index.html'].includes(endpoint)){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, max-age=0','Pragma':'no-cache'});res.end(fs.readFileSync(path.join(__dirname,'public','index.html')));return}
 if(req.method==='GET'&&endpoint==='/join-qr.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'public, max-age=600'});return res.end(fs.readFileSync(path.join(__dirname,'public','join-qr.svg')))}
 // Allow only the three named soundtrack files. Byte ranges support mobile audio streaming.
 const filename=decodeURIComponent(endpoint.slice(1));
 if(['GET','HEAD'].includes(req.method)&&['Hakpaza.mp3','Hapaza2.mp3','Hapaza3.mp3'].includes(filename)){
  const audioPath=path.join(__dirname,'public',filename);
  let st;try{st=fs.statSync(audioPath)}catch{return bad(res,'קובץ המוזיקה עדיין לא הועלה',404)}
  if(!st.isFile())return bad(res,'קובץ המוזיקה חסר',404);
  const size=st.size;let start=0,end=Math.max(0,size-1),status=200;
  const hdr={'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Cache-Control':'public, max-age=600'};
  const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||'');
  if(match){
   if(match[1])start=Number(match[1]);
   if(match[2])end=Number(match[2]);
   if(!match[1]&&match[2]){start=Math.max(0,size-Number(match[2]));end=size-1}
   end=Math.min(end,size-1);
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){
    res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();
   }
   status=206;hdr['Content-Range']=`bytes ${start}-${end}/${size}`;
  }
  hdr['Content-Length']=end-start+1;
  res.writeHead(status,hdr);
  if(req.method==='HEAD')return res.end();
  return fs.createReadStream(audioPath,{start,end}).pipe(res);
 }
 if(req.method==='GET'&&endpoint==='/api/health'){return json(res,200,{ok:true,build:BUILD,phase:phase()})}
 if(req.method==='GET'&&endpoint==='/api/stream'){
  const token=u.searchParams.get('token'),s=sessionFor(token);if(!s||s.kicked)return bad(res,'גישה נדחתה',401);
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
  res.write(': connected\n\n');if(!connections.has(token))connections.set(token,new Set());connections.get(token).add(res);sendSnapshot(token,res);
  req.on('close',()=>{connections.get(token)?.delete(res);if(!connections.get(token)?.size)connections.delete(token)});return;
 }
 if(req.method!=='POST'||!endpoint.startsWith('/api/'))return bad(res,'נתיב לא נמצא',404);
 let body;try{body=await readBody(req)}catch{return bad(res,'בקשה לא תקינה',400)}
 if(endpoint==='/api/login'){
  if(String(body.password||'')!==ADMIN_PASSWORD)return bad(res,'סיסמה שגויה',401);
  const token=secret(),s={id:token,role:'admin',name:'אדמין',lastSeen:Date.now(),approved:true};sessions.set(token,s);return json(res,200,{token,role:'admin'});
 }
 if(endpoint==='/api/screen'){const token=secret(),s={id:token,role:'screen',name:'מסך הקרנה',approved:true,lastSeen:Date.now()};sessions.set(token,s);return json(res,200,{token,role:'screen'})}
 if(endpoint==='/api/join'){
  const code=String(body.code||'').trim(),name=String(body.name||'').trim().slice(0,28),device=String(body.device||'').slice(0,90);
  if(!name||name.length<2)return bad(res,'צריך להקליד שם של לפחות שני תווים');
  if(!device||device.length<8)return bad(res,'מזהה מכשיר חסר');
  const role=code===game.code?'player':code===COMMAND_CODE?'judge':[TEST3,TEST4].includes(code)?'preview':null;
  if(!role)return bad(res,'קוד הכניסה שגוי',401);
  const lock=deviceLocks.get(device);
  if(lock&&role==='player'){
   if(Date.now()<lock.until)return bad(res,'יש להמתין 20 שניות אחרי הוצאה',429,{kickUntil:lock.until,previousName:lock.name});
   if(name.toLocaleLowerCase('he')===lock.name.toLocaleLowerCase('he'))return bad(res,'לאחר הוצאה צריך לבחור שם אחר',400,{previousName:lock.name});
   deviceLocks.delete(device);
  }
  const existing=[...sessions.entries()].find(([,s])=>s.device===device&&s.role===role&&!s.kicked);
  if(existing){existing[1].lastSeen=Date.now();return json(res,200,{token:existing[0],role,group:existing[1].group,approved:existing[1].approved,mode:existing[1].mode})}
  if(game.locked&&role==='player')return bad(res,'הכניסה למשחק נעולה כרגע',403);
  const token=secret(),s={id:token,role,name,device,lastSeen:Date.now(),approved:!game.started||role!=='player',group:role==='player'?assignGroup():null,kicked:false,mode:code===TEST3?3:code===TEST4?4:0};
  sessions.set(token,s);bump();pushAll();return json(res,200,{token,role,group:s.group,approved:s.approved,mode:s.mode});
 }
 const s=checkAuth(req,body);if(!s||s.kicked)return bad(res,'החיבור אינו פעיל. יש להתחבר מחדש.',401,{kickUntil:s?.kickUntil||0,previousName:s?.name||''});
 if(endpoint==='/api/resume'){s.lastSeen=Date.now();return json(res,200,{token:req.headers['x-session']||body.token,role:s.role,group:s.group,approved:s.approved,mode:s.mode})}
 if(endpoint==='/api/heartbeat'){s.lastSeen=Date.now();return json(res,200,{ok:true})}
 if(endpoint==='/api/state'){s.lastSeen=Date.now();return json(res,200,view(s))}
 if(endpoint==='/api/leave'){s.lastSeen=0;bump();pushAll();return json(res,200,{ok:true})}
 if(endpoint==='/api/admin'){
  if(s.role!=='admin')return bad(res,'אין הרשאה',403);
  if(!adminAction(body.action,body))return bad(res,'הפעולה אינה זמינה בשלב הזה');pushAll();return json(res,200,{ok:true});
 }
 if(endpoint==='/api/submit'){
  if(s.role!=='player'||!s.approved)return bad(res,'אין הרשאה להגיש',403);
  const r=roundIndex();if(phase()!==`write${r+1}`||remaining()<=0||game.paused)return bad(res,'חלון ההגשה סגור');
  const title=String(body.title||'').trim().slice(0,90),description=String(body.description||'').trim().slice(0,520);
  if(title.length<3||description.length<12)return bad(res,'צריך שם לקונספט והסבר של לפחות 12 תווים');
  // Exactly one submission per group and round. The first accepted request wins;
  // later requests cannot replace it, even from a stale browser or simultaneous taps.
  if(game.submissions[r][s.group])return bad(res,'הקבוצה כבר הגישה קונספט. רק המנהל יכול למחוק ולפתוח הגשה חדשה.',409);
  game.submissions[r][s.group]={title,description,author:s.name,group:s.group,updatedAt:Date.now()};bump();pushAll();return json(res,200,{ok:true});
 }
 if(endpoint==='/api/vote'){
  if(s.role!=='player'||!s.approved)return bad(res,'אין הרשאה',403);
  const r=roundIndex();if(phase()!==`vote${r+1}`||remaining()<=0)return bad(res,'ההצבעה הסתיימה');
  const slot=Number(body.slot),score=Number(body.score),target=ensureSlots(r)[slot];
  if(!Number.isInteger(slot)||slot<0||slot>2||!Number.isInteger(score)||score<1||score>5||target===s.group||!game.submissions[r][target])return bad(res,'לא ניתן לדרג את הכרטיסייה');
  if(!game.votes[r][s.id])game.votes[r][s.id]={group:s.group,scores:{}};
  game.votes[r][s.id].scores[target]=score;bump();pushAll();return json(res,200,{ok:true});
 }
 if(endpoint==='/api/rate'){
  if(s.role!=='judge')return bad(res,'רק הסגל יכול להגיש דירוג מנומק',403);
  const r=roundIndex();if(![`reveal${r+1}`,`vote${r+1}`].includes(phase())||remaining()<=0)return bad(res,'חלון דירוג הסגל סגור');
  const slot=Number(body.slot),score=Number(body.score),reason=String(body.reason||'').trim().slice(0,220),target=ensureSlots(r)[slot];
  if(!Number.isInteger(slot)||slot<0||slot>2||!Number.isInteger(score)||score<1||score>5||reason.length<4||!game.submissions[r][target])return bad(res,'צריך ציון מ־1 עד 5 ונימוק קצר לכל קונספט');
  if(!game.ratings[r][s.id])game.ratings[r][s.id]={name:s.name,scores:{}};
  game.ratings[r][s.id].scores[target]={score,reason};bump();pushAll();return json(res,200,{ok:true});
 }
 return bad(res,'נתיב לא נמצא',404);
}
const server=http.createServer((req,res)=>{handle(req,res).catch(e=>{console.error(e);if(!res.headersSent)bad(res,'שגיאת שרת',500);else res.end()})});
server.listen(PORT,'0.0.0.0',()=>console.log(`NEWS404 ${BUILD} on http://0.0.0.0:${PORT}`));
