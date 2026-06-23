"use client";
import Link from "next/link";
import { useState } from "react";
interface DocItem { slug:string;title:string;category?:string;source:"static"|"supabase"; }
export default function HomeSearch({docs}:{docs:DocItem[]}){
  const [query,setQuery]=useState("");
  const filtered=query.trim()?docs.filter(d=>d.title.toLowerCase().includes(query.toLowerCase())||(d.category??"").toLowerCase().includes(query.toLowerCase())):docs;
  return(
    <>
      <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
        placeholder="제목 또는 카테고리 검색..."
        style={{width:"100%",padding:"10px 14px",border:"1px solid #d1d5db",borderRadius:8,fontSize:15,outline:"none",boxSizing:"border-box",marginBottom:20}}/>
      {filtered.length===0?(
        <div>
          {query?(
            <p style={{color:"#6b7280"}}>&quot;{query}&quot; 결과 없음.{" "}
              <button onClick={()=>setQuery("")} style={{background:"none",border:"none",color:"#2563eb",cursor:"pointer",fontSize:14,padding:0}}>검색 초기화</button>
            </p>
          ):(
            <p style={{color:"#9ca3af"}}>아직 공개된 문서가 없습니다.{" "}
              <Link href="/suggest-topic" style={{color:"#2563eb"}}>첫 번째 토픽을 제안해보세요 →</Link>
            </p>
          )}
        </div>
      ):(
        <>
          <h2>등록된 문서 ({filtered.length}{query?` / ${docs.length}`:""})</h2>
          <ul className="document-list">
            {filtered.map(d=>(
              <li key={d.slug}>
                <Link href={`/ko/wiki/${d.slug}`}>{d.title}</Link>
                {d.category&&<span className="meta-label"> — {d.category}</span>}
                {d.source==="supabase"&&<span style={{fontSize:10,marginLeft:6,padding:"1px 6px",background:"#f3e8ff",color:"#7e22ce",borderRadius:10}}>new</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
