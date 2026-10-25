import { z } from "zod";
export const leadStages = [
  "Captured",
  "Awaiting reply",
  "Qualified",
  "Scheduled",
  "Details captured",
  "Converted",
  "Not interested",
  "Opted out",
] as const;
export type Lead = {
  id: string;
  customerId: string;
  phone?: string;
  source: string;
  sourceReference: string;
  whatsapp: string;
  interest: "Unknown" | "Products" | "Services";
  status: (typeof leadStages)[number];
  whatsappConsent: string;
  callConsent: string;
  scheduledAt: string;
  language: string;
  attempts: number;
  notes: string;
  requirements: string;
  enquiryId: string;
  solarProfile?: SolarProfile;
  createdAt: string;
  updatedAt: string;
};
export const solarProfileSchema = z.strictObject({
  customerType: z.enum(["Residential", "Commercial", "Industrial", "Other"]).default("Other"),
  monthlyBill: z.string().max(80).default(""),
  monthlyConsumption: z.string().max(80).default(""),
  propertyType: z.string().max(120).default(""),
  ownership: z.enum(["Unknown", "Owner", "Tenant"]).default("Unknown"),
  siteLocation: z.string().max(300).default(""),
  roofArea: z.string().max(80).default(""),
  roofType: z.string().max(120).default(""),
  shading: z.string().max(200).default(""),
  systemCapacity: z.string().max(80).default(""),
  systemType: z.enum(["Unknown", "On-grid", "Off-grid", "Hybrid"]).default("Unknown"),
  batteryBackup: z.string().max(200).default(""),
  budget: z.string().max(80).default(""),
  financing: z.string().max(160).default(""),
  timeline: z.string().max(120).default(""),
  decisionStatus: z.string().max(160).default(""),
  subsidyInterest: z.boolean().default(false),
  surveyAvailability: z.string().max(160).default(""),
});
export type SolarProfile = z.infer<typeof solarProfileSchema>;
export const phoneSchema = z
  .string()
  .regex(
    /^\+[1-9]\d{7,14}$/,
    "Use international format, for example +91 followed by the number.",
  );
export const leadInput = z.object({
  customerId: z.string().min(1),
  source: z.enum([
    "WhatsApp",
    "Website form",
    "CSV import",
    "CRM",
    "Campaign",
    "Manual",
    "Facebook",
    "Instagram",
    "Other",
  ]),
  sourceReference: z.string().max(200).default(""),
  whatsapp: z.union([phoneSchema, z.literal("")]),
  whatsappConsent: z.string().max(1000).default(""),
  notes: z.string().max(2000).default(""),
  solarProfile: solarProfileSchema.optional(),
});
export const callQuestions = [
  "Introduce yourself as an automated assistant and ask whether it is a good time to speak.",
  "Confirm product supply or installation/service need; send service requests to staff.",
  "Ask for product category, brand preference and verified technical requirements.",
  "Confirm quantity and unit for every requested item.",
  "Ask for company/contact, delivery address, required date, and site constraints.",
  "If relevant, ask about the electricity bill and consumption period; record the customer's units as stated.",
  "Ask property type and ownership, location, usable rooftop area, roof type and shading; leave unknown measurements blank.",
  "Record desired capacity and on-grid/off-grid/hybrid preference only when the customer states them; ask about battery backup.",
  "Ask about budget and payment expectations without promising a discount.",
  "Ask purchase timeline, decision status and preferred site-survey availability.",
  "If asked about subsidies, record the question and have staff verify current official eligibility and terms; do not estimate savings or eligibility.",
  "Read back the requirements and ask the customer to correct them.",
  "Explain that availability, compatibility, price and delivery will be reviewed by staff; quotations need admin approval.",
];
// Wall time conversion uses the configured business timezone, never the browser's timezone.
export function scheduledInstant(wall: string, zone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wall))
    throw Error("Choose a complete date and time.");
  const wanted = Date.parse(wall + ":00Z");
  if (!Number.isFinite(wanted)) throw Error("Invalid date.");
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  let t = wanted;
  for (let i = 0; i < 3; i++) {
    const parts = fmt.formatToParts(new Date(t));
    const part = (type: string) => parts.find((p) => p.type === type)?.value;
    const displayed = `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
    if (displayed === wall) return new Date(t).toISOString();
    t += wanted - Date.parse(displayed + ":00Z");
  }
  throw Error(
    "This local time does not exist in the business timezone. Choose another time.",
  );
}
export function callTime(at: string, zone: string) {
  return at
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: zone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(at)) +
        " · " +
        zone
    : "Not scheduled";
}
