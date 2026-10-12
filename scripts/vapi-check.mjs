import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export async function inspectVapi(key,transport=fetch){
 if(!key||/PLACEHOLDER|YOUR-/i.test(key))throw Error('Save VAPI_API_KEY in .dev.vars first. No request was sent.');
 const read=async path=>{
  const r=await transport('https://api.vapi.ai/'+path+'?limit=1000',{method:'GET',headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Vapi connection check failed (HTTP '+r.status+'). Verify the private key and account access.');
  const data=await r.json();if(!Array.isArray(data))throw Error('Unexpected provider response; connection was not verified.');return data;
 };
 const [assistants,numbers]=await Promise.all([read('assistant'),read('phone-number')]);
 const validId=x=>typeof x==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(x);
 return {authenticated:true,assistants:assistants.filter(a=>validId(a.id)).map(a=>({id:a.id,name:typeof a.name==='string'?a.name.slice(0,120):'Unnamed',maxDurationSeconds:a.maxDurationSeconds??null,hasServerUrl:!!(a.server?.url||a.serverUrl)})),phoneNumbers:numbers.filter(n=>validId(n.id)).map(n=>({id:n.id,provider:typeof n.provider==='string'?n.provider:'Unknown',numberSuffix:typeof n.number==='string'?n.number.slice(-4):null})),possiblyTruncated:assistants.length>=1000||numbers.length>=1000,note:'Read-only inspection. No assistant creation, calls, purchases or billing changes. Number presence does not verify India outbound approval.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  let key=process.env.VAPI_API_KEY;
  if(!key){let source;try{source=await readFile(new URL('../.dev.vars',import.meta.url),'utf8');}catch{source='';}key=source.match(/^VAPI_API_KEY\s*=\s*(.*)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/,'$2');}
  console.log(JSON.stringify(await inspectVapi(key),null,2));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
