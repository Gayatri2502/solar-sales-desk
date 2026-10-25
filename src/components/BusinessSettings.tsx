import IntegrationSettings from "./IntegrationSettings";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Inbox,
  FileText,
  Users,
  Package,
  Truck,
  Settings,
  Sun,
  Plus,
  ArrowUpRight,
  Search,
  Download,
  LogOut,
} from "lucide-react";
import {
  type State,
  type Quote,
  type Enquiry,
  type Line,
  type Extraction,
  type Product,
  type Customer,
  type Command,
  uid,
  minor,
  qty,
  totals,
  money,
  localDay,
  match,
  mockExtract,
  warnings,
  categories,
  stages,
} from "../domain";
import {
  loadDemo,
  command,
  live,
  auth,
  request,
  demoVisible,
  resetDemo,
  type Session,
} from "../api";
import { seed } from "../seed";
import { previewCSV, customerCSV, download, type Preview } from "../csv";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "../components/ui/field";
import { FieldInput, Tag, Table, Empty, safeTotal, type Run } from "./shared";
export default function BusinessSettings({
  state,
  admin,
  run,
  onReset,
}: {
  state: State;
  admin: boolean;
  run: Run;
  onReset: () => void;
}) {
  const [s, setS] = useState(state.settings);
  const [user, setUser] = useState({
    email: "",
    password: "",
    name: "",
    role: "sales",
  });
  const [error, setError] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetUser, setResetUser] = useState("");
  const edit = (key: keyof typeof s, v: unknown) => setS({ ...s, [key]: v });
  const month = new Date().toISOString().slice(0, 7);
  const usage = state.usage.filter((u) => u.at.startsWith(month));
  return (
    <>
      <IntegrationSettings state={state} admin={admin} run={run} />
      {!admin ? (
        <p>
          Only a business admin can change settings, manage users, or export all
          business data.
        </p>
      ) : (
        <>
          <section className="panel">
            <h2>Business defaults</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await run({ type: "settings.save", settings: s });
              }}
            >
              <FieldGroup>
                <div className="form-grid">
                  {(
                    [
                      "name",
                      "address",
                      "contact",
                      "gstin",
                      "timezone",
                      "prefix",
                      "paymentTerms",
                      "deliveryTerms",
                    ] as const
                  ).map((k) => (
                    <FieldInput
                      key={k}
                      label={
                        {
                          name: "Business name",
                          address: "Business address",
                          contact: "Contact details",
                          gstin: "GSTIN (optional)",
                          timezone: "Business timezone",
                          prefix: "Quotation prefix",
                          paymentTerms: "Payment terms",
                          deliveryTerms: "Delivery terms",
                        }[k]
                      }
                      value={s[k]}
                      onChange={(v) => edit(k, v)}
                      required={k === "name"}
                    />
                  ))}
                  <FieldInput
                    label="Currency"
                    value="INR"
                    onChange={() => {}}
                  />
                  <FieldInput
                    label="Quotation validity (days)"
                    type="number"
                    min={1}
                    value={s.validDays}
                    onChange={(v) => edit("validDays", Number(v))}
                  />
                  <FieldInput
                    label="Default product tax (%)"
                    value={s.taxBps === null ? "" : s.taxBps / 100}
                    type="number"
                    min={0}
                    step="0.01"
                    onChange={(v) =>
                      edit("taxBps", v ? Math.round(Number(v) * 100) : null)
                    }
                  />
                  <FieldInput
                    label="Delivery tax (%)"
                    value={
                      s.deliveryTaxBps === null ? "" : s.deliveryTaxBps / 100
                    }
                    type="number"
                    min={0}
                    step="0.01"
                    onChange={(v) =>
                      edit(
                        "deliveryTaxBps",
                        v ? Math.round(Number(v) * 100) : null,
                      )
                    }
                  />
                  <FieldInput
                    label="Minimum margin (%)"
                    value={s.marginBps / 100}
                    type="number"
                    min={0}
                    step="0.01"
                    onChange={(v) =>
                      edit("marginBps", Math.round(Number(v) * 100))
                    }
                  />
                  <FieldInput
                    label="Stock stale after (days)"
                    value={s.stockStaleDays}
                    type="number"
                    min={1}
                    onChange={(v) => edit("stockStaleDays", Number(v))}
                  />
                </div>
                <p className="warning">
                  Tax rates are business configuration, not legal advice. No
                  rate is assumed. Saving defaults applies to new quotations;
                  existing drafts keep their rates.
                </p>
                <h3>Manual subscription record</h3>
                <p>
                  This records an agreement, not payment verification. No
                  payment is charged by this application.
                </p>
                <div className="form-grid">
                  <Field>
                    <FieldLabel htmlFor="subscription">
                      Subscription status
                    </FieldLabel>
                    <select
                      aria-label="Subscription status"
                      id="subscription"
                      value={s.subscription}
                      onChange={(e) => edit("subscription", e.target.value)}
                    >
                      {["Pilot", "Active", "Past due", "Cancelled"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </Field>
                  <FieldInput
                    label="Renewal date"
                    type="date"
                    value={s.renewal}
                    onChange={(v) => edit("renewal", v)}
                  />
                  <FieldInput
                    label="Agreed monthly fee (₹)"
                    type="number"
                    min={0}
                    step="0.01"
                    value={s.fee / 100}
                    onChange={(v) => edit("fee", Math.round(Number(v) * 100))}
                  />
                  <FieldInput
                    label="Monthly AI request allowance"
                    type="number"
                    min={0}
                    value={s.allowance}
                    onChange={(v) => edit("allowance", Number(v))}
                  />
                  <FieldInput
                    label="Users allowed"
                    type="number"
                    min={1}
                    value={s.userLimit}
                    onChange={(v) => edit("userLimit", Number(v))}
                  />
                  <FieldInput
                    label="AI monthly ceiling (USD)"
                    type="number"
                    min={0}
                    step="0.01"
                    value={s.spendCeilingMicros / 1000000}
                    onChange={(v) =>
                      edit(
                        "spendCeilingMicros",
                        Math.round(Number(v) * 1000000),
                      )
                    }
                  />
                </div>
                <h3>Pilot baseline</h3>
                <p>
                  Enter measurements from the team's current process before the
                  pilot begins. Compare the same definitions in Dashboard.
                </p>
                <div className="form-grid">
                  {Object.entries(s.baseline).map(([k, v]) => (
                    <FieldInput
                      key={k}
                      label={
                        {
                          prepMinutes: "Baseline median preparation minutes",
                          followupPercent: "Baseline on-time follow-up %",
                          correctionPercent: "Baseline correction %",
                          conversionPercent: "Baseline quote conversion %",
                          weeklyUsers: "Baseline weekly active sales users",
                        }[k] || k
                      }
                      value={v}
                      onChange={(v) =>
                        edit("baseline", { ...s.baseline, [k]: v })
                      }
                    />
                  ))}
                </div>
                <Button>Save business settings</Button>
              </FieldGroup>
            </form>
          </section>
          <section className="panel">
            <h2>Business users</h2>
            <Table headers={["Name", "Role", "ID"]}>
              {state.users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.role}</td>
                  <td>{u.id}</td>
                </tr>
              ))}
            </Table>
            {live ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const d = await request("/users", user);
                    setError(
                      "User created. Share the temporary password through your approved secure channel. Refresh to load the new user.",
                    );
                    if (d.user) setUser({ ...user, password: "" });
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <FieldGroup>
                  <FieldInput
                    label="New user name"
                    value={user.name}
                    onChange={(v) => setUser({ ...user, name: v })}
                    required
                  />
                  <FieldInput
                    label="New user email"
                    type="email"
                    value={user.email}
                    onChange={(v) => setUser({ ...user, email: v })}
                    required
                  />
                  <FieldInput
                    label="Temporary password"
                    type="password"
                    value={user.password}
                    onChange={(v) => setUser({ ...user, password: v })}
                    required
                  />
                  <Field>
                    <FieldLabel htmlFor="new-role">User role</FieldLabel>
                    <select
                      aria-label="Role"
                      id="new-role"
                      value={user.role}
                      onChange={(e) =>
                        setUser({ ...user, role: e.target.value })
                      }
                    >
                      <option value="sales">Sales</option>
                      <option value="admin">Admin</option>
                    </select>
                  </Field>
                  <Button>Create user</Button>
                </FieldGroup>
              </form>
            ) : (
              <p>
                Local preview roles are for interface review. Live mode supports admin-created
                email/password accounts.
              </p>
            )}
          </section>
          <section className="panel">
            <h2>Export, audit & data deletion</h2>
            {error && (
              <p className="warning" role="alert">
                {error}
              </p>
            )}
            <div className="toolbar">
              <Button
                variant="outline"
                disabled={exportBusy}
                onClick={async () => {
                  setExportBusy(true);
                  setError("");
                  try {
                    const data =
                      live && import.meta.env.VITE_AUTH_PROVIDER === "firebase"
                        ? await request("/export")
                        : state;
                    download(
                      "solar-sales-desk-export.json",
                      JSON.stringify(data, null, 2),
                      "application/json",
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setExportBusy(false);
                  }
                }}
              >
                {exportBusy ? "Exporting…" : "Export business data"}
              </Button>
              {!live ? (
                <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                  Reset local preview
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                  Delete business data
                </Button>
              )}
            </div>
            <p>
              Exports contain sensitive business data and cost prices. Store
              them securely. Restore instructions are in the operator guide.
            </p>
            <Table headers={["When", "Action", "Detail"]}>
              {state.audit.slice(0, 30).map((a) => (
                <tr key={a.id}>
                  <td>
                    {new Date(a.at).toLocaleString("en-IN", {
                      timeZone: state.settings.timezone,
                    })}
                  </td>
                  <td>{a.action}</td>
                  <td>{a.detail}</td>
                </tr>
              ))}
            </Table>
          </section>
        </>
      )}
      {live ? (
        <section className="panel">
          <h2>Password management</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (newPassword.length < 12)
                  throw Error("Use at least 12 characters.");
                if (admin && resetUser) {
                  await request("/password", {
                    userId: resetUser,
                    password: newPassword,
                  });
                } else {
                  const r = await auth!.auth.updateUser({
                    password: newPassword,
                  });
                  if (r.error)
                    throw Error(
                      "Password change failed. Ask your admin for help.",
                    );
                }
                setNewPassword("");
                setError(
                  "Password updated. Share reset credentials only through your approved secure channel.",
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <FieldGroup>
              {admin ? (
                <Field>
                  <FieldLabel htmlFor="reset-user">
                    Account to update
                  </FieldLabel>
                  <select
                    aria-label="Account to reset"
                    id="reset-user"
                    value={resetUser}
                    onChange={(e) => setResetUser(e.target.value)}
                  >
                    <option value="">My password</option>
                    {state.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <FieldInput
                label="New password (at least 12 characters)"
                value={newPassword}
                type="password"
                onChange={setNewPassword}
                required
              />
              <Button>Update password</Button>
            </FieldGroup>
          </form>
        </section>
      ) : null}
      <section className="panel">
        <h2>AI usage & allowance</h2>
        <p>
          {usage.length} requests this UTC month / {state.settings.allowance}{" "}
          tenant allowance · $
          {(usage.reduce((n, u) => n + u.estimatedMicros, 0) / 1000000).toFixed(
            4,
          )}{" "}
          estimated usage · $
          {(state.settings.spendCeilingMicros / 1000000).toFixed(2)} ceiling.
        </p>
        <p>
          {live
            ? "Provider is configured by the operator. Extraction runs only on demand."
            : "Text parsing runs locally on the enquiry you enter. No hosted AI provider is activated."}{" "}
          Provider cost estimates may lag billing. Usage is limited; manual
          entry remains available.
        </p>
        <Table
          headers={[
            "Time",
            "Input tokens",
            "Output tokens",
            "Estimated USD",
            "Result",
          ]}
        >
          {usage.slice(-20).map((u) => (
            <tr key={u.id}>
              <td>{u.at}</td>
              <td>{u.inputTokens}</td>
              <td>{u.outputTokens}</td>
              <td>{(u.estimatedMicros / 1000000).toFixed(6)}</td>
              <td>{u.status}</td>
            </tr>
          ))}
        </Table>
      </section>
      {error ? <p role="status">{error}</p> : null}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {live ? "Delete business data" : "Reset local preview"}
            </DialogTitle>
            <DialogDescription>
              {live
                ? "Export your data first. This deletes business records and memberships. Auth accounts are retained for operator review."
                : "This clears local preview changes in this browser and returns to an empty workspace."}
            </DialogDescription>
          </DialogHeader>
          {live ? (
            <FieldInput
              label="Type DELETE to confirm"
              value={confirm}
              onChange={setConfirm}
            />
          ) : null}
          <Button variant="outline" onClick={() => setDeleteOpen(false)}>
            Keep data
          </Button>
          <Button
            disabled={live && confirm !== "DELETE"}
            onClick={async () => {
              if (live) {
                try {
                  await request("/delete", { confirmation: confirm });
                  await auth?.auth.signOut();
                } catch (e) {
                  setError((e as Error).message);
                }
              } else onReset();
              setDeleteOpen(false);
            }}
          >
            Confirm {live ? "deletion" : "reset"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
