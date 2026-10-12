# Admin weekly, monthly and yearly reports

Access: admin Dashboard → Open admin reports, or Reports. Sales users cannot open financial reports; their API state excludes expenses and call-review records as well as product/quotation/order costs. Admin-only record commands are enforced in the reducer and database commit function. Apply migration 002 for live reporting; demo needs no migration or credentials.

## Period and snapshot definitions

Pick Weekly, Monthly or Yearly and a date within that period. Weeks run Monday–Sunday, months/calendar years include their first/last days. Dates are inclusive in the configured business timezone. Counts and values reflect current record statuses at generation time, not immutable financial closing. Changing/cancelling an older order can change a prior report. The selected period may still be in progress.

- Enquiries: capture timestamp in the period.
- New quotations: distinct quotation numbers whose first draft was created in the period. Revisions are counted separately.
- Enquiry-to-quote/order conversion: enquiries captured in the selected period that have progressed to any quotation or non-cancelled order **to date** / captured enquiries. Later progress can change past cohorts. This differs from simply dividing period quote activity by enquiry activity.
- Deals won: non-cancelled orders created in the selected period; one accepted quote becomes one order. Current cancelled orders created in that period are separately counted.
- Won order value: exact order amounts including tax and delivery charges. This is a booking measure, not cash collected or accounting revenue recognition.
- Product sales: order lines after discounts, before tax/delivery.
- Product costs: quotation cost-price snapshots times exact quantities. They are estimates, not supplier invoices. Missing cost causes total estimated cost/margin to be unavailable; known partial cost is reported separately. No missing value silently becomes zero.
- Estimated product gross margin: product sales less estimated product costs, excluding delivery, taxes, operating costs, overhead and human support. It is not net profit.
- Call attempts: manually recorded calls in the period by call time, excluding cancelled appointments and Demo records. Unattended includes Unanswered/Busy; Failed is separate. Answered talk time sums answered-call durations.
- Call quality: admin's human 1–5 review average, only reviewed answered calls. The report shows coverage; unreviewed calls do not get a zero score. This is not automated verification or customer satisfaction measurement.
- Expenses: admin-entered provider/operating invoices by invoice date in INR. Only entered records are summed; completeness and payment are not verified. Future invoices and duplicate category/reference combinations reject. Call charges are informational and never added again to invoice totals.
- AI estimates: request/token/estimated-USD aggregates for the requested timezone period. In live mode migration 002 aggregates the full requested range in Postgres, avoiding the frontend's current-month ledger and API row caps. Pending requests reserve conservative costs; failed requests may be charged. Estimated USD is not added to actual INR invoices, preventing double counting. If live aggregation fails, the report displays Unavailable.
- Cash collected: not tracked. No payment integration or accounting cash ledger is fabricated.

## Recording and exporting

Until telephony/WhatsApp/hosting billing integrations are connected, record completed call logs and provider invoice totals manually. Give each call a unique log reference and each invoice a unique category/reference. Use international contact numbers, actual past call times, optional charges, review score and notes. Record charges as unknown when the provider has not supplied them. Simulations have no actual voice duration or charge and stay separate.

Export the selected summary as CSV or JSON. Files include period/timezone and coverage metadata. JSON includes selected manual expense records. Both contain private financial information; share only with authorized recipients. Reports are on demand, with no automatic email, external delivery or recurring paid process.

Manual expense/call correction or invoice reconciliation is not implemented; check entries before saving and use operator-reviewed backup recovery for mistakes during this small pilot. Full accounting, tax allocation, payment verification, payroll, inventory valuation and statutory reporting remain outside scope. No declaration of full financial profit is made.

## Pilot verification

Unit tests cover timezone cohort boundaries, leap-year/calendar periods, distinct quote numbers/revisions, exact snapshot cost and margin, cancelled-order exclusion, missing costs, separate invoice/AI estimates, call classifications/quality coverage, duplicate references, sales denial and privacy. PGlite tests execute both migrations and verify admin/cross-tenant authorization plus pending-cost aggregation. Browser workflow checks recording/export controls and period selection. Actual deployed provider reconciliation remains pending credentials.

## Graphs and sales view

Reports includes a count-scaled activity line graph with expandable exact data; cohort conversion, current enquiry stages, net product sales by current category, orders by current salesperson, invoice states, recorded call outcomes, human quality distribution, expense categories and product value/cost/margin bar graphs. Negative margin uses a labeled negative value. Missing costs do not produce a fabricated margin. Weekly/monthly/yearly boundaries apply to every graph; yearly activity groups by month, shorter periods by day.

Sales gets My Reports with their currently assigned enquiry cohort and related orders/invoices. Business expenses/costs/quality records stay in admin Reports. Browser graph data is already restricted to visible financial fields. All graph values have readable labels and the timeline has a keyboard-expandable exact table. Current assignments/category/statuses can change historical breakdowns; immutable accounting attribution is outside scope.
