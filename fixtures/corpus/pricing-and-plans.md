# Pricing and Plans

2026 price book. Effective 1 January 2026 until replaced. Owner: Revenue Operations. All prices are in USD and exclude taxes.

## How pricing works

Quaylark is priced per site. A site is one physical warehouse or distribution centre with its own dock doors and yard. A customer with three warehouses pays for three sites.

- List prices are per site per month on an annual contract, billed once a year in advance.
- Month-to-month billing is available for Starter and Growth only, at 20% above the list price.
- Plan codes end in -24 because this plan generation was introduced with the 2024 price book. The codes stayed the same when prices were updated for 2026.

## Plans

| Plan       | Plan code     | List price per site per month                 | Dock doors per site | Users     | Main features                                                                                        |
| ---------- | ------------- | --------------------------------------------- | ------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| Starter    | PLN-START-24  | 149 USD                                       | Up to 6             | 5         | Dock Scheduler, carrier booking links, email notifications                                           |
| Growth     | PLN-GROWTH-24 | 449 USD                                       | Up to 20            | 25        | Everything in Starter, plus Carrier Portal, webhooks and Insights dashboards                         |
| Scale      | PLN-SCALE-24  | 1,190 USD                                     | Up to 60            | Unlimited | Everything in Growth, plus Yard View, SAML single sign-on and audit log export                       |
| Enterprise | PLN-ENT-24    | Custom, minimum annual contract of 60,000 USD | Unlimited           | Unlimited | Everything in Scale, plus Premium Support, a 99.95% uptime SLA and a choice of data residency region |

API rate limits for each plan are listed in the Quaylark Public API v3 Specification. Uptime commitments are in the Customer Support SLA.

### Which plan fits

- Starter suits a single small warehouse that wants to stop booking appointments by phone and email.
- Growth is the most common plan. It fits sites that work with many carriers and need a self-service Carrier Portal and integrations through webhooks.
- Scale fits large distribution centres that also manage trailers in the yard and need single sign-on.
- Enterprise is for networks of sites that need contract-level terms, data residency and a named support team.

### Free trial

New customers can try Growth features free for 21 days, without a credit card. When the trial ends, the workspace is paused until a plan is chosen. Trial data is deleted 30 days after the trial ends if the customer does not buy a plan.

## Add-ons

| Add-on                   | Code        | Price                                                                             | Available on                                          |
| ------------------------ | ----------- | --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Yard View                | ADD-YARD-01 | 199 USD per site per month                                                        | Starter and Growth (included in Scale and Enterprise) |
| Insights Pro             | ADD-INSI-02 | 99 USD per site per month                                                         | Growth and Scale                                      |
| SMS driver notifications | ADD-SMS-03  | 39 USD per site per month with 2,000 messages included, then 0.02 USD per message | All plans                                             |
| Premium Support          | ADD-SUP-04  | 15% of the annual subscription fee, minimum 3,000 USD per year                    | Growth and Scale (included in Enterprise)             |
| Extra API capacity       | ADD-API-05  | 79 USD per month for each extra 300 requests per minute                           | Growth, Scale and Enterprise                          |
| Sandbox workspace        | ADD-SBX-06  | 250 USD per month per workspace                                                   | Scale and Enterprise                                  |

Notes on add-ons:

- Insights Pro adds carrier scorecards, dwell time benchmarks and scheduled report exports.
- Premium Support gives faster response targets and extends 24/7 coverage from P1 tickets to P2 tickets. The targets are in the Customer Support SLA.
- Unused SMS messages do not roll over to the next month.

## Overages

- Dock doors above the plan's limit cost 15 USD per door per month.
- Extra users on Starter and Growth cost 12 USD per user per month.
- A workspace that keeps hitting its API rate limit is contacted by its Account Executive to buy ADD-API-05 or move to a higher plan. Quaylark never charges automatically for API overages.

## Discounts

### Standard discounts

| Discount                | Code         | Amount | Condition                            |
| ----------------------- | ------------ | ------ | ------------------------------------ |
| Multi-site, medium      | DSC-MULTI-08 | 8%     | 5 to 19 sites on one contract        |
| Multi-site, large       | DSC-MULTI-15 | 15%    | 20 or more sites on one contract     |
| Multi-year              | DSC-TERM-05  | 5%     | 3-year contract, still billed yearly |
| Nonprofit and education | DSC-NPO-20   | 20%    | Proof of status required             |

### Approval rules

- Account Executives can give a total discount of up to 10% on their own.
- A total discount above 10% and up to 20% needs Sales Director approval.
- A total discount above 20% goes to Deal Desk review and needs approval from the Chief Revenue Officer.
- Discounts stack by adding them together, capped at 30% in total unless the CFO approves more.
- Discounts never apply to SMS messages above the included amount or to professional services.

## Professional services

- Standard onboarding, code SVC-ONB-01: 2,500 USD one-time per site. It includes dock and door configuration, carrier import and 3 live training sessions.
- Enterprise onboarding is scoped and quoted per project.
- Custom integration work is billed at 185 USD per hour, estimated in advance.

## Renewals and customer retention

- Annual contracts renew automatically for 12 months unless the customer cancels at least 30 days before the end of the term.
- Customers receive a renewal notice 60 days before the end of the term.
- The price increase at renewal is capped at 7% per year for annual contracts.
- For accounts at risk of leaving, Customer Success can offer a one-time retention credit of up to 2 months of fees, or a downgrade without penalty. Both need approval from the VP Customer Success.
- The company-wide target for gross revenue retention in 2026 is 92%.

## Payment terms

- Annual contracts are invoiced with payment terms of net 30 days.
- Starter and Growth customers on monthly billing pay by credit card.
- Late payments carry interest of 1.5% per month.
- A workspace that is more than 45 days overdue can be suspended after a 10-day written notice.
- Invoices can be issued in USD, EUR, CAD or SGD, using exchange rates fixed in the price book each January.
