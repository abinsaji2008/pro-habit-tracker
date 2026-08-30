import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays, Clock3, MapPin, Plus, Settings2, ChevronLeft, ChevronRight, Check, X, RefreshCw, Cloud, CloudOff, ShieldCheck, Trash2, Pencil, Home, BookOpen, Cpu, Dumbbell, School, Coffee, Monitor, CircleDot, ArrowRight, ExternalLink, Save, LayoutDashboard, CheckSquare, StickyNote, BarChart3, LogOut } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { getDatabase, ref, get, set } from 'firebase/database';
import { firebaseConfig, GOOGLE_CLIENT_ID, CALENDAR_API_KEY } from './firebaseConfig.js';
import './styles.css';

const COMMON_PLACES = [['Study Desk', Monitor], ['Bedroom', Home], ['School', School], ['Library', BookOpen], ['Workshop', Cpu], ['Gym', Dumbbell], ['Kitchen', Coffee]];
const TYPES = { routine: ['Routine', CircleDot], study: ['Study', BookOpen], fixed: ['Fixed', School], personal: ['Personal', Home] };
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAYKEY = ['MO','TU','WE','TH','FR','SA','SU'];
const emptyData = { tasks: {}, habits: {}, dailyRecords: {} };
const pad = n => String(n).padStart(2, '0');
const mins = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
const clock = m => { const h=Math.floor(m/60), ap=h>=12?'PM':'AM'; return `${h%12||12}:${pad(m%60)} ${ap}`; };
const duration = m => { const h=Math.floor(m/60), r=m%60; return h ? `${h}h${r ? ` ${r}m` : ''}` : `${r}m`; };
const dayIndex = d => d.getDay() === 0 ? 6 : d.getDay()-1;
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const clone = x => JSON.parse(JSON.stringify(x));

function loadScript(src) {
  return new Promise((resolve,reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s=document.createElement('script'); s.src=src; s.async=true; s.onload=resolve; s.onerror=()=>reject(new Error(`Could not load ${src}`)); document.head.appendChild(s);
  });
}

function App(){
  const configured = !!firebaseConfig?.apiKey && !String(firebaseConfig.apiKey).includes('YOUR_');
  const [fb,setFb] = useState(null), [user,setUser] = useState(null);
  const [tab,setTab] = useState('today'), [selected,setSelected] = useState(new Date());
  const [blocks,setBlocks] = useState([]), [legacy,setLegacy] = useState(emptyData);
  const [places,setPlaces] = useState(['Study Desk','Bedroom','School','Workshop']);
  const [modal,setModal] = useState(null), [notice,setNotice] = useState('');
  const [token,setToken] = useState(null), [calConnected,setCalConnected] = useState(false), [calEvents,setCalEvents] = useState([]), [calLoading,setCalLoading] = useState(false);

  useEffect(()=>{
    if(!configured) return;
    const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getFirestore(app), rtdb=getDatabase(app);
    return onAuthStateChanged(auth,u=>{ setUser(u); setFb(u ? {auth,db,rtdb} : null); });
  },[configured]);

  useEffect(()=>{
    if(!fb || !user) return;
    const q=query(collection(fb.db,'users',user.uid,'blocks'), orderBy('start'));
    return onSnapshot(q,s=>setBlocks(s.docs.map(d=>({id:d.id,...d.data()}))));
  },[fb,user]);

  useEffect(()=>{
    if(!fb || !user) return;
    get(ref(fb.rtdb,`users/${user.uid}`)).then(s=>{
      const v=s.exists()?s.val():emptyData;
      setLegacy({tasks:v.tasks||{},habits:v.habits||{},dailyRecords:v.dailyRecords||{}});
    }).catch(e=>setNotice(e.message));
  },[fb,user]);

  useEffect(()=>{
    const p=JSON.parse(localStorage.getItem('dayforge_places')||'null'); if(p) setPlaces(p);
  },[]);
  useEffect(()=>localStorage.setItem('dayforge_places',JSON.stringify(places)),[places]);
  useEffect(()=>{ if(token) fetchCalendar(token); },[selected]);

  const key=dateKey(selected), di=dayIndex(selected);
  const todayBlocks=useMemo(()=>blocks.filter(b=>b.active!==false&&b.days?.includes(di)&&!(b.exceptions||[]).includes(key)).sort((a,b)=>a.start.localeCompare(b.start)),[blocks,di,key]);
  const occupied=[...todayBlocks.map(b=>({start:mins(b.start),end:mins(b.end),title:b.title,place:b.place,source:'plan'})),...calEvents.map(e=>({start:e.startMin,end:e.endMin,title:e.summary,place:'Google Calendar',source:'google'}))].sort((a,b)=>a.start-b.start);
  const free=calcFree(occupied,420,1380,20);
  const taskEntries=Object.entries(legacy.tasks||{}).filter(([,t])=>t.date===key);
  const habits=Object.entries(legacy.habits||{}).filter(([,h])=>h.active!==false);
  const completed=taskEntries.filter(([,t])=>t.completed).length+habits.filter(([id])=>legacy.dailyRecords?.[key]?.habitChecks?.[id]).length;
  const total=taskEntries.length+habits.length, percent=total?Math.round(completed/total*100):0;

  async function login(){try{if(!configured)return setNotice('Firebase configuration is missing.');await signInWithPopup(fb.auth,new GoogleAuthProvider())}catch(e){setNotice(e.message)}}
  async function saveBlock(b){
    if(!b.title.trim()||mins(b.end)<=mins(b.start)||!b.days?.length||!b.place)return setNotice('Add a name, valid time, place, and at least one day.');
    const clean={...b,title:b.title.trim()};
    setBlocks(p=>p.some(x=>x.id===clean.id)?p.map(x=>x.id===clean.id?clean:x):[...p,clean]);
    if(fb&&user) await setDoc(doc(fb.db,'users',user.uid,'blocks',clean.id),{...clean,updatedAt:serverTimestamp()});
    if(token) await syncCalendarBlock(clean,token);
    setModal(null); setNotice(token?'Saved and Calendar synchronized':'Activity saved');
  }
  async function removeBlock(id){
    if(fb&&user) await deleteDoc(doc(fb.db,'users',user.uid,'blocks',id));
    setBlocks(p=>p.filter(x=>x.id!==id));
    if(token) await deleteCalendarBlock(id,token);
    setNotice('Activity removed');
  }
  async function saveLegacy(path,value){
    if(!fb||!user)return;
    await set(ref(fb.rtdb,`users/${user.uid}/${path}`),value);
    setLegacy(prev=>{const n=clone(prev);const parts=path.split('/');let q=n;for(let i=0;i<parts.length-1;i++)q=q[parts[i]]||(q[parts[i]]={});q[parts.at(-1)]=value;return n});
  }
  function addPlace(p){if(p&&!places.includes(p))setPlaces(x=>[...x,p])}

  async function connectCalendar(){
    if(!GOOGLE_CLIENT_ID||GOOGLE_CLIENT_ID.includes('YOUR_'))return setNotice('Google OAuth Client ID is missing.');
    setCalLoading(true);
    try{
      await loadScript('https://accounts.google.com/gsi/client');
      const tc=window.google.accounts.oauth2.initTokenClient({client_id:GOOGLE_CLIENT_ID,scope:'https://www.googleapis.com/auth/calendar',callback:async r=>{
        if(r.error){setNotice(r.error);setCalLoading(false);return;}
        setToken(r.access_token);setCalConnected(true);setNotice('Google Calendar connected');
        try{ for(const b of blocks) await syncCalendarBlock(b,r.access_token); await fetchCalendar(r.access_token); } finally { setCalLoading(false); }
      }});
      tc.requestAccessToken({prompt:''});
    }catch(e){setNotice(e.message);setCalLoading(false)}
  }
  async function fetchCalendar(t=token){
    if(!t)return;
    try{
      const a=new Date(selected);a.setHours(0,0,0,0);const b=new Date(selected);b.setHours(23,59,59,999);
      const url=`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(a.toISOString())}&timeMax=${encodeURIComponent(b.toISOString())}&showDeleted=false`;
      const r=await fetch(url,{headers:{Authorization:`Bearer ${t}`}}); if(!r.ok) throw new Error('Could not read Google Calendar.');
      const j=await r.json();setCalEvents((j.items||[]).filter(e=>e.start?.dateTime&&e.end?.dateTime&&e.status!=='cancelled').map(e=>({id:e.id,summary:e.summary||'Calendar event',startMin:new Date(e.start.dateTime).getHours()*60+new Date(e.start.dateTime).getMinutes(),endMin:new Date(e.end.dateTime).getHours()*60+new Date(e.end.dateTime).getMinutes()})));
    }catch(e){setNotice(e.message)}
  }
  async function syncCalendarBlock(b,t){
    try{
      const tz=Intl.DateTimeFormat().resolvedOptions().timeZone, url='https://www.googleapis.com/calendar/v3/calendars/primary/events';
      const base=new Date(); base.setHours(0,0,0,0); const monday=new Date(base); monday.setDate(base.getDate()-dayIndex(base));
      const first=new Date(monday); first.setDate(monday.getDate()+Math.min(...b.days));
      const date=dateKey(first);
      const recurrence=[`RRULE:FREQ=WEEKLY;BYDAY=${b.days.map(i=>DAYKEY[i]).join(',')}`,...(b.exceptions||[]).map(d=>`EXDATE;TZID=${tz}:${d.replaceAll('-','')}T${b.start.replace(':','')}00`)];
      const body={summary:b.title,location:b.place,description:`DayForge ${TYPES[b.type]?.[0]||'activity'}`,start:{dateTime:`${date}T${b.start}:00`,timeZone:tz},end:{dateTime:`${date}T${b.end}:00`,timeZone:tz},recurrence,extendedProperties:{private:{dayforgeId:b.id}}};
      const list=await fetch(`${url}?privateExtendedProperty=dayforgeId%3D${encodeURIComponent(b.id)}&maxResults=10`,{headers:{Authorization:`Bearer ${t}`}});
      const data=await list.json(), existing=data.items?.find(e=>e.status!=='cancelled'), endpoint=existing?`${url}/${existing.id}`:url;
      const r=await fetch(endpoint,{method:existing?'PUT':'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!r.ok)throw new Error('Calendar sync failed.');
    }catch(e){setNotice(e.message)}
  }
  async function deleteCalendarBlock(id,t){
    try{
      const url='https://www.googleapis.com/calendar/v3/calendars/primary/events';
      const list=await fetch(`${url}?privateExtendedProperty=dayforgeId%3D${encodeURIComponent(id)}&maxResults=10`,{headers:{Authorization:`Bearer ${t}`}}), data=await list.json();
      for(const e of data.items||[]) await fetch(`${url}/${e.id}`,{method:'DELETE',headers:{Authorization:`Bearer ${t}`}});
    }catch(e){setNotice(e.message)}
  }

  return <>
    <style>{`
      .timeline.dayforge-timeline{height:1360px!important;overflow:hidden;position:relative}
      .dayforge-timeline .hour{height:80px!important;position:relative}
      .dayforge-timeline .block-card{top:var(--block-top)!important;height:var(--block-height)!important}
      .legacy-panel{padding:16px;margin-top:18px}.legacy-panel .panel-title{display:flex;align-items:center;gap:7px}.legacy-row{display:flex;align-items:center;gap:9px;padding:10px 0;border-top:1px solid #1a2435;font-size:12px}.legacy-row>span{flex:1}.legacy-row small{color:#718098}.done{text-decoration:line-through;color:#718098}.legacy-panel .inputs{display:flex;gap:8px;margin-bottom:5px}.legacy-panel input,.legacy-panel textarea{width:100%;background:#0a101a;border:1px solid #23314a;color:#fff;border-radius:10px;padding:10px;outline:0}.check{border:1px solid #263650;background:#101827;border-radius:8px;min-width:30px;height:30px;color:#aab7c9}.check.done{background:#123126;color:#68e0a4}.danger{border:0;background:transparent;color:#ff8a9d;padding:6px}.exception-row{display:flex;gap:8px}.exception-row input{flex:1}.exception-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}.exception-chip{border:1px solid #57303c;background:#24151c;color:#ff9bae;border-radius:8px;padding:6px 8px;font-size:9px;display:inline-flex;gap:5px;align-items:center}
      @media(max-width:820px){.app-shell{display:block}.sidebar{position:sticky;top:0;z-index:10;height:auto;padding:9px 10px;border-right:0;border-bottom:1px solid var(--line);display:block}.brand{padding:2px 4px 9px}.brand-sub{display:none}.sidebar nav{display:flex;overflow-x:auto;gap:5px}.sidebar nav::-webkit-scrollbar{display:none}.nav{flex:0 0 auto;font-size:11px!important;padding:9px 10px}.sidebar-bottom{display:none}.main{padding:16px 10px 35px}.topbar{align-items:flex-start;gap:10px}.topbar h1{font-size:24px}.top-actions .ghost{display:none}.content-grid{display:block}.hero-card{padding:12px}.stat-big{font-size:36px}.spark{display:none}.timeline.dayforge-timeline{height:1020px!important}.dayforge-timeline .hour{height:60px!important}.dayforge-timeline .block-card{left:65px!important;right:6px!important}.side-stack{margin-top:12px}.week-grid{display:flex;overflow-x:auto;scroll-snap-type:x mandatory}.day-col{min-width:235px;scroll-snap-align:start}.places-grid{display:block}.place-list{margin-top:12px}.place-cards{grid-template-columns:1fr}.modal-backdrop{padding:8px}.modal{max-height:94vh;overflow:auto}.form{padding:15px}.day-row{flex-wrap:wrap}.toast{left:10px;right:10px;top:10px}.legacy-panel .inputs{flex-direction:column}.legacy-panel .inputs .primary{width:100%}}
      @media(max-width:430px){.topbar h1{font-size:21px}.timeline.dayforge-timeline{height:900px!important}.dayforge-timeline .hour{height:53px!important}.dayforge-timeline .block-card{left:58px!important}.place-hero,.place-list,.settings-card,.week-panel{padding:14px}}
    `}</style>
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">D</div><div><div className="brand-title">DAYFORGE</div><div className="brand-sub">Time · Place · Action</div></div></div>
        <nav>
          <Nav active={tab==='today'} onClick={()=>setTab('today')} icon={LayoutDashboard}>Today</Nav>
          <Nav active={tab==='week'} onClick={()=>setTab('week')} icon={CalendarDays}>Week plan</Nav>
          <Nav active={tab==='places'} onClick={()=>setTab('places')} icon={MapPin}>Places</Nav>
          <Nav active={tab==='settings'} onClick={()=>setTab('settings')} icon={Settings2}>Connections</Nav>
          <Nav active={false} onClick={()=>location.href='study-planner.html'} icon={BookOpen}>Study planner</Nav>
          <Nav active={false} onClick={()=>location.href='report.html'} icon={BarChart3}>Monthly report</Nav>
        </nav>
        <div className="sidebar-bottom"><div className="sync-card"><div className="sync-icon">{calConnected?<Cloud size={16}/>:<CloudOff size={16}/>}</div><div><div className="sync-title">{calConnected?'Calendar linked':'Calendar not linked'}</div><div className="sync-sub">{calConnected?'Live availability':'Connect to import events'}</div></div></div>{user?<button className="profile" onClick={()=>signOut(fb.auth)}><div className="avatar">{(user.displayName||'U')[0]}</div><div className="profile-copy"><strong>{user.displayName||user.email}</strong><span>Sign out</span></div></button>:<button className="profile" onClick={login}><div className="avatar">G</div><div className="profile-copy"><strong>Sign in</strong><span>Sync to Firebase</span></div></button>}</div>
      </aside>
      <main className="main">
        <header className="topbar"><div><div className="eyebrow">YOUR DAY, DESIGNED</div><h1>{tab==='today'?selected.toLocaleDateString('en-IN',{weekday:'long',month:'long',day:'numeric'}):tab==='week'?'Weekly rhythm':tab==='places'?'Saved places':'Connections'}</h1></div><div className="top-actions"><button className="ghost" onClick={()=>setSelected(new Date())}>Today</button><button className="primary" onClick={()=>setModal('new')}><Plus size={17}/> Add block</button></div></header>
        {notice&&<div className="toast" onClick={()=>setNotice('')}>{notice}<X size={15}/></div>}
        {tab==='today'&&<Today selected={selected} setSelected={setSelected} blocks={todayBlocks} free={free} google={calEvents} connected={calConnected} loading={calLoading} connect={connectCalendar} refresh={()=>fetchCalendar()} edit={b=>setModal(b)} taskEntries={taskEntries} habits={habits} legacy={legacy} saveLegacy={saveLegacy} notes={legacy.dailyRecords?.[key]?.notes||''} percent={percent}/>} 
        {tab==='week'&&<Week blocks={blocks} selected={selected} edit={b=>setModal(b)}/>} 
        {tab==='places'&&<Places places={places} add={addPlace}/>} 
        {tab==='settings'&&<Settings configured={configured} connected={calConnected} connect={connectCalendar} />}
      </main>
      {modal&&<BlockModal initial={modal==='new'?null:modal} places={places} selected={selected} onClose={()=>setModal(null)} onSave={saveBlock} onAddPlace={addPlace}/>} 
    </div>
  </>
}

function Nav({active,onClick,icon:C,children}){return <button className={active?'nav active':'nav'} onClick={onClick}><C size={18}/>{children}</button>}

function Today({selected,setSelected,blocks,free,google,connected,loading,connect,refresh,edit,taskEntries,habits,legacy,saveLegacy,notes,percent}){
  const shift=n=>{const d=new Date(selected);d.setDate(d.getDate()+n);setSelected(d)};
  const [taskText,setTaskText]=useState(''),[habitText,setHabitText]=useState('');
  const k=dateKey(selected);
  return <div className="content-grid">
    <section className="hero-card panel">
      <div className="date-row"><button className="icon-btn" onClick={()=>shift(-1)}><ChevronLeft size={18}/></button><div className="date-pill"><span>{DAYS[dayIndex(selected)]}</span><strong>{selected.getDate()}</strong><span>{selected.toLocaleString('en',{month:'short'})}</span></div><button className="icon-btn" onClick={()=>shift(1)}><ChevronRight size={18}/></button><div className="calendar-connection">{connected?<><span className="dot live"/> Google Calendar connected</>:<button onClick={connect} className="link-btn">Connect Google Calendar <ArrowRight size={14}/></button>}</div></div>
      <div className="hero-stat"><div><div className="stat-kicker">AVAILABLE TIME</div><div className="stat-big">{duration(free.reduce((s,x)=>s+x.duration,0))}</div><div className="stat-note">7:00 AM – 11:00 PM</div></div><div className="spark"><Clock3 size={23}/><span>{percent}% tracker progress · schedule around real commitments.</span></div></div>
      <div className="timeline-head"><span>DAY TIMELINE</span>{connected&&<button className="small-btn" onClick={refresh}>{loading?<RefreshCw className="spin" size={14}/>:<RefreshCw size={14}/>} Refresh Calendar</button>}</div>
      <Timeline blocks={blocks} google={google} edit={edit}/>
      <div className="panel legacy-panel"><div className="panel-title"><span><CheckSquare size={15}/> To-Do</span></div><div className="inputs"><input value={taskText} onChange={e=>setTaskText(e.target.value)} placeholder="What needs to be done?"/><button className="primary" onClick={async()=>{if(!taskText.trim())return;await saveLegacy(`tasks/t_${Date.now()}`,{title:taskText.trim(),date:k,priority:'Normal',completed:false,createdAt:Date.now()});setTaskText('')}}><Plus size={15}/> Add</button></div>{taskEntries.map(([id,t])=><div className="legacy-row" key={id}><button className={t.completed?'check done':'check'} onClick={()=>saveLegacy(`tasks/${id}`,{...t,completed:!t.completed})}>{t.completed?'✓':'○'}</button><span className={t.completed?'done':''}>{t.title}</span><small>{t.priority||'Normal'}</small><button className="danger" onClick={()=>saveLegacy(`tasks/${id}`,null)}><Trash2 size={14}/></button></div>)}</div>
      <div className="panel legacy-panel"><div className="panel-title"><span><CircleDot size={15}/> Habits</span></div><div className="inputs"><input value={habitText} onChange={e=>setHabitText(e.target.value)} placeholder="Add a habit"/><button className="primary" onClick={async()=>{if(!habitText.trim())return;await saveLegacy(`habits/h_${Date.now()}`,{name:habitText.trim(),goal:'Daily',active:true,createdAt:Date.now()});setHabitText('')}}><Plus size={15}/> Add</button></div>{habits.map(([id,h])=>{const done=!!legacy.dailyRecords?.[k]?.habitChecks?.[id];return <div className="legacy-row" key={id}><button className={done?'check done':'check'} onClick={()=>saveLegacy(`dailyRecords/${k}/habitChecks/${id}`,done?null:true)}>{done?'✓':'○'}</button><span>{h.name}</span><small>{h.goal||'Daily'}</small><button className="danger" onClick={()=>saveLegacy(`habits/${id}`,null)}><Trash2 size={14}/></button></div>})}</div>
      <div className="panel legacy-panel"><div className="panel-title"><span><StickyNote size={15}/> Daily notes</span><button className="small-btn" onClick={()=>saveLegacy(`dailyRecords/${k}/notes`,document.getElementById('day-notes').value)}>Save</button></div><textarea id="day-notes" defaultValue={notes} placeholder="Notes for this day…" rows="4"/></div>
    </section>
    <aside className="side-stack"><div className="panel free-panel"><div className="panel-title"><span>Free windows</span><Clock3 size={17}/></div>{free.map((x,i)=><div className="free-row" key={i}><strong>{x.start} – {x.end}</strong><span className="duration">{duration(x.duration)}</span></div>)}{!free.length&&<div className="empty">No free windows ≥ 20 min.</div>}</div><div className="panel focus-panel"><div className="panel-title"><span>Next planned block</span><MapPin size={17}/></div>{blocks[0]?<div className="next-card"><div className="next-time">{blocks[0].start}</div><div><h3>{blocks[0].title}</h3><span><MapPin size={13}/>{blocks[0].place}</span></div></div>:<div className="empty">Nothing scheduled yet.</div>}</div><div className="panel quick-panel"><div className="panel-title"><span>Plan hygiene</span><ShieldCheck size={17}/></div><div className="checkline"><Check size={15}/>Every block has a time</div><div className="checkline"><Check size={15}/>Every block has a place</div><div className="checkline"><Check size={15}/>Free time includes calendar conflicts</div></div></aside>
  </div>
}

function Timeline({blocks,google,edit}){
  const all=[...blocks.map(b=>({...b,startMin:mins(b.start),endMin:mins(b.end),source:'plan'})),...google.map(e=>({...e,startMin:e.startMin,endMin:e.endMin,source:'google',title:e.summary,place:'Google Calendar'}))].sort((a,b)=>a.startMin-b.startMin);
  return <div className="timeline dayforge-timeline">{Array.from({length:17},(_,i)=>i+7).map(h=><div className="hour" key={h}><span>{h>12?h-12:h}:00 {h<12?'AM':'PM'}</span><div className="hour-line"/></div>)}{all.map((b,i)=>{const top=(b.startMin-420)*(80/60),height=Math.max(42,(b.endMin-b.startMin)*(80/60));return <button key={b.id||i} className={`block-card ${b.color||'google'}`} style={{'--block-top':`${top}px`,'--block-height':`${height}px`,opacity:b.source==='google'?.78:1}} onClick={()=>b.source==='plan'&&edit(b)}><div className="block-left"><strong>{b.title}</strong><span><MapPin size={12}/>{b.place}</span></div><span className="block-time">{clock(b.startMin)}–{clock(b.endMin)}</span></button>})}</div>
}

function Week({blocks,selected,edit}){
  const s=new Date(selected);s.setDate(s.getDate()-dayIndex(s));
  return <div className="week-panel panel"><div className="week-summary"><div><div className="stat-kicker">WEEKLY RHYTHM</div><h2>Your saved schedule.</h2><p>Set recurring time + place blocks once. Use a date exception when a school day or routine is cancelled.</p></div><button className="primary" onClick={()=>edit(null)}><Plus size={17}/> Add recurring block</button></div><div className="week-grid">{DAYS.map((d,i)=>{const bs=blocks.filter(b=>b.active!==false&&b.days?.includes(i)).sort((a,b)=>a.start.localeCompare(b.start));return <div className="day-col" key={d}><div className="day-head"><span>{d}</span><strong>{new Date(s.getFullYear(),s.getMonth(),s.getDate()+i).getDate()}</strong></div>{bs.map(b=><div className="week-block" key={b.id} onClick={()=>edit(b)}><div className={`mini-dot ${b.color||''}`}/><div><strong>{b.title}</strong><span>{b.start}–{b.end}</span><span><MapPin size={11}/>{b.place}</span></div></div>)}{!bs.length&&<div className="week-empty">No blocks</div>}</div>})}</div></div>
}

function Places({places,add}){const[v,setV]=useState('');return <div className="places-grid"><div className="panel place-hero"><div className="stat-kicker">QUICK LOCATION PICKER</div><h2>Use places as cues.</h2><p>Save common places so the same location takes one tap when you build a block.</p><div className="place-input"><MapPin size={17}/><input value={v} onChange={e=>setV(e.target.value)} placeholder="Add custom place…"/><button onClick={()=>{if(v.trim()){add(v.trim());setV('')}}}><Plus size={16}/></button></div></div><div className="panel place-list"><div className="panel-title"><span>Recent & common places</span><span className="muted">{places.length} saved</span></div><div className="place-cards">{places.map((p,i)=>{const C=COMMON_PLACES.find(x=>x[0]===p)?.[1]||MapPin;return <div className="place-card" key={p}><div className="place-icon"><C size={17}/></div><div><strong>{p}</strong><span>{i<4?'Quick pick':'Custom place'}</span></div></div>})}</div></div></div>}

function Settings({configured,connected,connect}){return <div className="settings-wrap"><div className="panel settings-card"><div className="settings-title"><Settings2/><div><div className="stat-kicker">BACKEND & SYNC</div><h2>Connections</h2></div></div><div className="setting-row"><div><strong>Firebase</strong><span>{configured?'Authentication + Firestore + Realtime Database ready':'Firebase configuration missing'}</span></div><span className={`status ${configured?'ok':''}`}>{configured?'READY':'SETUP'}</span></div><div className="setting-row"><div><strong>Google Calendar</strong><span>{connected?'OAuth access active for this browser session':'Connect to import events and synchronize schedule blocks'}</span></div><button className="outline" onClick={connect}>{connected?'Reconnect':'Connect Google Calendar'}</button></div><div className="security-note"><ShieldCheck size={18}/><div><strong>Private data</strong><p>Your Firebase rules should keep each user under users/{'{uid}'}. Calendar OAuth tokens stay in browser memory in this version.</p></div></div><div className="setup-links"><span><ExternalLink size={14}/>Enable Google Calendar API</span><span><ExternalLink size={14}/>Configure OAuth origin in Google Cloud</span><span><ExternalLink size={14}/>Check Firebase Authentication</span></div></div></div>}

function BlockModal({initial,places,selected,onClose,onSave,onAddPlace}){
  const [f,setF]=useState(initial||{id:crypto.randomUUID(),title:'',type:'study',start:'16:30',end:'17:30',place:places[0]||'Study Desk',days:[0,1,2,3,4],color:'cyan',active:true,exceptions:[]});
  const [ex,setEx]=useState(dateKey(selected));
  const setv=(k,v)=>setF(x=>({...x,[k]:v}));
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><div className="stat-kicker">TIME · PLACE · ACTION</div><h2>{initial?'Edit block':'Create a block'}</h2></div><button className="icon-btn" onClick={onClose}><X/></button></div><div className="form"><label>Activity name<input autoFocus value={f.title} onChange={e=>setv('title',e.target.value)} placeholder="Coding study"/></label><div className="two"><label>Start<input type="time" value={f.start} onChange={e=>setv('start',e.target.value)}/></label><label>End<input type="time" value={f.end} onChange={e=>setv('end',e.target.value)}/></label></div><label>Type<div className="seg-row">{Object.entries(TYPES).map(([k,[n,C]])=><button type="button" key={k} className={f.type===k?'seg active':'seg'} onClick={()=>setv('type',k)}><C size={14}/>{n}</button>)}</div></label><label>Place<div className="place-select">{places.map(p=><button type="button" key={p} className={f.place===p?'place-chip active':'place-chip'} onClick={()=>setv('place',p)}>{p}</button>)}<button type="button" className="place-chip add" onClick={()=>{const p=prompt('Place name');if(p){onAddPlace(p);setv('place',p)}}}><Plus size={13}/> New</button></div></label><label>Repeat on<div className="day-row">{DAYS.map((d,i)=><button type="button" key={d} className={f.days.includes(i)?'day active':'day'} onClick={()=>setv('days',f.days.includes(i)?f.days.filter(x=>x!==i):[...f.days,i])}>{d}</button>)}</div></label><label>Leave / exception date<div className="exception-row"><input type="date" value={ex} onChange={e=>setEx(e.target.value)}/><button type="button" className="small-btn" onClick={()=>setv('exceptions',Array.from(new Set([...(f.exceptions||[]),ex])).sort())}>Cancel this date</button></div><div className="exception-chips">{(f.exceptions||[]).map(d=><button type="button" className="exception-chip" key={d} onClick={()=>setv('exceptions',f.exceptions.filter(x=>x!==d))}>{d}<X size={11}/></button>)}</div></label><div className="location-preview"><MapPin size={16}/><div><strong>{f.title||'Your activity'}</strong><span>{f.start}–{f.end} · {f.place}</span></div><Check size={16}/></div><div className="modal-foot"><button className="ghost" onClick={onClose}>Cancel</button><button className="primary" onClick={()=>onSave(f)}><Save size={16}/> {initial?'Save changes':'Create block'}</button></div></div></div></div>
}

function calcFree(items,start,end,gap){let cur=start,out=[];for(const x of items){const s=Math.max(start,x.start),e=Math.min(end,x.end);if(s>cur&&s-cur>=gap)out.push({start:clock(cur),end:clock(s),duration:s-cur});if(e>cur)cur=e}if(end-cur>=gap)out.push({start:clock(cur),end:clock(end),duration:end-cur});return out}

createRoot(document.getElementById('root')).render(<App/>);
