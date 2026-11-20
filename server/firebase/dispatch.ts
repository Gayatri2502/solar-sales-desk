import { finishPendingDeletions, expireExtractionCaches } from "./privacy";
import { type FirebaseEnv, FirebaseStore } from "./store";
import { FirebaseBridge, firebaseMutate } from "./bridge";
import {
  runScheduledCommunications,
  type CommunicationEnv,
} from "../integrations/service";
import { deliverInvoices, type EmailEnv } from "../invoice-delivery";
export async function firebaseScheduled(
  env: FirebaseEnv & CommunicationEnv & EmailEnv,
  dispatch = true,
  maintenance = true,
) {
  const store = new FirebaseStore(env),
    db = new FirebaseBridge(store).asDatabase();
  if (maintenance) {
    await finishPendingDeletions(store);
    await expireExtractionCaches(store);
  }
  if (!dispatch) return;
  let communicationFailed = false;
  try {
    await runScheduledCommunications(db, env, firebaseMutate);
  } catch {
    communicationFailed = true;
  }
  if (env.INVOICE_EMAIL_ENABLED !== "true") {
    if (communicationFailed && !maintenance) throw Error("Communications dispatch failed.");
    return;
  }
  const registry = await store.get<{ ids: string[] }>(
      "system/dispatch-tenants",
    ),
    ids = registry?.value.ids || [];
  const offset =
    (Math.floor(Date.now() / 300000) * 10) % Math.max(ids.length, 1);
  for (let i = 0; i < Math.min(ids.length, 10); i++) {
    try {
      await deliverInvoices(
        db,
        ids[(offset + i) % ids.length],
        env,
        firebaseMutate,
      );
    } catch {
      /* Persisted leases remain for the next run. */
    }
  }
  if (communicationFailed && !maintenance) throw Error("Communications dispatch failed.");
}
