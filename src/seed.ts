import { type State, type Product, reduce } from "./domain";
export function seed(): State {
  const now = new Date().toISOString();
  const products: Product[] = [
    [
      "P-540",
      "Sunfield Demo",
      "Panel",
      "540 W mono panel",
      "Rated power: 540 W; synthetic specification",
      "pcs",
      890000,
      1040000,
      120,
    ],
    [
      "P-550",
      "Sunfield Demo",
      "Panel",
      "550 W mono panel",
      "Rated power: 550 W; synthetic specification",
      "pcs",
      920000,
      1090000,
      60,
    ],
    [
      "I-5",
      "Gridway Demo",
      "Inverter",
      "5 kW inverter",
      "Rated power: 5 kW; phase and compatibility unverified",
      "pcs",
      3300000,
      4100000,
      12,
    ],
    [
      "B-100",
      "Voltbank Demo",
      "Battery",
      "100 Ah battery",
      "Capacity: 100 Ah; voltage and chemistry require confirmation",
      "pcs",
      1250000,
      1590000,
      24,
    ],
    [
      "M-SET",
      "Framecraft Demo",
      "Mounting",
      "Mounting structure set",
      "Material and dimensions require site confirmation",
      "sets",
      350000,
      450000,
      30,
    ],
    [
      "A-CABLE",
      "Connect Demo",
      "Accessory",
      "Solar cable",
      "Cross-section and certification require confirmation",
      "m",
      4200,
      5500,
      1000,
    ],
  ].map((a, i) => ({
    id: "p" + i,
    sku: a[0] as string,
    brand: a[1] as string,
    category: a[2] as Product["category"],
    name: a[3] as string,
    attributes: a[4] as string,
    unit: a[5] as string,
    cost: a[6] as number,
    price: a[7] as number,
    physical: (a[8] as number) * 1000,
    reserved: 0,
    taxBps: null,
    active: true,
    stockAt: now,
  }));
  const s: State = {
    version: 1,
    leads: [],
    expenses: [],
    callRecords: [],
    followups: [],
    settings: {
      name: "Surya Distribution · Demo",
      address: "Synthetic business · Pune, Maharashtra",
      contact: "sales@example.test",
      gstin: "",
      currency: "INR",
      timezone: "Asia/Kolkata",
      taxBps: null,
      deliveryTaxBps: null,
      prefix: "SSD-",
      validDays: 14,
      paymentTerms: "Payment terms to be agreed with customer.",
      deliveryTerms: "Delivery subject to stock and destination confirmation.",
      marginBps: 1500,
      stockStaleDays: 7,
      subscription: "Pilot",
      renewal: "",
      fee: 0,
      allowance: 100,
      userLimit: 5,
      spendCeilingMicros: 1000000,
      baseline: {
        prepMinutes: "",
        followupPercent: "",
        correctionPercent: "",
        conversionPercent: "",
        weeklyUsers: "",
      },
    },
    products,
    customers: [
      {
        id: "c1",
        company: "Aarav Energy · Demo",
        contact: "Aarav Shah",
        phone: "",
        email: "aarav@example.test",
        address: "Pune · synthetic address",
        gstin: "",
        notes:
          "Synthetic customer. Confirm roof details before suggesting mounting.",
        priceList: {},
      },
      {
        id: "c2",
        company: "Deccan Solar Projects · Demo",
        contact: "Meera Rao",
        phone: "",
        email: "meera@example.test",
        address: "Nashik · synthetic address",
        gstin: "",
        notes: "Site specifications pending.",
        priceList: {},
      },
    ],
    enquiries: [],
    quotes: [],
    orders: [],
    audit: [],
    events: [],
    usage: [],
    users: [
      { id: "demo-admin", name: "Priya · Demo admin", role: "admin" },
      { id: "demo-sales", name: "Rohan · Demo sales", role: "sales" },
    ],
  };
  let x = reduce(
    s,
    {
      type: "enquiry.create",
      customerId: "c1",
      text: "20 pcs 540 W panels\n1 pcs 5 kW inverter",
      extraction: {
        items: [
          {
            description: "540 W mono panels",
            quantity: "20",
            unit: "pcs",
            specifications: "540 W requested",
          },
          {
            description: "5 kW inverter",
            quantity: "1",
            unit: "pcs",
            specifications: "Phase missing",
          },
        ],
        destination: "Pune",
        requestedDate: "",
        missing: [
          "Confirm inverter phase and voltage",
          "Confirm delivery date",
        ],
      },
    },
    { id: "demo-admin", role: "admin" },
    new Date(Date.now() - 86400000).toISOString(),
  );
  x = reduce(
    x,
    {
      type: "enquiry.create",
      customerId: "c2",
      text: "Battery for backup",
      extraction: {
        items: [
          {
            description: "Battery for backup",
            quantity: null,
            unit: null,
            specifications: "Voltage and chemistry missing",
          },
        ],
        destination: "Nashik",
        requestedDate: "",
        missing: ["Quantity, voltage, chemistry and unit needed"],
      },
    },
    { id: "demo-sales", role: "sales" },
    new Date(Date.now() - 2 * 86400000).toISOString(),
  );
  // Deliberately synthetic, non-routable phone fixture. No live provider is called.
  x.customers[0].phone = "+910000000001";
  const capturedAt = new Date(Date.now() - 10 * 60000).toISOString();
  x = reduce(
    x,
    {
      type: "lead.capture",
      lead: {
        customerId: "c1",
        source: "Website form",
        sourceReference: "synthetic-form-1",
        whatsapp: "+910000000001",
        whatsappConsent:
          "Synthetic fixture only: customer permission for qualification",
        notes: "Synthetic lead",
      },
    },
    { id: "demo-admin", role: "admin" },
    capturedAt,
  );
  const leadId = x.leads![0].id;
  x = reduce(
    x,
    {
      type: "lead.qualify",
      id: leadId,
      response: "Products",
      evidence: "Synthetic fixture only: interested in panels and inverter",
    },
    { id: "demo-admin", role: "admin" },
    capturedAt,
  );
  x = reduce(
    x,
    {
      type: "lead.schedule",
      id: leadId,
      at: new Date(Date.now() - 60000).toISOString(),
      consent: "Synthetic fixture only: agreed automated callback",
      language: "English",
    },
    { id: "demo-admin", role: "admin" },
    capturedAt,
  );
  return x;
}
export function emptyState(): State {
  const s = seed();
  return {
    ...s,
    settings: {
      ...s.settings,
      name: "My solar business",
      address: "",
      contact: "",
    },
    followups: [],
    leads: [],
    expenses: [],
    callRecords: [],
    products: [],
    customers: [],
    enquiries: [],
    quotes: [],
    orders: [],
    audit: [],
    events: [],
    users: [],
  };
}
