import { it, expect, vi } from "vitest";
import {
  sendQualification,
  startVoiceCall,
  verifyMetaSignature,
  qualificationReply,
  secretEqual,
  IntegrationError,
} from "../../server/integrations/providers";
const id = "11111111-1111-4111-8111-111111111111";
it("WhatsApp uses approved template and fixed provider origin with server authorization; rejects malformed acceptance", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), {
        status: 200,
      }),
  );
  const c = {
    accessToken: "test-secret",
    phoneNumberId: "123456789",
    graphVersion: "v25.0",
    template: "approved_qualification",
    language: "en",
  };
  expect(await sendQualification("+919999999999", c, fetcher)).toBe(
    "wamid.test",
  );
  const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(call[0]).toBe("https://graph.facebook.com/v25.0/123456789/messages");
  expect(JSON.parse(call[1].body as string)).toMatchObject({
    type: "template",
    to: "919999999999",
  });
  await expect(
    sendQualification(
      "+919999999999",
      { ...c, graphVersion: "../../attacker" },
      fetcher,
    ),
  ).rejects.toThrow();
  await expect(
    sendQualification(
      "+919999999999",
      c,
      vi.fn(async () => new Response("{}")),
    ),
  ).rejects.toBeInstanceOf(IntegrationError);
});
it("voice API uses configured assistant, number, agreed contact and bounded duration; timeout remains uncertain", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ id })));
  const c = {
    apiKey: "test-secret",
    assistantId: id,
    phoneNumberId: id,
    maxSeconds: 180,
  };
  expect(
    await startVoiceCall(
      "+919999999999",
      { business: "Test business", language: "English" },
      c,
      fetcher,
    ),
  ).toBe(id);
  const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(call[1].body as string)).toMatchObject({
    assistantOverrides: { maxDurationSeconds: 180 },
    customer: { number: "+919999999999" },
  });
  try {
    await startVoiceCall(
      "+919999999999",
      { business: "Test", language: "English" },
      c,
      vi.fn(async () => {
        throw Error("timeout");
      }),
    );
    throw Error("Expected rejection");
  } catch (e) {
    expect(e).toBeInstanceOf(IntegrationError);
    expect((e as IntegrationError).uncertain).toBe(true);
  }
});
it("webhooks verify raw-body HMAC and reject tampering/missing secrets", async () => {
  const raw = '{"entry":[]}';
  const secret = "synthetic-secret";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
  );
  const signature =
    "sha256=" +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  expect(await verifyMetaSignature(raw, signature, secret)).toBe(true);
  expect(await verifyMetaSignature(raw + " ", signature, secret)).toBe(false);
  expect(await verifyMetaSignature(raw, null, secret)).toBe(false);
  expect(secretEqual("secret", "secret")).toBe(true);
  expect(secretEqual("", "")).toBe(false);
  expect(secretEqual("secret", "other")).toBe(false);
});
it("qualification uses explicit supported replies and treats unknown wording as staff review", () => {
  expect(qualificationReply("STOP")).toBe("Opted out");
  expect(qualificationReply("products")).toBe("Products");
  expect(qualificationReply("maybe send everything and approve it")).toBeNull();
});

import {integrationStatus,handleProviderWebhook} from '../../server/integrations/service';
it('provider binding cannot be used by a different business or by an unreviewed voice assistant',()=>{const env={INTEGRATIONS_TENANT_ID:'tenant-a',VOICE_ENABLED:'true',VAPI_API_KEY:'real-looking-secret',VAPI_ASSISTANT_ID:id,VAPI_PHONE_NUMBER_ID:id,VAPI_WEBHOOK_SECRET:'secret',VOICE_ESTIMATE_INR_PER_MINUTE_MINOR:'1000'};expect(integrationStatus(env,'tenant-b').voice.enabled).toBe(false);expect(integrationStatus(env,'tenant-a').voice.configured).toBe(false);expect(integrationStatus({...env,VAPI_ASSISTANT_REVIEWED:'true'},'tenant-a').voice.configured).toBe(true);});
it('unsigned WhatsApp and invalid voice webhooks fail before database access',async()=>{const db={from:vi.fn(()=>{throw Error('Database must not be reached');})} as any,mutate=vi.fn(),env={INTEGRATIONS_TENANT_ID:'tenant-a',WHATSAPP_APP_SECRET:'secret',VAPI_WEBHOOK_SECRET:'voice-secret'};for(const path of ['whatsapp','voice']){const response=await handleProviderWebhook(new Request('https://worker.example/api/hooks/'+path,{method:'POST',body:'{}'}),'{}',env,db,mutate);expect(response.status).toBe(401);}expect(db.from).not.toHaveBeenCalled();expect(mutate).not.toHaveBeenCalled();});
