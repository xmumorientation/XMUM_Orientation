"use client";

import { Radio, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

interface NdefRecord { recordType?:string;data?:DataView }
interface NdefEvent extends Event { message?:{records?:NdefRecord[]} }
interface Reader { scan():Promise<void>;addEventListener(type:string,listener:(event:NdefEvent)=>void):void }
type ReaderConstructor=new()=>Reader;

function tokenFromRecord(record:NdefRecord):string|null{
  if(!record.data)return null;
  const text=new TextDecoder().decode(record.data).replace(/^\u0000/,"");
  try{const url=new URL(text);return url.searchParams.get("t")??url.pathname.match(/\/nfc\/redeem\/([^/]+)/)?.[1]??null}catch{return null}
}

export function WebNFCReader({open,onToken,onClose}:{open:boolean;onToken:(token:string)=>void;onClose:()=>void}){
  const [supported,setSupported]=useState<boolean|null>(null),[state,setState]=useState<"idle"|"scanning"|"denied"|"error">("idle");
  useEffect(()=>{setSupported(typeof window!=="undefined"&&"NDEFReader" in window)},[]);
  async function scan(){
    const Constructor=(window as unknown as {NDEFReader?:ReaderConstructor}).NDEFReader;if(!Constructor){setSupported(false);return}
    setState("scanning");try{const reader=new Constructor();reader.addEventListener("reading",event=>{for(const record of event.message?.records??[]){const token=tokenFromRecord(record);if(token){onToken(token);return}}setState("error")});await reader.scan()}catch(error){setState(error instanceof DOMException&&error.name==="NotAllowedError"?"denied":"error")}
  }
  if(!open)return null;
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-3 sm:items-center"><Card className="w-full max-w-sm space-y-4 p-6 text-center"><button aria-label="Cancel NFC scan" onClick={onClose} className="ml-auto flex h-11 w-11 items-center justify-center rounded-xl"><X/></button><Radio className="mx-auto h-16 w-16 text-brand-1"/><h2 className="text-xl font-black">NFC Scan</h2>{supported===false?<p className="text-sm leading-6 text-ink-soft">Direct NFC scanning is not available in this browser. Hold the NFC card near the top of your phone and open the NFC notification when it appears.</p>:state==="idle"?<><p className="text-sm">Allow NFC access, then hold the card near the top of your phone.</p><button className="btn-primary w-full" onClick={()=>void scan()}>Start NFC scan</button></>:state==="denied"?<><p className="text-sm font-semibold text-red-700">NFC permission was not granted. Please allow NFC access and try again.</p><button className="btn-primary w-full" onClick={()=>void scan()}>Try again</button></>:state==="error"?<><p className="text-sm text-red-700">The card could not be read. Hold it near the phone and try again.</p><button className="btn-primary w-full" onClick={()=>void scan()}>Try again</button></>:<div className="rounded-2xl bg-brand-1/10 p-5"><p className="font-black text-brand-1">READY TO SCAN</p><p className="mt-2 text-sm">Hold the NFC card near your phone.</p></div>}<button className="btn-secondary w-full" onClick={onClose}>Cancel</button></Card></div>;
}
