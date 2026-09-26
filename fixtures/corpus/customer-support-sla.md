# Customer Support Service Level Agreement

Version 2026.2, effective 1 July 2026. Owner: Director of Customer Support. Applies to every paid Quaylark plan.

## Support tiers

Quaylark offers two levels of support.

- Standard Support is included in Starter, Growth and Scale.
- Premium Support is the add-on ADD-SUP-04 for Growth and Scale, and is included in Enterprise. It adds faster targets, 24/7 handling of P2 tickets, a designated support engineer and a quarterly support review.

Trial workspaces receive best-effort help through the help centre and are not covered by this SLA.

## Priority levels

The customer chooses the priority when opening a ticket. Support can change it after talking to the customer and will always explain why.

- P1 Critical: Quaylark is down or unusable for a whole site, or dock appointments cannot be created or checked in, and there is no workaround.
- P2 High: a major function is impaired for many users. A workaround exists but is hard to live with.
- P3 Normal: a partial or non-critical problem, or a question about configuration.
- P4 Low: general questions, feature requests and cosmetic issues.

A support priority is not the same as an incident severity. A P1 ticket automatically opens a SEV2 incident for Engineering, as described in the Information Security and Incident Response Runbook.

## Response and resolution targets

First response means a reply from a person, not an automatic acknowledgement. The clock starts when the ticket is logged in the support portal or when the phone call is answered.

| Priority    | First response, Standard | First response, Premium | Resolution or workaround, Standard | Resolution or workaround, Premium | Customer updates                                 |
| ----------- | ------------------------ | ----------------------- | ---------------------------------- | --------------------------------- | ------------------------------------------------ |
| P1 Critical | 1 hour, 24/7             | 15 minutes, 24/7        | 8 hours                            | 4 hours                           | Every 60 minutes, or every 30 minutes on Premium |
| P2 High     | 4 business hours         | 1 hour, 24/7            | 2 business days                    | 1 business day                    | Once per business day                            |
| P3 Normal   | 1 business day           | 4 business hours        | 5 business days                    | 3 business days                   | Every 3 business days                            |
| P4 Low      | 2 business days          | 1 business day          | Best effort or roadmap review      | Best effort or roadmap review     | When the status changes                          |

- A workaround that restores the customer's ability to schedule and receive trucks counts as resolution for the target. The ticket stays open until the root cause is fixed.
- Targets pause while Support is waiting for information from the customer.
- Support meets these targets for at least 95% of tickets each quarter. Results are shared in the quarterly support review for Premium customers.

## Support hours by timezone

Each customer is assigned to the support desk for the region of its billing address. Business hours mean the hours of that desk, excluding public holidays at the desk's location.

| Support desk | Office    | Hours, local time                | Time zone                        | Customers served               |
| ------------ | --------- | -------------------------------- | -------------------------------- | ------------------------------ |
| Americas     | Toronto   | 07:00 to 20:00, Monday to Friday | Eastern Time (ET)                | North and South America        |
| EMEA         | Rotterdam | 08:00 to 18:00, Monday to Friday | Central European Time (CET/CEST) | Europe, Middle East and Africa |
| APAC         | Singapore | 08:00 to 18:00, Monday to Friday | Singapore Time (SGT, UTC+8)      | Asia Pacific                   |

- P1 tickets are handled 24 hours a day, 7 days a week, for every plan, through the P1 phone line.
- Premium customers also get 24/7 handling for P2 tickets.
- Outside desk hours, P1 and P2 calls go to the on-duty support engineer in any region, who can page Engineering.

## Contacting support

- Support portal at support.quaylark.example. This is the preferred channel for every priority.
- Email to support@quaylark.example, for P3 and P4 only. Emails are logged as P3 by default.
- Phone, for P1 only. The numbers for each region are listed in the support portal.

Every ticket should include the workspace ID (it starts with `ws_`), the site name, any affected appointment IDs, the time the problem started in UTC, and screenshots or error messages. For API problems, include the `request_id` from the error response.

## Escalation

### When to escalate

A customer can ask for escalation when a target was missed, when the business impact has grown since the ticket was opened, or when they are not satisfied with the progress. Use the Request escalation button in the portal or say so on the phone. Escalation does not change the priority; it adds more senior attention.

### Escalation path

1. Support Engineer (Level 1) handles the ticket.
2. Senior Support Engineer (Level 2) takes over. For a P1 ticket this happens within 30 minutes of the escalation request.
3. Support Team Lead for the desk.
4. Support Manager for the region.
5. Director of Customer Support.

Enterprise customers have a Technical Account Manager who coordinates every escalation and joins the calls.

### Escalation to Engineering

When a problem needs a code or infrastructure change, a Senior Support Engineer opens a ticket in the ESC project of the issue tracker. Engineering acknowledges ESC tickets within 1 business day, or within 4 hours when the ticket is linked to a P1. The support ticket stays the customer's single point of contact.

## Uptime commitment and service credits

Quaylark measures uptime every month as the share of minutes in which Dock Scheduler and the Public API were available.

- Growth and Scale: 99.9% monthly uptime.
- Enterprise: 99.95% monthly uptime.
- Starter: no uptime commitment. The internal target is 99.5%.

| Monthly uptime                          | Service credit         |
| --------------------------------------- | ---------------------- |
| Below the commitment but at least 99.0% | 10% of the monthly fee |
| Below 99.0% but at least 95.0%          | 25% of the monthly fee |
| Below 95.0%                             | 50% of the monthly fee |

- Credits must be claimed within 30 days after the end of the month, through the support portal.
- Credits are capped at 50% of the monthly fee and are the only remedy for missed uptime.
- Planned maintenance does not count as downtime. It happens on Sundays from 02:00 to 04:00 UTC and is announced 5 business days in advance.
- Problems caused by the customer's own systems, by misuse of the API, or by third-party SMS networks are excluded.

## Customer responsibilities

- Name up to 3 authorized support contacts on Standard Support, or up to 6 on Premium Support.
- Keep contact details for the workspace Admins current.
- Give Support the access and information needed to reproduce the problem.
- Test major process changes in a sandbox workspace where one is available.

## Closing tickets

- A ticket marked resolved closes automatically after 7 days without a reply from the customer.
- A closed ticket can be reopened within 14 days. After that, a new ticket is opened with a link to the old one.
- Every closed ticket triggers a short satisfaction survey. The target customer satisfaction (CSAT) score is 90%.
