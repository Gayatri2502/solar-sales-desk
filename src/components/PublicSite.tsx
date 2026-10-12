import { useEffect, useState } from "react";
import {
  Sun,
  ArrowRight,
  Check,
  PhoneCall,
  FileCheck,
  PackageCheck,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import { auth, live, type Session } from "../api";
import App from "../App";
import { Button } from "./ui/button";
const publicPages = new Set([
  "",
  "home",
  "public-main",
  "services",
  "how-it-works",
  "pricing",
  "faq",
  "login",
  "signup",
  "privacy",
  "reset-password",
  "update-password",
]);
function page() {
  try {
    return decodeURIComponent(location.hash.slice(1));
  } catch {
    return "home";
  }
}
export default function PublicSite() {
  const [route, setRoute] = useState(page),
    [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(!auth);
  const [sandbox, setSandbox] = useState(false);
  useEffect(() => {
    const f = () => setRoute(page());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  useEffect(() => {
    if (!auth) return;
    let active = true;
    auth.auth
      .getSession()
      .then(({ data }) => {
        if (active) {
          setSession(data.session);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setReady(true);
      });
    const listener = auth.auth.onAuthStateChange((_e, s) => {
      if (active) {
        setSession(s);
        setReady(true);
        if (_e === "PASSWORD_RECOVERY") location.hash = "update-password";
      }
    });
    return () => {
      active = false;
      listener.data.subscription.unsubscribe();
    };
  }, []);
  if (!ready)
    return (
      <main className="login">
        <p role="status">Checking your session…</p>
      </main>
    );
  if (!publicPages.has(route)) {
    if ((live && session) || (!live && sandbox)) return <App />;
    return (
      <AuthPage
        signup={false}
        onSandbox={() => {
          setSandbox(true);
          location.hash = "Dashboard";
        }}
      />
    );
  }
  if (
    route === "login" ||
    route === "signup" ||
    route === "reset-password" ||
    route === "update-password"
  )
    return (
      <AuthPage
        key={route}
        signup={route === "signup"}
        reset={route === "reset-password"}
        recovery={route === "update-password"}
        onSandbox={() => {
          setSandbox(true);
          location.hash = "Dashboard";
        }}
      />
    );
  if (route === "privacy")
    return (
      <div className="public-site">
        <PublicHeader signedIn={!!session} />
        <main className="public-section narrow">
          <h1>Business data and contact preferences</h1>
          <p>
            Your workspace contains customer contacts, product prices,
            enquiries, quotations, invoices and operational records. Business
            admins manage user access and data export/deletion.
          </p>
          <p>
            Configured messaging and voice providers receive the customer
            contact and conversation details needed for those services. Outbound
            contact requires permission, interest and an agreed call time.
            Quotes and invoices require admin approval before sending.
          </p>
          <p>
            Recording and provider retention settings must be reviewed with your
            business before calls are activated. AI extraction uses the
            configured server provider; uploaded PDF text is extracted locally
            and files are not uploaded by this application.
          </p>
          <p>
            Billing is manual during the pilot. Account creation does not
            activate a paid subscription. Contact the operator using the
            published business contact for support, privacy requests and
            cancellation.
          </p>
          <a href="#home">Back to home</a>
        </main>
      </div>
    );
  return <Landing signedIn={!!session} />;
}
function PublicHeader({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className="public-header">
      <a href="#home" className="public-brand">
        <Sun aria-hidden />
        <span>Solar Sales Desk</span>
      </a>
      <nav aria-label="Public navigation">
        <a href="#services">Services</a>
        <a href="#how-it-works">How it works</a>
        <a href="#pricing">Plans</a>
        <a className="public-login" href={signedIn ? "#Dashboard" : "#login"}>
          {signedIn ? "Open workspace" : "Log in"}
        </a>
        <a className="public-primary" href="#signup">
          Create account
        </a>
      </nav>
    </header>
  );
}
function Landing({ signedIn }: { signedIn: boolean }) {
  const contact = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;
  const plans = [
    {
      name: "Pilot",
      summary: "Start with a focused distributor workflow.",
      features: [
        "Catalogue and customer import",
        "Enquiries, quotes and order tracking",
        "Admin approvals and business reports",
        "Manual billing and onboarding",
      ],
    },
    {
      name: "Sales team",
      summary: "Keep your sales work and approvals in one place.",
      features: [
        "Admin and sales roles",
        "Assigned enquiries and follow-up dates",
        "Stock reservations and order invoices",
        "Weekly, monthly and yearly reports",
      ],
    },
    {
      name: "Automation",
      summary: "Connect customer conversations to your sales workflow.",
      features: [
        "WhatsApp qualification with permission",
        "Customer-agreed voice appointments",
        "Captured requirements for staff review",
        "Configured usage limits and spending controls",
      ],
    },
  ];
  return (
    <div className="public-site">
      <a className="skip" href="#public-main">
        Skip to content
      </a>
      <PublicHeader signedIn={signedIn} />
      <main id="public-main">
        <section className="public-hero">
          <div>
            <p className="eyebrow">FOR SOLAR EQUIPMENT DISTRIBUTORS</p>
            <h1>
              From first enquiry
              <br />
              to an approved sale.
            </h1>
            <p className="hero-copy">
              Keep customer requirements, catalogue products, quotations,
              follow-ups and orders together. Give your team a clear next action
              and keep customer pricing under admin control.
            </p>
            <div className="public-actions">
              <a className="public-primary" href="#signup">
                Create your account <ArrowRight aria-hidden />
              </a>
              <a href="#how-it-works">Explore the workflow</a>
            </div>
            <p className="public-fine">
              INR pricing · Configurable taxes · Email and password access
            </p>
          </div>
          <div className="workflow-preview" aria-label="Sales workflow">
            <p className="eyebrow">ONE CONNECTED WORKFLOW</p>
            {[
              "Capture the enquiry",
              "Confirm products and quantities",
              "Prepare the quotation",
              "Get admin approval",
              "Track follow-up and acceptance",
              "Reserve stock and create the invoice",
            ].map((s, n) => (
              <div key={s}>
                <span>{String(n + 1).padStart(2, "0")}</span>
                <strong>{s}</strong>
                {n === 3 ? <ShieldCheck aria-label="Approval gate" /> : null}
              </div>
            ))}
            <p>Quotes and invoices stay under human approval.</p>
          </div>
        </section>
        <section className="public-section" id="services">
          <p className="eyebrow">WHAT YOUR TEAM CAN MANAGE</p>
          <h2>Software built around the solar sales desk.</h2>
          <div className="public-feature-grid">
            {[
              {
                icon: PhoneCall,
                title: "Customer enquiries",
                text: "Capture contacts and requirements from forms or manually entered messages. Schedule calls after interest and permission are confirmed.",
              },
              {
                icon: FileCheck,
                title: "Accurate quotations",
                text: "Select catalogue products and calculate quantities, discounts, configured taxes and delivery charges with ordinary code.",
              },
              {
                icon: PackageCheck,
                title: "Orders and invoices",
                text: "Convert accepted quotes, reserve stock and track dispatch. Submit order invoices for admin approval before email delivery.",
              },
              {
                icon: BarChart3,
                title: "Reports and follow-ups",
                text: "Review conversion, order value, call outcomes and recorded expenses. Give each enquiry an owner and a next action.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <Icon aria-hidden />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="public-section public-tinted" id="how-it-works">
          <p className="eyebrow">HOW IT WORKS</p>
          <h2>A clear handoff at every stage.</h2>
          <ol className="public-steps">
            {[
              [
                "Set up your business",
                "Add your business details, tax settings, users and catalogue. Import products and customers using validated CSV files.",
              ],
              [
                "Capture and qualify",
                "Record the enquiry, confirm interest and agree a suitable call time. WhatsApp and voice automation operate through configured providers.",
              ],
              [
                "Review requirements",
                "Check captured products, specifications, quantities and delivery needs. Staff choose ambiguous catalogue matches.",
              ],
              [
                "Quote and approve",
                "Prepare the quotation using exact money calculations. Admin reviews it before your team shares it with the customer.",
              ],
              [
                "Follow up and close",
                "Record the next action, customer acceptance and order. Stock reservations prevent competing orders from using the same stock.",
              ],
              [
                "Invoice and report",
                "Review the draft invoice, submit it and get admin approval. Configured email delivery submits the approved invoice to the customer; reports show recorded outcomes.",
              ],
            ].map(([title, text]) => (
              <li key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="public-section" id="pricing">
          <p className="eyebrow">SUBSCRIPTIONS</p>
          <h2>Choose a scope. Agree the price before activation.</h2>
          <p>
            Monthly fees, seats and usage allowances are agreed in writing.
            Pilot billing is manual; creating an account does not charge you or
            start a paid renewal.
          </p>
          <div className="public-plan-grid">
            {plans.map((p) => (
              <article key={p.name}>
                <h3>{p.name}</h3>
                <p>{p.summary}</p>
                <strong className="plan-price">Contact for pricing</strong>
                <ul>
                  {p.features.map((f) => (
                    <li key={f}>
                      <Check aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <a className="public-primary" href="#signup">
                  Request {p.name.toLowerCase()} setup
                </a>
              </article>
            ))}
          </div>
          <p className="public-fine">
            Calling, WhatsApp, AI, email delivery and infrastructure allowances
            are stated separately in your agreement. No unlimited usage promise.
            Automation depends on provider configuration and number approval.
            Cancellation and renewal are handled by the operator under your
            agreed terms.
          </p>
        </section>
        <section className="public-section public-tinted" id="faq">
          <h2>Before you start</h2>
          <div className="public-faq">
            {[
              [
                "Does the app send unapproved quotations or invoices?",
                "No. Approval is required. A revision removes approval. Invoice delivery is triggered only after the reviewed invoice is approved by admin.",
              ],
              [
                "Is this an accounting or installation service?",
                "The application supports equipment sales and follow-up. It does not verify cash collection, provide an accounting ledger or claim product/site compatibility. Installation enquiries can be handed to staff.",
              ],
              [
                "Can I connect WhatsApp and calls?",
                "Yes, through configured business messaging and voice providers. Contact permission, approved sender numbers, usage allowances and provider costs are reviewed before activation.",
              ],
              [
                "What happens when an allowance runs out?",
                "Automated work stops or waits; staff can continue manually. Provider billing can lag application estimates. Your limits and agreed fee remain visible in business settings.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="public-section public-contact">
          <h2>Bring your sales workflow into one workspace.</h2>
          <a className="public-primary" href="#signup">
            Create account
          </a>
          {contact ? (
            <a href={"mailto:" + contact}>Contact {contact}</a>
          ) : (
            <p>
              Submit your business details when you create an account. The
              operator confirms onboarding and the agreed plan.
            </p>
          )}
        </section>
      </main>
      <footer className="public-footer">
        <a href="#home">Solar Sales Desk</a>
        <a href="#privacy">Data and contact preferences</a>
        <a href="#login">Log in</a>
      </footer>
    </div>
  );
}
function AuthPage({
  signup,
  reset = false,
  recovery = false,
  onSandbox,
}: {
  signup: boolean;
  reset?: boolean;
  recovery?: boolean;
  onSandbox: () => void;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [business, setBusiness] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const configured = live && !!auth;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!configured)
        throw Error(
          "Account access is not configured on this installation. The operator must connect authentication before signup or login is available.",
        );
      if (recovery) {
        const r = await auth!.auth.updateUser({ password });
        if (r.error)
          throw Error(
            "Password update failed. Open a valid recovery link or contact your admin.",
          );
        await auth!.auth.signOut();
        setMessage("Password updated. Log in with your new password.");
      } else if (reset) {
        const r = await auth!.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + "/#login",
        });
        if (r.error) throw r.error;
        setMessage(
          "If this address has an account, a recovery email will be sent. Contact your admin if email recovery is not configured.",
        );
      } else if (signup) {
        const r = await auth!.auth.signUp({
          email,
          password,
          options: {
            data: { business_name: business },
            emailRedirectTo: location.origin + "/#Dashboard",
          },
        });
        if (r.error) throw r.error;
        if (r.data.session) {
          location.hash = "Dashboard";
        } else {
          setMessage(
            "Check your email to confirm your account, then log in. Creating an account does not activate a paid subscription.",
          );
        }
      } else {
        const r = await auth!.auth.signInWithPassword({ email, password });
        if (r.error)
          throw Error(
            "Login failed. Check your email, password and email confirmation.",
          );
        location.hash = "Dashboard";
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="public-site">
      <PublicHeader />
      <main className="auth-layout">
        <div className="auth-intro">
          <p className="eyebrow">SOLAR SALES DESK</p>
          <h1>
            {reset
              ? "Recover access"
              : signup
                ? "Set up your sales workspace."
                : "Welcome back."}
          </h1>
          <p>
            {signup
              ? "Create a business account, then configure your catalogue, team and approval workflow. No payment is taken during signup."
              : "Sign in to manage enquiries, quotations, orders and approved invoices."}
          </p>
          <a href="#home">Back to the website</a>
        </div>
        <section className="auth-card">
          <h2>
            {recovery
              ? "Choose a new password"
              : reset
                ? "Password recovery"
                : signup
                  ? "Create account"
                  : "Log in"}
          </h2>
          <form onSubmit={submit} aria-busy={busy}>
            {signup && (
              <label>
                Business name
                <input
                  required
                  maxLength={200}
                  value={business}
                  onChange={(e) => setBusiness(e.target.value)}
                  autoComplete="organization"
                />
              </label>
            )}
            {!recovery && (
              <label>
                Email address
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-describedby={error ? "auth-error" : undefined}
                />
              </label>
            )}
            {!reset && (
              <label>
                Password
                <input
                  required
                  type="password"
                  minLength={signup || recovery ? 12 : 1}
                  maxLength={100}
                  autoComplete={
                    signup || recovery ? "new-password" : "current-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby={signup ? "password-help" : undefined}
                />
                {signup && (
                  <small id="password-help">Use at least 12 characters.</small>
                )}
              </label>
            )}
            {error && (
              <p id="auth-error" className="warning" role="alert">
                {error}
              </p>
            )}
            {message && <p role="status">{message}</p>}
            <Button disabled={busy}>
              {busy
                ? "Please wait…"
                : recovery
                  ? "Save new password"
                  : reset
                    ? "Send recovery email"
                    : signup
                      ? "Create account"
                      : "Log in"}
            </Button>
          </form>
          <p>
            {signup ? "Already have an account?" : "New to Solar Sales Desk?"}{" "}
            <a href={signup ? "#login" : "#signup"}>
              {signup ? "Log in" : "Create account"}
            </a>
          </p>
          {!signup && !reset && (
            <a href="#reset-password">Forgot your password?</a>
          )}
          <p className="public-fine">
            <a href="#privacy">Data and contact preferences</a>. Paid services
            require a separate agreed plan and activation.
          </p>
          {!configured && (
            <details className="operator-access">
              <summary>Local testing access</summary>
              <p>
                Authentication is not connected. The isolated synthetic
                workspace makes no live calls or sends.
              </p>
              <Button variant="outline" onClick={onSandbox}>
                Open synthetic test workspace
              </Button>
            </details>
          )}
        </section>
      </main>
    </div>
  );
}
