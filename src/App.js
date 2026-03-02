import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  loadAllData, saveResidents as apiSaveRes, saveFixedWorkshifts as apiSaveFx,
  saveDayWorkshifts as apiSaveDay, saveFlexWorkshifts as apiSaveFlex,
  savePreference as apiSavePref, savePublish as apiSavePublish,
  initializeDefaults as apiInitDefaults
} from "./api";

const DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const D3=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const PL=["Yes","Fine","Prefer not","No"];
const CATS=[
  {v:"flex",l:"Flexible"},{v:"day",l:"Day-specific"},{v:"fixed",l:"Fixed (always assigned)"}
];
const KEY_WS=["Cook","Cook Help","PM Clean","Upstairs Bathroom","Downstairs Bathroom","Kitchen Bathroom Clean","Berkeley Bowl Shop","Farmers Market"];

const calcH=out=>{const i=7-out.length;return i>=5?4:i>=3?2:i>=1?1:0;};
const nextMon=()=>{const d=new Date();const diff=(8-d.getDay())%7||7;d.setDate(d.getDate()+diff);return d;};
const fmtR=s=>{
  if(!s)return"—";
  const clean=String(s).includes("T")?s.split("T")[0]:String(s).trim();
  const d=new Date(clean+"T12:00:00"),e=new Date(d);
  if(isNaN(d.getTime()))return"—";
  e.setDate(d.getDate()+6);
  const m1=d.toLocaleDateString("en-US",{month:"short"}),m2=e.toLocaleDateString("en-US",{month:"short"});
  return m1===m2?`${m1} ${d.getDate()}-${e.getDate()}, ${d.getFullYear()}`:`${m1} ${d.getDate()} - ${m2} ${e.getDate()}, ${e.getFullYear()}`;
};
const fmtD=d=>{
  if(!d)return"—";
  try{return new Date(d).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});}catch(e){return"—";}
};
const toISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

const G={p:"#2d4a2d",pl:"#4a7a4a",bg:"#fafaf7",card:"#fff",imp:"#fffcf0",impB:"#e6c200",mt:"#94928d",
  dayBg:"rgba(45,74,45,0.12)",dayBdr:"rgba(45,74,45,0.35)",miss:"#fff0f0",missTxt:"#c0392b"};
const TABS=["📋 This Week's Workshifts","✏️ My Preferences","⚙️ Admin"];

const Hrs=({v})=><span style={{color:G.mt,fontStyle:"italic",fontSize:12,marginLeft:4}}>{v}h</span>;
const ImpBadge=()=><span style={{background:G.impB,color:"#5a4800",fontSize:9,padding:"1px 5px",borderRadius:3,marginLeft:6,fontWeight:700}}>⚠ Important</span>;

const hasLimitedAvail=(sub,allDayWS,flexWS,fxW)=>{
  if(!sub)return false;
  if(fxW.some(f=>f.to===sub.resId))return false;
  const prefs=sub.prefs||{};
  const pos=["Yes","Fine","Prefer not"];
  const keyIds=[...allDayWS,...flexWS].filter(w=>KEY_WS.includes(w.nm)).map(w=>w.id);
  return!keyIds.some(id=>pos.includes(prefs[id]));
};

function SecHead({n,title}){
  return(<div style={{background:G.p,color:"#fff",padding:"8px 14px",borderRadius:6,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
    {n&&<span style={{fontSize:15,fontWeight:700,opacity:0.9}}>{n}.</span>}
    <span style={{fontSize:15,fontWeight:700}}>{title}</span>
  </div>);
}

function ConfirmUnlockModal({open,onClose,onConfirm}){
  const[txt,setTxt]=useState("");
  const ref=useRef(null);
  useEffect(()=>{if(open){setTxt("");setTimeout(()=>ref.current?.focus(),50);}},[open]);
  if(!open)return null;
  return(
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}}>
      <div style={{background:"#fff",borderRadius:12,padding:28,maxWidth:380,width:"90%",boxShadow:"0 8px 30px rgba(0,0,0,0.15)"}}>
        <h3 style={{margin:"0 0 10px",color:"#333",fontSize:16,fontWeight:700}}>Unlock Editing</h3>
        <p style={{fontSize:13,color:"#666",lineHeight:1.5}}>Changes will affect workshifts, residents, the preference form, and schedule generation.</p>
        <p style={{fontSize:13}}>Type <strong>CONFIRM</strong> to proceed:</p>
        <input ref={ref} value={txt} onChange={e=>setTxt(e.target.value)}
          style={{width:"100%",padding:10,border:"1px solid #d4d3cf",borderRadius:6,fontSize:14,boxSizing:"border-box",marginBottom:14}}/>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{setTxt("");onClose();}} style={{flex:1,padding:10,background:"#f5f5f0",border:"none",borderRadius:6,cursor:"pointer",fontSize:13,color:"#666"}}>Cancel</button>
          <button disabled={txt!=="CONFIRM"} onClick={()=>{if(txt==="CONFIRM"){setTxt("");onConfirm();}}}
            style={{flex:1,padding:10,background:txt==="CONFIRM"?G.p:"#e8e8e3",border:"none",borderRadius:6,
              cursor:txt==="CONFIRM"?"pointer":"default",fontSize:13,color:txt==="CONFIRM"?"#fff":"#aaa",fontWeight:600}}>Proceed</button>
        </div>
      </div>
    </div>
  );
}

function LoadingScreen({msg}){
  return(
    <div style={{fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif",background:G.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:G.p}}>
      <div style={{fontSize:44,marginBottom:16}}>🏠</div>
      <h1 style={{fontSize:20,fontWeight:700,marginBottom:8}}>Fort Awesome Workshifts</h1>
      <div style={{fontSize:14,color:G.mt}}>{msg||"Loading..."}</div>
      <div style={{marginTop:20,width:200,height:4,background:"#e8e8e3",borderRadius:2,overflow:"hidden"}}>
        <div style={{width:"60%",height:"100%",background:G.p,borderRadius:2,animation:"pulse 1.5s ease-in-out infinite"}}/>
      </div>
    </div>
  );
}

function ErrorScreen({error,onRetry,onInit}){
  return(
    <div style={{fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif",background:G.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#333",padding:20}}>
      <div style={{fontSize:44,marginBottom:16}}>⚠️</div>
      <h1 style={{fontSize:20,fontWeight:700,color:G.p,marginBottom:8}}>Connection Issue</h1>
      <p style={{fontSize:14,color:G.mt,textAlign:"center",maxWidth:400,marginBottom:20}}>{error}</p>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onRetry} style={{padding:"10px 24px",background:G.p,color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer"}}>Retry</button>
        <button onClick={onInit} style={{padding:"10px 24px",background:"#fff",color:G.p,border:`1px solid ${G.p}`,borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer"}}>Initialize Default Data</button>
      </div>
      <p style={{fontSize:11,color:G.mt,marginTop:12,textAlign:"center",maxWidth:400}}>
        If this is your first time, click "Initialize Default Data" to populate Google Sheets with default residents and workshifts.
      </p>
    </div>
  );
}

export default function App(){
  const[loading,setLoading]=useState(true);
  const[loadError,setLoadError]=useState(null);
  const[saving,setSaving]=useState(false);

  const[res,setRes]=useState([]);
  const[fxW,setFxW]=useState([]);
  const[dws,setDws]=useState([]);
  const[flex,setFlex]=useState([]);
  const[tab,setTab]=useState(0);
  const[aTab,setATab]=useState(0);
  const[subs,setSubs]=useState({});
  const[hist,setHist]=useState([]);
  const[pub,setPub]=useState(null);
  const[draft,setDraft]=useState(null);
  const[ws,setWs]=useState(()=>toISO(nextMon()));
  const[eRes,setERes]=useState(null);
  const[cView,setCView]=useState("ws");
  const[stUnlock,setStUnlock]=useState(false);
  const[showUnlockModal,setShowUnlockModal]=useState(false);
  const[histModal,setHistModal]=useState(null);
  const[editWS,setEditWS]=useState(null);
  const[editResId,setEditResId]=useState(null);
  const[newResName,setNewResName]=useState("");
  const[showHDrop,setShowHDrop]=useState(false);
  const[addingRes,setAddingRes]=useState(false);
  const[copied,setCopied]=useState(false);
  const[navPrompt,setNavPrompt]=useState(null);

  const doLoad=useCallback(async()=>{
    setLoading(true);setLoadError(null);
    try{
      const d=await loadAllData();
      setRes(d.residents);
      setFxW(d.fixedWorkshifts);
      setDws(d.dayWorkshifts);
      setFlex(d.flexWorkshifts);
      setSubs(d.subs);
      setHist(d.history);
      setPub(d.pub);
      setLoading(false);
    }catch(err){
      console.error("Load error:",err);
      setLoadError(err.message||"Failed to connect to Google Sheets");
      setLoading(false);
    }
  },[]);

  const doInit=useCallback(async()=>{
    setLoading(true);setLoadError(null);
    try{
      await apiInitDefaults();
      await doLoad();
    }catch(err){
      setLoadError("Failed to initialize: "+err.message);
      setLoading(false);
    }
  },[doLoad]);

  useEffect(()=>{doLoad();},[doLoad]);

  const rById=useCallback(id=>res.find(r=>r.id===id),[res]);
  const rName=useCallback(id=>rById(id)?.n||"?",[rById]);
  const fxHrs=useCallback(rid=>fxW.filter(f=>f.to===rid).reduce((s,f)=>s+f.h,0),[fxW]);
  const isFF=useCallback(rid=>fxHrs(rid)>=4,[fxHrs]);

  const uDayWS=useMemo(()=>{
    const seen=new Set(),r=[];
    dws.forEach(w=>{const k=`${w.nm}--${w.day}`;if(w.slot==="B")return;if(!seen.has(k)){seen.add(k);r.push(w);}});
    return r;
  },[dws]);

  const nextWeekStr=useMemo(()=>{
    const m=nextMon(),e=new Date(m);e.setDate(m.getDate()+6);
    return`${m.toLocaleDateString("en-US",{month:"long",day:"numeric"})} - ${e.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}`;
  },[]);

  const pastCharts=useMemo(()=>{
    if(!pub)return hist;
    return hist.filter(h=>h.weekStart!==pub.weekStart);
  },[hist,pub]);

  const buildDefaultPrefs=useCallback(()=>{
    const pr={};
    uDayWS.forEach(w=>{pr[w.id]="Fine";});
    flex.filter(w=>!fxW.find(f=>f.id===w.id)).forEach(w=>{pr[w.id]="Fine";});
    return pr;
  },[uDayWS,flex,fxW]);

  const navTo=(t,at)=>{
    if(stUnlock&&(t!==2||at!==2)){setNavPrompt({t,at});return;}
    if(t!==undefined)setTab(t);if(at!==undefined)setATab(at);
    setERes(null);setShowHDrop(false);
  };
  const confirmNav=()=>{
    setStUnlock(false);
    if(navPrompt.t!==undefined)setTab(navPrompt.t);
    if(navPrompt.at!==undefined)setATab(navPrompt.at);
    setERes(null);setShowHDrop(false);setNavPrompt(null);
  };

  // ─── Print / Save as PDF ──────────────────────────────────
  const handlePrint=useCallback(()=>{
    const wsArea=document.getElementById("print-chart-ws");
    const personArea=document.getElementById("print-chart-person");
    if(!wsArea||!personArea)return;
    const weekTitle=pub?fmtR(pub.weekStart):"";
    const processClone=(el)=>{
      const clone=document.createElement("div");
      clone.innerHTML=el.innerHTML;
      clone.querySelectorAll("div").forEach(d=>{
        const bg=d.style.background||d.style.backgroundColor;
        if(bg&&(bg.includes("45, 74, 45")||bg.includes("74, 122, 74")||bg.includes("122, 122, 114")||bg.includes("#2d4a2d")||bg.includes("#4a7a4a")||bg.includes("#7a7a72"))){
          d.style.background="none";d.style.backgroundColor="transparent";
          d.style.color="#1a1a1a";d.style.fontWeight="800";
          d.style.borderBottom="2px solid #999";d.style.paddingBottom="2px";d.style.borderRadius="0";
        }
      });
      return clone.innerHTML;
    };
    // Force both views visible temporarily to capture content
    const wsWasHidden=wsArea.style.display==="none";
    const personWasHidden=personArea.style.display==="none";
    wsArea.style.display="block";
    personArea.style.display="block";
    const wsContent=processClone(wsArea);
    const personContent=processClone(personArea);
    if(wsWasHidden)wsArea.style.display="none";
    if(personWasHidden)personArea.style.display="none";
    const w=window.open("","_blank","width=900,height=700");
    w.document.write(`<!DOCTYPE html><html><head><title>Workshifts for Week of ${weekTitle}</title>
<style>
@page{size:letter;margin:0.25in 0.4in;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif;
padding:0;margin:0;color:#333;font-size:9px;line-height:1.15;}
.no-print{background:#f0efeb;border:1px solid #d4d3cf;border-radius:8px;padding:12px 16px;margin:16px;text-align:center;}
.no-print p{font-size:12px;color:#666;margin-bottom:8px;}
.print-title{text-align:center;font-size:16px;font-weight:700;color:#1a1a1a;padding:8px 16px 4px;border-bottom:2px solid #333;margin:0 16px 6px;}
.print-subtitle{text-align:center;font-size:12px;font-weight:600;color:#555;margin:4px 16px 8px;}
.print-content{padding:0 16px;font-size:9px;}
.print-content div[style*="grid"]{display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px!important;}
.print-content.person-view div[style*="grid"]{grid-template-columns:1fr 1fr 1fr!important;gap:6px!important;font-size:8px!important;}
.page-break{page-break-before:always;margin-top:0;}
@media print{
.no-print{display:none!important;}
body{font-size:9px;}
.print-title{margin:0 0 8px;padding:0 0 6px;}
.print-subtitle{margin:4px 0 8px;}
.print-content{padding:0;}
}
</style></head><body>
<div class="no-print">
<p>Tip: In the print dialog, uncheck "Headers and footers" for a cleaner look.</p>
<button onclick="window.print()" style="padding:8px 20px;background:#2d4a2d;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Print</button>
</div>
<div class="page-one">
<div class="print-title">Workshifts for Week of ${weekTitle}</div>
<div class="print-subtitle">By Workshift</div>
<div class="print-content">${wsContent}</div>
</div>
<div class="print-title">Workshifts for Week of ${weekTitle}</div>
<div class="print-subtitle">By Person</div>
<div class="print-content person-view">${personContent}</div>
</body></html>`);
    w.document.close();
  },[pub]);

  // ─── Algorithm ────────────────────────────────────────────
  const genSched=useCallback(()=>{
    const a={},rh={},sat={},ckCnt={},pmCnt={},amCnt={},pmDays={};
    res.forEach(r=>{rh[r.id]=0;sat[r.id]={l:0,f:0,pn:0,t:0};ckCnt[r.id]=0;pmCnt[r.id]=0;amCnt[r.id]=0;pmDays[r.id]=new Set();});
    fxW.forEach(w=>{if(w.to){a[w.id]=w.to;rh[w.to]=(rh[w.to]||0)+w.h;}});
    const tgt={};res.forEach(r=>{tgt[r.id]=isFF(r.id)?fxHrs(r.id):calcH(subs[r.id]?.daysOut||[]);});
    const rem=rid=>Math.max(0,tgt[rid]-(rh[rid]||0));
    const canDay=(rid,day)=>!(subs[rid]?.daysOut||[]).includes(day);
    const gp=(rid,wid)=>subs[rid]?.prefs?.[wid]||"Fine";
    const ps=p=>p==="Yes"?4:p==="Fine"?3:p==="Prefer not"?2:1;

    const canA=(rid,w)=>{
      if(isFF(rid))return false;if(rem(rid)<w.h)return false;
      if(w.day&&!canDay(rid,w.day))return false;
      const pid=w.id.replace(/^pb-/,"pa-");
      if(gp(rid,pid)==="No")return false;
      if((w.nm==="Cook"||w.nm==="Cook Help")&&ckCnt[rid]>=1)return false;
      if(w.nm==="PM Clean"&&pmCnt[rid]>=2)return false;
      if(w.nm==="AM Clean"&&amCnt[rid]>=4)return false;
      if(w.id.startsWith("pb-")&&a[w.id.replace("pb-","pa-")]===rid)return false;
      if(w.id.startsWith("pa-")&&a[w.id.replace("pa-","pb-")]===rid)return false;
      if(w.nm==="PM Clean"&&pmDays[rid]?.has(w.day))return false;
      if(w.nm==="PM Clean"){const ci=`ck-${w.day}`;if(a[ci]===rid&&!subs[rid]?.cookPmOk)return false;}
      if(w.nm==="Cook"){const pa=`pa-${w.day}`,pb=`pb-${w.day}`;if((a[pa]===rid||a[pb]===rid)&&!subs[rid]?.cookPmOk)return false;}
      if(w.nm==="Cook Help"){const ci=`ck-${w.day}`;if(a[ci]===rid||!a[ci])return false;}
      return true;
    };
    const rank=(w,cands)=>cands.sort((x,y)=>{
      const rx=rem(x),ry=rem(y);if(rx!==ry)return ry-rx;
      const sx=sat[x],sy=sat[y];
      const sa=sx.t>0?(sx.l*4+sx.f*3+sx.pn)/sx.t:5;
      const sb=sy.t>0?(sy.l*4+sy.f*3+sy.pn)/sy.t:5;
      if(sa!==sb)return sa-sb;
      const pid=w.id.replace(/^pb-/,"pa-");
      return ps(gp(y,pid))-ps(gp(x,pid))||Math.random()-0.5;
    });
    const doA=w=>{
      const c=res.filter(r=>canA(r.id,w)).map(r=>r.id);if(!c.length)return;
      const ch=rank(w,c)[0];a[w.id]=ch;rh[ch]=(rh[ch]||0)+w.h;
      if(w.nm==="Cook"||w.nm==="Cook Help")ckCnt[ch]++;
      if(w.nm==="PM Clean"){pmCnt[ch]++;pmDays[ch].add(w.day);}
      if(w.nm==="AM Clean")amCnt[ch]++;
      const p=gp(ch,w.id.replace(/^pb-/,"pa-"));const s=sat[ch];s.t++;
      if(p==="Yes")s.l++;else if(p==="Fine")s.f++;else if(p==="Prefer not")s.pn++;
    };
    // Priority 1: Cook
    dws.filter(w=>w.nm==="Cook").sort((x,y)=>DAYS.indexOf(x.day)-DAYS.indexOf(y.day)).forEach(doA);
    // Priority 2: PM Clean for dinner nights
    dws.filter(w=>w.nm==="PM Clean").sort((x,y)=>DAYS.indexOf(x.day)-DAYS.indexOf(y.day)).forEach(w=>{if(a[`ck-${w.day}`])doA(w);});
    // Priority 3: Cook Help for dinner nights
    dws.filter(w=>w.nm==="Cook Help").forEach(w=>{if(a[`ck-${w.day}`])doA(w);});
    // Priority 4: Other day workshifts
    dws.filter(w=>w.ess&&w.nm!=="Cook"&&w.nm!=="PM Clean"&&w.nm!=="Cook Help").sort((x,y)=>DAYS.indexOf(x.day)-DAYS.indexOf(y.day)).forEach(doA);
    // Priority 5: Flexible workshifts in priority order
    flex.forEach(doA);
    return a;
  },[res,fxW,dws,flex,subs,isFF,fxHrs]);

  const tb=act=>({padding:"5px 14px",border:`1px solid ${act?G.p:"#d4d3cf"}`,borderRadius:6,cursor:"pointer",
    background:act?G.p:"#fff",color:act?"#fff":"#666",fontWeight:act?600:400,fontSize:12});
  const dayOrd=nm=>({"AM Clean":0,"Cook":1,"Cook Help":2,"PM Clean":3}[nm]??4);

  const SaveIndicator=()=>saving?(
    <div style={{position:"fixed",top:10,right:10,background:G.p,color:"#fff",padding:"6px 16px",borderRadius:8,fontSize:12,fontWeight:600,zIndex:1000,boxShadow:"0 2px 10px rgba(0,0,0,0.2)"}}>
      Saving...
    </div>
  ):null;

  // ─── Preference Form ──────────────────────────────────────
  const PrefForm=({resId,onClose})=>{
    const r=rById(resId),ex=subs[resId];
    const defaultPrefs=buildDefaultPrefs();
    const[dOut,setDOut]=useState(ex?.daysOut||[]);
    const[pr,setPr]=useState(()=>{
      if(ex?.prefs&&Object.keys(ex.prefs).length>0){
        return{...defaultPrefs,...ex.prefs};
      }
      return defaultPrefs;
    });
    const[cpOk,setCpOk]=useState(ex?.cookPmOk||false);
    const[cmt,setCmt]=useState(ex?.comment||"");
    const[col,setCol]=useState(()=>{const c={};DAYS.forEach(d=>c[d]=true);return c;});
    const[submitting,setSubmitting]=useState(false);

    const togDay=d=>{
      const next=dOut.includes(d)?dOut.filter(x=>x!==d):[...dOut,d];
      setDOut(next);
    };
    const setP=(wid,lv)=>setPr(p=>({...p,[wid]:lv}));
    const submit=async()=>{
      setSubmitting(true);
      const submission={resId,daysOut:dOut,prefs:pr,cookPmOk:cpOk,comment:cmt,updatedAt:new Date().toISOString()};
      try{
        await apiSavePref(submission);
        setSubs(s=>({...s,[resId]:submission}));
        onClose();
      }catch(err){
        alert("Failed to save: "+err.message);
      }
      setSubmitting(false);
    };

    const myFx=fxW.filter(f=>f.to===resId);
    const dayGrp={};DAYS.forEach(d=>{dayGrp[d]=uDayWS.filter(w=>w.day===d).sort((a,b)=>dayOrd(a.nm)-dayOrd(b.nm));});
    const flexList=useMemo(()=>flex.filter(w=>!fxW.find(f=>f.id===w.id)).sort((a,b)=>{
      if(a.imp&&!b.imp)return -1;if(!a.imp&&b.imp)return 1;return(a.priority||999)-(b.priority||999);
    }),[flex,fxW]);

    const keyIds=[...uDayWS,...flex].filter(w=>KEY_WS.includes(w.nm)).map(w=>w.id);
    const hasKeyPref=keyIds.some(id=>["Yes","Fine","Prefer not"].includes(pr[id]));
    const showWarn=!myFx.length&&!hasKeyPref;

    const PRow=({ws:w,disabled})=>(
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f0efeb",opacity:disabled?0.35:1}}>
        <span style={{fontSize:13,fontWeight:500,display:"flex",alignItems:"center",gap:4}}>{w.nm}<Hrs v={w.h}/></span>
        <div style={{display:"flex",gap:3}}>
          {PL.map(lv=>(
            <button key={lv} onClick={()=>!disabled&&setP(w.id,lv)} style={{
              padding:"3px 10px",border:`1px solid ${pr[w.id]===lv?"#5a8a5a":"#ddd"}`,borderRadius:4,
              cursor:disabled?"default":"pointer",fontSize:11,fontWeight:pr[w.id]===lv?600:400,
              background:pr[w.id]===lv?"#e8f0e8":"#fafaf7",color:pr[w.id]===lv?"#2d5a2d":"#888"
            }}>{lv}</button>
          ))}
        </div>
      </div>
    );

    return(
      <div style={{maxWidth:660,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:G.mt}}>← Back</button>
          <h2 style={{margin:0,color:G.p,fontSize:22,fontWeight:700}}>{r?.n}</h2>
        </div>
        {myFx.length>0&&(
          <div style={{background:"#fff",borderLeft:`4px solid ${G.pl}`,borderRadius:4,padding:"10px 14px",marginBottom:20,border:"1px solid #eeeee8",borderLeftWidth:4,borderLeftColor:G.pl}}>
            <div style={{fontWeight:600,fontSize:13,marginBottom:2,color:G.p}}>📌 Always Yours</div>
            {myFx.map(f=><div key={f.id} style={{fontSize:12,color:"#555"}}>• {f.nm} <span style={{color:G.mt,fontStyle:"italic"}}>{f.h}h</span></div>)}
          </div>
        )}
        {showWarn&&(
          <div style={{background:"#fff8e1",border:"1px solid #ffe082",borderRadius:8,padding:12,marginBottom:16,fontSize:13,color:"#8d6e00"}}>
            ⚠ <strong>Warning:</strong> You are unavailable for all key workshifts (cook, cook help, PM clean, bathrooms, Berkeley Bowl, and farmers market).
          </div>
        )}
        <SecHead n="1" title="Days out of town this week"/>
        <div style={{marginBottom:24}}>
          <div style={{fontSize:12,color:G.p,fontWeight:600,marginBottom:8}}>Week of: {nextWeekStr}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {DAYS.map((d,i)=>(
              <button key={d} onClick={()=>togDay(d)} style={{
                padding:"6px 14px",borderRadius:6,border:`1px solid ${dOut.includes(d)?G.p:"#d4d3cf"}`,
                background:dOut.includes(d)?G.p:"#fff",color:dOut.includes(d)?"#fff":"#555",
                cursor:"pointer",fontSize:12,fontWeight:dOut.includes(d)?600:400
              }}>{D3[i]}</button>
            ))}
          </div>
          <div style={{fontSize:12,color:G.mt,marginTop:8}}>Hours this week: <strong style={{color:G.p}}>{calcH(dOut)}h</strong> ({7-dOut.length} days in town)</div>
        </div>
        <SecHead n="2" title="Day-specific workshifts"/>
        <div style={{marginBottom:24}}>
          {DAYS.map(d=>{
            const wl=dayGrp[d];if(!wl?.length)return null;
            const isOut=dOut.includes(d),isOpen=col[d];
            return(<div key={d} style={{marginBottom:6}}>
              <button onClick={()=>setCol(c=>({...c,[d]:!c[d]}))} style={{
                width:"100%",textAlign:"left",padding:"7px 12px",background:G.dayBg,color:G.p,
                border:`1px solid ${G.dayBdr}`,borderRadius:6,cursor:"pointer",fontWeight:600,fontSize:13,
                opacity:isOut?0.35:1,display:"flex",justifyContent:"space-between",alignItems:"center"
              }}><span>{d}{isOut?" (out of town)":""}</span><span style={{fontSize:11,opacity:0.5,fontWeight:300}}>{isOpen?"▿":"▹"}</span></button>
              {isOpen&&<div style={{padding:"4px 0"}}>{wl.map(w=><PRow key={w.id} ws={w} disabled={isOut}/>)}</div>}
            </div>);
          })}
        </div>
        <SecHead n="3" title="Flexible workshifts"/>
        <div style={{marginBottom:24}}>{flexList.map(w=><PRow key={w.id} ws={w} disabled={false}/>)}</div>
        <SecHead n="4" title="Comments and availability"/>
        <div style={{marginBottom:24}}>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer",marginBottom:12}}>
            <input type="checkbox" checked={cpOk} onChange={e=>setCpOk(e.target.checked)} style={{accentColor:G.p}}/>
            I'm okay with Cook + PM Clean on the same evening
          </label>
          <textarea value={cmt} onChange={e=>setCmt(e.target.value)} placeholder="Any notes for the chore-e-ographer..."
            style={{width:"100%",minHeight:70,padding:10,border:"1px solid #d4d3cf",borderRadius:6,fontSize:13,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
        </div>
        <button onClick={submit} disabled={submitting} style={{width:"100%",padding:14,background:submitting?"#999":G.p,color:"#fff",border:"none",borderRadius:8,fontSize:15,fontWeight:700,cursor:submitting?"wait":"pointer"}}>
          {submitting?"Saving...":"Update Preferences"}
        </button>
      </div>
    );
  };

  // ─── Charts ───────────────────────────────────────────────
  const DayChart=({asgn,wsd,edit,onEdit,showLC,showStats})=>{
    const lc=useMemo(()=>{
      if(!showLC)return{};const r={};flex.forEach(w=>{
        for(let i=hist.length-1;i>=0;i--){if(hist[i].assignments[w.id]){r[w.id]=Math.round((Date.now()-new Date(hist[i].weekStart+"T12:00:00").getTime())/(7*86400000));break;}}
      });return r;
    },[showLC,hist,flex]);

    const resStats=useMemo(()=>{
      if(!showStats)return[];
      const s={};res.forEach(r=>{s[r.id]=0;});
      Object.entries(asgn).forEach(([wid,rid])=>{
        if(!rid)return;
        const w=dws.find(x=>x.id===wid)||flex.find(x=>x.id===wid)||fxW.find(x=>x.id===wid);
        if(w)s[rid]=(s[rid]||0)+w.h;
      });
      const tgt={};res.forEach(r=>{tgt[r.id]=isFF(r.id)?fxHrs(r.id):calcH(subs[r.id]?.daysOut||[]);});
      return res.map(r=>({n:r.n,hrs:s[r.id]||0,tgt:tgt[r.id],ok:Math.abs((s[r.id]||0)-tgt[r.id])<0.1}));
    },[showStats,asgn,res,dws,flex,fxW,subs,isFF,fxHrs]);

    const Slot=({w})=>{
      const rid=asgn[w.id];const missing=!rid&&w.day;
      const lcVal=lc[w.id];const lcIsRecent=lcVal===0;
      return(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",
          background:missing?G.miss:w.imp?G.imp:"transparent",borderRadius:4,fontSize:13}}>
          <span style={{display:"flex",alignItems:"center",gap:4}}>
            {w.nm}<Hrs v={w.h}/>{w.imp&&<ImpBadge/>}
            {showLC&&lcVal!=null&&(
              <span style={{fontSize:10,fontWeight:600,padding:"1px 5px",borderRadius:3,marginLeft:6,
                color:lcIsRecent?"#999":"#6b5900",background:lcIsRecent?"#f0f0ed":"#fff3cd"}}>
                last: {lcVal}w ago
              </span>
            )}
          </span>
          {edit?(
            <select value={rid||""} onChange={e=>onEdit(w.id,e.target.value||null)}
              style={{padding:"3px 8px",borderRadius:4,border:"1px solid #d4d3cf",fontSize:12,minWidth:100,background:"#fff"}}>
              <option value="">—</option>
              {res.filter(r=>!isFF(r.id)).map(r=><option key={r.id} value={r.id}>{r.n}</option>)}
            </select>
          ):<span style={{fontWeight:600,color:rid?G.p:G.missTxt,fontSize:13}}>{rid?rName(rid):missing?"":"—"}</span>}
        </div>
      );
    };

    return(
      <div>
        {showStats&&resStats.length>0&&(
          <div style={{background:"#f0efeb",borderRadius:8,padding:10,marginBottom:16,display:"flex",flexWrap:"wrap",gap:6}}>
            {resStats.filter(s=>s.tgt>0).map(s=>(
              <span key={s.n} style={{fontSize:11,padding:"2px 8px",borderRadius:4,fontWeight:600,
                background:s.ok?"#e8f5e8":"#fde8e8",color:s.ok?"#1a5c1a":"#a01010",
                border:`1px solid ${s.ok?"#c5e5c5":"#f5c5c5"}`}}>
                {s.n}: {s.hrs}/{s.tgt}h {s.ok?"✓":"⚠"}
              </span>
            ))}
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"start"}}>
          <div>
            {DAYS.map(d=>{
              const list=dws.filter(w=>w.day===d).sort((a,b)=>dayOrd(a.nm)-dayOrd(b.nm));
              return(<div key={d} style={{marginBottom:10}}>
                <div style={{background:G.p,color:"#fff",padding:"5px 12px",borderRadius:6,fontWeight:700,fontSize:13}}>{d}</div>
                {list.map(w=><Slot key={w.id} w={w}/>)}
              </div>);
            })}
          </div>
          <div>
            <div style={{marginBottom:12}}>
              <div style={{background:G.pl,color:"#fff",padding:"5px 12px",borderRadius:6,fontWeight:700,fontSize:13}}>Flexible</div>
              {[...flex].sort((a,b)=>{if(a.imp&&!b.imp)return -1;if(!a.imp&&b.imp)return 1;return(a.priority||999)-(b.priority||999);}).map(w=><Slot key={w.id} w={w}/>)}
            </div>
            <div>
              <div style={{background:"#7a7a72",color:"#fff",padding:"5px 12px",borderRadius:6,fontWeight:600,fontSize:13,fontStyle:"italic"}}>Fixed</div>
              {fxW.map(w=>(
                <div key={w.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 8px",fontSize:13}}>
                  <span>{w.nm}<Hrs v={w.h}/></span>
                  <span style={{fontWeight:600,color:G.p}}>{rName(w.to)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const PersonChart=({asgn})=>{
    const byP={};res.forEach(r=>{byP[r.id]=[];});
    Object.entries(asgn).forEach(([wid,rid])=>{
      if(!rid)return;
      const w=dws.find(x=>x.id===wid)||flex.find(x=>x.id===wid)||fxW.find(x=>x.id===wid);
      if(w)byP[rid]?.push({...w,wid});
    });
    return(
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
        {res.map(r=>{
          const items=byP[r.id]||[];const hrs=items.reduce((s,i)=>s+(i.h||0),0);
          const dayI=items.filter(i=>i.day).sort((a,b)=>{const di=DAYS.indexOf(a.day)-DAYS.indexOf(b.day);return di!==0?di:dayOrd(a.nm)-dayOrd(b.nm);});
          const flexI=items.filter(i=>!i.day);
          return(
            <div key={r.id} style={{background:G.card,borderRadius:8,padding:12,border:"1px solid #eeeee8"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <strong style={{fontSize:14,color:G.p}}>{r.n}</strong>
                <span style={{fontSize:12,color:G.mt,fontStyle:"italic"}}>{hrs}h</span>
              </div>
              {items.length===0?<div style={{fontSize:12,color:"#ccc"}}>No assignments</div>:(
                <>
                  {dayI.map((it,i)=>(
                    <div key={i} style={{fontSize:12,display:"flex",gap:6,padding:"1px 0",background:it.imp?G.imp:"transparent",borderRadius:it.imp?3:0,paddingLeft:it.imp?4:0}}>
                      <span style={{fontWeight:700,minWidth:28,color:G.p}}>{D3[DAYS.indexOf(it.day)]}</span>
                      <span>{it.nm}<Hrs v={it.h}/></span>{it.imp&&<ImpBadge/>}
                    </div>
                  ))}
                  {flexI.map((it,i)=>(
                    <div key={i} style={{fontSize:12,display:"flex",gap:6,padding:"1px 0",background:it.imp?G.imp:"transparent",borderRadius:it.imp?3:0,paddingLeft:it.imp?4:0}}>
                      <span style={{minWidth:28}}/><span>{it.nm}<Hrs v={it.h}/></span>{it.imp&&<ImpBadge/>}
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const ChartHeader=({wsd,asgn,showToggle,copyBtn,printBtn})=>{
    const dn=["Sunday","Monday","Tuesday","Wednesday","Thursday"].filter(d=>asgn[`ck-${d}`]).length;
    const oc=res.filter(r=>{const s=subs[r.id];return s?.daysOut?.length>0;}).length;
    return(<div style={{marginBottom:16}}>
      <div style={{display:"flex",alignItems:"baseline",gap:12,flexWrap:"wrap"}}>
        <span style={{fontSize:20,fontWeight:700,color:G.p}}>Week of {fmtR(wsd||ws)}</span>
        <span style={{fontSize:13,color:G.mt}}>🍳 {dn} dinners</span>
        <span style={{fontSize:13,color:G.mt}}>✈️ {oc} away</span>
      </div>
      {showToggle&&(
        <div style={{display:"flex",gap:8,marginTop:10,alignItems:"center"}}>
          <button onClick={()=>setCView("ws")} style={tb(cView==="ws")}>By Workshift</button>
          <button onClick={()=>setCView("person")} style={tb(cView==="person")}>By Person</button>
          <div style={{flex:1}}/>
          {printBtn}
          {copyBtn}
        </div>
      )}
    </div>);
  };

  // ─── Tab 0 ────────────────────────────────────────────────
  const Tab0=()=>{
    const copyLink=()=>{
      const msg=`It's time to submit your workshift preferences for the week of ${nextWeekStr}! Open the app to update yours.`;
      navigator.clipboard?.writeText(msg).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});
    };
    if(!pub)return(
      <div style={{textAlign:"center",padding:60,color:G.mt}}>
        <div style={{fontSize:44,marginBottom:8}}>📋</div>
        <div style={{fontSize:16,fontWeight:500}}>No chart published yet</div>
        <div style={{fontSize:13,marginTop:6}}>Go to Admin → Generate Chart to create one</div>
      </div>
    );
    const CopyBtn=<button onClick={copyLink} style={{padding:"5px 12px",border:"1px solid #d4d3cf",borderRadius:6,cursor:"pointer",fontSize:12,color:copied?"#22c55e":"#666",background:"#fff",fontWeight:500}}>
      {copied?"✓ Copied!":"📋 Copy link"}
    </button>;
    const PrintBtn=<button onClick={handlePrint} style={{padding:"5px 12px",border:"1px solid #d4d3cf",borderRadius:6,cursor:"pointer",fontSize:12,color:"#666",background:"#fff",fontWeight:500}}>
      🖨 Print / PDF
    </button>;
    return(
      <div>
        <ChartHeader wsd={pub.weekStart} asgn={pub.assignments} showToggle={true} copyBtn={CopyBtn} printBtn={PrintBtn}/>
        <div id="print-chart-ws" style={{display:cView==="ws"?"block":"none"}}>
          <DayChart asgn={pub.assignments} wsd={pub.weekStart} edit={false} showLC={false} showStats={false}/>
        </div>
        <div id="print-chart-person" style={{display:cView==="person"?"block":"none"}}>
          <PersonChart asgn={pub.assignments} wsd={pub.weekStart}/>
        </div>
      </div>
    );
  };

  // ─── Tab 1 ────────────────────────────────────────────────
  const Tab1=()=>{
    if(eRes)return <PrefForm resId={eRes} onClose={()=>setERes(null)}/>;
    return(
      <div>
        <h2 style={{color:G.p,margin:"0 0 16px",fontSize:20,fontWeight:700}}>My Preferences</h2>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
          {res.map(r=>{
            const ff=isFF(r.id),sub=subs[r.id];
            return(
              <div key={r.id} onClick={()=>!ff&&setERes(r.id)} style={{
                background:G.card,borderRadius:8,padding:14,textAlign:"center",cursor:ff?"default":"pointer",
                opacity:ff?0.45:1,border:"1px solid #eeeee8"
              }}>
                <div style={{fontWeight:600,fontSize:14,color:G.p}}>{r.n}</div>
                {ff?<div style={{fontSize:11,color:G.mt,marginTop:4}}>Auto-assigned</div>:
                  sub?<div style={{marginTop:4}}><div style={{fontSize:10,color:G.mt}}>Last updated:</div><div style={{fontSize:10,color:G.mt}}>{fmtD(sub.updatedAt)}</div></div>:
                  <div style={{fontSize:11,color:G.mt,marginTop:4}}>Tap to set preferences</div>
                }
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Tab 2: Admin ─────────────────────────────────────────
  const Tab2=()=>{
    const atabs=["📊 Generate Chart","📋 Form Results","⚙ Settings"];

    const GenPanel=()=>{
      const gen=()=>setDraft({assignments:genSched(),weekStart:ws});
      const editD=(wid,rid)=>setDraft(d=>({...d,assignments:{...d.assignments,[wid]:rid}}));
      const publish=async()=>{
        setSaving(true);
        const ch={...draft,publishedAt:new Date().toISOString(),submissions:{...subs}};
        try{
          await apiSavePublish(ch);
          setHist(h=>[...h,ch].slice(-8));setPub(ch);setDraft(null);navTo(0);setCView("ws");
        }catch(err){alert("Failed to publish: "+err.message);}
        setSaving(false);
      };
      const unstaffed=draft?dws.filter(w=>w.ess&&!draft.assignments[w.id]):[];
      return(
        <div>
          <div style={{display:"flex",gap:14,alignItems:"center",padding:"8px 14px",background:"#f0efeb",borderRadius:8,marginBottom:16,flexWrap:"wrap",fontSize:13}}>
            <label style={{display:"flex",alignItems:"center",gap:6}}>Week:
              <input type="date" value={ws} onChange={e=>setWs(e.target.value)} style={{padding:"3px 8px",borderRadius:4,border:"1px solid #d4d3cf",fontSize:12}}/>
            </label>
          </div>
          {!draft?(
            <div style={{textAlign:"center",padding:50}}>
              <button onClick={gen} style={{padding:"16px 48px",background:G.p,color:"#fff",border:"none",borderRadius:10,fontSize:17,fontWeight:700,cursor:"pointer"}}>Generate Chart →</button>
            </div>
          ):(
            <div>
              {unstaffed.length>0&&(
                <div style={{background:"#fff8e1",border:"1px solid #ffe082",borderRadius:8,padding:12,marginBottom:16}}>
                  <strong style={{fontSize:13}}>⚠ {unstaffed.length} essential workshift{unstaffed.length!==1?"s":""} unassigned</strong>
                  <div style={{fontSize:12,color:"#8d6e00",marginTop:4}}>{unstaffed.map(w=>`${w.nm}${w.day?` (${w.day})`:""}`).join(", ")}</div>
                </div>
              )}
              <div style={{marginBottom:16}}>
                <div style={{fontSize:18,fontWeight:700,color:G.p}}>Week of {fmtR(draft.weekStart)}</div>
              </div>
              <DayChart asgn={draft.assignments} wsd={draft.weekStart} edit={true} onEdit={editD} showLC={true} showStats={true}/>
              <div style={{display:"flex",gap:10,marginTop:20}}>
                <button onClick={gen} style={{flex:1,padding:12,background:"#fff",color:G.p,border:`1px solid ${G.p}`,borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer"}}>🔄 Re-generate</button>
                <button onClick={publish} style={{flex:1,padding:12,background:G.p,color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer"}}>Publish Chart ✓</button>
              </div>
            </div>
          )}
        </div>
      );
    };

    const FormResults=()=>{
      const[fCol,setFCol]=useState({});
      const dayGrouped={};
      DAYS.forEach(d=>{dayGrouped[d]=uDayWS.filter(w=>w.day===d).sort((a,b)=>dayOrd(a.nm)-dayOrd(b.nm));});
      const flexWS=flex.filter(w=>!fxW.find(f=>f.id===w.id));
      const shades={"Yes":{bg:"#c8e6c8",c:"#1a4a1a"},"Fine":{bg:"#dde8dd",c:"#2d5a2d"},"Prefer not":{bg:"#eef4ee",c:"#4a7a4a"},"No":{bg:"#f0f0ed",c:"#aaa"}};
      const limited=res.filter(r=>!isFF(r.id)&&hasLimitedAvail(subs[r.id],uDayWS,flex,fxW)).map(r=>r.n);

      const WSCard=({w})=>{
        const cov=res.filter(r=>{
          if(isFF(r.id))return false;
          const sub=subs[r.id];if(!sub)return true;
          let out=sub.daysOut||[];
          if(typeof out==="string"){try{out=JSON.parse(out);}catch(e){out=[];}}
          if(!Array.isArray(out))out=[];
          if(out.length>=5)return false;
          if(w.day&&out.includes(w.day))return false;
          return true;
        }).map(r=>({r,pref:subs[r.id]?.prefs?.[w.id]||null}));
        const groups={};PL.forEach(lv=>{groups[lv]=cov.filter(x=>x.pref===lv);});
        return(
          <div style={{background:G.card,borderRadius:8,padding:10,marginBottom:6,border:"1px solid #eeeee8"}}>
            <div style={{fontWeight:600,fontSize:13,color:G.p,marginBottom:6,display:"flex",alignItems:"center",gap:4}}>
              {w.nm}<Hrs v={w.h}/>{w.imp&&<ImpBadge/>}
            </div>
            {PL.map(lv=>{
              const g=groups[lv];if(!g.length)return null;const sh=shades[lv];
              return(<div key={lv} style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:3}}>
                <span style={{fontSize:11,color:sh.c,fontWeight:600,minWidth:72}}>{lv}:</span>
                <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                  {g.map(({r})=><span key={r.id} style={{fontSize:11,padding:"1px 7px",borderRadius:4,background:sh.bg,color:sh.c}}>{r.n}</span>)}
                </div>
              </div>);
            })}
          </div>
        );
      };

      const comments=res.filter(r=>!isFF(r.id)&&subs[r.id]?.comment);

      return(
        <div>
          {limited.length>0&&(
            <div style={{background:"#fff8e1",border:"1px solid #ffe082",borderRadius:8,padding:12,marginBottom:16}}>
              <strong style={{fontSize:13,color:"#8d6e00"}}>⚠ Limited availability</strong>
              <div style={{fontSize:12,color:"#8d6e00",marginTop:2}}>Unable to do key workshifts:</div>
              <ul style={{margin:"6px 0 0",paddingLeft:20}}>
                {limited.map(n=><li key={n} style={{fontSize:12,color:"#8d6e00"}}>{n}</li>)}
              </ul>
            </div>
          )}
          <SecHead title="Day-specific"/>
          {DAYS.map(d=>{
            const wl=dayGrouped[d];if(!wl?.length)return null;
            const isOpen=fCol[d]!==false;
            return(<div key={d}>
              <button onClick={()=>setFCol(c=>({...c,[d]:!isOpen}))} style={{
                width:"100%",textAlign:"left",padding:"7px 12px",background:G.dayBg,color:G.p,
                border:`1px solid ${G.dayBdr}`,borderRadius:6,cursor:"pointer",fontWeight:600,fontSize:13,
                display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,marginTop:6
              }}><span>{d}</span><span style={{fontSize:11,opacity:0.5,fontWeight:300}}>{isOpen?"▿":"▹"}</span></button>
              {isOpen&&wl.map(w=><WSCard key={w.id} w={w}/>)}
            </div>);
          })}
          <SecHead title="Flexible"/>
          {flexWS.map(w=><WSCard key={w.id} w={w}/>)}
          {comments.length>0&&(
            <><SecHead title="Resident Comments"/>
              {comments.map(r=>(
                <div key={r.id} style={{background:G.card,borderRadius:8,padding:10,marginBottom:6,border:"1px solid #eeeee8"}}>
                  <strong style={{fontSize:13,color:G.p}}>{r.n}</strong>
                  <div style={{fontSize:12,color:"#666",marginTop:2}}>{subs[r.id].comment}</div>
                </div>
              ))}
            </>
          )}
        </div>
      );
    };

    const SettingsPanel=()=>{
      const[dragIdx,setDragIdx]=useState(null);
      const[overIdx,setOverIdx]=useState(null);

      const WSEditModal=()=>{
        const[nm,setNm]=useState(editWS?.nm||"");
        const[h,setH]=useState(editWS?.h||0.5);
        const[cat,setCat]=useState(editWS?.cat||"flex");
        const[day,setDay]=useState(editWS?.day||"Monday");
        const[impV,setImpV]=useState(editWS?.imp||false);
        const[fixTo,setFixTo]=useState(editWS?.to||"");
        const[priV,setPriV]=useState(editWS?.priority||"");
        const[isSaving,setIsSaving]=useState(false);
        if(!editWS)return null;
        const isNew=editWS.isNew;
        const origId=editWS.id;

        const save=async()=>{
          setIsSaving(true);
          const base={nm,h:parseFloat(h),imp:impV};
          const id=origId||(isNew?`${cat}-${Date.now()}`:origId);

          let newFx=[...fxW],newDws=[...dws],newFlex=[...flex];
          if(!isNew){
            newFx=newFx.filter(x=>x.id!==origId);
            newDws=newDws.filter(x=>x.id!==origId);
            newFlex=newFlex.filter(x=>x.id!==origId);
          }
          if(cat==="fixed")newFx.push({...base,id,to:fixTo,cat:"fixed"});
          else if(cat==="day")newDws.push({...base,id,day,cat:"day",slot:"",ess:true});
          else{
            const pri=isNew?newFlex.reduce((m,w)=>Math.max(m,w.priority||0),0)+1:parseInt(priV)||editWS.priority||999;
            newFlex.push({...base,id,cat:"flex",priority:pri});
            // If priority changed, reorder and renumber
            newFlex.sort((a,b)=>(a.priority||999)-(b.priority||999));
            newFlex=newFlex.map((w,i)=>({...w,priority:i+1}));
          }

          try{
            await Promise.all([
              apiSaveFx(newFx),apiSaveDay(newDws),apiSaveFlex(newFlex)
            ]);
            setFxW(newFx);setDws(newDws);setFlex(newFlex.sort((a,b)=>(a.priority||999)-(b.priority||999)));
            setEditWS(null);
          }catch(err){alert("Failed to save: "+err.message);}
          setIsSaving(false);
        };

        const del=async()=>{
          setIsSaving(true);
          let newFx=fxW.filter(x=>x.id!==origId),newDws=dws.filter(x=>x.id!==origId);
          let newFlex=flex.filter(x=>x.id!==origId);
          try{
            await Promise.all([apiSaveFx(newFx),apiSaveDay(newDws),apiSaveFlex(newFlex)]);
            setFxW(newFx);setDws(newDws);setFlex(newFlex);setEditWS(null);
          }catch(err){alert("Failed to delete: "+err.message);}
          setIsSaving(false);
        };

        const ipt={width:"100%",padding:8,border:"1px solid #d4d3cf",borderRadius:6,fontSize:13,boxSizing:"border-box",marginBottom:10};
        const lbl={fontSize:12,fontWeight:600,color:"#555",marginBottom:3,display:"block"};
        return(
          <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}}>
            <div style={{background:"#fff",borderRadius:12,padding:24,maxWidth:420,width:"90%",maxHeight:"85vh",overflow:"auto",boxShadow:"0 8px 30px rgba(0,0,0,0.15)"}}>
              <h3 style={{margin:"0 0 16px",fontSize:16,fontWeight:700,color:G.p}}>{isNew?"Add Workshift":"Edit Workshift"}</h3>
              <label style={lbl}>Workshift title</label><input value={nm} onChange={e=>setNm(e.target.value)} style={ipt}/>
              <label style={lbl}>Hours</label>
              <input type="number" step="0.5" min="0.5" max="4" value={h} onChange={e=>setH(Math.min(4,Math.max(0.5,parseFloat(e.target.value)||0.5)))} style={ipt}/>
              <label style={lbl}>Category</label>
              <div style={{marginBottom:12}}>
                {CATS.map(c=>(<label key={c.v} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer",marginBottom:4}}>
                  <input type="radio" name="wscat" checked={cat===c.v} onChange={()=>setCat(c.v)} style={{accentColor:G.p}}/>{c.l}
                </label>))}
              </div>
              {cat==="fixed"&&(<><label style={lbl}>Assigned to</label><select value={fixTo} onChange={e=>setFixTo(e.target.value)} style={ipt}><option value="">Select</option>{res.map(r=><option key={r.id} value={r.id}>{r.n}</option>)}</select></>)}
              {cat==="day"&&(<><label style={lbl}>Day</label><select value={day} onChange={e=>setDay(e.target.value)} style={ipt}>{DAYS.map(d=><option key={d} value={d}>{d}</option>)}</select></>)}
              {cat==="flex"&&!isNew&&(<><label style={lbl}>Priority (1 = highest)</label><input type="number" min="1" max={flex.length} value={priV} onChange={e=>setPriV(e.target.value)} style={ipt}/></>)}
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,marginBottom:16,cursor:"pointer"}}>
                <input type="checkbox" checked={impV} onChange={e=>setImpV(e.target.checked)} style={{accentColor:G.p}}/>Flag as important (ie bathroom)
              </label>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setEditWS(null)} style={{flex:1,padding:10,background:"#f5f5f0",border:"none",borderRadius:6,cursor:"pointer",fontSize:13,color:"#666"}}>Cancel</button>
                {!isNew&&<button onClick={del} disabled={isSaving} style={{padding:"10px 16px",background:"#fde8e8",border:"none",borderRadius:6,cursor:"pointer",fontSize:13,color:"#c0392b",fontWeight:600}}>Delete</button>}
                <button onClick={save} disabled={isSaving} style={{flex:1,padding:10,background:isSaving?"#999":G.p,border:"none",borderRadius:6,cursor:"pointer",fontSize:13,color:"#fff",fontWeight:600}}>{isSaving?"Saving...":"Save"}</button>
              </div>
            </div>
          </div>
        );
      };

      const ResModal=()=>{
        const[rmText,setRmText]=useState("");
        const[isSaving,setIsSaving]=useState(false);
        const rmRef=useRef(null);
        useEffect(()=>{if(editResId)setTimeout(()=>rmRef.current?.focus(),50);},[editResId]);
        if(!editResId)return null;
        const r=rById(editResId);
        const remove=async()=>{
          setIsSaving(true);
          const newRes=res.filter(x=>x.id!==editResId);
          const newFx=fxW.map(w=>w.to===editResId?{...w,to:""}:w);
          try{
            await apiSaveRes(newRes);
            await apiSaveFx(newFx);
            setRes(newRes);setFxW(newFx);
            const ns={...subs};delete ns[editResId];setSubs(ns);
            setEditResId(null);
          }catch(err){alert("Failed to remove: "+err.message);}
          setIsSaving(false);
        };
        return(
          <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}}>
            <div style={{background:"#fff",borderRadius:12,padding:24,maxWidth:380,width:"90%",boxShadow:"0 8px 30px rgba(0,0,0,0.15)"}}>
              <h3 style={{margin:"0 0 12px",fontSize:16,fontWeight:700,color:G.p}}>Remove {r?.n}?</h3>
              {fxW.filter(f=>f.to===editResId).length>0&&(
                <div style={{fontSize:12,color:"#c0392b",marginBottom:12}}>⚠ This resident has fixed workshifts. Please reassign them after removal.</div>
              )}
              <p style={{fontSize:13,color:"#666"}}>Type <strong>REMOVE</strong> to confirm:</p>
              <input ref={rmRef} value={rmText} onChange={e=>setRmText(e.target.value)} style={{width:"100%",padding:8,border:"1px solid #d4d3cf",borderRadius:6,fontSize:13,boxSizing:"border-box",marginBottom:12}}/>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setEditResId(null)} style={{flex:1,padding:10,background:"#f5f5f0",border:"none",borderRadius:6,cursor:"pointer",fontSize:13,color:"#666"}}>Cancel</button>
                <button disabled={rmText!=="REMOVE"||isSaving} onClick={remove} style={{
                  flex:1,padding:10,background:rmText==="REMOVE"?"#c0392b":"#e8e8e3",border:"none",borderRadius:6,
                  cursor:rmText==="REMOVE"?"pointer":"default",fontSize:13,color:rmText==="REMOVE"?"#fff":"#aaa",fontWeight:600
                }}>{isSaving?"Removing...":"Remove"}</button>
              </div>
            </div>
          </div>
        );
      };

      const addRes=async()=>{
        if(!newResName.trim())return;
        const newList=[...res,{id:`r-${Date.now()}`,n:newResName.trim()}].sort((a,b)=>a.n.localeCompare(b.n));
        try{
          await apiSaveRes(newList);
          setRes(newList);
          setNewResName("");setAddingRes(false);
        }catch(err){alert("Failed to add: "+err.message);}
      };

      const[pendingSave,setPendingSave]=useState(false);
      const saveOrder=async(updated)=>{
        setPendingSave(true);
        try{await apiSaveFlex(updated);}catch(err){alert("Failed to save order: "+err.message);}
        setPendingSave(false);
      };
      const moveUp=(idx)=>{
        if(idx<=0)return;
        const nf=[...flex];
        [nf[idx-1],nf[idx]]=[nf[idx],nf[idx-1]];
        const updated=nf.map((w,i)=>({...w,priority:i+1}));
        setFlex(updated);
        saveOrder(updated);
      };
      const moveDown=(idx)=>{
        if(idx>=flex.length-1)return;
        const nf=[...flex];
        [nf[idx],nf[idx+1]]=[nf[idx+1],nf[idx]];
        const updated=nf.map((w,i)=>({...w,priority:i+1}));
        setFlex(updated);
        saveOrder(updated);
      };
      const handleDragStart=(e,idx)=>{setDragIdx(idx);e.dataTransfer.effectAllowed="move";};
      const handleDragOver=(e,idx)=>{e.preventDefault();setOverIdx(idx);};
      const handleDrop=(e,dropIdx)=>{
        e.preventDefault();
        if(dragIdx===null||dragIdx===dropIdx){setDragIdx(null);setOverIdx(null);return;}
        const nf=[...flex];const[item]=nf.splice(dragIdx,1);nf.splice(dropIdx,0,item);
        const updated=nf.map((w,i)=>({...w,priority:i+1}));
        setFlex(updated);
        saveOrder(updated);
        setDragIdx(null);setOverIdx(null);
      };
      const handleDragEnd=()=>{setDragIdx(null);setOverIdx(null);};

      const WSRow=({w,label})=>(
        <div onClick={()=>stUnlock&&setEditWS({...w})} style={{
          background:w.imp?G.imp:G.card,borderRadius:6,padding:"8px 12px",marginBottom:4,fontSize:13,
          border:"1px solid #eeeee8",display:"flex",justifyContent:"space-between",alignItems:"center",
          cursor:stUnlock?"pointer":"default"
        }}>
          <span style={{display:"flex",alignItems:"center",gap:6}}>
            {stUnlock&&<span style={{color:G.mt,fontSize:13}}>✎</span>}
            {w.nm}<Hrs v={w.h}/>{w.imp&&<ImpBadge/>}{label&&<span style={{fontSize:10,color:G.mt}}>{label}</span>}
            {w.to&&<span style={{fontSize:11,color:G.pl}}>→ {rName(w.to)}</span>}
          </span>
        </div>
      );

      const FlexRow=({w,idx})=>(
        <div
          style={{
            background:w.imp?G.imp:G.card,borderRadius:6,padding:"8px 12px",marginBottom:4,fontSize:13,
            border:"1px solid #eeeee8",
            display:"flex",justifyContent:"space-between",alignItems:"center"
          }}>
          <span style={{display:"flex",alignItems:"center",gap:4}}>
            {stUnlock&&(
              <>
                <button onClick={e=>{e.stopPropagation();moveUp(idx);}} disabled={idx===0}
                  style={{background:"none",border:"none",cursor:idx===0?"default":"pointer",fontSize:12,color:idx===0?"#ddd":G.mt,padding:"1px 2px",lineHeight:1}}>▲</button>
                <button onClick={e=>{e.stopPropagation();moveDown(idx);}} disabled={idx===flex.length-1}
                  style={{background:"none",border:"none",cursor:idx===flex.length-1?"default":"pointer",fontSize:12,color:idx===flex.length-1?"#ddd":G.mt,padding:"1px 2px",lineHeight:1}}>▼</button>
                <span style={{width:6}}/>
              </>
            )}
            <span style={{color:G.p,fontSize:13,fontWeight:700,minWidth:24}}>{idx+1}.</span>
            {w.nm}<Hrs v={w.h}/>{w.imp&&<ImpBadge/>}
          </span>
          {stUnlock&&(
            <button onClick={e=>{e.stopPropagation();setEditWS({...w});}}
              style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:G.mt,padding:"2px 4px"}}>✎</button>
          )}
        </div>
      );

      return(
        <div>
          <WSEditModal/><ResModal/>
          {!stUnlock?(
            <div style={{textAlign:"center",padding:24}}>
              <button onClick={()=>setShowUnlockModal(true)} style={{padding:"10px 24px",background:"#fff",color:"#c0392b",border:"1px solid #c0392b",borderRadius:6,fontSize:13,cursor:"pointer",fontWeight:500}}>🔓 Unlock Editing</button>
              <div style={{fontSize:11,color:G.mt,marginTop:8}}>Editing is locked to prevent accidental changes</div>
            </div>
          ):(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,background:"#fff8e1",border:"1px solid #ffe082",borderRadius:8,padding:"8px 14px"}}>
                <span style={{fontSize:13,color:"#8d6e00",fontWeight:600}}>⚠ Editing unlocked — changes save to Google Sheets</span>
                <button onClick={()=>setStUnlock(false)} style={{padding:"6px 16px",background:G.p,color:"#fff",border:"none",borderRadius:6,fontSize:12,cursor:"pointer",fontWeight:600}}>Lock 🔒</button>
              </div>
              <h2 style={{color:G.p,fontSize:20,fontWeight:800,margin:"0 0 12px",borderBottom:`2px solid ${G.dayBdr}`,paddingBottom:8}}>Workshifts</h2>
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
                <button onClick={()=>setEditWS({isNew:true,cat:"flex",h:0.5,imp:false})} style={{padding:"5px 14px",background:G.p,color:"#fff",border:"none",borderRadius:6,fontSize:12,cursor:"pointer",fontWeight:600}}>+ Add Workshift</button>
              </div>
              <h3 style={{color:G.p,fontSize:16,fontWeight:700,margin:"0 0 8px"}}>Day-specific workshifts</h3>
              {DAYS.map(d=>{
                const list=dws.filter(w=>w.day===d);if(!list.length)return null;
                return(<div key={d}><div style={{fontWeight:600,fontSize:13,color:G.p,marginTop:10,marginBottom:4}}>{d}</div>{list.map(w=><WSRow key={w.id} w={w}/>)}</div>);
              })}
              <h3 style={{color:G.p,fontSize:16,fontWeight:700,margin:"20px 0 8px"}}>
                Flexible workshifts <span style={{fontSize:11,color:G.mt,fontWeight:400,fontStyle:"italic"}}>(use arrows to reorder priority)</span>
              </h3>
              {flex.map((w,i)=><FlexRow key={w.id} w={w} idx={i}/>)}
              <h3 style={{color:G.p,fontSize:16,fontWeight:700,margin:"20px 0 8px"}}>
                Fixed workshifts <span style={{fontSize:11,color:G.mt,fontWeight:400,fontStyle:"italic"}}>(always assigned to a specific resident)</span>
              </h3>
              {fxW.map(w=><WSRow key={w.id} w={w}/>)}
              <h2 style={{color:G.p,fontSize:20,fontWeight:800,margin:"28px 0 12px",borderBottom:`2px solid ${G.dayBdr}`,paddingBottom:8}}>Residents</h2>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:6}}>
                {res.map(r=>(
                  <div key={r.id} onClick={()=>setEditResId(r.id)} style={{
                    background:G.card,borderRadius:6,padding:10,textAlign:"center",border:"1px solid #eeeee8",cursor:"pointer"
                  }}>
                    <div style={{fontWeight:600,fontSize:13,color:G.p}}>{r.n}</div>
                    {fxW.filter(f=>f.to===r.id).map(f=><div key={f.id} style={{fontSize:10,color:G.pl}}>📌 {f.nm}</div>)}
                    <div style={{fontSize:10,color:"#c0392b",marginTop:3}}>Remove resident</div>
                  </div>
                ))}
                {addingRes?(
                  <div style={{background:"#f5f5f0",borderRadius:6,padding:10,textAlign:"center",border:"2px dashed #d4d3cf"}}>
                    <input value={newResName} onChange={e=>setNewResName(e.target.value)} placeholder="Name"
                      style={{width:"100%",padding:6,border:"1px solid #d4d3cf",borderRadius:4,fontSize:13,boxSizing:"border-box",textAlign:"center",marginBottom:6}}
                      autoFocus onKeyDown={e=>{if(e.key==="Enter")addRes();}}/>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={()=>{setAddingRes(false);setNewResName("");}} style={{flex:1,padding:4,background:"#eee",border:"none",borderRadius:4,fontSize:11,cursor:"pointer",color:"#666"}}>Cancel</button>
                      <button onClick={addRes} style={{flex:1,padding:4,background:G.p,color:"#fff",border:"none",borderRadius:4,fontSize:11,cursor:"pointer",fontWeight:600}}>Add</button>
                    </div>
                  </div>
                ):(
                  <div onClick={()=>setAddingRes(true)} style={{
                    background:"#f5f5f0",borderRadius:6,padding:10,textAlign:"center",border:"2px dashed #d4d3cf",cursor:"pointer",
                    display:"flex",alignItems:"center",justifyContent:"center",minHeight:60
                  }}><span style={{fontSize:24,color:G.mt}}>+</span></div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    };

    return(
      <div>
        <div style={{display:"flex",gap:6,marginBottom:20,borderBottom:"1px solid #eeeee8",paddingBottom:10}}>
          {atabs.map((t,i)=>(
            <button key={t} onClick={()=>navTo(2,i)} style={{
              padding:"6px 14px",border:"none",borderRadius:6,cursor:"pointer",
              background:aTab===i?"#eeeee8":"transparent",color:aTab===i?G.p:"#999",
              fontWeight:aTab===i?600:400,fontSize:13,opacity:i===2&&aTab!==2?0.55:1
            }}>{t}</button>
          ))}
        </div>
        {aTab===0&&<GenPanel/>}
        {aTab===1&&<FormResults/>}
        {aTab===2&&<SettingsPanel/>}
      </div>
    );
  };

  const HistModalComp=()=>{
    if(!histModal)return null;
    return(
      <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}}>
        <div style={{background:G.bg,borderRadius:12,padding:20,maxWidth:880,width:"95%",maxHeight:"85vh",overflow:"auto",boxShadow:"0 8px 30px rgba(0,0,0,0.15)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <h3 style={{margin:0,color:G.p,fontSize:18,fontWeight:700}}>Week of {fmtR(histModal.weekStart)}</h3>
            <button onClick={()=>setHistModal(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:G.mt}}>✕</button>
          </div>
          <DayChart asgn={histModal.assignments} wsd={histModal.weekStart} edit={false} showLC={false} showStats={false}/>
        </div>
      </div>
    );
  };

  const NavPromptModal=()=>{
    if(!navPrompt)return null;
    return(
      <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}}>
        <div style={{background:"#fff",borderRadius:12,padding:28,maxWidth:380,width:"90%",boxShadow:"0 8px 30px rgba(0,0,0,0.15)"}}>
          <h3 style={{margin:"0 0 10px",color:"#333",fontSize:16,fontWeight:700}}>Settings are unlocked</h3>
          <p style={{fontSize:13,color:"#666",lineHeight:1.5}}>Would you like to lock settings before leaving?</p>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setNavPrompt(null)} style={{flex:1,padding:10,background:"#f5f5f0",border:"none",borderRadius:6,cursor:"pointer",fontSize:13,color:"#666"}}>Stay</button>
            <button onClick={()=>confirmNav()} style={{flex:1,padding:10,background:G.p,border:"none",borderRadius:6,cursor:"pointer",fontSize:13,color:"#fff",fontWeight:600}}>Lock & Leave</button>
          </div>
        </div>
      </div>
    );
  };

  if(loading)return <LoadingScreen msg="Loading from Google Sheets..."/>;
  if(loadError)return <ErrorScreen error={loadError} onRetry={doLoad} onInit={doInit}/>;

  return(
    <div style={{fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif",background:G.bg,minHeight:"100vh",color:"#333"}}>
      <SaveIndicator/>
      <ConfirmUnlockModal open={showUnlockModal} onClose={()=>setShowUnlockModal(false)} onConfirm={()=>{setStUnlock(true);setShowUnlockModal(false);}}/>
      <HistModalComp/><NavPromptModal/>
      <div style={{background:G.p,color:"#fff",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div onClick={()=>navTo(0)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
          <span style={{fontSize:20}}>🏠</span>
          <h1 style={{margin:0,fontSize:17,fontWeight:700,letterSpacing:-0.3}}>Fort Awesome Workshifts</h1>
        </div>
        {pastCharts.length>0&&(
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowHDrop(!showHDrop)} style={{
              background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:6,
              padding:"4px 12px",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:500
            }}>Previous Charts {showHDrop?"▿":"▹"}</button>
            {showHDrop&&(
              <div style={{position:"absolute",right:0,top:"100%",marginTop:4,background:"#fff",borderRadius:8,
                boxShadow:"0 4px 20px rgba(0,0,0,0.15)",minWidth:260,zIndex:100,overflow:"hidden"}}>
                {[...pastCharts].reverse().map((h,i)=>{
                  const dn=["Sunday","Monday","Tuesday","Wednesday","Thursday"].filter(d=>h.assignments[`ck-${d}`]).length;
                  return(
                    <div key={i} onClick={()=>{setHistModal(h);setShowHDrop(false);}} style={{
                      padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #f0efeb",fontSize:12,color:"#333"
                    }}>
                      <div style={{fontWeight:600,color:G.p}}>Week of {fmtR(h.weekStart)}</div>
                      <div style={{color:G.mt,marginTop:2}}>🍳 {dn} dinners</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{display:"flex",borderBottom:"1px solid #eeeee8",background:"#fff"}}>
        {TABS.map((t,i)=>(
          <button key={t} onClick={()=>navTo(i)} style={{
            flex:1,padding:"11px 6px",border:"none",background:tab===i?"#fff":"#fafaf7",
            borderBottom:tab===i?`2px solid ${G.p}`:"2px solid transparent",
            color:tab===i?G.p:G.mt,fontWeight:tab===i?600:400,fontSize:12,cursor:"pointer"
          }}>{t}</button>
        ))}
      </div>
      <div style={{maxWidth:880,margin:"0 auto",padding:"20px 16px"}}>
        {tab===0&&<Tab0/>}
        {tab===1&&<Tab1/>}
        {tab===2&&<Tab2/>}
      </div>
    </div>
  );
}