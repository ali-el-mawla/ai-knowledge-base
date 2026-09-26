# Data Retention and Privacy Policy

Version 5.0, effective 1 April 2026. Owner: Data Protection Officer. Approved by General Counsel. Reviewed once a year.

## Purpose and scope

This policy sets how long Quaylark Systems keeps data, how data is deleted, and how requests from individuals about their personal data are handled. It covers:

- Customer data processed in the Quaylark platform, where Quaylark acts as a processor for its customers.
- Data where Quaylark is the controller: employees, job candidates, marketing contacts, billing contacts and website visitors.

This policy is about data retention. Programs for employee retention, such as stay interviews and retention bonuses, are described in the Employee Handbook.

## Roles and responsibilities

- Data Protection Officer (DPO): owns this policy, the DSAR register, the breach register and the record of processing activities.
- Data owners: the head of each department is the data owner for the systems their team runs. Data owners make sure retention periods are configured in those systems.
- Privacy Champions: one person per team, trained every year, who is the first contact for privacy questions.
- General Counsel: places and lifts legal holds.

## Retention schedule

Data is kept only as long as the table below allows. The retention period starts at the trigger event.

| Data type                             | Examples                                                | Retention period                                     | Trigger                      |
| ------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------- | ---------------------------- |
| Appointment and dock activity records | Appointments, door events, check-in and check-out times | Life of the contract plus 90 days                    | End of the customer contract |
| Yard camera images                    | Gate photos and licence plate reads from Yard View      | 30 days                                              | Capture date                 |
| Driver contact details                | Phone numbers used for SMS notifications                | 180 days after the driver's last appointment         | Last appointment             |
| Application logs                      | API request logs and service logs                       | 30 days searchable, then 1 year in cold archive      | Log date                     |
| Customer audit logs                   | Admin actions and sign-ins                              | 2 years, extendable to 7 years on Enterprise         | Event date                   |
| Database backups                      | Encrypted database snapshots                            | 35 days, rolling                                     | Backup date                  |
| Support tickets                       | Tickets and attachments                                 | 3 years                                              | Ticket closure               |
| Support call recordings               | Recorded phone calls                                    | 90 days                                              | Recording date               |
| Billing and finance records           | Invoices, receipts and expense reports                  | 7 years after the end of the fiscal year             | Fiscal year end              |
| Employee records                      | Contracts, payroll and performance records              | 6 years after employment ends                        | Last day of employment       |
| Candidate data                        | CVs and interview notes                                 | 12 months, or 24 months with the candidate's consent | Hiring decision              |
| Marketing contacts                    | Newsletter subscribers and event leads                  | 24 months without engagement                         | Last engagement              |
| Security incident records             | Incident documents and postmortems                      | 3 years                                              | Incident closure             |
| Trial workspace data                  | Workspaces from trials that did not convert             | 30 days                                              | End of the trial             |

Forensic evidence collected during a security incident has its own retention period, set in the Information Security and Incident Response Runbook.

## Legal hold

- General Counsel can place a legal hold on any data when litigation, an investigation or a regulator's request is expected.
- A legal hold suspends deletion for the data it covers, even if the retention period has ended.
- Legal holds are reviewed every 6 months. Only General Counsel can lift one.

## Deletion process

### Routine deletion

Automated jobs run every day at 03:00 UTC and delete data that has passed its retention period. The DPO reviews the monthly deletion report, and data owners investigate any job that failed.

### Customer offboarding

When a customer contract ends:

1. The workspace becomes read-only for 30 days. Workspace Admins can export their data as CSV or JSON with the export tool.
2. After those 30 days, the workspace is deactivated and nobody can sign in.
3. Customer data is deleted from production systems within 90 days of the end of the contract.
4. Copies in backups expire within 35 days after the production deletion, following the backup rotation.
5. If the customer asks, the DPO issues a deletion certificate within 10 business days of the production deletion.

### Deletion methods

- Production data is deleted with hard deletes, not soft-delete flags.
- Backups are protected by per-customer encryption keys. Destroying the key (crypto-shredding) makes the backup copies unreadable.
- Retired disks and laptops are wiped following NIST SP 800-88 before they are recycled.

## Data subject access requests (DSARs)

### Receiving a request

- Requests come in through privacy@quaylark.example or the privacy web form. A request is valid in any form, including a message to any employee.
- Any employee who receives a request forwards it to the privacy team within 1 business day.
- Every request is logged in the DSAR register with an ID in the format DSAR-YYYY-NNNN, for example DSAR-2026-0147.

### When Quaylark is the processor

Most personal data in the platform, such as driver phone numbers and the names of carrier dispatchers, belongs to Quaylark's customers. Quaylark forwards these requests to the customer within 5 business days and does not answer the individual directly, apart from acknowledging receipt. Quaylark then helps the customer answer, for example by running an export.

### When Quaylark is the controller

- Verify the requester's identity by matching at least 2 data points that Quaylark already holds. Ask for identity documents only when those checks fail.
- Answer within 30 calendar days of receiving the request.
- For complex or numerous requests, the deadline can be extended by up to 60 more days. The requester must be told about the extension, with the reason, within the first 30 days.
- Requests are free. A request that is clearly unfounded or excessive can be refused only with DPO approval, and the reason is recorded.
- Supported rights: access, correction, erasure, restriction, portability (as JSON or CSV) and objection.

### DSAR checklist

1. Log the request in the DSAR register and note the deadline.
2. Decide whether Quaylark is the controller or the processor for the data.
3. Verify identity.
4. Search every system listed for that person in the record of processing activities.
5. Check for legal holds before deleting anything.
6. Send the response through a secure channel and record the date in the register.

## Privacy by design

- A data protection impact assessment (DPIA) is required before launching any feature that processes location data or images, such as Yard View gate photos. The DPO signs off before launch.
- Collect only the fields a feature needs. Analytics use pseudonymous IDs instead of names or phone numbers.
- Production personal data is never copied into development or test environments.

## Sub-processors

- The current list of sub-processors is published on the Quaylark trust page.
- Customers receive 30 days notice before a new sub-processor starts processing their data.
- A customer can object within 15 days of the notice. If the objection cannot be resolved, the customer can end the affected service without penalty.

## International transfers and data residency

- Customer data is hosted in one of three regions: North America (Montreal), European Union (Frankfurt) or Asia Pacific (Singapore).
- Enterprise customers choose their region. Other plans are hosted in the region closest to the billing address.
- Transfers of personal data out of the European Union rely on the Standard Contractual Clauses.

## Personal data breaches

- Affected customers are notified without undue delay, and no later than 48 hours after the breach is confirmed.
- Where Quaylark is the controller, the supervisory authority is notified within 72 hours when the breach is likely to put individuals at risk.
- The response steps are in the Information Security and Incident Response Runbook.
