import { readFile } from "node:fs/promises";
const config = {};
for (const name of [".env.local", ".dev.vars"]) {
  try {
    for (const line of (
      await readFile(new URL("../" + name, import.meta.url), "utf8")
    ).split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match)
        config[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
Object.assign(config, process.env);
const firebase = config.DATABASE_PROVIDER === "firebase";
const groups = {
  "Authentication/database": firebase
    ? [
        "VITE_MODE",
        "VITE_AUTH_PROVIDER",
        "VITE_FIREBASE_API_KEY",
        "VITE_FIREBASE_AUTH_DOMAIN",
        "VITE_FIREBASE_PROJECT_ID",
        "VITE_FIREBASE_APP_ID",
        "VITE_API_URL",
        "FIREBASE_PROJECT_ID",
        "FIREBASE_DATABASE_ID",
        "FIREBASE_SERVICE_ACCOUNT_EMAIL",
        "FIREBASE_PRIVATE_KEY",
        "FIREBASE_WEB_API_KEY",
        "ALLOWED_ORIGIN",
      ]
    : [
        "VITE_MODE",
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_ANON_KEY",
        "VITE_API_URL",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "ALLOWED_ORIGIN",
      ],
  WhatsApp: [
    "INTEGRATIONS_TENANT_ID",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_VERIFY_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_GRAPH_VERSION",
    "WHATSAPP_QUALIFICATION_TEMPLATE",
    "WHATSAPP_TEMPLATE_ESTIMATE_INR_MINOR",
  ],
  "Voice/calling": [
    "INTEGRATIONS_TENANT_ID",
    "VAPI_API_KEY",
    "VAPI_ASSISTANT_ID",
    "VAPI_PHONE_NUMBER_ID",
    "VAPI_WEBHOOK_SECRET",
    "VOICE_ESTIMATE_INR_PER_MINUTE_MINOR",
  ],
  "Approved invoice email": ["RESEND_API_KEY", "INVOICE_FROM_EMAIL"],
};
let missing = false;
for (const [group, keys] of Object.entries(groups)) {
  const absent = keys.filter(
    (k) => !config[k] || /PLACEHOLDER|YOUR-|\.example/i.test(config[k]),
  );
  console.log(
    group +
      ": " +
      (absent.length
        ? "missing " + absent.join(", ")
        : "values present; live verification required"),
  );
  missing ||= !!absent.length;
}
if (config.VITE_MODE !== "live") {
  console.log("Live frontend is disabled.");
  missing = true;
}
if (firebase && config.VITE_AUTH_PROVIDER !== "firebase") {
  console.log("Frontend/backend authentication provider mismatch.");
  missing = true;
}
for (const k of [
  "WHATSAPP_ENABLED",
  "VOICE_ENABLED",
  "VAPI_ASSISTANT_REVIEWED",
  "INVOICE_EMAIL_ENABLED",
])
  console.log(k + ": " + (config[k] === "true" ? "enabled" : "disabled"));
console.log(
  "This check performs no calls, messages, purchases or secret disclosure. Passing configuration is not proof of live provider delivery.",
);
process.exitCode = missing ? 1 : 0;
