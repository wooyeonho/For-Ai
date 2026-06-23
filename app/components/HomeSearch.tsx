"use client";
import Link from "next/link";
import { useState } from "react";
interface DocItem { slug:string;title:string;category?:string;source:"static"|"supabase";lang?:string; }
export default function HomeSearch({docs,locale="ko"}:{docs:DocItem[];locale?:string}){
  const [query,setQuery]=useState("");
  const filtered=query.trim()?docs.filter(d=>d.title.toLowerCase().includes(query.toLowerCase())||(d.category??"").toLowerCase().includes(query.toLowerCase())):docs;
  return(
    <>
      <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
        placeholder="Search by title or category..."
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
          <h2>Registered documents ({filtered.length}{query?` / ${docs.length}`:""})</h2>
          <ul className="document-list">
            {filtered.map(d=>(
              <li key={d.slug}>
                <Link href={`/${locale}/wiki/${d.slug}`}>{d.title}</Link>
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
