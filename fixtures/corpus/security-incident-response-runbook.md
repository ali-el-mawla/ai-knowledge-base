# Information Security and Incident Response Runbook

Owner: Head of Security. Last reviewed 12 August 2026. Reviewed every quarter. Classification: internal.

## Scope

This runbook covers two kinds of incidents:

- Production incidents that affect the Quaylark platform: Dock Scheduler, Yard View, Carrier Portal, Insights and the Public API.
- Security incidents: unauthorized access, exposure of customer or employee data, malware, account takeover, and lost or stolen devices.

Anyone at Quaylark can declare an incident. If you are not sure whether something is an incident, declare it. Closing a false alarm costs far less than a late response.

## Severity levels

| Severity | Definition                                                                     | Examples                                                                                | Acknowledge within | Status update cadence |
| -------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------ | --------------------- |
| SEV1     | Critical: full outage, or a confirmed data breach                              | Dock Scheduler down for all customers; customer data exposed publicly                   | 5 minutes          | Every 30 minutes      |
| SEV2     | Major: a core feature badly degraded for many customers, or a suspected breach | Webhook deliveries delayed by more than 30 minutes; admin login from an unknown country | 15 minutes         | Every 60 minutes      |
| SEV3     | Minor: limited impact and a workaround exists                                  | Insights reports delayed; SMS delivery failing in one region                            | 1 hour             | Every 4 hours         |
| SEV4     | Low: cosmetic, or no customer impact                                           | Typo in the Carrier Portal; a failed internal job that retries                          | Next business day  | Daily until closed    |

Rules for choosing a severity:

- When in doubt, choose the higher severity.
- Any incident that involves personal data starts at SEV2 or higher.
- Only the Incident Commander can lower the severity of an open incident.
- A P1 support ticket (see the Customer Support SLA) opens a SEV2 incident automatically. The Incident Commander decides whether to raise it to SEV1.

## Incident roles

- Incident Commander (IC): runs the response and makes the decisions. The primary on-call engineer is the IC until they hand the role to someone else.
- Communications Lead: owns the status page and customer updates. For SEV1 and SEV2 this person comes from Customer Support.
- Operations Lead: does the hands-on investigation and fix.
- Scribe: keeps the timeline in the incident document.
- Security Lead: required for every security incident, always from the Security team.

## On-call rotation

- Production on-call runs in weekly shifts. Handover happens every Monday at 10:00 Toronto time.
- Each week has a primary and a secondary on-call engineer from the Platform Engineering pool.
- If the primary was paged more than 2 times during the night, they can hand the next day to the secondary.
- Engineers join the rotation after 3 months of employment and 2 completed shadow shifts.
- The Security team keeps its own security on-call rotation, in 2-week shifts.
- On-call pay is set in the Employee Handbook.

## Escalation contacts

Escalate by role, not by name. The paging system always knows who holds each role this week.

| Order | Role                                        | When to escalate                                         | How to reach                       |
| ----- | ------------------------------------------- | -------------------------------------------------------- | ---------------------------------- |
| 1     | Primary on-call engineer                    | Every page                                               | Paging system                      |
| 2     | Secondary on-call engineer                  | Primary has not acknowledged within 10 minutes           | Automatic page                     |
| 3     | Engineering Manager on duty                 | Any SEV1, or a SEV2 open for more than 1 hour            | Paging system, em-duty schedule    |
| 4     | Head of Security                            | Any suspected security incident or data exposure         | Security on-call first, then phone |
| 5     | VP Engineering                              | SEV1 declared, or a SEV2 open for more than 4 hours      | Phone                              |
| 6     | Data Protection Officer and General Counsel | Personal data is involved                                | Within 1 hour of confirmation      |
| 7     | CTO and CEO                                 | SEV1 open for more than 2 hours, or any confirmed breach | Phone call from the VP Engineering |

## Declaring an incident

Incidents are declared with the incident bot in Slack.

```bash
# Declare from any Slack channel. This opens a new #inc-<number> channel,
# a video bridge and an incident document from the template.
/incident declare --sev SEV2 --title "Webhook deliveries delayed for EU customers"

# Change the severity later (Incident Commander only)
/incident sev SEV1

# Page the security on-call directly for a suspected compromise
/incident page security-oncall

# Incident channels are archived 30 days after the incident is resolved.
/incident resolve --summary "Queue consumer restarted, backlog cleared"
```

## Response checklist

1. Acknowledge the page within the time set for the severity.
2. Declare the incident and set the severity.
3. Assign the Incident Commander, Communications Lead, Operations Lead and Scribe.
4. For SEV1 and SEV2, the Communications Lead posts on the status page within 15 minutes of the declaration.
5. Stabilize first. If a deploy went out in the last 2 hours, roll it back before debugging.
6. For a security incident, preserve evidence before changing anything (see Evidence preservation).
7. Contain the problem: revoke credentials, block addresses, isolate hosts.
8. Post updates at the cadence for the severity, even when there is nothing new.
9. Watch monitoring for 30 minutes after the fix before resolving the incident.
10. Open the postmortem document before the incident channel goes quiet.

## Security incidents

### Evidence preservation

Collect evidence before remediation, because rebooting or reimaging a host destroys memory and log data.

```bash
# Preserve evidence before remediation. Never reboot a suspected compromised host first.
# Evidence snapshot retention is 400 days, or longer while a legal hold is active.
qlctl snapshot create --host "$HOST_ID" --tag "incident=$INCIDENT_ID" --memory --disk

# Export audit logs for the affected tenant (the last 14 days by default)
qlctl audit export --tenant "$TENANT_ID" --since 14d --out "evidence/$INCIDENT_ID/"

# Record a hash of every exported file for the chain of custody
sha256sum evidence/"$INCIDENT_ID"/* > evidence/"$INCIDENT_ID"/SHA256SUMS
```

Store evidence only in the restricted evidence bucket. Access is limited to the Security team and General Counsel.

### Personal data breach

- The Data Protection Officer is notified within 1 hour of confirming that personal data is involved.
- Affected customers are notified no later than 48 hours after a breach of their data is confirmed.
- Where Quaylark is the controller, the Data Protection Officer decides on notifying the supervisory authority, which must happen within 72 hours.
- Every breach, including ones that need no notification, is recorded in the breach register.

### Credential compromise

- Rotate the affected secrets and force sign-out of all sessions for the affected accounts.
- If customer API keys may be exposed, revoke them and ask the customers to create new ones.
- Check the audit log for actions taken with the compromised credentials during the exposure window.

### Lost or stolen devices

Employees report lost laptops and phones within 1 hour. The Security on-call triggers a remote wipe and revokes the device certificate and the hardware security key.

## After the incident

### Postmortems

- A blameless postmortem is required for every SEV1 and SEV2 incident. The draft is due within 5 business days of resolution.
- Action items are tracked in the issue tracker with the label postmortem. Action items from a SEV1 are due within 30 days.
- The Head of Security reviews every security postmortem before it is shared outside the team.

### Exercises

- The Security team runs a tabletop exercise every quarter.
- A full disaster recovery test runs twice a year. The targets are a recovery time objective (RTO) of 4 hours and a recovery point objective (RPO) of 15 minutes.
