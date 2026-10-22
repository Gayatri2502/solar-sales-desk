import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {z} from 'zod';
import {FirebaseStore} from './store';
import {privateDocuments} from './privacy';
import {restoreFirebaseSnapshot} from './restore';
import {type State} from '../../src/domain';
export async function run(){const [action,argument,destination,confirmation]=process.argv.slice(2);
 const account=JSON.parse(await readFile('.firebase-service-account.json','utf8')),aliases=JSON.parse(await readFile('.firebaserc','utf8')),config=JSON.parse(await readFile('firebase.json','utf8'));
 if(account.type!=='service_account'||account.project_id!==aliases.projects.default)throw Error('Credential must belong to the selected project.');
 const store=new FirebaseStore({FIREBASE_PROJECT_ID:account.project_id,FIREBASE_DATABASE_ID:config.firestore.database,FIREBASE_SERVICE_ACCOUNT_EMAIL:account.client_email,FIREBASE_PRIVATE_KEY:account.private_key});
 if(action==='backup'){
  const tenant=z.uuid().parse(argument),snapshot=await store.get<State>('businesses/'+tenant);if(!snapshot)throw Error('Business unavailable.');
  const ledgers=await privateDocuments(store,'usage-'+tenant+'-');if(ledgers.length>=200)throw Error('Use operator-assisted export for this history size.');
  await mkdir('backups',{recursive:true});const output=destination||'backups/'+tenant+'-'+Date.now()+'.json';
  await writeFile(output,JSON.stringify({version:1,project:account.project_id,database:config.firestore.database,tenant,exportedAt:new Date().toISOString(),state:snapshot.value,ledgers:ledgers.map(d=>({path:d.name.split('/documents/')[1],value:JSON.parse(d.fields.json.stringValue)}))},null,2),{mode:0o600,flag:'wx'});await chmod(output,0o600);console.log('Private backup saved: '+output);return;
 }
 if(action==='restore'){
  if(destination!=='--confirm-restore'||confirmation!==undefined)throw Error('Restore requires: restore BACKUP_FILE --confirm-restore, with Worker maintenance enabled.');
  const local=await readFile('.dev.vars','utf8');if(!/^MAINTENANCE_MODE=["']?true["']?\s*$/m.test(local))throw Error('Set MAINTENANCE_MODE=true locally and on the Worker before restoring.');
  const backup=JSON.parse(await readFile(argument,'utf8'));if(backup.project!==account.project_id||backup.database!==config.firestore.database)throw Error('Backup project/database mismatch.');const tenant=z.uuid().parse(backup.tenant);
  await restoreFirebaseSnapshot(store,tenant,backup.state,backup.ledgers);
  console.log('Business snapshot restored. Keep maintenance enabled until ledger/budget, provider outcome and physical-stock reconciliation are complete. Auth membership grants were preserved; outbound jobs were quarantined.');return;
 }throw Error('Usage: backup TENANT_UUID [OUTPUT_FILE] | restore BACKUP_FILE --confirm-restore');
}
