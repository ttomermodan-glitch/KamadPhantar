'use strict';
// NEWS404 / Hakpatza Pitch: synchronized zero-dependency classroom game.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const BUILD = '2026.11.11-pitch.1';
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'kamadP';
const COMMAND_CODE = '18608';
const TEST3 = '67420', TEST4 = '67421';
const KICK_MS = 20_000, ONLINE_MS = 16_000;
const ROUNDS = [
  {name:'תמכרו לי את זה',tag:'מוצר מיותר לקמ״ד',prompt:'המציאו מוצר שאף אחד לא ביקש, אבל איכשהו הוא נשמע כמו הדבר שהקמ״ד הכי צריך. מכרו אותו ברצינות מוחלטת.',hint:'שם, בעיה שהוא פותר, מחיר חסר היגיון וסלוגן שאי אפשר לשכוח.',detail:'חפשו משהו קטן ומוכר מהיומיום בקורס, ותנו לו פתרון מוגזם להחריד.'},
  {name:'הבעיה שלא הייתה קיימת',tag:'קודם ממציאים בעיה',prompt:'תמציאו בעיה דמיונית ומגוחכת שקיימת כביכול בקמ״ד. אחר כך תמכרו מוצר שמפתר אותה, אבל יוצר יותר בעיות ממה שהיו קודם.',hint:'הבעיה עצמה צריכה להיות משכנעת. הפתרון חייב להיות גרוע במיוחד.',detail:'ככל שהנציג נשמע בטוח בעצמו, כך הרעיון יכול להיות טיפשי יותר.'},
  {name:'עסקת המאה',tag:'חפץ + מגבלה',prompt:'קיבלתם חפץ ומגבלת מכירה. אתם חייבים להפוך את השילוב הזה למוצר ולמכור אותו לסגל כאילו מדובר בהשקעה של החיים.',hint:'אסור להחליף את החפץ או להתעלם מהמגבלה. כל היתר מותר להמציא.',detail:'הסגל יכול להציע חפצים מראש. אם לא הציע, המערכת תבחר עבורכם.'}
];
const STAGES=[{id:'intro',seconds:60,label:'פתיחת הפעילות'}];
for(let r=1;r<=3;r++){
 STAGES.push({id:`write${r}`,seconds:300,label:`סבב ${r}: המצאה והגשה`});
 for(const c of ['a','b','c'])STAGES.push({id:`pitch${r}${c}`,seconds:30,label:`סבב ${r}: הצגת מוצר ${c.toUpperCase()}`});
 STAGES.push({id:`vote${r}`,seconds:45,label:`סבב ${r}: הצבעות ודירוג סגל`});
 STAGES.push({id:`results${r}`,seconds:15,label:`סבב ${r}: חשיפת תוצאות`});
}
STAGES.push({id:'finale',seconds:90,label:'הכרזת מנצחים'});
const DURATIONS=STAGES.map(x=>x.seconds);
const PHASES=STAGES.map(x=>x.id);
const SEEDS=['שדכן','שרוך','מחק','פנס','ספל','מחברת','גרב','מטען','אטב','בקבוק מים'];
const CONSTRAINTS=[
 'חייב לעבוד רק בשעה 21:30',
 'אסור למכור אותו למי שבאמת צריך אותו',
 'צריך להחזיר אותו בכל סוף שיעור',
 'אסור לומר את שם המוצר במהלך המכירה',
 'חייב להימכר במנוי חודשי',
 'חייב לפעול בלי חשמל, אפליקציה או סוללה',
 'מותר להפעיל אותו רק מול לפחות שלושה עדים',
 'אסור להסביר למה הוא קיים'
];
const sessions=new Map(), connections=new Map(), deviceLocks=new Map();
const secret=()=>crypto.randomBytes(24).toString('hex');
const shuffle=x=>{const a=[...x];for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a};
const generateCode=()=>{let x;do{x=String(crypto.randomInt(10000,99999))}while([COMMAND_CODE,TEST3,TEST4].includes(x));return x};
function fresh(){return {code:generateCode(),phaseIndex:-1,started:false,paused:false,deadline:0,remaining:0,locked:false,submissions:[{},{},{}],slots:[[],[],[]],votes:[{},{},{}],ratings:[{},{},{}],questions:[{},{},{}],seedWords:{},challenges:{},version:1,resetAt:Date.now()}}
let game=fresh();
function phase(){return game.phaseIndex<0?'lobby':PHASES[game.phaseIndex]||'finale'}
function roundIndex(){const m=/^(?:write|pitch|vote|results)([123])/.exec(phase());return m?Number(m[1])-1:phase()==='finale'?2:-1}
function pitchSlot(){const m=/^pitch[123]([abc])$/.exec(phase());return m?'abc'.indexOf(m[1]):-1}
function currentGroup(){const r=roundIndex(),slot=pitchSlot();return r>=0&&slot>=0?game.slots[r][slot]||null:null}
function duration(){return game.phaseIndex<0?0:DURATIONS[game.phaseIndex]}
function remaining(){return game.phaseIndex<0?0:game.paused?game.remaining:Math.max(0,Math.ceil((game.deadline-Date.now())/1000))}
function bump(){game.version++}
function makeChallenges(){
 const offered=Object.values(game.seedWords).filter(Boolean).map(x=>x.word);
 const proposed=shuffle([...new Set(offered)]);const words=[...proposed,...shuffle(SEEDS.filter(x=>!proposed.includes(x)))];const limits=shuffle(CONSTRAINTS);
 for(let g=1;g<=3;g++)game.challenges[g]={object:words[g-1],limit:limits[g-1]};
}
function advance(){
 if(game.phaseIndex===PHASES.length-1)return false;
 game.phaseIndex++;game.paused=false;game.remaining=duration();game.deadline=Date.now()+game.remaining*1000;
 const p=phase(),r=roundIndex();
 if(/^pitch[123]a$/.test(p))game.slots[r]=shuffle([1,2,3]);
 if(p==='write3')makeChallenges();
 bump();pushAll();return true;
}
function start(){if(game.started)return false;game.started=true;return advance()}
const interval=setInterval(()=>pushAll(),1000);interval.unref?.();
function alive(s){return s&&!s.kicked&&s.approved&&Date.now()-s.lastSeen<ONLINE_MS}
function activePlayers(){return [...sessions.values()].filter(s=>s.role==='player'&&alive(s))}
function roster(){return activePlayers().map(s=>({id:s.id,name:s.name,group:s.group})).sort((a,b)=>a.group-b.group||a.name.localeCompare(b.name,'he'))}
function groupCounts(){return [1,2,3].map(g=>activePlayers().filter(s=>s.group===g).length)}
function assignGroup(){const c=groupCounts(),min=Math.min(...c),a=[1,2,3].filter(g=>c[g-1]===min);return a[crypto.randomInt(a.length)]}
function ensureSlots(r){return game.slots[r]?.length===3?game.slots[r]:[1,2,3]}
function audienceScore(r,g){let sum=0,part=0;for(const source of [1,2,3].filter(x=>x!==g)){
 const votes=Object.values(game.votes[r]).filter(v=>v.group===source&&v.scores[g]!==undefined).map(v=>v.scores[g]);
 if(votes.length){sum+=votes.reduce((a,b)=>a+b,0)/votes.length;part++}
}return part?sum/part:null}
function judgeScore(r,g){const a=Object.values(game.ratings[r]).map(v=>v.scores[g]?.score).filter(x=>x!==undefined);return a.length?a.reduce((x,y)=>x+y,0)/a.length:null}
function calc(r,g){if(!game.submissions[r][g])return {audience:null,judges:null,total:0,count:0};
 const audience=audienceScore(r,g),judges=judgeScore(r,g),total=audience===null?(judges??0):judges===null?audience:judges*.7+audience*.3;
 return {audience,judges,total:Number(total.toFixed(2)),count:Object.values(game.votes[r]).filter(x=>x.scores[g]!==undefined).length}}
function ranking(){return [1,2,3].map(g=>({group:g,score:Number([0,1,2].reduce((t,r)=>t+calc(r,g).total,0).toFixed(2))})).sort((a,b)=>b.score-a.score||a.group-b.group)}
function notes(r){return Object.values(game.ratings[r]).flatMap(j=>Object.entries(j.scores).map(([g,x])=>({name:j.name,group:Number(g),score:x.score,reason:x.reason,round:r+1})))}
function sessionFor(t){return typeof t==='string'?sessions.get(t):null}
function view(s){
 const p=phase(),r=roundIndex(),stage=STAGES[game.phaseIndex],pi=pitchSlot(),cg=currentGroup();
 const base={build:BUILD,phase:p,round:r+1,stage:game.phaseIndex+1,totalStages:STAGES.length,stageLabel:stage?.label||'ממתינים לפתיחה',remaining:remaining(),duration:duration(),paused:game.paused,started:game.started,version:game.version,serverTime:Date.now(),concept:r>=0?ROUNDS[r]:null,groups:groupCounts(),members:roster().map(({name,group})=>({name,group})),presentationGroup:cg,presentationOrder:pi>=0?pi+1:null};
 if(s.role==='admin')Object.assign(base,{code:game.code,locked:game.locked,roster:roster(),pending:[...sessions.values()].filter(x=>x.role==='player'&&!x.approved&&!x.kicked).map(x=>({id:x.id,name:x.name,group:x.group})),submissions:game.submissions,slots:game.slots,ratings:game.ratings,votes:game.votes,ranking:ranking(),judgesOnline:[...sessions.values()].filter(x=>x.role==='judge'&&alive(x)).length,seedWords:Object.values(game.seedWords),challenges:game.challenges});
 if(s.role==='player')Object.assign(base,{myGroup:s.group,myName:s.name,approved:s.approved,mySubmission:r>=0?game.submissions[r][s.group]||null:null,myVotes:r>=0?game.votes[r][s.id]?.scores||{}:{},challenge:r===2?game.challenges[s.group]||null:null});
 if(s.role==='judge')Object.assign(base,{myName:s.name,myRatings:r>=0?game.ratings[r][s.id]?.scores||{}:{},mySeed:game.seedWords[s.id]?.word||'',seedCount:Object.keys(game.seedWords).length});
 if(['admin','screen','judge','preview'].includes(s.role)){
  base.slots=r>=0?ensureSlots(r):[1,2,3];
  if(r>=0&&(p.startsWith('pitch')||p.startsWith('vote')||p.startsWith('results'))){
   base.display=ensureSlots(r).map((g,i)=>({slot:i,group:g,submission:game.submissions[r][g]||null,challenge:r===2?game.challenges[g]:null,question:game.questions[r][g]?.text||null}));
  }
  if(p.startsWith('results')||p==='finale'||s.role==='admin')Object.assign(base,{results:[0,1,2].map(k=>[1,2,3].map(g=>({group:g,...calc(k,g)}))),ranking:ranking(),judgeNotes:[0,1,2].flatMap(k=>notes(k))});
 }
 if(s.role==='player'&&p.startsWith('vote'))base.ballot=ensureSlots(r).map((g,i)=>({slot:i,group:g,isSelf:g===s.group,submitted:!!game.submissions[r][g],myScore:game.votes[r][s.id]?.scores[g]??null,submission:game.submissions[r][g]||null}));
 if(s.role==='judge'&&(p.startsWith('pitch')||p.startsWith('vote')))base.ballot=ensureSlots(r).map((g,i)=>({slot:i,group:g,submission:game.submissions[r][g]||null,question:game.questions[r][g]?.text||null}));
 if(s.role==='player'&&cg)base.presentation={group:cg,submission:game.submissions[r][cg]||null,question:game.questions[r][cg]?.text||null};
 if(s.role==='screen'&&p==='lobby')base.code=game.code;
 if(s.role==='preview'){base.mode=s.mode;base.previewRound=ROUNDS;base.previewSubmissions=game.submissions;base.previewSlots=game.slots;}
 return base;
}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
function bad(res,msg,status=400,extra={}){return json(res,status,{error:msg,...extra})}
function readBody(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',x=>{raw+=x;if(raw.length>100000){reject(new Error('large body'));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'))}catch{reject(new Error('bad JSON'))}});req.on('error',reject)})}
function sendSnapshot(token,res){const s=sessionFor(token);if(!s||s.kicked){try{res.write(`event: revoked\ndata: ${JSON.stringify({error:'נותקת מהמשחק',kickUntil:s?.kickUntil||0,previousName:s?.name||''})}\n\n`)}catch{}res.end();return false}try{res.write(`event: state\ndata: ${JSON.stringify(view(s))}\n\n`);return true}catch{return false}}
function pushAll(){for(const [token,set] of connections){for(const res of set){if(!sendSnapshot(token,res))set.delete(res)}if(!set.size)connections.delete(token)}}
function destroySession(s){if(s){s.kicked=true;s.kickUntil=Date.now()+KICK_MS;bump();pushAll()}}
function adminAction(action,data){switch(action){
 case 'start':return start();
 case 'next':return game.started?advance():false;
 case 'pause':if(!game.started)return false;if(game.paused){game.deadline=Date.now()+game.remaining*1000;game.paused=false}else{game.remaining=remaining();game.paused=true}bump();return true;
 case 'add30':if(!game.started||phase()==='finale')return false;if(game.paused)game.remaining+=30;else game.deadline=Math.max(game.deadline,Date.now())+30000;bump();return true;
 case 'lock':game.locked=!game.locked;bump();return true;
 case 'reset':game=fresh();bump();return true;
 case 'approve':{const x=[...sessions.values()].find(s=>s.id===data.id&&s.role==='player');if(!x||x.kicked)return false;x.approved=true;bump();return true}
 case 'reject':case 'kick':{const x=[...sessions.values()].find(s=>s.id===data.id&&s.role==='player');if(!x)return false;if(action==='kick')deviceLocks.set(x.device,{until:Date.now()+KICK_MS,name:x.name});destroySession(x);return true}
 case 'deleteConcept':{
  const r=Number(data.round),g=Number(data.group);if(!Number.isInteger(r)||r<0||r>2||![1,2,3].includes(g)||!game.submissions[r][g])return false;
  delete game.submissions[r][g];for(const b of Object.values(game.votes[r]))delete b.scores[g];for(const b of Object.values(game.ratings[r]))delete b.scores[g];delete game.questions[r][g];bump();return true;
 }
 default:return false;
}}
async function handle(req,res){
 const u=new URL(req.url,`http://${req.headers.host||'localhost'}`),endpoint=u.pathname;
 if(req.method==='GET'&&['/','/index.html'].includes(endpoint)){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(fs.readFileSync(path.join(__dirname,'public','index.html')))}
 if(req.method==='GET'&&endpoint==='/join-qr.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'public, max-age=600'});return res.end(fs.readFileSync(path.join(__dirname,'public','join-qr.svg')))}
 const filename=endpoint.slice(1);
 if(['GET','HEAD'].includes(req.method)&&['Hakpaza.mp3','Hapaza2.mp3','Hapaza3.mp3'].includes(filename)){
  const p=path.join(__dirname,'public',filename);let st;try{st=fs.statSync(p)}catch{return bad(res,'קובץ המוזיקה עדיין לא הועלה',404)}
  if(!st.isFile())return bad(res,'קובץ המוזיקה חסר',404);
  const size=st.size;let start=0,end=size-1,status=200;const headers={'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Cache-Control':'public, max-age=600'};
  const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||'');if(m){if(m[1])start=Number(m[1]);if(m[2])end=Number(m[2]);if(!m[1]&&m[2]){start=Math.max(0,size-Number(m[2]));end=size-1}end=Math.min(end,size-1);if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end()}status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`}
  headers['Content-Length']=end-start+1;res.writeHead(status,headers);return req.method==='HEAD'?res.end():fs.createReadStream(p,{start,end}).pipe(res);
 }
 if(req.method==='GET'&&endpoint==='/api/health')return json(res,200,{ok:true,build:BUILD,phase:phase()});
 if(req.method==='GET'&&endpoint==='/api/stream'){
  const token=u.searchParams.get('token'),s=sessionFor(token);if(!s||s.kicked)return bad(res,'גישה נדחתה',401);
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': connected\n\n');if(!connections.has(token))connections.set(token,new Set());connections.get(token).add(res);sendSnapshot(token,res);req.on('close',()=>{connections.get(token)?.delete(res);if(!connections.get(token)?.size)connections.delete(token)});return;
 }
 if(req.method!=='POST'||!endpoint.startsWith('/api/'))return bad(res,'נתיב לא נמצא',404);
 let body;try{body=await readBody(req)}catch{return bad(res,'בקשה לא תקינה')}
 if(endpoint==='/api/login'){
  if(String(body.password||'')!==ADMIN_PASSWORD)return bad(res,'סיסמה שגויה',401);
  const token=secret();sessions.set(token,{id:token,role:'admin',name:'מנהל',approved:true,lastSeen:Date.now()});return json(res,200,{token,role:'admin'});
 }
 if(endpoint==='/api/screen'){
  const token=secret();sessions.set(token,{id:token,role:'screen',name:'מסך הקרנה',approved:true,lastSeen:Date.now()});return json(res,200,{token,role:'screen'});
 }
 if(endpoint==='/api/join'){
  const code=String(body.code||'').trim(),name=String(body.name||'').trim().slice(0,28),device=String(body.device||'').slice(0,90);
  if(name.length<2)return bad(res,'יש להזין שם של לפחות שני תווים');if(device.length<8)return bad(res,'מזהה מכשיר חסר');
  const role=code===game.code?'player':code===COMMAND_CODE?'judge':[TEST3,TEST4].includes(code)?'preview':null;if(!role)return bad(res,'קוד הכניסה שגוי',401);
  const lock=deviceLocks.get(device);if(lock&&role==='player'){
   if(Date.now()<lock.until)return bad(res,'יש להמתין 20 שניות אחרי הוצאה',429,{kickUntil:lock.until,previousName:lock.name});
   if(name.toLowerCase()===lock.name.toLowerCase())return bad(res,'לאחר הוצאה צריך לבחור שם אחר',400,{previousName:lock.name});deviceLocks.delete(device);
  }
  const existing=[...sessions.entries()].find(([,x])=>x.device===device&&x.role===role&&!x.kicked);
  if(existing){existing[1].lastSeen=Date.now();return json(res,200,{token:existing[0],role,group:existing[1].group,approved:existing[1].approved,mode:existing[1].mode})}
  if(game.locked&&role==='player')return bad(res,'הכניסה נעולה כרגע',403);
  const token=secret(),s={id:token,role,name,device,lastSeen:Date.now(),approved:!game.started||role!=='player',group:role==='player'?assignGroup():null,kicked:false,mode:code===TEST3?3:code===TEST4?4:0};sessions.set(token,s);bump();pushAll();return json(res,200,{token,role,group:s.group,approved:s.approved,mode:s.mode});
 }
 const s=sessionFor(req.headers['x-session']||body?.token);if(!s||s.kicked)return bad(res,'החיבור אינו פעיל',401,{kickUntil:s?.kickUntil||0,previousName:s?.name||''});
 if(endpoint==='/api/resume'){s.lastSeen=Date.now();return json(res,200,{token:req.headers['x-session']||body.token,role:s.role,group:s.group,approved:s.approved,mode:s.mode})}
 if(endpoint==='/api/heartbeat'){s.lastSeen=Date.now();return json(res,200,{ok:true})}
 if(endpoint==='/api/state'){s.lastSeen=Date.now();return json(res,200,view(s))}
 if(endpoint==='/api/leave'){s.lastSeen=0;bump();pushAll();return json(res,200,{ok:true})}
 if(endpoint==='/api/admin'){
  if(s.role!=='admin')return bad(res,'אין הרשאה',403);
  if(!adminAction(body.action,body))return bad(res,'הפעולה אינה זמינה בשלב הזה');pushAll();return json(res,200,{ok:true});
 }
 if(endpoint==='/api/seed'){
  if(s.role!=='judge')return bad(res,'רק הסגל יכול להציע חפץ',403);
  if(game.challenges[1])return bad(res,'החפצים לסבב השלישי כבר חולקו');
  const word=String(body.word||'').trim().slice(0,35);if(word.length<2)return bad(res,'צריך חפץ בן שני תווים לפחות');game.seedWords[s.id]={name:s.name,word};bump();pushAll();return json(res,200,{ok:true});
 }
 if(endpoint==='/api/submit'){
  if(s.role!=='player'||!s.approved)return bad(res,'אין הרשאה להגיש',403);
  const r=roundIndex();if(phase()!==`write${r+1}`||remaining()<=0||game.paused)return bad(res,'חלון ההגשה סגור');
  const title=String(body.title||'').trim().slice(0,90),description=String(body.description||'').trim().slice(0,450),price=String(body.price||'').trim().slice(0,45),slogan=String(body.slogan||'').trim().slice(0,130);
  if(title.length<3||description.length<12||price.length<1||slogan.length<3)return bad(res,'צריך שם מוצר, הסבר (12 תווים), מחיר וסלוגן');
  if(game.submissions[r][s.group])return bad(res,'הקבוצה כבר הגישה. רק המנהל יכול למחוק ולאפשר הגשה חדשה.',409);
  game.submissions[r][s.group]={title,description,price,slogan,author:s.name,group:s.group,updatedAt:Date.now()};bump();pushAll();return json(res,200,{ok:true});
 }
 if(endpoint==='/api/vote'){
  if(s.role!=='player'||!s.approved)return bad(res,'אין הרשאה',403);
  const r=roundIndex();if(phase()!==`vote${r+1}`||remaining()<=0||game.paused)return bad(res,'ההצבעה סגורה');
  const slot=Number(body.slot),score=Number(body.score),target=ensureSlots(r)[slot];
  if(!Number.isInteger(slot)||slot<0||slot>2||!Number.isInteger(score)||score<1||score>5||target===s.group||!game.submissions[r][target])return bad(res,'לא ניתן לדרג את המוצר הזה');
  if(!game.votes[r][s.id])game.votes[r][s.id]={group:s.group,scores:{}};
  game.votes[r][s.id].scores[target]=score;bump();pushAll();return json(res,200,{ok:true});
 }
 if(endpoint==='/api/rate'){
  if(s.role!=='judge')return bad(res,'רק הסגל יכול לדרג',403);
  const r=roundIndex(),p=phase(),slot=Number(body.slot),score=Number(body.score),reason=String(body.reason||'').trim().slice(0,220),target=ensureSlots(r)[slot];
  if(!(p.startsWith('pitch')||p.startsWith('vote'))||remaining()<=0||game.paused)return bad(res,'חלון דירוג הסגל סגור');
  if(!Number.isInteger(slot)||slot<0||slot>2||!Number.isInteger(score)||score<1||score>5||reason.length<4||!game.submissions[r][target])return bad(res,'צריך ציון בין 1 ל־5 ונימוק קצר');
  if(p.startsWith('pitch')&&currentGroup()!==target)return bad(res,'אפשר לדרג כעת רק את המוצר שמוצג');
  if(!game.ratings[r][s.id])game.ratings[r][s.id]={name:s.name,scores:{}};game.ratings[r][s.id].scores[target]={score,reason};bump();pushAll();return json(res,200,{ok:true});
 }
 if(endpoint==='/api/ask'){
  if(s.role!=='judge')return bad(res,'רק הסגל יכול לשאול',403);
  const r=roundIndex(),g=currentGroup(),q=String(body.question||'').trim().slice(0,110);
  if(!phase().startsWith('pitch')||remaining()<=0||game.paused||!g)return bad(res,'אפשר לשאול רק בזמן הצגה');
  if(q.length<5)return bad(res,'השאלה קצרה מדי');
  const accepted=!game.questions[r][g];
  if(accepted)game.questions[r][g]={text:q,name:s.name}; // only the first question appears on the projector
  bump();pushAll();return json(res,200,{ok:true,accepted});
 }
 return bad(res,'נתיב לא נמצא',404);
}
const server=http.createServer((req,res)=>{handle(req,res).catch(e=>{console.error(e);if(!res.headersSent)bad(res,'שגיאת שרת',500);else res.end()})});
server.listen(PORT,'0.0.0.0',()=>console.log(`NEWS404 ${BUILD} on :${PORT}`));
