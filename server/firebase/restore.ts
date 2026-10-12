import {z} from 'zod';
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
