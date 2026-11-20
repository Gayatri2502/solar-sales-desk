import SalesReports from "./components/SalesReports";
import Invoices from "./components/Invoices";
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
  Phone,
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
} from "./domain";
import {
  loadDemo,
  command,
  live,
  auth,
  request,
  demoVisible,
  resetDemo,
  type Session,
  type IntegrationStatus,
} from "./api";
import { emptyState } from "./seed";
import { previewCSV, customerCSV, download, type Preview } from "./csv";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "./components/ui/field";
import {
  FieldInput,
  Tag,
  Table,
  Empty,
  safeTotal,
  type Run,
} from "./components/shared";
import AdminReports from "./components/AdminReports";
import Leads from "./components/Leads";
import Dashboard from "./components/Dashboard";
import NewEnquiry from "./components/NewEnquiry";
import EnquiryDetail from "./components/EnquiryDetail";
import QuoteDetail from "./components/QuoteDetail";
import Catalogue from "./components/Catalogue";
import Customers from "./components/Customers";
import Orders from "./components/Orders";
import BusinessSettings from "./components/BusinessSettings";
const nav = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Reports", icon: FileText },
  { name: "My Reports", icon: FileText },
  { name: "Enquiries", icon: Inbox },
  { name: "Leads & Calls", icon: Phone },
  { name: "Quotations", icon: FileText },
  { name: "Customers", icon: Users },
  { name: "Products & Stock", icon: Package },
  { name: "Orders", icon: Truck },
  { name: "Invoices", icon: FileText },
  { name: "Settings", icon: Settings },
];
function hashPage() {
  try {
    const name = decodeURIComponent(location.hash.slice(1));
    return nav.some((n) => n.name === name) ? name : "Dashboard";
  } catch {
    return "Dashboard";
  }
}
export default function App() {
  const [raw, setRaw] = useState<State>(() => emptyState());
  const [page, setPage] = useState(hashPage);
  const [role, setRole] = useState<"admin" | "sales">("admin");
  const [actorId, setActorId] = useState("demo-admin");
  const [session, setSession] = useState<Session | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedEnquiry, setSelectedEnquiry] = useState<string | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  useEffect(() => {
    if (live) return;
    let active = true;
    loadDemo()
      .then((saved) => {
        if (active) setRaw(saved);
      })
      .catch((error: unknown) => {
        if (active)
          setNotice(
            error instanceof Error
              ? error.message
              : "Could not open this browser's local database.",
          );
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!auth) return;
    const { data } = auth.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user.user_metadata?.business_name)
        setBusinessName(
          String(s.user.user_metadata.business_name).slice(0, 200),
        );
      if (s)
        request("/state")
          .then((d) => {
            setRaw(d.state);
            setRole(d.role);
            setActorId(s.user.id);
            setReady(true);
          })
          .catch((e) => {
            setNotice(e.message);
            if (e.message.includes("membership")) setNeedsOnboarding(true);
          });
      if (s)
        request("/integrations")
          .then((status) => setIntegrations(status))
          .catch(() => setIntegrations(null));
      else {
        setIntegrations(null);
        setReady(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const f = () => {
      const name = hashPage();
      if (nav.some((n) => n.name === name)) setPage(name);
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const state = live ? raw : demoVisible(raw, role);
  const admin = role === "admin";
  const run: Run = async (cmd) => {
    setBusy(true);
    try {
      const next = await command(raw, cmd, { id: actorId, role });
      setRaw(next);
      setNotice("Saved.");
      return next;
    } catch (e) {
      setNotice((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  function navigate(name: string) {
    location.hash = encodeURIComponent(name);
    setPage(name);
    setQuery("");
    setListFilter("");
    setSelectedEnquiry(null);
    setSelectedQuote(null);
  }
  if (!ready && !live)
    return (
      <main className="login" role="status">
        <Sun aria-hidden />
        <h1>Solar Sales Desk</h1>
        <p>Opening your local workspace…</p>
      </main>
    );
  if (live && session && needsOnboarding)
    return (
      <main className="login">
        <h1>Create your business</h1>
        <p>
          Your account is authenticated. Create the business, then configure
          tax, stock and users in Settings.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await request("/onboard", { name: businessName });
              const d = await request("/state");
              setRaw(d.state);
              setRole(d.role);
              setActorId(session.user.id);
              setReady(true);
              setNeedsOnboarding(false);
            } catch (e) {
              setNotice((e as Error).message);
            }
          }}
        >
          <FieldGroup>
            <FieldInput
              label="Business name"
              value={businessName}
              onChange={setBusinessName}
              required
            />
            <Button>Create business</Button>
          </FieldGroup>
        </form>
        <p role="alert">{notice}</p>
      </main>
    );
  if (live && !ready)
    return (
      <main className="login">
        <Sun aria-hidden />
        <h1>Solar Sales Desk</h1>
        <p>Sign in to your business workspace.</p>
        {!auth ? (
          <p role="alert">
            Live configuration is missing. Set Supabase URL and public key, or
            use the local preview workspace.
          </p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const { error } = await auth!.auth.signInWithPassword({
                  email,
                  password,
                });
                if (error)
                  setNotice("Sign-in failed. Check your email and password.");
              } catch {
                setNotice(
                  "Sign-in unavailable. Check your connection and retry.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <FieldGroup>
              <FieldInput
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                required
              />
              <FieldInput
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                required
              />
              <Button disabled={busy}>Sign in</Button>
            </FieldGroup>
          </form>
        )}
        <p role="alert">{notice}</p>
        <p>
          Ask your admin to create your account. Password recovery is handled by
          your admin during the pilot.
        </p>
      </main>
    );
  const today = localDay(new Date().toISOString(), state.settings.timezone);
  const activeEnquiries = state.enquiries.filter(
    (e) => !["Won", "Lost"].includes(e.status),
  );
  const due = activeEnquiries.filter((e) => e.due && e.due <= today);
  const drafts = state.quotes.filter((q) => q.status === "Draft");
  const openQuotes = state.quotes.filter(
    (q) =>
      ["Approved", "Sent"].includes(q.status) &&
      !state.orders.some((o) => o.quoteId === q.id),
  );
  const value = openQuotes.reduce((n, q) => n + (safeTotal(q) || 0), 0);
  const won = state.orders.filter((o) => o.status !== "Cancelled");
  const filtered = <T,>(list: T[]) =>
    list.filter(
      (x) =>
        JSON.stringify(x).toLowerCase().includes(query.toLowerCase()) &&
        (!listFilter ||
          (x as any).status === listFilter ||
          (x as any).category === listFilter),
    );
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <Sun aria-hidden />
          <span>
            Solar
            <br />
            <strong>Sales Desk</strong>
          </span>
        </div>
        <p className="workspace">{state.settings.name}</p>
        <nav aria-label="Primary navigation">
          {nav
            .filter(
              (n) =>
                (n.name !== "Reports" || admin) &&
                (n.name !== "My Reports" || !admin),
            )
            .map(({ name, icon: Icon }) => (
              <a
                href={"#" + encodeURIComponent(name)}
                key={name}
                aria-current={page === name ? "page" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(name);
                }}
              >
                <Icon aria-hidden />
                {name}
                {name === "Enquiries" ? (
                  <span className="nav-count">{activeEnquiries.length}</span>
                ) : null}
              </a>
            ))}
        </nav>
        <div className="sidebar-footer">
          <span className="avatar">{admin ? "PA" : "RS"}</span>
          <div>
            <strong>{admin ? "Business admin" : "Sales representative"}</strong>
            <small>{live ? session?.user.email : "Local workspace"}</small>
          </div>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <span>
            Sales workspace <span className="muted">/ {page}</span>
          </span>
          <div className="toolbar">
            {!live ? (
              <label className="role-switch">
                Preview role{" "}
                <select
                  aria-label="Preview role"
                  value={role}
                  onChange={(e) => {
                    const r = e.target.value as typeof role;
                    setRole(r);
                    setActorId("demo-" + r);
                  }}
                >
                  <option value="admin">Admin</option>
                  <option value="sales">Sales</option>
                </select>
              </label>
            ) : (
              <Button variant="outline" onClick={() => auth?.auth.signOut()}>
                <LogOut aria-hidden />
                Sign out
              </Button>
            )}
          </div>
        </header>
        {!live ? (
          <div className="demo-banner">
            <strong>Local preview</strong>
            <span>
              Local database · records stay on this computer and do not sync to a team. AI, calls, WhatsApp and email need verified provider setup.
            </span>
          </div>
        ) : null}
        <main id="main" tabIndex={-1} aria-busy={busy}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {today} · {state.settings.timezone}
              </p>
              <h1>{page === "Dashboard" ? "Your sales, in focus" : page}</h1>
              <p className="muted">
                {page === "Dashboard"
                  ? "Keep enquiries moving. Know what needs your attention."
                  : page === "Enquiries"
                    ? "Capture requirements, review matches, and prepare a quote."
                    : page === "Quotations"
                      ? "Review every revision before sharing it with a customer."
                      : page === "Products & Stock"
                        ? "Catalogue prices and stock snapshots, in one place."
                        : page === "Orders"
                          ? "Reserve stock, prepare dispatch, and track delivery."
                          : page === "Invoices"
                            ? "Review order invoices, request approval, and track customer email submission."
                            : page === "Customers"
                              ? "Customer details for accurate quotations."
                              : page === "Leads & Calls"
                                ? "Qualify leads, schedule agreed calls, and review captured requirements."
                                : page === "My Reports"
                                  ? "Graphs for your assigned enquiries, quotations and orders."
                                  : page === "Reports"
                                    ? "Weekly, monthly and yearly sales, calls, costs and spending."
                                    : "Business defaults, users, and pilot usage."}
              </p>
            </div>
            {["Dashboard", "Enquiries"].includes(page) ? (
              <Button onClick={() => setShowNew(true)}>
                <Plus aria-hidden />
                New enquiry
              </Button>
            ) : null}
          </div>
          {notice ? (
            <div className="notice" role="status">
              <span>{notice}</span>
              <Button
                variant="ghost"
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                Dismiss
              </Button>
            </div>
          ) : null}
          {page === "My Reports" ? (
            <SalesReports state={state} actorId={actorId} />
          ) : null}
          {page === "Reports" ? (
            admin ? (
              <AdminReports state={state} run={run} />
            ) : (
              <section className="panel">
                <p role="alert">
                  Business admin access is required for financial reports.
                </p>
              </section>
            )
          ) : null}
          {page === "Leads & Calls" ? (
            <Leads
              state={state}
              run={run}
              voiceReady={!!integrations?.voice.configured && !!integrations.voice.enabled}
              whatsappReady={!!integrations?.whatsapp.configured && !!integrations.whatsapp.enabled}
              onEnquiry={(id) => {
                navigate("Enquiries");
                setSelectedEnquiry(id);
              }}
            />
          ) : null}
          {page === "Dashboard" ? (
            <Dashboard
              state={state}
              due={due}
              drafts={drafts}
              value={value}
              won={won}
              admin={admin}
              callingConfigured={!!integrations?.voice.configured && !!integrations.voice.enabled}
              onEnquiry={(id) => {
                navigate("Enquiries");
                setSelectedEnquiry(id);
              }}
              onPage={navigate}
            />
          ) : null}
          {[
            "Enquiries",
            "Quotations",
            "Customers",
            "Products & Stock",
            "Orders",
          ].includes(page) ? (
            <div className="list-toolbar">
              <label className="search">
                <Search aria-hidden />
                <input
                  aria-label={"Search " + page}
                  placeholder={"Search " + page.toLowerCase()}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {[
                "Enquiries",
                "Quotations",
                "Orders",
                "Products & Stock",
              ].includes(page) ? (
                <select
                  aria-label="Filter list"
                  value={listFilter}
                  onChange={(e) => setListFilter(e.target.value)}
                >
                  <option value="">
                    All{" "}
                    {page === "Products & Stock" ? "categories" : "statuses"}
                  </option>
                  {(page === "Enquiries"
                    ? [
                        "New",
                        "Needs information",
                        "Draft quote",
                        "Approved",
                        "Sent",
                        "Follow-up due",
                        "Won",
                        "Lost",
                      ]
                    : page === "Quotations"
                      ? ["Draft", "Approved", "Sent", "Superseded"]
                      : page === "Orders"
                        ? [
                            "Confirmed",
                            "Preparing",
                            "Dispatched",
                            "Delivered",
                            "Cancelled",
                          ]
                        : [
                            "Panel",
                            "Inverter",
                            "Battery",
                            "Mounting",
                            "Accessory",
                          ]
                  ).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              ) : null}
              <span className="muted">
                {page === "Products & Stock"
                  ? "Stock is a snapshot, not a live ERP connection."
                  : "Search applies to this list."}
              </span>
            </div>
          ) : null}
          {page === "Enquiries" ? (
            selectedEnquiry ? (
              <EnquiryDetail
                key={selectedEnquiry}
                e={state.enquiries.find((e) => e.id === selectedEnquiry)!}
                state={state}
                run={run}
                onBack={() => setSelectedEnquiry(null)}
                onQuote={(id) => {
                  navigate("Quotations");
                  setSelectedQuote(id);
                }}
              />
            ) : (
              <>
                <Table
                  headers={[
                    "Customer / requirement",
                    "Stage",
                    "Assigned to",
                    "Next action",
                    "Due",
                    "",
                  ]}
                >
                  {filtered(state.enquiries).map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>
                          {
                            state.customers.find((c) => c.id === e.customerId)
                              ?.company
                          }
                        </strong>
                        <small>
                          {e.items.map((i) => i.description).join(", ")}
                        </small>
                      </td>
                      <td>
                        <Tag text={e.status} />
                      </td>
                      <td>
                        {state.users.find((u) => u.id === e.assigned)?.name ||
                          "Unassigned"}
                      </td>
                      <td>{e.nextAction}</td>
                      <td>
                        <span className={e.due < today ? "overdue" : ""}>
                          {e.due}
                          {e.due < today ? " · Overdue" : ""}
                        </span>
                      </td>
                      <td>
                        <Button
                          variant="outline"
                          onClick={() => setSelectedEnquiry(e.id)}
                        >
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </Table>
                {!filtered(state.enquiries).length ? (
                  <Empty text="No enquiries match. Create an enquiry or clear your search." />
                ) : null}
              </>
            )
          ) : null}
          {page === "Quotations" ? (
            selectedQuote ? (
              <QuoteDetail
                key={selectedQuote}
                q={state.quotes.find((q) => q.id === selectedQuote)!}
                state={state}
                admin={admin}
                run={run}
                onBack={() => setSelectedQuote(null)}
                onRevision={setSelectedQuote}
              />
            ) : (
              <>
                <Table
                  headers={[
                    "Quotation",
                    "Customer",
                    "Status",
                    "Valid until",
                    "Total",
                    "",
                  ]}
                >
                  {filtered(state.quotes).map((q) => (
                    <tr key={q.id}>
                      <td>
                        <strong>{q.number}</strong>
                        <small>Revision {q.revision}</small>
                      </td>
                      <td>
                        {
                          state.customers.find((c) => c.id === q.customerId)
                            ?.company
                        }
                      </td>
                      <td>
                        <Tag text={q.status} />
                      </td>
                      <td>{q.validUntil}</td>
                      <td>
                        {safeTotal(q) === null
                          ? "Tax configuration needed"
                          : money(safeTotal(q)!)}
                      </td>
                      <td>
                        <Button
                          variant="outline"
                          onClick={() => setSelectedQuote(q.id)}
                        >
                          Open quote
                        </Button>
                      </td>
                    </tr>
                  ))}
                </Table>
                {!state.quotes.length ? (
                  <Empty text="No quotations yet. Review an enquiry and select catalogue products." />
                ) : null}
              </>
            )
          ) : null}
          {page === "Products & Stock" ? (
            <Catalogue
              state={state}
              products={filtered(state.products)}
              admin={admin}
              run={run}
            />
          ) : null}
          {page === "Customers" ? (
            <Customers
              state={state}
              customers={filtered(state.customers)}
              admin={admin}
              run={run}
            />
          ) : null}
          {page === "Invoices" ? (
            <Invoices
              state={state}
              admin={admin}
              run={run}
              onRefresh={async () => {
                setBusy(true);
                try {
                  const d = await request("/state");
                  setRaw(d.state);
                  setNotice("Invoice delivery status refreshed.");
                } catch {
                  setNotice("Status refresh failed. Try again.");
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : null}
          {page === "Orders" ? (
            <Orders
              state={state}
              orders={filtered(state.orders)}
              run={run}
              onInvoices={() => navigate("Invoices")}
            />
          ) : null}
          {page === "Settings" ? (
            <BusinessSettings
              state={state}
              admin={admin}
              run={run}
              onReset={async () => {
                try {
                  setRaw(await resetDemo());
                  setNotice("This browser's local workspace was cleared.");
                } catch (error) {
                  setNotice(error instanceof Error ? error.message : "Could not clear the local workspace.");
                }
              }}
            />
          ) : null}
        </main>
        <footer>
          Solar Sales Desk{" "}
          <span>
            Approved invoice email · Configurable taxes ·{" "}
            {live ? "Live workspace" : "Local database · external actions disabled"}
          </span>
        </footer>
      </div>
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="wide-dialog">
          <DialogHeader>
            <DialogTitle>Capture an enquiry</DialogTitle>
            <DialogDescription>
              Paste an enquiry, extract PDF text, or enter requirements
              manually.
            </DialogDescription>
          </DialogHeader>
          <NewEnquiry
            state={state}
            run={run}
            onDone={(id) => {
              setShowNew(false);
              navigate("Enquiries");
              setSelectedEnquiry(id);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
