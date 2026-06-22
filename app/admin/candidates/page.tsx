"use client";
import { useState, useEffect, useCallback } from "react";

interface Candidate {
  id: string; title: string; slug: string; category: string; subcategory?: string;
  risk_tier: string; why_people_ask_ai?: string; why_ai_gets_wrong?: string;
  claims: { question: string; placeholder_value: string }[];
  source_hints: { url: string; title: string }[];
  status: string; source: string; generation_model?: string; created_at: string;
}

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function sbFetch(path: string, opts?: RequestInit) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation",
      ...(opts?.headers ?? {}) },
  });
}

const statusColor = (s: string) => ({ new:"bg-blue-100 text-blue-700",
  reviewing:"bg-yellow-100 text-yellow-700", approved:"bg-green-100 text-green-700",
  rejected:"bg-red-100 text-red-700", promoted:"bg-purple-100 text-purple-700" }[s] ?? "bg-gray-100 text-gray-700");
const riskColor = (r: string) => ({ low:"text-green-600", medium:"text-yellow-600", high:"text-red-600" }[r] ?? "");

export default function CandidatesPage() {
  const [items, setItems] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("new");
  const [selected, setSelected] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const q = filter === "all" ? "" : `&status=eq.${filter}`;
    const res = await sbFetch(`topic_candidates?select=*&order=created_at.desc&limit=100${q}`);
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, newStatus: string) {
    const res = await sbFetch(`topic_candidates?id=eq.${id}`, {
      method: "PATCH",
      headers: { "x-admin-secret": secret },
      body: JSON.stringify({ status: newStatus, reviewed_at: new Date().toISOString() }),
    });
    if (res.ok || res.status === 200 || res.status === 204) {
      setMsg(`✅ ${newStatus}`); setSelected(null); load();
    } else { setMsg("❌ 권한 오류 — admin secret 확인"); }
    setTimeout(() => setMsg(""), 3000);
  }

  return (
    <div style={{minHeight:"100vh",background:"#f9fafb",padding:"24px",fontFamily:"sans-serif"}}>
      <div style={{maxWidth:800,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div>
            <h1 style={{fontSize:22,fontWeight:700,margin:0}}>📋 후보 검토 큐</h1>
            <p style={{color:"#6b7280",fontSize:13,margin:"4px 0 0"}}>
              생성된 후보 → 검토 → 승인 → verified 페이지
            </p>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input type="password" placeholder="admin secret" value={secret}
              onChange={e => setSecret(e.target.value)}
              style={{border:"1px solid #d1d5db",borderRadius:6,padding:"6px 10px",fontSize:13,width:160}} />
            <a href="/admin/generate" style={{fontSize:13,color:"#2563eb"}}>→ 생성</a>
          </div>
        </div>

        {msg && <div style={{marginBottom:12,padding:"10px 14px",background:"#f0fdf4",
          border:"1px solid #bbf7d0",borderRadius:8,fontSize:13}}>{msg}</div>}

        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          {["new","reviewing","approved","rejected","all"].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              style={{padding:"6px 16px",borderRadius:20,fontSize:13,fontWeight:500,cursor:"pointer",
                border: filter===s ? "none" : "1px solid #d1d5db",
                background: filter===s ? "#111827" : "#fff",
                color: filter===s ? "#fff" : "#374151"}}>
              {s === "all" ? "전체" : s}
            </button>
          ))}
          <button onClick={load} style={{marginLeft:"auto",fontSize:12,color:"#9ca3af",
            background:"none",border:"none",cursor:"pointer"}}>↻ 새로고침</button>
        </div>

        {loading ? <div style={{textAlign:"center",padding:"60px 0",color:"#9ca3af"}}>로딩 중...</div>
        : items.length === 0 ? <div style={{textAlign:"center",padding:"60px 0",color:"#9ca3af"}}>후보 없음</div>
        : items.map(c => (
          <div key={c.id} onClick={() => setSelected(selected===c.id ? null : c.id)}
            style={{background:"#fff",border:`1px solid ${selected===c.id?"#3b82f6":"#e5e7eb"}`,
              borderRadius:10,padding:16,marginBottom:10,cursor:"pointer",
              transition:"border-color .15s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:600}}
                    className={statusColor(c.status)}>{c.status}</span>
                  <span style={{fontSize:11,color:"#9ca3af"}}>{c.category}{c.subcategory ? ` / ${c.subcategory}` : ""}</span>
                  <span style={{fontSize:11,fontWeight:600}} className={riskColor(c.risk_tier)}>{c.risk_tier}</span>
                </div>
                <div style={{fontWeight:600,fontSize:15,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.title}</div>
                {c.why_people_ask_ai && <div style={{fontSize:12,color:"#6b7280",marginTop:3}}>{c.why_people_ask_ai}</div>}
              </div>
              <div style={{fontSize:11,color:"#9ca3af",whiteSpace:"nowrap"}}>
                {new Date(c.created_at).toLocaleDateString("ko-KR")}
              </div>
            </div>

            {selected === c.id && (
              <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid #f3f4f6"}}
                onClick={e => e.stopPropagation()}>
                {c.why_ai_gets_wrong && (
                  <div style={{marginBottom:12,padding:"10px 12px",background:"#fef2f2",borderRadius:8,fontSize:13}}>
                    <strong style={{color:"#b91c1c"}}>AI 오류 원인:</strong>{" "}
                    <span style={{color:"#dc2626"}}>{c.why_ai_gets_wrong}</span>
                  </div>
                )}
                {c.claims?.length > 0 && (
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#6b7280",marginBottom:6}}>
                      확인 필요 항목 ({c.claims.length}개)
                    </div>
                    {c.claims.map((cl, i) => (
                      <div key={i} style={{fontSize:13,display:"flex",gap:8,marginBottom:4}}>
                        <span style={{color:"#9ca3af"}}>Q.</span>
                        <span>{cl.question}</span>
                        <span style={{marginLeft:"auto",color:"#f97316",fontWeight:600,whiteSpace:"nowrap"}}>확인 필요</span>
                      </div>
                    ))}
                  </div>
                )}
                {c.source_hints?.length > 0 && (
                  <div style={{marginBottom:16}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#6b7280",marginBottom:4}}>출처 힌트</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                      {c.source_hints.map((h, i) => (
                        <a key={i} href={h.url} target="_blank" rel="noopener"
                          style={{fontSize:12,color:"#2563eb"}} onClick={e=>e.stopPropagation()}>
                          {h.title || h.url}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                  {c.status==="new" && (
                    <button onClick={()=>act(c.id,"reviewing")}
                      style={{padding:"8px 16px",background:"#f59e0b",color:"#fff",border:"none",
                        borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>검토중</button>
                  )}
                  {(c.status==="new"||c.status==="reviewing") && (
                    <button onClick={()=>act(c.id,"approved")}
                      style={{padding:"8px 16px",background:"#16a34a",color:"#fff",border:"none",
                        borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>✅ 승인</button>
                  )}
                  {c.status!=="rejected" && (
                    <button onClick={()=>act(c.id,"rejected")}
                      style={{padding:"8px 16px",background:"#dc2626",color:"#fff",border:"none",
                        borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>❌ 거절</button>
                  )}
                  <span style={{fontSize:11,color:"#9ca3af",marginLeft:"auto"}}>
                    {c.generation_model} · {c.slug}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
