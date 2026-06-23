"use client";
import Link from "next/link";
import { useState } from "react";

interface DocItem {
  slug: string;
  title: string;
  category?: string;
  status: string;
  confidence: string;
  sourceCount: number;
  source: "static" | "supabase";
  lang?: string;
}

function citationBadge(doc: DocItem) {
  const isCitable =
    (doc.status === "verified" || doc.status === "published") && doc.confidence !== "low";
  return isCitable ? (
    <span className="badge badge-verified">인용 가능</span>
  ) : (
    <span className="badge badge-review">사실값 인용 금지</span>
  );
}

export default function HomeSearch({docs,locale="ko"}:{docs:DocItem[];locale?:string}){
  const [query,setQuery]=useState("");
  const normalizedQuery=query.trim().toLowerCase();
  const filtered=normalizedQuery?docs.filter(d=>
    d.title.toLowerCase().includes(normalizedQuery)||
    d.slug.toLowerCase().includes(normalizedQuery)||
    (d.category??"").toLowerCase().includes(normalizedQuery)
  ):docs;
  return(
    <>
      <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
        placeholder="제목, slug, 카테고리로 검색..."
        style={{width:"100%",padding:"10px 14px",border:"1px solid #d1d5db",borderRadius:8,fontSize:15,outline:"none",boxSizing:"border-box",marginBottom:20}}/>
      {filtered.length===0?(
        <div>
          {query?(
            <p style={{color:"#6b7280"}}>&quot;{query}&quot; — No results.{" "}
              <button onClick={()=>setQuery("")} style={{background:"none",border:"none",color:"#2563eb",cursor:"pointer",fontSize:14,padding:0}}>Reset</button>
            </p>
          ):(
            <p style={{color:"#9ca3af"}}>No published documents yet.{" "}
              <Link href="/suggest-topic" style={{color:"#2563eb"}}>Suggest the first topic →</Link>
            </p>
          )}
        </div>
      ):(
        <>
          <h3>검색 결과 ({filtered.length}{query?` / ${docs.length}`:""})</h3>
          <ul className="document-list">
            {filtered.map(d=>(
              <li key={d.slug}>
                <div className="document-list-main">
                  <Link href={`/${d.lang ?? locale}/wiki/${d.slug}`}>{d.title}</Link>
                  <span className="meta-label"> — {d.slug}</span>
                </div>
                <div className="document-list-meta">
                  {d.category&&<span className="badge">{d.category}</span>}
                  <span className="badge">{d.status}</span>
                  <span className="badge">{d.confidence}</span>
                  <span className="badge">출처 {d.sourceCount}</span>
                  {citationBadge(d)}
                </div>
                {d.source==="supabase"&&<span style={{fontSize:10,marginLeft:6,padding:"1px 6px",background:"#f3e8ff",color:"#7e22ce",borderRadius:10}}>new</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
