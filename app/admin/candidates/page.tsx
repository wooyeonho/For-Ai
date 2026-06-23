"use client";
import { useState, useEffect, useCallback } from "react";
interface Candidate {
  id:string;title:string;slug:string;category:string;subcategory?:string;
  risk_tier:string;why_people_ask_ai?:string;why_ai_gets_wrong?:string;
  claims:{question:string;placeholder_value:string}[];
  source_hints:{url:string;title:string}[];
  status:string;source:string;generation_model?:string;created_at:string;
}
const SB_URL=process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
async function sbFetch(path:string,opts?:RequestInit){
  return fetch(`${SB_URL}/rest/v1/${path}`,{...opts,headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,"Content-Type":"application/json",Prefer:"return=representation",...(opts?.headers??{})}});
}
const SC:Record<string,string>={new:"background:#dbeafe;color:#1d4ed8",reviewing:"background:#fef9c3;color:#a16207",approved:"background:#dcfce7;color:#15803d",rejected:"background:#fee2e2;color:#b91c1c",promoted:"background:#f3e8ff;color:#7e22ce"};
export default function CandidatesPage(){
  const [items,setItems]=useState<Candidate[]>([]);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState("new");
  const [selected,setSelected]=useState<string|null>(null);
  const [secret,setSecret]=useState("");
  const [msg,setMsg]=useState<{text:string;ok:boolean}|null>(null);
  const [promoting,setPromoting]=useState<string|null>(null);
  const load=useCallback(async()=>{
    setLoading(true);
    const q=filter==="all"?"":`&status=eq.${filter}`;
    const r=await sbFetch(`topic_candidates?select=*&order=created_at.desc&limit=100${q}`);
    const d=await r.json();setItems(Array.isArray(d)?d:[]);setLoading(false);
  },[filter]);
  useEffect(()=>{load();},[load]);
  function flash(text:string,ok=true){setMsg({text,ok});setTimeout(()=>setMsg(null),4000);}
  async function act(id:string,st:string){
    const r=await sbFetch(`topic_candidates?id=eq.${id}`,{method:"PATCH",headers:{"x-admin-secret":secret},body:JSON.stringify({status:st,reviewed_at:new Date().toISOString()})});
    if(r.ok||r.status===200||r.status===204){flash(`✅ ${st}`);setSelected(null);load();}
    else flash("❌ 권한 오류 — admin secret 확인",false);
  }
  async function promote(id:string,slug:string){
    if(!secret){flash("❌ admin secret을 입력하세요",false);return;}
    setPromoting(id);
    try{
      const r=await fetch("/api/admin/promote-candidate",{method:"POST",headers:{"Content-Type":"application/json","x-admin-secret":secret},body:JSON.stringify({candidateId:id})});
      const d=await r.json();
      if(r.ok&&d.success){flash(`🚀 공개 등록 완료 → /ko/wiki/${slug}`);setSelected(null);load();}
      else flash(`❌ ${d.error??"등록 실패"}`,false);
    }catch{flash("❌ 네트워크 오류",false);}finally{setPromoting(null);}
  }
  return(
    <div style={{minHeight:"100vh",background:"#f9fafb",padding:"24px",fontFamily:"sans-serif"}}>
      <div style={{maxWidth:860,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div><h1 style={{fontSize:22,fontWeight:700,margin:0}}>📋 후보 검토 큐</h1>
            <p style={{color:"#6b7280",fontSize:13,margin:"4px 0 0"}}>AI 생성 후보 → 검토 → 승인 → 🚀 공개 등록</p></div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input type="password" placeholder="admin secret" value={secret} onChange={e=>setSecret(e.target.value)}
              style={{border:"1px solid #d1d5db",borderRadius:6,padding:"6px 10px",fontSize:13,width:160}}/>
            <a href="/admin/generate" style={{fontSize:13,color:"#2563eb"}}>→ 생성</a>
          </div>
        </div>
        {msg&&<div style={{marginBottom:12,padding:"10px 14px",background:msg.ok?"#f0fdf4":"#fef2f2",border:`1px solid ${msg.ok?"#bbf7d0":"#fecaca"}`,borderRadius:8,fontSize:13}}>{msg.text}</div>}
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          {["new","reviewing","approved","promoted","rejected","all"].map(s=>(
            <button key={s} onClick={()=>setFilter(s)} style={{padding:"6px 16px",borderRadius:20,fontSize:13,fontWeight:500,cursor:"pointer",border:filter===s?"none":"1px solid #d1d5db",background:filter===s?"#111827":"#fff",color:filter===s?"#fff":"#374151"}}>{s==="all"?"전체":s}</button>
          ))}
          <button onClick={load} style={{marginLeft:"auto",fontSize:12,color:"#9ca3af",background:"none",border:"none",cursor:"pointer"}}>↻</button>
        </div>
        {loading?<div style={{textAlign:"center",padding:"60px 0",color:"#9ca3af"}}>로딩 중...</div>
        :items.length===0?<div style={{textAlign:"center",padding:"60px 0",color:"#9ca3af"}}>후보 없음</div>
        :items.map(c=>(
          <div key={c.id} onClick={()=>setSelected(selected===c.id?null:c.id)} style={{background:"#fff",border:`1px solid ${selected===c.id?"#3b82f6":"#e5e7eb"}`,borderRadius:10,padding:16,marginBottom:10,cursor:"pointer"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:600,...Object.fromEntries((SC[c.status]||"").split(";").filter(Boolean).map(s=>s.trim().split(":").map(x=>x.trim())).filter(a=>a.length===2))}}>{c.status}</span>
                  <span style={{fontSize:11,color:"#9ca3af"}}>{c.category}{c.subcategory?` / ${c.subcategory}`:""}</span>
                </div>
                <div style={{fontWeight:600,fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.title}</div>
                {c.why_people_ask_ai&&<div style={{fontSize:12,color:"#6b7280",marginTop:3}}>{c.why_people_ask_ai}</div>}
              </div>
              <div style={{fontSize:11,color:"#9ca3af",whiteSpace:"nowrap"}}>{new Date(c.created_at).toLocaleDateString("ko-KR")}</div>
            </div>
            {selected===c.id&&(
              <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid #f3f4f6"}} onClick={e=>e.stopPropagation()}>
                {c.claims?.length>0&&<div style={{marginBottom:12}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#6b7280",marginBottom:6}}>확인 필요 ({c.claims.length}개)</div>
                  {c.claims.map((cl,i)=><div key={i} style={{fontSize:13,display:"flex",gap:8,marginBottom:4}}><span style={{color:"#9ca3af"}}>Q.</span><span>{cl.question}</span><span style={{marginLeft:"auto",color:"#f97316",fontWeight:600}}>확인 필요</span></div>)}</div>}
                {c.source_hints?.length>0&&<div style={{marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#6b7280",marginBottom:4}}>출처 힌트</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{c.source_hints.map((h,i)=><a key={i} href={h.url} target="_blank" rel="noopener" style={{fontSize:12,color:"#2563eb"}} onClick={e=>e.stopPropagation()}>{h.title||h.url}</a>)}</div></div>}
                <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                  {c.status==="new"&&<button onClick={()=>act(c.id,"reviewing")} style={{padding:"8px 16px",background:"#f59e0b",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>검토중</button>}
                  {(c.status==="new"||c.status==="reviewing")&&<button onClick={()=>act(c.id,"approved")} style={{padding:"8px 16px",background:"#16a34a",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>✅ 승인</button>}
                  {c.status==="approved"&&<button onClick={()=>promote(c.id,c.slug)} disabled={promoting===c.id} style={{padding:"8px 20px",background:promoting===c.id?"#a855f7":"#7c3aed",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:promoting===c.id?"not-allowed":"pointer"}}>{promoting===c.id?"등록 중...":"🚀 공개 등록"}</button>}
                  {c.status==="promoted"&&<a href={`/ko/wiki/${c.slug}`} target="_blank" rel="noopener" style={{padding:"8px 16px",background:"#f3f4f6",color:"#7e22ce",border:"1px solid #e9d5ff",borderRadius:8,fontSize:13,fontWeight:600,textDecoration:"none"}}>🔗 공개 페이지 보기</a>}
                  {c.status!=="rejected"&&c.status!=="promoted"&&<button onClick={()=>act(c.id,"rejected")} style={{padding:"8px 16px",background:"#dc2626",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>❌ 거절</button>}
                  <span style={{fontSize:11,color:"#9ca3af",marginLeft:"auto"}}>{c.generation_model} · {c.slug}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
