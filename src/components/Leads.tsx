import { useState } from "react";
import { type State, type Extraction, mockExtract } from "../domain";
import { callQuestions, callTime, scheduledInstant, type Lead } from "../leads";
import { live, request } from "../api";
import { Button } from "./ui/button";
import { FieldInput, Table, Tag, type Run } from "./shared";

type Props = { state: State; run: Run; onEnquiry: (id: string) => void };
export default function Leads({ state, run, onEnquiry }: Props) {
  const [selected, setSelected] = useState("");
  const [customerId, setCustomer] = useState(state.customers[0]?.id || "");
  const [source, setSource] = useState("Website form");
  const [reference, setReference] = useState("");
  const [whatsapp, setWhatsApp] = useState("");
  const [permission, setPermission] = useState("");
  const [error, setError] = useState("");
  const leads = state.leads || [];
  const lead = leads.find((l) => l.id === selected);
  const jobs = state.communicationJobs||[];
  const due = leads.filter(
    (l) => l.status === "Scheduled" && Date.parse(l.scheduledAt) <= Date.now(),
  );
  return (
    <>
      <section className="panel">
        <h2>Qualification → scheduled call → reviewed enquiry</h2>
        <p>
          Capture contact details in Customers, then add the lead here. A phone
          number alone is not permission to message or call.
        </p>
        <div className="form-grid">
          <p>
            <strong>Communication allowance is configured in Settings</strong>
            <br />
            {live?"Provider access, approved sender IDs and estimated usage limits are checked before outbound contact.":"Synthetic test calls make no outbound network request."}
          </p>
          <p>
            <strong>{due.length} calls due</strong>
            <br />
            {live?(state.communicationPolicy?.autoCalls?"Automatic due-call processing is enabled by admin; server provider activation is also required.":"Automatic calling is off. Admin can configure it in Settings."):"Up to two due appointments can be simulated per run."}
          </p>
        </div>
        {!live ? (
          <Button
            disabled={!due.length}
            onClick={() => run({ type: "lead.simulateDue" })}
          >
            Run due demo calls
          </Button>
        ) : null}
        {!live&&<p className="muted">Synthetic answers are only for local testing; they are not customer conversations.</p>}
      </section>
      <section className="panel">
        <h2>Add a lead</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            const next = await run({
              type: "lead.capture",
              lead: {
                customerId,
                source,
                sourceReference: reference,
                whatsapp,
                whatsappConsent: permission,
                notes: "",
              },
            });
            if (next) {
              setSelected(next.leads?.[0]?.id || "");
              setReference("");
            }
          }}
        >
          <div className="form-grid">
            <label>
              Customer
              <select
                aria-label="Lead customer"
                required
                value={customerId}
                onChange={(e) => setCustomer(e.target.value)}
              >
                <option value="">Select customer</option>
                {state.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company} · {c.contact}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Source
              <select
                aria-label="Lead source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                {[
                  "Website form",
                  "WhatsApp",
                  "Facebook",
                  "Instagram",
                  "Other",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <FieldInput
              label="Source record reference (optional)"
              value={reference}
              onChange={setReference}
            />
            <FieldInput
              label="WhatsApp number (international format, optional)"
              value={whatsapp}
              onChange={setWhatsApp}
            />
            <FieldInput
              label="WhatsApp permission evidence (customer response, source and date)"
              value={permission}
              onChange={setPermission}
            />
          </div>
          <Button disabled={!customerId}>Capture lead</Button>
        </form>
        {error ? <p role="alert">{error}</p> : null}
      </section>
      <section className="panel">
        <h2>Lead and call queue</h2>
        <Table headers={["Customer / source", "Stage", "Call time", "Action"]}>
          {leads.map((l) => (
            <tr key={l.id}>
              <td>
                {state.customers.find((c) => c.id === l.customerId)?.company}
                <small>
                  {l.source} · {l.sourceReference || "Manual capture"}
                </small>
              </td>
              <td>
                <Tag text={l.status === "Converted" ? "Enquiry created" : l.status} />
                {l.interest === "Services" ? (
                  <small>Staff service handoff</small>
                ) : null}
              </td>
              <td>{callTime(l.scheduledAt, state.settings.timezone)}</td>
              <td>
                <Button variant="outline" onClick={() => setSelected(l.id)}>
                  Review lead
                </Button>
              </td>
            </tr>
          ))}
        </Table>
        {!leads.length ? (
          <p>
            No leads yet. Capture one above; imported leads are not contacted
            automatically.
          </p>
        ) : null}
      </section>
      {jobs.length?<section className="panel"><h2>Outbound contact history</h2><Table headers={["Channel","Status","Provider reference","Receipt","Estimate / review"]}>{jobs.map(j=><tr key={j.id}><td>{j.kind}</td><td>{j.status}</td><td>{j.providerId||"Not confirmed"}</td><td>{j.receipt||"Not confirmed"}</td><td>{j.error||"Actual billing is reported separately."}</td></tr>)}</Table></section>:null}
      {lead ? (
        <LeadDetail
          key={lead.id + lead.updatedAt}
          lead={lead}
          state={state}
          run={run}
          onEnquiry={onEnquiry}
        />
      ) : null}
    </>
  );
}
function LeadDetail({
  lead: l,
  state,
  run,
  onEnquiry,
}: { lead: Lead } & Props) {
  const [response, setResponse] = useState("Products");
  const [evidence, setEvidence] = useState("");
  const [at, setAt] = useState("");
  const [consent, setConsent] = useState(l.callConsent);
  const [language, setLanguage] = useState(l.language);
  const [text, setText] = useState(l.requirements);
  const [parsed, setParsed] = useState<Extraction | null>(null);
  const [error, setError] = useState("");
  const customer = state.customers.find((c) => c.id === l.customerId);
  const qualification = `Hello ${customer?.contact || "there"}, this is ${state.settings.name}. You contacted us about solar equipment. Are you looking for products or installation/service? If interested, may we arrange a call at a time and language you choose? You can ask us to stop contacting you.`;
  return (
    <section className="panel">
      <h2>{customer?.company} · lead review</h2>
      <p>
        {customer?.phone || "Phone missing"} ·{" "}
        {customer?.email || "Email missing"} · WhatsApp:{" "}
        {l.whatsapp || "Not recorded"}
      </p>
      <p>
        <Tag text={l.status === "Converted" ? "Enquiry created" : l.status} /> {l.notes}
      </p>
      {l.status === "Converted" ? (
        <Button onClick={() => onEnquiry(l.enquiryId)}>
          Open linked enquiry
        </Button>
      ) : (
        <>
          <h3>1. Confirm interest and contact permission</h3>
          {live&&<Button variant="outline" disabled={!l.whatsappConsent||!l.whatsapp} onClick={()=>run({type:"contact.whatsapp",id:l.id})}>Send approved WhatsApp qualification template</Button>}
          <p>
            Prepared WhatsApp text — review and send deliberately using your
            approved channel. This app has not sent it.
          </p>
          <blockquote>{qualification}</blockquote>
          <Button
            variant="outline"
            disabled={!l.whatsappConsent || !l.whatsapp}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(qualification);
              } catch {
                setError(
                  "Copy unavailable. Select the prepared text manually.",
                );
              }
            }}
          >
            Copy qualification message
          </Button>
          <div className="form-grid">
            <label>
              Customer response
              <select
                aria-label="Qualification response"
                value={response}
                onChange={(e) => setResponse(e.target.value)}
              >
                {[
                  "Awaiting reply",
                  "Products",
                  "Services",
                  "Not interested",
                  "Opted out",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <FieldInput
              label="Response evidence (customer wording, date and source)"
              value={evidence}
              onChange={setEvidence}
            />
          </div>
          <Button
            disabled={!evidence || l.status === "Opted out"}
            onClick={() =>
              run({ type: "lead.qualify", id: l.id, response, evidence })
            }
          >
            Record response
          </Button>
          <h3>2. Schedule the customer-agreed call</h3>
          <p>
            Call time is interpreted in {state.settings.timezone}. A scheduled
            time and explicit call permission are required. Rescheduling
            replaces the existing pending time.
          </p>
          <div className="form-grid">
            <FieldInput
              label={"Call time (" + state.settings.timezone + ")"}
              type="datetime-local"
              value={at}
              onChange={setAt}
            />
            <FieldInput
              label="Call permission and agreed time evidence"
              value={consent}
              onChange={setConsent}
            />
            <FieldInput
              label="Preferred conversation language"
              value={language}
              onChange={setLanguage}
            />
          </div>
          <Button
            disabled={
              !["Qualified", "Scheduled"].includes(l.status) || !at || !consent
            }
            onClick={async () => {
              try {
                await run({
                  type: "lead.schedule",
                  id: l.id,
                  at: scheduledInstant(at, state.settings.timezone),
                  consent,
                  language,
                });
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Save call appointment
          </Button>
          <p>{callTime(l.scheduledAt, state.settings.timezone)}</p>
          {live&&<Button variant="outline" disabled={l.status!=="Scheduled"||!l.callConsent||Date.parse(l.scheduledAt)>Date.now()} onClick={()=>run({type:"contact.voice",id:l.id})}>Start agreed call now</Button>}
          <h3>3. Capture and review requirements</h3>
          <p>
            Review captured conversation text before matching products. Staff can also enter notes manually. Customer text is untrusted input.
          </p>
          <details>
            <summary>Call guide</summary>
            <ol>
              {callQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
          </details>
          <label>
            Conversation requirements
            <textarea
              aria-label="Conversation requirements"
              maxLength={12000}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setParsed(null);
              }}
            />
          </label>
          <div className="toolbar">
            <Button
              disabled={
                !text ||
                !["Qualified", "Scheduled", "Details captured"].includes(
                  l.status,
                )
              }
              onClick={() => run({ type: "lead.requirements", id: l.id, text })}
            >
              Save conversation details
            </Button>
            <Button
              variant="outline"
              disabled={!text || l.interest !== "Products"}
              onClick={async () => {
                try {
                  setParsed(live?(await request("/extract",{text})).extraction:mockExtract(text));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Review extracted items
            </Button>
          </div>
          {l.interest === "Services" ? (
            <p>
              Service work needs staff review. The current catalogue covers
              products; no installation quotation or compatibility promise is
              generated.
            </p>
          ) : null}
          {parsed ? (
            <>
              <h3>Review before creating the enquiry</h3>
              {parsed.items.map((item, i) => (
                <div className="form-grid" key={i}>
                  <FieldInput
                    label={"Item " + (i + 1) + " description"}
                    value={item.description}
                    onChange={(v) =>
                      setParsed({
                        ...parsed,
                        items: parsed.items.map((x, n) =>
                          n === i ? { ...x, description: v } : x,
                        ),
                      })
                    }
                  />
                  <FieldInput
                    label={"Item " + (i + 1) + " quantity"}
                    value={item.quantity || ""}
                    onChange={(v) =>
                      setParsed({
                        ...parsed,
                        items: parsed.items.map((x, n) =>
                          n === i ? { ...x, quantity: v || null } : x,
                        ),
                      })
                    }
                  />
                  <FieldInput
                    label={"Item " + (i + 1) + " unit"}
                    value={item.unit || ""}
                    onChange={(v) =>
                      setParsed({
                        ...parsed,
                        items: parsed.items.map((x, n) =>
                          n === i ? { ...x, unit: v || null } : x,
                        ),
                      })
                    }
                  />
                  <FieldInput
                    label={"Item " + (i + 1) + " specifications"}
                    value={item.specifications}
                    onChange={(v) =>
                      setParsed({
                        ...parsed,
                        items: parsed.items.map((x, n) =>
                          n === i ? { ...x, specifications: v } : x,
                        ),
                      })
                    }
                  />
                </div>
              ))}
              <div className="form-grid">
                <FieldInput
                  label="Delivery destination"
                  value={parsed.destination}
                  onChange={(v) => setParsed({ ...parsed, destination: v })}
                />
                <FieldInput
                  label="Requested delivery date"
                  value={parsed.requestedDate}
                  onChange={(v) => setParsed({ ...parsed, requestedDate: v })}
                />
              </div>
              <p>
                Missing quantities, technical details and delivery requirements
                will be flagged for staff. Catalogue selection is required;
                totals are calculated in code. No quotation is sent here.
              </p>
              <Button
                disabled={l.status !== "Details captured"}
                onClick={async () => {
                  const missing = parsed.items.flatMap((x, i) =>
                    !x.quantity || !x.unit
                      ? ["Item " + (i + 1) + ": confirm quantity and unit"]
                      : [],
                  );
                  if (!parsed.destination)
                    missing.push("Confirm delivery destination");
                  if (!parsed.requestedDate)
                    missing.push("Confirm requested delivery date");
                  missing.push(
                    "Verify technical specifications and product suitability with staff",
                  );
                  const next = await run({
                    type: "lead.promote",
                    id: l.id,
                    extraction: { ...parsed, missing },
                  });
                  const created = next?.leads?.find(
                    (x) => x.id === l.id,
                  )?.enquiryId;
                  if (created) onEnquiry(created);
                }}
              >
                Create reviewed enquiry
              </Button>
              <p>
                Save conversation details first, then review items. Approved
                quotations proceed through the existing sent/follow-up/order
                workflow.
              </p>
            </>
          ) : null}
        </>
      )}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
