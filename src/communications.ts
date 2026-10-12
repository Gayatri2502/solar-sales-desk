import { z } from "zod";
import { type State, type Command, type Role, uid, localDay } from "./domain";
import { phoneSchema } from "./leads";
export const communicationPolicySchema = z.strictObject({
  autoCalls: z.boolean(),
  monthlyCeiling: z.number().int().min(0).max(10000000),
  userDaily: z.number().int().min(0).max(100),
  tenantDaily: z.number().int().min(0).max(1000),
});
export type CommunicationPolicy = z.infer<typeof communicationPolicySchema>;
export type CommunicationJob = {
  id: string;
  leadId: string;
  kind: "WhatsApp" | "Voice";
  key: string;
  status:
    | "Queued"
    | "Starting"
    | "Accepted"
    | "Completed"
    | "Failed"
    | "Uncertain"
    | "Cancelled";
  phone: string;
  createdAt: string;
  createdBy: string;
  estimatedCost: number | null;
  providerId: string;
  startedAt: string;
  error: string;
  finishedAt: string;
  receipt: string;
};
export function eligibleLead(
  s: State,
  id: unknown,
  kind: "WhatsApp" | "Voice",
  now: string,
) {
  const l = s.leads?.find((l) => l.id === id);
  if (!l) throw Error("Lead not found.");
  const c = s.customers.find((c) => c.id === l.customerId);
  if (!c) throw Error("Customer not found.");
  if (
    ["Opted out", "Not interested", "Converted"].includes(l.status) ||
    s.leads?.some(
      (other) =>
        other.status === "Opted out" &&
        (other.customerId === l.customerId ||
          [other.phone, other.whatsapp]
            .filter(Boolean)
            .some((n) => n === c.phone || n === l.whatsapp)),
    )
  )
    throw Error("This contact is closed or opted out.");
  if (kind === "WhatsApp") {
    if (!l.whatsapp || !l.whatsappConsent.trim())
      throw Error("Record WhatsApp permission before sending.");
    phoneSchema.parse(l.whatsapp);
  } else {
    if (
      l.status !== "Scheduled" ||
      !l.callConsent.trim() ||
      !l.scheduledAt ||
      Date.parse(l.scheduledAt) > Date.parse(now)
    )
      throw Error("A due, customer-agreed call appointment is required.");
    phoneSchema.parse(c.phone);
    if (l.phone !== c.phone)
      throw Error(
        "Contact number changed. Renew qualification and call permission.",
      );
    if (l.attempts >= 2)
      throw Error("Call attempt allowance reached. Review with staff.");
  }
  return l;
}
export function communicationAction(
  s: State,
  cmd: Command,
  actor: { id: string; role: Role },
  now: string,
) {
  s.communicationJobs ||= [];
  s.inboundMessages ||= [];
  const event = (type: string, entity: string) =>
    s.events.push({ at: now, user: actor.id, type, entity });
  if (cmd.type === "comms.policy") {
    if (actor.role !== "admin") throw Error("Business admin required.");
    s.communicationPolicy = communicationPolicySchema.parse(cmd.policy);
    event("comms.policy.changed", "settings");
    return "Communication allowances updated";
  }
  if (cmd.type === "comms.queue") {
    const kind = z.enum(["WhatsApp", "Voice"]).parse(cmd.kind),
      l = eligibleLead(s, cmd.leadId, kind, now),
      p = s.communicationPolicy || {
        autoCalls: false,
        monthlyCeiling: 0,
        userDaily: 0,
        tenantDaily: 0,
      };
    if (["Past due", "Cancelled"].includes(s.settings.subscription))
      throw Error("Automated contact is paused for this subscription.");
    const key =
      kind +
      ":" +
      l.id +
      ":" +
      (kind === "Voice" ? l.scheduledAt : "qualification");
    if (s.communicationJobs.some((j) => j.key === key))
      throw Error("This outbound contact has already been queued.");
    if (
      kind === "Voice" &&
      s.communicationJobs.some(
        (j) =>
          j.leadId === l.id &&
          ["Starting", "Accepted", "Uncertain"].includes(j.status),
      )
    )
      throw Error(
        "An existing call needs completion or reconciliation before another call.",
      );
    const estimate = z.number().int().min(1).max(10000000).parse(cmd.estimate);
    const month = localDay(now, s.settings.timezone).slice(0, 7),
      today = localDay(now, s.settings.timezone);
    const monthly = s.communicationJobs.filter((j) =>
        localDay(j.createdAt, s.settings.timezone).startsWith(month),
      ),
      daily = monthly.filter(
        (j) => localDay(j.createdAt, s.settings.timezone) === today,
      );
    if (
      daily.length >= p.tenantDaily ||
      daily.filter((j) => j.createdBy === actor.id).length >= p.userDaily ||
      monthly.reduce((n, j) => n + (j.estimatedCost || 0), 0) + estimate >
        p.monthlyCeiling
    )
      throw Error(
        "Communication request allowance or estimated spending ceiling reached. Continue manually.",
      );
    const job: CommunicationJob = {
      id: uid(),
      leadId: l.id,
      kind,
      key,
      status: "Queued",
      phone: kind === "WhatsApp" ? l.whatsapp : l.phone!,
      createdAt: now,
      createdBy: actor.id,
      estimatedCost: estimate,
      providerId: "",
      startedAt: "",
      error: "",
      finishedAt: "",
      receipt: "",
    };
    s.communicationJobs.unshift(job);
    event("comms.queued", job.id);
    return job.id;
  }
  if (cmd.type === "comms.inbound") {
    const data = z
      .strictObject({
        id: z.string().min(1).max(300),
        phone: phoneSchema,
        text: z.string().max(12000),
        at: z.iso.datetime(),
        reply: z
          .enum(["Products", "Services", "Not interested", "Opted out"])
          .nullable(),
      })
      .parse(cmd.message);
    if (s.inboundMessages.some((m) => m.id === data.id))
      return "Duplicate webhook ignored";
    let l = s.leads?.find(
      (l) =>
        l.whatsapp === data.phone &&
        !["Converted", "Not interested"].includes(l.status),
    );
    if (!l) {
      const customerId = uid();
      s.customers.push({
        id: customerId,
        company: "WhatsApp enquiry " + data.phone,
        contact: "",
        phone: data.phone,
        email: "",
        address: "",
        gstin: "",
        notes: "Inbound enquiry: verify company and delivery details",
        priceList: {},
      });
      l = {
        id: uid(),
        customerId,
        phone: data.phone,
        source: "WhatsApp",
        sourceReference: data.id,
        whatsapp: data.phone,
        interest: "Unknown",
        status: "Captured",
        whatsappConsent: "",
        callConsent: "",
        scheduledAt: "",
        language: "English",
        attempts: 0,
        notes: "Inbound message: confirm outbound permission before contact",
        requirements: "",
        enquiryId: "",
        createdAt: now,
        updatedAt: now,
      };
      (s.leads ||= []).push(l);
    }
    s.inboundMessages.push({ ...data, leadId: l.id });
    if (data.reply && l.status !== "Opted out") {
      if (["Products", "Services"].includes(data.reply)) {
        if (
          !["Scheduled", "Details captured", "Converted"].includes(l.status)
        ) {
          l.interest = data.reply as "Products" | "Services";
          l.status = "Qualified";
          l.callConsent = "";
          l.scheduledAt = "";
        }
      } else {
        l.status = data.reply as "Not interested" | "Opted out";
        l.callConsent = "";
        l.scheduledAt = "";
        s.communicationJobs
          .filter((j) => j.leadId === l.id && j.status === "Queued")
          .forEach((j) => (j.status = "Cancelled"));
      }
      l.updatedAt = now;
    }
    event("whatsapp.received", l.id);
    return l.id;
  }
  const j = s.communicationJobs.find((j) => j.id === cmd.id);
  if (!j) throw Error("Outbound job not found.");
  const l = s.leads?.find((l) => l.id === j.leadId);
  if (!l) throw Error("Lead not found.");
  switch (cmd.type) {
    case "comms.claim":
      if (j.status !== "Queued")
        throw Error("Outbound request already started.");
      eligibleLead(s, l.id, j.kind, now);
      if (j.kind === "Voice" && j.key !== "Voice:" + l.id + ":" + l.scheduledAt)
        throw Error("Call appointment changed; queued request is stale.");
      j.status = "Starting";
      j.startedAt = now;
      if (j.kind === "Voice") l.attempts++;
      break;
    case "comms.accepted":
      if (j.status !== "Starting")
        throw Error("Outbound request is not awaiting provider acceptance.");
      j.providerId = z.string().min(1).max(300).parse(cmd.providerId);
      j.status = "Accepted";
      if (j.kind === "WhatsApp" && l.status === "Captured")
        l.status = "Awaiting reply";
      break;
    case "comms.failed":
    case "comms.uncertain":
      if (j.status !== "Starting")
        throw Error("Outbound request is not in progress.");
      j.status = cmd.type === "comms.uncertain" ? "Uncertain" : "Failed";
      j.error =
        j.status === "Uncertain"
          ? "Provider acceptance is unknown. Reconcile in the provider console; do not repeat the outbound request."
          : "Provider rejected contact. Check configuration; staff follow-up is required.";
      break;
    case "comms.receipt": {
      const receipt = z
        .enum(["sent", "delivered", "read", "failed"])
        .parse(cmd.receipt);
      const rank = { sent: 1, delivered: 2, read: 3, failed: 0 };
      if (!j.receipt || rank[receipt] > rank[j.receipt as keyof typeof rank])
        j.receipt = receipt;
      break;
    }
    case "comms.callCompleted": {
      if (j.kind !== "Voice" || !["Accepted", "Starting"].includes(j.status))
        throw Error("Call completion cannot apply to this job.");
      const data = z
        .strictObject({
          providerId: z.string().min(1).max(300),
          outcome: z.enum(["Answered", "Unanswered", "Busy", "Failed"]),
          duration: z.number().int().min(0).max(36000),
          transcript: z.string().max(12000),
          at: z.iso.datetime(),
        })
        .parse(cmd.result);
      if (j.providerId && j.providerId !== data.providerId)
        throw Error("Call ID does not match the queued job.");
      j.status = "Completed";
      j.providerId = data.providerId;
      j.finishedAt = data.at;
      s.callRecords ||= [];
      if (!s.callRecords.some((c) => c.reference === "vapi-" + data.providerId))
        s.callRecords.push({
          id: uid(),
          customerId: l.customerId,
          leadId: l.id,
          at: data.at,
          mode: "Live",
          outcome: data.outcome,
          durationSeconds: data.outcome === "Answered" ? data.duration : 0,
          reference: "vapi-" + data.providerId,
          notes: "Voice provider outcome; quality awaits human review",
          cost: null,
          quality: null,
          recordedBy: actor.id,
          createdAt: now,
        });
      if (!["Opted out", "Not interested", "Converted"].includes(l.status)) {
        if (data.outcome === "Answered" && data.transcript.trim()) {
          l.requirements = data.transcript;
          l.status = "Details captured";
        } else {
          l.status = "Qualified";
          l.scheduledAt = "";
          l.callConsent = "";
        }
        l.updatedAt = now;
      }
      break;
    }
    default:
      throw Error("Unknown communication action.");
  }
  event(cmd.type, j.id);
  return j.id;
}
