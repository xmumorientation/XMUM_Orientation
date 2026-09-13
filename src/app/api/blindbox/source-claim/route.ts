import { NextRequest,NextResponse } from "next/server";
import { hashToken,verifyToken } from "@/lib/signed-token";
import { supabaseServer } from "@/lib/supabase/server";
export async function POST(req:NextRequest){const db=await supabaseServer();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Please log in again."},{status:401});let token:string,requestId:string;try{const b=await req.json();token=String(b.token??"");requestId=String(b.requestId??"")}catch{return NextResponse.json({error:"Invalid request"},{status:400})}
 const verified=verifyToken(token);if(!verified.valid||verified.payload.purpose!=="blind_box_source")return NextResponse.json({error:"This QR code is not a valid Big Game Blind Box source."},{status:400});
 const {data,error}=await db.rpc("fn_claim_blind_box_source",{p_qr_hash:hashToken(token),p_request_id:requestId});if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json(data);}
