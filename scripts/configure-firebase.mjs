import { readFile, writeFile, chmod } from "node:fs/promises";
const root = new URL("../", import.meta.url);
try {
  const account = JSON.parse(
    await readFile(new URL(".firebase-service-account.json", root), "utf8"),
  );
  const aliases = JSON.parse(
      await readFile(new URL(".firebaserc", root), "utf8"),
    ),
    project = aliases.projects.default;
  if (
    account.type !== "service_account" ||
    account.project_id !== project ||
    typeof account.private_key !== "string" ||
    !account.private_key.includes("BEGIN PRIVATE KEY") ||
    !account.client_email?.endsWith(".iam.gserviceaccount.com")
  )
    throw Error(
      "Use a service-account JSON key for the selected Solar Sales Desk project.",
    );
  let source = "";
  try {
    source = await readFile(new URL(".dev.vars", root), "utf8");
  } catch {}
  const values = {
    DATABASE_PROVIDER: "firebase",
    FIREBASE_PROJECT_ID: project,
    FIREBASE_DATABASE_ID: "sales-native",
    FIREBASE_SERVICE_ACCOUNT_EMAIL: account.client_email,
    FIREBASE_PRIVATE_KEY: account.private_key,
  };
  for (const [key, value] of Object.entries(values)) {
    const line = key + "=" + JSON.stringify(value),
      pattern = new RegExp("^" + key + "=.*$", "m");
    source = pattern.test(source)
      ? source.replace(pattern, () => line)
      : source + "\n" + line;
  }
  await writeFile(new URL(".dev.vars", root), source.trim() + "\n", {
    mode: 0o600,
  });
  await chmod(new URL(".dev.vars", root), 0o600);
  await chmod(new URL(".firebase-service-account.json", root), 0o600);
  console.log(
    "Firebase server credential configured privately. No secrets displayed; outbound flags, billing and deployment were not changed. Configure the public web app key and origin before starting the local Worker.",
  );
} catch (e) {
  console.error(
    e.code === "ENOENT"
      ? "Save .firebase-service-account.json locally first. Payment verification is not required."
      : e.message,
  );
  process.exitCode = 1;
}
