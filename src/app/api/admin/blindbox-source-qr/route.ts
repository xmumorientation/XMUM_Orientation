import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { hashToken, signPayload } from "@/lib/signed-token";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req:NextRequest){const admin=await requirePermission("configuration.manage");if(!admin)return NextResponse.json({error:"Forbidden"},{status:403});
 let sourceId:number;try{sourceId=Number((await req.json()).sourceId)}catch{return NextResponse.json({error:"Invalid request"},{status:400})}if(!Number.isInteger(sourceId)||sourceId<1)return NextResponse.json({error:"Invalid source"},{status:400});
 const db=supabaseAdmin();const {data:source}=await db.from("blind_box_sources").select("id,source_code").eq("id",sourceId).single();if(!source)return NextResponse.json({error:"Source not found"},{status:404});
 const token=signPayload({purpose:"blind_box_source",sourceId:source.id});const {error}=await db.from("blind_box_sources").update({qr_token_hash:hashToken(token),qr_rotated_at:new Date().toISOString(),updated_by:admin.user.id}).eq("id",source.id);if(error)return NextResponse.json({error:error.message},{status:500});
 await db.from("audit_log").insert({actor:admin.user.id,actor_role:"admin",action:"blind_box.source_qr_rotate",target:`source:${source.id}`,detail:{source_code:source.source_code}});
 const base=(process.env.NEXT_PUBLIC_SITE_URL??req.nextUrl.origin).replace(/\/$/,"");return NextResponse.json({ok:true,url:`${base}/inventory?blindbox_source=${encodeURIComponent(token)}`});}
