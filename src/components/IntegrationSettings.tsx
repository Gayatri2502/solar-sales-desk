import { useEffect, useState } from "react";
import { type State, minor, money } from "../domain";
import { live, request } from "../api";
import { Button } from "./ui/button";
import { FieldInput, type Run, Table } from "./shared";
type Status = {
  bound: boolean;
  whatsapp: { configured: boolean; enabled: boolean };
  voice: { configured: boolean; enabled: boolean };
  note: string;
};
export default function IntegrationSettings({
  state,
  admin,
  run,
}: {
  state: State;
  admin: boolean;
  run: Run;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(
      state.communicationPolicy?.autoCalls || false,
    ),
    [ceiling, setCeiling] = useState(
      ((state.communicationPolicy?.monthlyCeiling || 0) / 100).toFixed(2),
    ),
    [userLimit, setUserLimit] = useState(
      String(state.communicationPolicy?.userDaily || 0),
    ),
    [tenantLimit, setTenantLimit] = useState(
      String(state.communicationPolicy?.tenantDaily || 0),
    );
  useEffect(() => {
    if (!live || !admin) return;
    let active = true;
    request("/integrations")
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch(() => {
        if (active)
          setError(
            "Integration status unavailable. Refresh to check configuration.",
          );
      });
    return () => {
      active = false;
    };
  }, [admin]);
  if (!admin) return null;
  const check = async () => {
    setBusy(true);
    setError("");
    try {
      setStatus(await request("/integrations"));
    } catch {
      setError(
        "Status check failed. Check your connection and server configuration.",
      );
    } finally {
      setBusy(false);
    }
  };
  const text = (c: Status["voice"] | undefined) =>
    !live
      ? "Not connected"
      : !c
        ? "Unavailable"
        : c.configured
          ? c.enabled
            ? "Configured and enabled — provider verification required"
            : "Configured; outbound disabled"
          : "Not configured";
  return (
    <section className="panel">
      <h2>Messaging and voice integrations</h2>
      <Table headers={["Connection", "Status"]}>
        <tr>
          <td>Business database / authentication</td>
          <td>
            {live
              ? `Authenticated Worker access (${import.meta.env.VITE_AUTH_PROVIDER === "firebase" ? "Firebase configuration" : "Supabase configuration"})`
              : "Local SQLite workspace; not connected to shared Firebase"}
          </td>
        </tr>
        <tr>
          <td>Meta WhatsApp Business Cloud API</td>
          <td>{text(status?.whatsapp)}</td>
        </tr>
        <tr>
          <td>Arka voice assistant / Vapi calling</td>
          <td>{text(status?.voice)}</td>
        </tr>
      </Table>
      <p>
        Credentials stay on the server. WhatsApp requires an approved
        qualification template; calls require a verified caller number and a
        reviewed assistant. Configuration does not confirm delivery.
      </p>
      {live && (
        <Button disabled={busy} variant="outline" onClick={check}>
          Refresh connection status
        </Button>
      )}
      {status?.note && <p>{status.note}</p>}
      {error && (
        <p className="warning" role="alert">
          {error}
        </p>
      )}
      <h3>Application communication allowance</h3>
      <p>
        Estimates are reserved before contact. Actual provider billing may lag
        or include other charges. Limits never automatically buy credits.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            await run({
              type: "comms.policy",
              policy: {
                autoCalls: auto,
                monthlyCeiling: minor(ceiling),
                userDaily: Number(userLimit),
                tenantDaily: Number(tenantLimit),
              },
            });
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="form-grid">
          <FieldInput
            label="Monthly communication ceiling INR"
            value={ceiling}
            onChange={setCeiling}
          />
          <FieldInput
            label="Daily outbound requests per user"
            type="number"
            min={0}
            value={userLimit}
            onChange={setUserLimit}
          />
          <FieldInput
            label="Daily outbound requests per business"
            type="number"
            min={0}
            value={tenantLimit}
            onChange={setTenantLimit}
          />
          <label>
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />{" "}
            Run due, consented call appointments automatically
          </label>
        </div>
        <Button>Save communication allowance</Button>
      </form>
      <p>
        Current estimated monthly cap:{" "}
        {money(state.communicationPolicy?.monthlyCeiling || 0)}. Automation
        requires server activation. Review queued and uncertain contacts in
        Leads &amp; Calls.
      </p>
    </section>
  );
}
