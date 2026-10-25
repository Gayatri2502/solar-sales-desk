<!-- Maintained design context; full structured record is in design.json. -->
# Solar Sales Desk design context

Solar Sales Desk is a solar sales CRM and operations dashboard built with React, TypeScript, Vite, shadcn primitives and Tailwind v4. Its visual direction is a light, high-trust business workspace with a warm off-white canvas, forest-green navigation, restrained solar-gold highlights, compact readable data tables and clear stage labels.

The interface should keep priority actions and real metrics near the top of the dashboard. On Leads & Calls, the queue should be searchable and filterable without hiding call readiness or review actions. Layouts must adapt to laptop and phone widths, retain visible keyboard focus, and respect reduced-motion preferences.

All records and metrics come from saved application state. Empty states replace fabricated examples. Outbound calling requires recorded customer consent, an agreed schedule, configured provider access and available allowance. Quotations and invoices remain behind administrator approval. Never imply an uncalibrated lead score, automatic learning, or unapproved communication.

21st.dev references informed the compact CRM table hierarchy and KPI grouping only; sample records and destructive sample interactions were not reused. See the prompt and references in `design.json`.
