import {z} from 'zod';
import {FirebaseStore} from './store';
import {type State,productSchema} from '../../src/domain';
export function prepareFirebaseRestore(source:unknown,current:State):State{
 const candidate=z.looseObject({version:z.literal(1),settings:z.record(z.string(),z.unknown()),products:z.array(z.unknown()),customers:z.array(z.unknown()),enquiries:z.array(z.unknown()),quotes:z.array(z.unknown()),orders:z.array(z.unknown()),users:z.array(z.unknown()),events:z.array(z.unknown()),audit:z.array(z.unknown()),usage:z.array(z.unknown())}).parse(source);
 for(const p of candidate.products)productSchema.parse(p);
 const state=structuredClone(candidate) as unknown as State;
 state.users=structuredClone(current.users);
 state.communicationPolicy={...(state.communicationPolicy||{monthlyCeiling:0,userDaily:0,tenantDaily:0}),autoCalls:false};
 for(const j of state.communicationJobs||[]){if(j.status==='Queued')j.status='Cancelled';else if(['Starting','Accepted'].includes(j.status)){j.status='Uncertain';j.error='Restored snapshot: reconcile provider outcome before further contact.';}}
 for(const l of state.leads||[]){if(l.status==='Scheduled'){l.status='Qualified';l.scheduledAt='';l.callConsent='';}}
 for(const i of state.invoices||[]){if(['Approved','Sending','Failed'].includes(i.status)){i.status='Failed';i.attempts=3;i.lease='';i.error='Restored snapshot: automatic delivery quarantined. Reconcile provider acceptance with the operator.';}}
 state.events.push({at:new Date().toISOString(),user:'operator',type:'business.restore',entity:'maintenance'});
 return state;
}


/** Validate the entire ledger set before any restore writes are committed. */
export function validateRestoreLedgers(source: unknown, tenant: string) {
 z.uuid().parse(tenant);
 const ledgers = z.array(z.object({path:z.string(),value:z.object({rows:z.array(z.record(z.string(),z.unknown()))})})).max(199).parse(source ?? []);
 const seen = new Set<string>();
 for(const ledger of ledgers){
  const prefix='system/usage-'+tenant+'-';
  const month=ledger.path.slice(prefix.length);
  if(!ledger.path.startsWith(prefix)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||seen.has(ledger.path))throw Error('Invalid or duplicate tenant ledger scope.');
  seen.add(ledger.path);
 }
 return ledgers;
}


export async function restoreFirebaseSnapshot(store: FirebaseStore, tenant: string, source: unknown, ledgerSource: unknown) {
 const ledgers=validateRestoreLedgers(ledgerSource,tenant);
 const current=await store.get<State>('businesses/'+tenant);
 if(!current)throw Error('Target business must exist with verified memberships.');
 const state=prepareFirebaseRestore(source,current.value);
 const existing=await Promise.all(ledgers.map(ledger=>store.get<unknown>(ledger.path)));
 const writes=[store.write('businesses/'+tenant,state,current.stamp),...ledgers.map((ledger,index)=>store.write(ledger.path,ledger.value,existing[index]?.stamp))];
 if(new TextEncoder().encode(JSON.stringify({writes})).byteLength>8_000_000)throw Error('Backup exceeds the atomic restore size limit. Operator-assisted restore required.');
 await store.call(store.root+'/documents:commit',{writes});
}
