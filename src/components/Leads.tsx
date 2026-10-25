import { useState } from "react";
import { type State, type Extraction, mockExtract, uid } from "../domain";
import { callQuestions, callTime, scheduledInstant, type Lead, type SolarProfile } from "../leads";
import { live, request } from "../api";
import { Button } from "./ui/button";
import { FieldInput, Table, Tag, type Run } from "./shared";
import { BarGraph } from "./ReportGraphs";
import { Search } from "lucide-react";

type Props = { state: State; run: Run; onEnquiry: (id: string) => void };
export default function Leads({ state, run, onEnquiry }: Props) {
  const [selected, setSelected] = useState("");
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [source, setSource] = useState("Website form");
  const [reference, setReference] = useState("");
  const [whatsapp, setWhatsApp] = useState("");
  const [permission, setPermission] = useState("");
  const [solarProfile, setSolarProfile] = useState<SolarProfile>(blankSolarProfile());
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("All stages");
  const leads = state.leads || [];
  const stages = Array.from(new Set(leads.map((item) => item.status))).sort();
  const filteredLeads = leads.filter((item) => {
    const customer = state.customers.find((record) => record.id === item.customerId);
    const term = search.trim().toLocaleLowerCase();
    const matchesSearch = !term || [customer?.company, customer?.contact, customer?.phone, customer?.email, item.source, item.sourceReference]
      .some((value) => value?.toLocaleLowerCase().includes(term));
    return matchesSearch && (stageFilter === "All stages" || item.status === stageFilter);
  });
  const lead = leads.find((l) => l.id === selected);
  const jobs = state.communicationJobs||[];
  return (
    <>
      <section className="panel lead-overview">
        <div>
          <h2>Lead work queue</h2>
          <p className="muted">Capture customer requirements, review agreed callbacks, and move qualified opportunities into enquiries.</p>
        </div>
        <div className="lead-kpis" aria-label="Lead activity summary">
          <span><strong>{leads.length}</strong> contacts</span>
          <span><strong>{leads.filter(l=>["Qualified","Scheduled","Details captured"].includes(l.status)).length}</strong> qualified or in progress</span>
          <span><strong>{jobs.filter(j=>j.kind==="Voice").length}</strong> call attempts logged</span>
        </div>
      </section>
      <details className="panel lead-capture">
        <summary><span>Add a contact</span><small>Customer, source and solar requirements</small></summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            const existing = state.customers.find(c => c.phone.trim() === phone.trim());
            const openLead = existing && leads.find(l => l.customerId === existing.id && !["Converted", "Not interested", "Opted out"].includes(l.status));
            if (openLead) { setSelected(openLead.id); setError("This contact already has an open lead. It is selected below for updating."); return; }
            const customerId = existing?.id || uid();
            const savedCustomer = await run({ type: "customer.save", customer: { id: customerId, company, contact, phone, email, address, gstin: existing?.gstin || "", notes: existing?.notes || "", priceList: existing?.priceList || {} } });
            if (!savedCustomer) return;
            const next = await run({
              type: "lead.capture",
              lead: {
                customerId,
                source,
                sourceReference: reference,
                whatsapp,
                whatsappConsent: permission,
                notes: "",
                solarProfile,
              },
            });
            if (next) {
              setSelected(next.leads?.[0]?.id || "");
              setCompany(""); setContact(""); setPhone(""); setEmail(""); setAddress("");
              setReference("");
              setWhatsApp(""); setPermission(""); setSolarProfile(blankSolarProfile());
            }
          }}
        >
          <div className="form-grid">
            <FieldInput label="Company / customer" value={company} onChange={setCompany} required />
            <FieldInput label="Contact name" value={contact} onChange={setContact} required />
            <FieldInput label="Phone (international format, e.g. +91…)" value={phone} onChange={setPhone} required />
            <FieldInput label="Email (optional)" type="email" value={email} onChange={setEmail} />
            <FieldInput label="Address / delivery location (optional)" value={address} onChange={setAddress} />
            <label>
              Source
              <select
                aria-label="Lead source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                {[
                  "Website form",
                  "CSV import",
                  "CRM",
                  "Campaign",
                  "Manual",
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
              label="WhatsApp number (optional)"
              value={whatsapp}
              onChange={setWhatsApp}
            />
            <p className="field-hint">Enter an Indian 10-digit number or an international number with country code. Spaces, brackets and dashes are accepted.</p>
            <FieldInput
              label="WhatsApp permission evidence (customer response, source and date)"
              value={permission}
              onChange={setPermission}
            />
          </div>
          <details className="lead-requirements">
            <summary>Solar requirement details <small>Leave unknown items blank; confirm with the customer.</small></summary>
            <div className="form-grid">
              <label>Customer category<select aria-label="Customer category" value={solarProfile.customerType} onChange={e=>setSolarProfile({...solarProfile,customerType:e.target.value as SolarProfile["customerType"]})}>{["Residential","Commercial","Industrial","Other"].map(x=><option key={x}>{x}</option>)}</select></label>
              <FieldInput label="Monthly electricity bill (₹, as stated)" value={solarProfile.monthlyBill} onChange={v=>setSolarProfile({...solarProfile,monthlyBill:v})}/>
              <FieldInput label="Average consumption (unit and period)" value={solarProfile.monthlyConsumption} onChange={v=>setSolarProfile({...solarProfile,monthlyConsumption:v})}/>
              <FieldInput label="Property type" value={solarProfile.propertyType} onChange={v=>setSolarProfile({...solarProfile,propertyType:v})}/>
              <label>Property ownership<select aria-label="Property ownership" value={solarProfile.ownership} onChange={e=>setSolarProfile({...solarProfile,ownership:e.target.value as SolarProfile["ownership"]})}>{["Unknown","Owner","Tenant"].map(x=><option key={x}>{x}</option>)}</select></label>
              <FieldInput label="Installation location" value={solarProfile.siteLocation} onChange={v=>setSolarProfile({...solarProfile,siteLocation:v})}/>
              <FieldInput label="Usable roof area (unit as stated)" value={solarProfile.roofArea} onChange={v=>setSolarProfile({...solarProfile,roofArea:v})}/>
              <FieldInput label="Roof type" value={solarProfile.roofType} onChange={v=>setSolarProfile({...solarProfile,roofType:v})}/>
              <FieldInput label="Shading / site constraints" value={solarProfile.shading} onChange={v=>setSolarProfile({...solarProfile,shading:v})}/>
              <FieldInput label="Desired system capacity (kW, if known)" value={solarProfile.systemCapacity} onChange={v=>setSolarProfile({...solarProfile,systemCapacity:v})}/>
              <label>System preference<select aria-label="System preference" value={solarProfile.systemType} onChange={e=>setSolarProfile({...solarProfile,systemType:e.target.value as SolarProfile["systemType"]})}>{["Unknown","On-grid","Off-grid","Hybrid"].map(x=><option key={x}>{x}</option>)}</select></label>
              <FieldInput label="Battery backup requirement" value={solarProfile.batteryBackup} onChange={v=>setSolarProfile({...solarProfile,batteryBackup:v})}/>
              <FieldInput label="Budget (₹, as stated)" value={solarProfile.budget} onChange={v=>setSolarProfile({...solarProfile,budget:v})}/>
              <FieldInput label="Financing requirement" value={solarProfile.financing} onChange={v=>setSolarProfile({...solarProfile,financing:v})}/>
              <FieldInput label="Purchase timeline" value={solarProfile.timeline} onChange={v=>setSolarProfile({...solarProfile,timeline:v})}/>
              <FieldInput label="Decision-making status" value={solarProfile.decisionStatus} onChange={v=>setSolarProfile({...solarProfile,decisionStatus:v})}/>
              <FieldInput label="Site survey availability" value={solarProfile.surveyAvailability} onChange={v=>setSolarProfile({...solarProfile,surveyAvailability:v})}/>
              <label className="checkbox-field"><input type="checkbox" checked={solarProfile.subsidyInterest} onChange={e=>setSolarProfile({...solarProfile,subsidyInterest:e.target.checked})}/> Asked about subsidy information</label>
            </div>
            <p className="muted">Subsidy eligibility, savings and payback are not estimated here. Verify current program rules and source documents before advising a customer.</p>
          </details>
          <Button disabled={!company.trim() || !contact.trim() || !phone.trim()}>Save contact and capture lead</Button>
        </form>
        {error ? <p role="alert">{error}</p> : null}
      </details>
      <section className="panel">
        <div className="section-heading lead-table-heading">
          <div><h2>Lead and call queue</h2><p className="muted">{filteredLeads.length} of {leads.length} contacts</p></div>
          <div className="lead-table-filters">
            <label className="search lead-search"><Search aria-hidden /><input aria-label="Search leads" placeholder="Search name, phone, email or source" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label className="sr-only" htmlFor="lead-stage-filter">Filter leads by stage</label>
            <select id="lead-stage-filter" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option>All stages</option>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select>
          </div>
        </div>
        <Table headers={["Customer / contact", "Source", "Stage", "Readiness", "Call status / time", "Action"]}>
          {filteredLeads.map((l) => (
            <tr key={l.id}>
              <td>
                {state.customers.find((c) => c.id === l.customerId)?.company}
                <small>{state.customers.find((c) => c.id === l.customerId)?.contact} · {state.customers.find((c) => c.id === l.customerId)?.phone}</small>
              </td>
              <td>{l.source}<small>{l.sourceReference || "Manual capture"}</small></td>
              <td>
                <Tag text={l.status === "Converted" ? "Enquiry created" : l.status} />
                {l.interest === "Services" ? (
                  <small>Staff service handoff</small>
                ) : null}
              </td>
              <td>{readiness(l)}<small>Not a purchase probability</small></td>
              <td>{jobs.filter(j=>j.leadId===l.id&&j.kind==="Voice").at(-1)?.status || (state.callRecords?.filter(c=>c.leadId===l.id).length ? "Call logged" : "No call yet")}<small>{callTime(l.scheduledAt, state.settings.timezone)}</small></td>
              <td>
                <div className="toolbar">
                  <Button variant="outline" onClick={() => setSelected(l.id)}>Review lead</Button>
                  {live ? <Button disabled={l.status!=="Scheduled" || !l.callConsent || Date.parse(l.scheduledAt)>Date.now()} onClick={() => run({type:"contact.voice",id:l.id})}>Trigger agreed call</Button> : <Button variant="outline" disabled title="Connect and verify a calling provider to enable calls">Calling unavailable</Button>}
                </div>
              </td>
            </tr>
          ))}
        </Table>
        {!leads.length ? <p className="empty">No leads yet. Capture one above; imported leads are not contacted automatically.</p> : null}
        {leads.length > 0 && !filteredLeads.length ? <p className="empty">No leads match these filters. Clear the search or choose another stage.</p> : null}
      </section>
      <details className="panel lead-analytics"><summary>Pipeline overview <small>Current stage counts; no conversion prediction until outcome data is available.</small></summary><BarGraph title="Lead stages" rows={[
        {label:"Captured / awaiting reply",value:leads.filter(l=>["Captured","Awaiting reply"].includes(l.status)).length},
        {label:"Qualified",value:leads.filter(l=>l.status==="Qualified").length},
        {label:"Agreed call scheduled",value:leads.filter(l=>l.status==="Scheduled").length},
        {label:"Details captured",value:leads.filter(l=>l.status==="Details captured").length},
        {label:"Converted to enquiry",value:leads.filter(l=>l.status==="Converted").length},
      ]} /></details>
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
function blankSolarProfile(): SolarProfile {
  return { customerType: "Residential", monthlyBill: "", monthlyConsumption: "", propertyType: "", ownership: "Unknown", siteLocation: "", roofArea: "", roofType: "", shading: "", systemCapacity: "", systemType: "Unknown", batteryBackup: "", budget: "", financing: "", timeline: "", decisionStatus: "", subsidyInterest: false, surveyAvailability: "" };
}
function readiness(l: Lead) {
  if (l.status === "Converted") return "Enquiry created";
  if (l.status === "Details captured") return "Details captured";
  if (l.status === "Scheduled") return "Call agreed";
  if (l.status === "Qualified") return "Qualified";
  if (["Not interested", "Opted out"].includes(l.status)) return "Closed";
  return "Needs qualification";
}
function LeadDetail({
  lead: l,
  state,
  run,
  onEnquiry,
}: { lead: Lead } & Props) {
  const [response, setResponse] = useState("Products");
  const [evidence, setEvidence] = useState("");
  const [whatsappEvidence, setWhatsAppEvidence] = useState(l.whatsappConsent);
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
      {l.solarProfile && <dl className="solar-profile-summary">{([
        ["Category", l.solarProfile.customerType], ["Monthly bill", l.solarProfile.monthlyBill && `₹${l.solarProfile.monthlyBill}`], ["Consumption", l.solarProfile.monthlyConsumption], ["Property", l.solarProfile.propertyType], ["Ownership", l.solarProfile.ownership !== "Unknown" && l.solarProfile.ownership], ["Location", l.solarProfile.siteLocation], ["Roof area", l.solarProfile.roofArea], ["Roof / shading", [l.solarProfile.roofType,l.solarProfile.shading].filter(Boolean).join(" · ")], ["Capacity", l.solarProfile.systemCapacity], ["System", l.solarProfile.systemType !== "Unknown" && l.solarProfile.systemType], ["Battery", l.solarProfile.batteryBackup], ["Budget", l.solarProfile.budget && `₹${l.solarProfile.budget}`], ["Financing", l.solarProfile.financing], ["Timeline", l.solarProfile.timeline], ["Decision status", l.solarProfile.decisionStatus], ["Site survey", l.solarProfile.surveyAvailability], ["Subsidy interest", l.solarProfile.subsidyInterest && "Asked"]] as [string, string | false][]).filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      {l.status === "Converted" ? (
        <Button onClick={() => onEnquiry(l.enquiryId)}>
          Open linked enquiry
        </Button>
      ) : (
        <>
          <h3>1. Confirm interest and contact permission</h3>
          {!l.whatsappConsent ? (
            <div className="form-grid">
              <FieldInput
                label="WhatsApp permission evidence (customer consent wording, date and source)"
                value={whatsappEvidence}
                onChange={setWhatsAppEvidence}
              />
              <Button
                disabled={!l.whatsapp || whatsappEvidence.trim().length < 5}
                onClick={async () => {
                  const saved = await run({
                    type: "lead.whatsapp-permission",
                    id: l.id,
                    evidence: whatsappEvidence,
                  });
                  if (saved) setError("");
                }}
              >
                Record WhatsApp permission
              </Button>
              <small>Record only consent the customer actually gave. This does not send a message.</small>
            </div>
          ) : null}
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
