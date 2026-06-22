import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { getAllRegistryBundles } from "../lib/data";
import HomeSearch from "./components/HomeSearch";
interface DocItem{slug:string;title:string;category?:string;source:"static"|"supabase";}
async function getAllDocs():Promise<DocItem[]>{
  const staticDocs:DocItem[]=getAllRegistryBundles().map(b=>({slug:b.document.slug,title:b.document.title,category:undefined,source:"static" as const}));
  const staticSlugs=new Set(staticDocs.map(d=>d.slug));
  let sbDocs:DocItem[]=[];
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(url&&key){
    try{
      const sb=createClient(url,key);
      const {data}=await sb.from("registry_documents").select("slug,title,category").eq("status","published").order("created_at",{ascending:false}).limit(500);
      sbDocs=(data??[]).filter((d:{slug:string})=>!staticSlugs.has(d.slug)).map((d:{slug:string;title:string;category?:string})=>({slug:d.slug,title:d.title,category:d.category??"",source:"supabase" as const}));
    }catch{}
  }
  return [...sbDocs,...staticDocs];
}
export const revalidate=60;
export default async function HomePage(){
  const docs=await getAllDocs();
  return(
    <section className="registry-panel">
      <p className="eyebrow">GYEOL</p>
      <h1>로컬 팩트 레지스트리</h1>
      <p>인간과 AI가 함께 쌓는 팩트 레지스트리. claim 단위로 신뢰도·출처·검증일을 관리합니다. 스포츠, 연예, 경제, 법률, 건강 — 모든 분야를 다룹니다.</p>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"20px 0"}}>
        <Link href="/suggest-topic" style={{padding:"8px 16px",background:"#2563eb",color:"#fff",borderRadius:8,fontSize:13,fontWeight:600,textDecoration:"none"}}>+ 토픽 제안하기</Link>
        <Link href="/admin/candidates" style={{padding:"8px 16px",background:"#f3f4f6",color:"#374151",borderRadius:8,fontSize:13,fontWeight:600,textDecoration:"none"}}>관리자 검토 큐</Link>
        <Link href="/admin/generate" style={{padding:"8px 16px",background:"#f3f4f6",color:"#374151",borderRadius:8,fontSize:13,fontWeight:600,textDecoration:"none"}}>AI 생성</Link>
      </div>
      <HomeSearch docs={docs}/>
    </section>
  );
}
