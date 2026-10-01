import { NextRequest, NextResponse } from "next/server";
import { hashToken, verifyNfcToken } from "@/lib/nfc";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request:NextRequest){
  const supabase=await supabaseServer();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  let body:{token?:unknown;requestId?:unknown};try{body=await request.json()}catch{return NextResponse.json({error:"Invalid request."},{status:400})}
  if(typeof body.token!=="string"||typeof body.requestId!=="string"||!verifyNfcToken(body.token).valid)return NextResponse.json({error:"This NFC card is invalid for this event."},{status:400});
  const {data,error}=await supabase.rpc("fn_redeem_nfc_card",{p_token_hash:hashToken(body.token),p_request_id:body.requestId});
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json(data);
}
