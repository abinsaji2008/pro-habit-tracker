import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CalendarDays, Clock3, MapPin, Plus, Settings2, ChevronLeft, ChevronRight,
  Check, X, Search, Sparkles, RefreshCw, Cloud, CloudOff, ShieldCheck,
  Trash2, Pencil, GripVertical, Home, BookOpen, Cpu, Dumbbell, School,
  Coffee, Monitor, CircleDot, ArrowRight, ExternalLink, Save, LayoutDashboard
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { firebaseConfig, GOOGLE_CLIENT_ID, CALENDAR_API_KEY } from './firebaseConfig.js';
import './styles.css';

const COMMON_PLACES = [
  { name: 'Study Desk', icon: Monitor },
  { name: 'Bedroom', icon: Home },
  { name: 'School', icon: School },
  { name: 'Library', icon: BookOpen },
  { name: 'Workshop', icon: Cpu },
  { name: 'Gym', icon: Dumbbell },
  { name: 'Kitchen', icon: Coffee },
];
const TYPE_META = {
  routine: { label: 'Routine', icon: CircleDot },
  study: { label: 'Study', icon: BookOpen },
  fixed: { label: 'Fixed', icon: School },
  personal: { label: 'Personal', icon: Home },
};
const DAY_KEYS = ['MO','TU','WE','TH','FR','SA','SU'];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const sampleBlocks = [
  { id:'demo-school', title:'School', type:'fixed', start:'08:30', end:'15:30', place:'School', days:[0,1,2,3,4,5], color:'violet', active:true, exceptions:[] },
  { id:'demo-coding', title:'Coding Study', type:'study', start:'16:30', end:'17:30', place:'Study Desk', days:[0,2,4], color:'cyan', active:true, exceptions:[] },
  { id:'demo-robotics', title:'Robotics', type:'study', start:'17:30', end:'18:30', place:'Workshop', days:[1,3,5], color:'amber', active:true, exceptions:[] },
  { id:'demo-reading', title:'Reading', type:'routine', start:'20:30', end:'21:00', place:'Bedroom', days:[0,1,2,3,4,5,6], color:'green', active:true, exceptions:[] },
];

function uid(){ return crypto.randomUUID(); }
function pad(n){ return String(n).padStart(2,'0'); }
function toMinutes(t){ const [h,m]=t.split(':').map(Number); return h*60+m; }
function fromMinutes(m){ return `${pad(Math.floor(m/60)%24)}:${pad(m%60)}`; }
function dayIndex(date){ const d=date.getDay(); return d===0?6:d-1; }
function isoDate(date){ return date.toISOString().slice(0,10); }
function formatDateLong(date){ return new Intl.DateTimeFormat('en-IN',{weekday:'long',month:'long',day:'numeric'}).format(date); }
function escapeICS(s){ return String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n'); }

function useFirebase(){
  const configured = firebaseConfig?.apiKey && !String(firebaseConfig.apiKey).includes('YOUR_');
  const [user,setUser]=useState(null); const [fb,setFb]=useState(null);
  useEffect(()=>{
    if(!configured) return;
    const app=initializeApp(firebaseConfig); const auth=getAuth(app); const db=getFirestore(app);
    const unsub=onAuthStateChanged(auth,u=>{setUser(u); setFb({auth,db});}); return ()=>unsub();
  },[configured]);
  return {configured,user,fb};
}

function App(){
  const {configured,user,fb}=useFirebase();
  const [activeTab,setActiveTab]=useState('today');
  const [selectedDate,setSelectedDate]=useState(new Date());
  const [blocks,setBlocks]=useState(sampleBlocks);
  const [tasks,setTasks]=useState([]);
  const [places,setPlaces]=useState(['Study Desk','Bedroom','School','Workshop']);
  const [showForm,setShowForm]=useState(false); const [editing,setEditing]=useState(null);
  const [calendarToken,setCalendarToken]=useState(null); const [calendarConnected,setCalendarConnected]=useState(false);
  const [calendarEvents,setCalendarEvents]=useState([]); const [calendarLoading,setCalendarLoading]=useState(false);
  const [notice,setNotice]=useState('');

  useEffect(()=>{
    if(!fb || !user) return;
    const q=query(collection(fb.db,'users',user.uid,'blocks'), orderBy('start'));
    return onSnapshot(q,s=>{
      if(!s.empty) setBlocks(s.docs.map(d=>({id:d.id,...d.data()})));
    });
  },[fb,user]);
  useEffect(()=>{ const local=JSON.parse(localStorage.getItem('dayforge_places')||'null'); if(local) setPlaces(local); },[]);
  useEffect(()=>{localStorage.setItem('dayforge_places',JSON.stringify(places));},[places]);

  const todayBlocks=useMemo(()=>{
    const di=dayIndex(selectedDate), date=isoDate(selectedDate);
    return blocks.filter(b=>b.active!==false && b.days?.includes(di) && !(b.exceptions||[]).includes(date)).sort((a,b)=>a.start.localeCompare(b.start));
  },[blocks,selectedDate]);
  const occupied=[...todayBlocks.map(b=>({start:toMinutes(b.start),end:toMinutes(b.end),label:b.title,source:'plan'})), ...calendarEvents.map(e=>({start:e.startMin,end:e.endMin,label:e.summary||'Calendar event',source:'google'}))].sort((a,b)=>a.start-b.start);
  const free=calcFree(occupied,7*60,23*60,20);

  async function login(){
    if(!configured) return setNotice('Add your Firebase config in src/firebaseConfig.js first.');
    const p=new GoogleAuthProvider(); await signInWithPopup(fb.auth,p);
  }
  async function saveBlock(block){
    setBlocks(prev=>prev.some(x=>x.id===block.id)?prev.map(x=>x.id===block.id?block:x):[...prev,block]);
    if(fb && user){ await setDoc(doc(fb.db,'users',user.uid,'blocks',block.id),{...block,updatedAt:serverTimestamp()}); }
    if(calendarToken) await syncRecurringBlockToCalendar(block,calendarToken);
    setNotice('Activity saved'); setShowForm(false); setEditing(null);
  }
  async function removeBlock(id){
    setBlocks(prev=>prev.filter(x=>x.id!==id));
    if(fb && user) await deleteDoc(doc(fb.db,'users',user.uid,'blocks',id));
    setNotice('Activity removed');
  }
  function addPlace(name){ if(name && !places.includes(name)){ setPlaces(p=>[...p,name]); } }

  async function connectCalendar(){
    if(!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes('YOUR_')) return setNotice('Add GOOGLE_CLIENT_ID in src/firebaseConfig.js first.');
    setCalendarLoading(true);
    try{
      await new Promise((resolve,reject)=>{ if(window.gapi) window.gapi.load('client',resolve); else reject(new Error('Google API failed to load')); });
      await window.gapi.client.init({apiKey:CALENDAR_API_KEY,discoveryDocs:['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest']});
      const tokenClient=google.accounts.oauth2.initTokenClient({client_id:GOOGLE_CLIENT_ID,scope:'https://www.googleapis.com/auth/calendar',callback:(resp)=>{ if(resp.error){setNotice(resp.error);setCalendarLoading(false);return;} setCalendarToken(resp.access_token); setCalendarConnected(true); setNotice('Google Calendar connected'); setCalendarLoading(false); fetchCalendarEvents(resp.access_token); }});
      tokenClient.requestAccessToken({prompt:''});
    }catch(e){setNotice(e.message);setCalendarLoading(false);}
  }
  async function fetchCalendarEvents(token=calendarToken){
    if(!token) return;
    setCalendarLoading(true);
    try{
      const dayStart=new Date(selectedDate); dayStart.setHours(0,0,0,0); const dayEnd=new Date(selectedDate); dayEnd.setHours(23,59,59,999);
      const res=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(dayStart.toISOString())}&timeMax=${encodeURIComponent(dayEnd.toISOString())}&showDeleted=false`,{headers:{Authorization:`Bearer ${token}`} });
      if(!res.ok) throw new Error('Could not read Google Calendar.'); const data=await res.json();
      const mapped=(data.items||[]).filter(e=>e.start?.dateTime&&e.end?.dateTime).map(e=>({id:e.id,summary:e.summary,startMin:new Date(e.start.dateTime).getHours()*60+new Date(e.start.dateTime).getMinutes(),endMin:new Date(e.end.dateTime).getHours()*60+new Date(e.end.dateTime).getMinutes()}));
      setCalendarEvents(mapped);
    }catch(e){setNotice(e.message);} finally{setCalendarLoading(false);}
  }
  async function syncRecurringBlockToCalendar(block,token){
    try{
      const tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
      const weekStart=new Date(selectedDate); weekStart.setDate(weekStart.getDate()-dayIndex(weekStart)); weekStart.setHours(0,0,0,0);
      const firstOffset=Math.min(...block.days); const first=new Date(weekStart); first.setDate(weekStart.getDate()+firstOffset);
      const firstDate=isoDate(first);
      const url='https://www.googleapis.com/calendar/v3/calendars/primary/events';
      const body={summary:block.title,location:block.place,description:`DayForge activity • ${TYPE_META[block.type]?.label||block.type}`,start:{dateTime:`${firstDate}T${block.start}:00`,timeZone:tz},end:{dateTime:`${firstDate}T${block.end}:00`,timeZone:tz},recurrence:[`RRULE:FREQ=WEEKLY;BYDAY=${block.days.map(i=>DAY_KEYS[i]).join(',')}`,...(block.exceptions||[]).map(d=>`EXDATE;TZID=${tz}:${d.replaceAll('-','')}T${block.start.replace(':','')}00`)],extendedProperties:{private:{dayforgeId:block.id}}};
      const find=await fetch(`${url}?privateExtendedProperty=dayforgeId%3D${encodeURIComponent(block.id)}&maxResults=10`,{headers:{Authorization:`Bearer ${token}`}});
      const data=await find.json(); const existing=data.items?.[0];
      const endpoint=existing?`${url}/${existing.id}`:url;
      const method=existing?'PUT':'POST';
      const r=await fetch(endpoint,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!r.ok) throw new Error('Calendar sync failed.'); await fetchCalendarEvents(token); setNotice(existing?'Saved + Calendar event updated':'Saved + Calendar event created');
    }catch(e){setNotice(e.message);}
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">D</div><div><div className="brand-title">DAYFORGE</div><div className="brand-sub">Time · Place · Action</div></div></div>
      <nav>
        <button className={activeTab==='today'?'nav active':'nav'} onClick={()=>setActiveTab('today')}><LayoutDashboard size={18}/>Today</button>
        <button className={activeTab==='week'?'nav active':'nav'} onClick={()=>setActiveTab('week')}><CalendarDays size={18}/>Week plan</button>
        <button className={activeTab==='places'?'nav active':'nav'} onClick={()=>setActiveTab('places')}><MapPin size={18}/>Places</button>
        <button className={activeTab==='settings'?'nav active':'nav'} onClick={()=>setActiveTab('settings')}><Settings2 size={18}/>Connections</button>
      </nav>
      <div className="sidebar-bottom">
        <div className="sync-card">
          <div className="sync-icon">{calendarConnected?<Cloud size={16}/>:<CloudOff size={16}/>}</div>
          <div><div className="sync-title">{calendarConnected?'Calendar linked':'Calendar not linked'}</div><div className="sync-sub">{calendarConnected?'Live day availability':'Connect to import events'}</div></div>
        </div>
        {user?<button className="profile" onClick={()=>signOut(fb.auth)}><div className="avatar">{(user.displayName||'U')[0]}</div><div className="profile-copy"><strong>{user.displayName||'Signed in'}</strong><span>Sign out</span></div></button>:<button className="profile" onClick={login}><div className="avatar">G</div><div className="profile-copy"><strong>Sign in</strong><span>Sync to Firebase</span></div></button>}
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div><div className="eyebrow">YOUR DAY, DESIGNED</div><h1>{activeTab==='today'?formatDateLong(selectedDate):activeTab==='week'?'Weekly rhythm':activeTab==='places'?'Saved places':'Connections'}</h1></div>
        <div className="top-actions"><button className="ghost" onClick={()=>setSelectedDate(new Date())}>Today</button><button className="primary" onClick={()=>{setEditing(null);setShowForm(true)}}><Plus size={17}/> Add block</button></div>
      </header>
      {notice&&<div className="toast" onClick={()=>setNotice('')}>{notice}<X size={15}/></div>}
      {activeTab==='today'&&<TodayView selectedDate={selectedDate} setSelectedDate={setSelectedDate} todayBlocks={todayBlocks} free={free} occupied={occupied} calendarEvents={calendarEvents} calendarConnected={calendarConnected} calendarLoading={calendarLoading} connectCalendar={connectCalendar} fetchCalendarEvents={()=>fetchCalendarEvents()} edit={(b)=>{setEditing(b);setShowForm(true)}} remove={removeBlock}/>} 
      {activeTab==='week'&&<WeekView blocks={blocks} selectedDate={selectedDate} setSelectedDate={setSelectedDate} edit={(b)=>{setEditing(b);setShowForm(true)}} remove={removeBlock}/>} 
      {activeTab==='places'&&<PlacesView places={places} addPlace={addPlace}/>} 
      {activeTab==='settings'&&<SettingsView configured={configured} user={user} calendarConnected={calendarConnected} connectCalendar={connectCalendar} firebaseReady={!!fb}/>} 
    </main>
    {showForm&&<BlockModal initial={editing} places={places} onAddPlace={addPlace} selectedDate={selectedDate} onClose={()=>{setShowForm(false);setEditing(null)}} onSave={saveBlock}/>} 
  </div>
}

function TodayView({selectedDate,setSelectedDate,todayBlocks,free,occupied,calendarEvents,calendarConnected,calendarLoading,connectCalendar,fetchCalendarEvents,edit,remove}){
  const di=dayIndex(selectedDate);
  return <div className="content-grid">
    <section className="hero-card panel">
      <div className="date-row"><button className="icon-btn" onClick={()=>{const d=new Date(selectedDate);d.setDate(d.getDate()-1);setSelectedDate(d)}}><ChevronLeft size={18}/></button><div className="date-pill"><span>{DAY_LABELS[di]}</span><strong>{selectedDate.getDate()}</strong><span>{new Intl.DateTimeFormat('en',{month:'short'}).format(selectedDate)}</span></div><button className="icon-btn" onClick={()=>{const d=new Date(selectedDate);d.setDate(d.getDate()+1);setSelectedDate(d)}}><ChevronRight size={18}/></button><div className="calendar-connection">{calendarConnected?<><span className="dot live"/> Google Calendar connected</>:<button onClick={connectCalendar} className="link-btn">Connect Google Calendar <ArrowRight size={14}/></button>}</div></div>
      <div className="hero-stat"><div><div className="stat-kicker">AVAILABLE TIME</div><div className="stat-big">{formatDuration(free.reduce((s,x)=>s+x.duration,0))}</div><div className="stat-note">from 7:00 AM to 11:00 PM</div></div><div className="spark"><Sparkles size={23}/><span>Time + place make the plan visible.</span></div></div>
      <div className="timeline-wrap"><div className="timeline-head"><span>DAY TIMELINE</span><div className="timeline-actions">{calendarConnected&&<button className="small-btn" onClick={fetchCalendarEvents}>{calendarLoading?<RefreshCw className="spin" size={14}/>:<RefreshCw size={14}/>} Refresh Calendar</button>}</div></div><Timeline blocks={todayBlocks} calendarEvents={calendarEvents} edit={edit}/></div>
    </section>
    <aside className="side-stack">
      <div className="panel free-panel"><div className="panel-title"><span>Free windows</span><Clock3 size={17}/></div>{free.slice(0,5).map((x,i)=><div className="free-row" key={i}><div><strong>{x.start}</strong><span> — </span><strong>{x.end}</strong></div><span className="duration">{formatDuration(x.duration)}</span></div>)}{free.length===0&&<div className="empty">No free windows ≥ 20 min.</div>}</div>
      <div className="panel focus-panel"><div className="panel-title"><span>Next block</span><MapPin size={17}/></div>{todayBlocks[0]?<div className="next-card"><div className="next-time">{todayBlocks[0].start}</div><div><h3>{todayBlocks[0].title}</h3><span><MapPin size={13}/>{todayBlocks[0].place}</span></div></div>:<div className="empty">Nothing scheduled yet.</div>}</div>
      <div className="panel quick-panel"><div className="panel-title"><span>Plan hygiene</span><ShieldCheck size={17}/></div><div className="checkline"><Check size={15}/>Every block has a time</div><div className="checkline"><Check size={15}/>Every block has a place</div><div className="checkline"><Check size={15}/>Free time is calculated around them</div></div>
    </aside>
  </div>
}

function Timeline({blocks,calendarEvents,edit}){
  const all=[...blocks.map(b=>({...b,startMin:toMinutes(b.start),endMin:toMinutes(b.end),source:'plan'})),...calendarEvents.map(e=>({...e,start:e.startMin,end:e.endMin,startMin:e.startMin,endMin:e.endMin,source:'google',title:e.summary,place:'Google Calendar'}))].sort((a,b)=>a.startMin-b.startMin);
  return <div className="timeline">{Array.from({length:17},(_,i)=>i+7).map(h=><div className="hour" key={h}><span>{h>12?h-12:h}:00 {h<12?'AM':'PM'}</span><div className="hour-line"/></div>)}{all.map((b,i)=><button key={b.id||i} className={`block-card ${b.color||'google'} ${b.source==='google'?'google-block':''}`} style={{top:`${(b.startMin-420)*2.65}px`,height:`${Math.max(42,(b.endMin-b.startMin)*2.65)}px`}} onClick={()=>b.source==='plan'&&edit(b)}><div className="block-left"><strong>{b.title}</strong><span><MapPin size={12}/>{b.place}</span></div><span className="block-time">{fromMinutes(b.startMin)}–{fromMinutes(b.endMin)}</span></button>)}</div>
}

function WeekView({blocks,selectedDate,setSelectedDate,edit,remove}){
  const start=new Date(selectedDate); start.setDate(start.getDate()-dayIndex(start));
  return <div className="week-panel panel"><div className="week-summary"><div><div className="stat-kicker">WEEKLY RHYTHM</div><h2>Set once. Repeat reliably.</h2><p>Recurring blocks stay fixed until you change the plan or cancel a specific date.</p></div><button className="primary" onClick={()=>edit(null)}><Plus size={17}/> Add recurring block</button></div><div className="week-grid">{DAY_LABELS.map((d,i)=>{const date=new Date(start);date.setDate(start.getDate()+i);const dayBlocks=blocks.filter(b=>b.active!==false&&b.days?.includes(i)).sort((a,b)=>a.start.localeCompare(b.start));return <div className="day-col" key={d}><div className="day-head"><span>{d}</span><strong>{date.getDate()}</strong></div>{dayBlocks.map(b=><div className="week-block" key={b.id} onClick={()=>edit(b)}><div className={`mini-dot ${b.color}`}/><div><strong>{b.title}</strong><span>{b.start}–{b.end}</span><span><MapPin size={11}/>{b.place}</span></div></div>)}{dayBlocks.length===0&&<div className="week-empty">No blocks</div>}</div>})}</div></div>
}

function PlacesView({places,addPlace}){const [value,setValue]=useState('');return <div className="places-grid"><div className="panel place-hero"><div className="stat-kicker">QUICK LOCATION PICKER</div><h2>Use places as cues.</h2><p>Save the places where an activity normally happens so the block can be created in seconds.</p><div className="place-input"><MapPin size={17}/><input value={value} onChange={e=>setValue(e.target.value)} placeholder="Add a custom place…"/><button onClick={()=>{if(value.trim()){addPlace(value.trim());setValue('')}}}><Plus size={16}/></button></div></div><div className="panel place-list"><div className="panel-title"><span>Recent & common places</span><span className="muted">{places.length} saved</span></div><div className="place-cards">{places.map((p,i)=>{const C=COMMON_PLACES.find(x=>x.name===p)?.icon||MapPin;return <div className="place-card" key={p}><div className="place-icon"><C size={17}/></div><div><strong>{p}</strong><span>{i<4?'Quick pick':'Custom place'}</span></div><GripVertical size={16} className="drag"/></div>})}</div></div></div>}

function SettingsView({configured,user,calendarConnected,connectCalendar,firebaseReady}){return <div className="settings-wrap"><div className="panel settings-card"><div className="settings-title"><Settings2/><div><div className="stat-kicker">BACKEND & SYNC</div><h2>Keep the plan available everywhere.</h2></div></div><div className="setting-row"><div><strong>Firebase</strong><span>{configured?(firebaseReady?'Connected to your project':'Configured, waiting for sign-in'):'Configuration required'}</span></div><div className={`status ${configured?'ok':''}`}>{configured?'READY':'SETUP'}</div></div><div className="setting-row"><div><strong>Google Calendar</strong><span>{calendarConnected?'OAuth access is active for this session':'Connect to read events and create recurring blocks'}</span></div><button className="outline" onClick={connectCalendar}>{calendarConnected?'Reconnect':'Connect Google Calendar'}</button></div><div className="security-note"><ShieldCheck size={18}/><div><strong>Security note</strong><p>For a real deployment, move long-lived Calendar credentials and recurring-event synchronization to Firebase Cloud Functions. This starter keeps the browser OAuth token in memory only.</p></div></div><div className="setup-links"><span><ExternalLink size={14}/>Create a Firebase web app</span><span><ExternalLink size={14}/>Enable Google Calendar API</span><span><ExternalLink size={14}/>Create a Google OAuth web client</span></div></div></div>}

function BlockModal({initial,places,onAddPlace,selectedDate,onClose,onSave}){
  const [f,setF]=useState(initial||{id:uid(),title:'',type:'study',start:'16:30',end:'17:30',place:'Study Desk',days:[0,1,2,3,4],color:'cyan',active:true,exceptions:[]});
  const [exceptionDate,setExceptionDate]=useState(isoDate(selectedDate||new Date()));
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const [newPlace,setNewPlace]=useState('');
  function save(){ if(!f.title.trim()) return; if(toMinutes(f.end)<=toMinutes(f.start)) return alert('End time must be after start time.'); onSave({...f,title:f.title.trim()}); }
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><div className="stat-kicker">TIME · PLACE · ACTION</div><h2>{initial?'Edit block':'Create a block'}</h2></div><button className="icon-btn" onClick={onClose}><X size={19}/></button></div><div className="form"><label>Activity name<input autoFocus value={f.title} onChange={e=>set('title',e.target.value)} placeholder="Coding study"/></label><div className="two"><label>Start<input type="time" value={f.start} onChange={e=>set('start',e.target.value)}/></label><label>End<input type="time" value={f.end} onChange={e=>set('end',e.target.value)}/></label></div><label>Type<div className="seg-row">{Object.entries(TYPE_META).map(([k,m])=>{const C=m.icon;return <button key={k} type="button" className={f.type===k?'seg active':''} onClick={()=>set('type',k)}><C size={15}/>{m.label}</button>})}</div></label><label>Place<div className="place-select">{places.map(p=><button type="button" key={p} className={f.place===p?'place-chip active':''} onClick={()=>set('place',p)}>{p}</button>)}<button type="button" className="place-chip add" onClick={()=>{const p=prompt('New place name');if(p){onAddPlace(p);set('place',p)}}}><Plus size={13}/> New place</button></div></label><label>Repeat on<div className="day-row">{DAY_LABELS.map((d,i)=><button type="button" key={d} className={f.days.includes(i)?'day active':''} onClick={()=>set('days',f.days.includes(i)?f.days.filter(x=>x!==i):[...f.days,i])}>{d}</button>)}</div></label><label>Exceptions / leaves<div className="exception-row"><input type="date" value={exceptionDate} onChange={e=>setExceptionDate(e.target.value)}/><button type="button" className="small-btn" onClick={()=>exceptionDate&&set('exceptions',Array.from(new Set([...(f.exceptions||[]),exceptionDate])).sort())}>Cancel this date</button></div><div className="exception-chips">{(f.exceptions||[]).map(d=><button type="button" className="exception-chip" key={d} onClick={()=>set('exceptions',f.exceptions.filter(x=>x!==d))}>{d}<X size={11}/></button>)}</div></label><div className="location-preview"><MapPin size={16}/><div><strong>{f.title||'Your activity'}</strong><span>{f.start}–{f.end} · {f.place}</span></div><Check size={16}/></div><div className="modal-foot"><button className="ghost" onClick={onClose}>Cancel</button><button className="primary" onClick={save}><Save size={16}/>{initial?'Save changes':'Create block'}</button></div></div></div></div>
}

function calcFree(items,start,end,minGap){let cur=start;const out=[];for(const x of items){const s=Math.max(start,x.start),e=Math.min(end,x.end);if(s>cur&&s-cur>=minGap)out.push({start:formatClock(cur),end:formatClock(s),duration:s-cur});if(e>cur)cur=e;}if(end-cur>=minGap)out.push({start:formatClock(cur),end:formatClock(end),duration:end-cur});return out;}
function formatClock(m){const h=Math.floor(m/60),mm=m%60;const ap=h>=12?'PM':'AM';const hh=h%12||12;return `${hh}:${pad(mm)} ${ap}`;}
function formatDuration(m){const h=Math.floor(m/60),mm=m%60;return h?`${h}h ${mm?`${mm}m`:''}`.trim():`${mm}m`;}

createRoot(document.getElementById('root')).render(<App/>);
