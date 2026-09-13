"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, ErrorBanner, PageTitle, Spinner, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Freshie, GmStationAssignment, Group, Profile, Station, UserGroupAssignment, UserRole } from "@/lib/types";

type StatusFilter = "all" | "assigned" | "unassigned";
type Editor = { kind:"faci"; user:Profile } | { kind:"gm"; user:Profile } | null;

export default function AdminAccountsPage(){
 const supabase=useMemo(()=>supabaseBrowser(),[]);
 const [profiles,setProfiles]=useState<Profile[]>([]),[freshies,setFreshies]=useState<Freshie[]>([]);
 const [groups,setGroups]=useState<Group[]>([]),[stations,setStations]=useState<Station[]>([]);
 const [groupAssignments,setGroupAssignments]=useState<UserGroupAssignment[]>([]),[gmAssignments,setGmAssignments]=useState<GmStationAssignment[]>([]);
 const [role,setRole]=useState<"all"|UserRole>("all"),[status,setStatus]=useState<StatusFilter>("all"),[search,setSearch]=useState("");
 const [editor,setEditor]=useState<Editor>(null),[groupId,setGroupId]=useState(""),[day1,setDay1]=useState(""),[day2,setDay2]=useState("");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
 const load=useCallback(async()=>{ setLoading(true); const [p,f,g,s,uga,gma]=await Promise.all([
  supabase.from("profiles").select("*").in("role",["faci","gm","admin"]).order("full_name"),
  supabase.from("freshies").select("*").order("full_name"),supabase.from("groups").select("*").eq("is_active",true).order("group_number"),
  supabase.from("stations").select("*").eq("is_active",true).order("station_number"),supabase.from("user_group_assignments").select("user_id,group_id,version"),
  supabase.from("gm_station_assignments").select("user_id,day,station_id,version")]);
 const failure=[p,f,g,s,uga,gma].find(x=>x.error)?.error; if(failure)setError(failure.message);
 setProfiles((p.data as Profile[])??[]);setFreshies((f.data as Freshie[])??[]);setGroups((g.data as Group[])??[]);setStations((s.data as Station[])??[]);
 setGroupAssignments((uga.data as UserGroupAssignment[])??[]);setGmAssignments((gma.data as GmStationAssignment[])??[]);setLoading(false);},[supabase]);
 useEffect(()=>{void load()},[load]);
 const assignment=(id:string)=>groupAssignments.find(a=>a.user_id===id);
 const gm=(id:string,d:1|2)=>gmAssignments.find(a=>a.user_id===id&&a.day===d);
 const open=(u:Profile)=>{setEditor(u.role==="faci"?{kind:"faci",user:u}:{kind:"gm",user:u});setGroupId(String(assignment(u.id)?.group_id??""));setDay1(String(gm(u.id,1)?.station_id??""));setDay2(String(gm(u.id,2)?.station_id??""));};
 const rows=[...profiles.map(u=>({id:u.id,name:u.full_name||u.email||"Unnamed account",role:u.role,assigned:u.role==="faci"?!!assignment(u.id):u.role==="gm"?(!!gm(u.id,1)&&!!gm(u.id,2)):true,user:u})),
  ...freshies.map(f=>({id:`freshie-${f.id}`,name:f.full_name,role:"freshie" as UserRole,assigned:f.group_id!=null,freshie:f}))]
  .filter(r=>(role==="all"||r.role===role)&&(status==="all"||(status==="assigned")===r.assigned)&&(!search||`${r.name} ${r.id}`.toLowerCase().includes(search.toLowerCase())));
 async function save(){if(!editor)return;setBusy(true);setError(null);let result;
  if(editor.kind==="faci"){const a=assignment(editor.user.id);result=await supabase.rpc("fn_admin_assign_faci",{p_user_id:editor.user.id,p_group_id:groupId?Number(groupId):null,p_expected_version:a?.version??0,p_reason:"Admin account registry"});}
  else {result=await supabase.rpc("fn_admin_assign_gm_stations",{p_user_id:editor.user.id,p_day1_station_id:day1?Number(day1):null,p_day2_station_id:day2?Number(day2):null,p_day1_expected_version:gm(editor.user.id,1)?.version??0,p_day2_expected_version:gm(editor.user.id,2)?.version??0,p_reason:"Admin account registry"});}
  setBusy(false);if(result.error)setError(result.error.message.includes("CONFLICT")?"This account was modified by another Admin. Please refresh and try again.":result.error.message);else{setNotice(editor.kind==="faci"?"Faci group assigned successfully.":"GM station assignments updated successfully.");setEditor(null);await load();}}
 return <div className="space-y-4"><PageTitle title="Accounts" subtitle="Search accounts and manage Faci/GM allocation"/><ErrorBanner message={error}/><SuccessBanner message={notice}/>
  <Card className="space-y-3"><h2 className="font-semibold">Filter</h2><div className="grid gap-2 sm:grid-cols-3">
   <select className="input" value={role} onChange={e=>setRole(e.target.value as typeof role)}><option value="all">All roles</option><option value="faci">Faci</option><option value="gm">GM</option><option value="freshie">Freshie</option><option value="admin">Admin</option></select>
   <select className="input" value={status} onChange={e=>setStatus(e.target.value as StatusFilter)}><option value="all">All statuses</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select>
   <input className="input" placeholder="Name or account ID" value={search} onChange={e=>setSearch(e.target.value)}/></div></Card>
  {loading?<div className="flex justify-center py-10"><Spinner/></div>:<div className="space-y-2">{rows.map(r=><Card key={r.id} className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="font-semibold">{r.name}</p><p className="text-xs uppercase text-ink-faint">{r.role} · {r.assigned?"Assigned":"Unassigned"}</p><p className="text-sm text-ink-soft">{r.role==="faci"?(groups.find(g=>g.id===assignment(r.id)?.group_id)?.name??"No group"):r.role==="gm"?`Day 1: ${stations.find(s=>s.id===gm(r.id,1)?.station_id)?.code??"—"} · Day 2: ${stations.find(s=>s.id===gm(r.id,2)?.station_id)?.code??"—"}`:r.role==="freshie"?(groups.find(g=>g.id===(r as {freshie?:Freshie}).freshie?.group_id)?.name??"No group — read only"):"Management account"}</p></div>{(r.role==="faci"||r.role==="gm")&&<button className="btn-secondary px-4" onClick={()=>open((r as {user:Profile}).user)}>{r.assigned?"Edit":"Assign"}</button>}</Card>)}</div>}
  {editor&&<div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3 sm:items-center"><Card className="w-full max-w-md space-y-4 p-5"><div><h2 className="font-bold">{editor.kind==="faci"?"Faci allocation":"GM allocation"}</h2><p className="text-sm text-ink-faint">{editor.user.full_name}</p></div>{editor.kind==="faci"?<label className="block text-sm font-semibold">Group<select className="input mt-1" value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="">Unassigned</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>:<><label className="block text-sm font-semibold">Day 1 station<select className="input mt-1" value={day1} onChange={e=>setDay1(e.target.value)}><option value="">Unassigned</option>{stations.filter(s=>!s.day||s.day===1).map(s=><option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></label><label className="block text-sm font-semibold">Day 2 station<select className="input mt-1" value={day2} onChange={e=>setDay2(e.target.value)}><option value="">Unassigned</option>{stations.filter(s=>!s.day||s.day===2).map(s=><option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></label></>}
   <div className="flex gap-2"><button className="btn-secondary flex-1" onClick={()=>setEditor(null)}>Cancel</button><button disabled={busy} className="btn-primary flex-1" onClick={save}>{busy?"Saving…":"Save"}</button></div></Card></div>}</div>;
}
