# Quaylark Public API v3 Specification

Status: generally available. Last updated 3 September 2026. Audience: customers and integration partners.

## Overview

The Quaylark Public API lets warehouses, third-party logistics providers and carriers read and change dock appointments, trailers and yard events from their own systems. It is a REST API that sends and receives JSON over HTTPS.

- Production base URL: `https://api.quaylark.example/v3`
- Sandbox base URL: `https://sandbox.api.quaylark.example/v3`

Main resources are sites, docks, appointments, carriers, trailers and yard events. Object IDs carry a type prefix: `site_`, `dock_`, `appt_`, `car_` and `trl_`. All timestamps are ISO 8601 in UTC.

## Authentication

- Every request carries an API key in the header `Authorization: Bearer <key>`.
- Production keys start with `qlk_live_` and sandbox keys start with `qlk_test_`. A sandbox key never touches production data.
- Partner applications use OAuth 2.0 with the client credentials grant. Access tokens expire after 3600 seconds, and there are no refresh tokens: request a new token instead.
- Only a workspace Admin can create keys. A workspace can have at most 10 active API keys.
- Rotate keys at least every 90 days. The old key keeps working for 24 hours after a rotation.

## Requests

### Conventions

- List endpoints use cursor pagination with the `cursor` and `limit` query parameters.
- Send an `Idempotency-Key` header on every POST. Quaylark stores idempotency keys for 24 hours and returns the original response for a repeated key.
- Unknown fields in a request body are rejected with `invalid_request`.

### Limits

- Maximum body size: 1 MB.
- Bulk calls accept at most 500 items.
- Page size: default 50, maximum 200 items.
- Query strings are limited to 2,048 characters.
- Free text fields accept up to 4,000 characters.

## Rate limits

Rate limits apply per workspace, not per API key, and depend on the workspace's plan.

| Plan       | Plan code     | Requests per minute               | Burst allowance | Webhook endpoints |
| ---------- | ------------- | --------------------------------- | --------------- | ----------------- |
| Starter    | PLN-START-24  | 60                                | 20              | 2                 |
| Growth     | PLN-GROWTH-24 | 300                               | 100             | 10                |
| Scale      | PLN-SCALE-24  | 1,200                             | 400             | 25                |
| Enterprise | PLN-ENT-24    | 3,000 by default, set by contract | 1,000           | 100               |

- Every response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (a Unix timestamp in seconds).
- A request over the limit gets HTTP 429 with the error code `rate_limited` and a `Retry-After` header in seconds.
- Clients that keep ignoring `Retry-After` for more than 10 minutes are blocked for 1 hour.
- Growth, Scale and Enterprise workspaces can buy extra capacity with the add-on ADD-API-05, which adds 300 requests per minute per unit. Prices are in the Pricing and Plans document.

## Appointments

### Create an appointment

`POST /v3/appointments` books a dock door for a time window. Example request body:

```json
{
  "site_id": "site_7Hq2Lm",
  "dock_id": "dock_A14",
  "carrier_id": "car_58KzQ",
  "type": "inbound",
  "window": {
    "start": "2026-10-14T13:30:00Z",
    "end": "2026-10-14T14:15:00Z"
  },
  "load": {
    "reference": "PO-448120",
    "pallets": 22,
    "temperature_controlled": true
  },
  "notify_driver": {
    "phone": "+15555550142",
    "channel": "sms"
  }
}
```

A successful call returns HTTP 201 with the new appointment ID (for example `appt_9fK2xQ71`) and the status `scheduled`.

### Appointment rules

- The shortest bookable window is 15 minutes.
- Appointments cannot be created more than 180 days in advance.
- If the trailer has not checked in 45 minutes after the window starts, the appointment becomes `no_show`. Each site can change this grace period.
- Statuses: `scheduled`, `checked_in`, `at_door`, `completed`, `no_show` and `cancelled`.

## Webhooks

### Events

Webhooks push changes to your endpoint as they happen. Available events:

- `appointment.created`
- `appointment.rescheduled`
- `appointment.cancelled`
- `appointment.no_show`
- `trailer.checked_in`
- `trailer.checked_out`
- `dock.door_status_changed`

### Delivery and signatures

- Quaylark sends each event as an HTTP POST with a JSON body. Your endpoint must answer with a 2xx status within 10 seconds, or the delivery counts as failed.
- Each delivery carries the header `Quaylark-Signature` in the form `t=<timestamp>,v1=<signature>`. The signature is an HMAC-SHA256 of `<timestamp>.<raw body>`, keyed with the endpoint secret. Endpoint secrets start with `whsec_`.
- Verify the signature on the raw request body before parsing it. Example in Node.js:

```js
import crypto from 'node:crypto';

export function verifyQuaylarkSignature(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(',').map((part) => part.split('=')));
  const timestamp = Number(parts.t);
  // Reject events whose timestamp is more than 300 seconds old (replay protection).
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) {
    return false;
  }
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest();
  const received = Buffer.from(parts.v1 ?? '', 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

### Retry policy

- A delivery fails when your endpoint returns a status other than 2xx, times out, or refuses the connection.
- Failed deliveries are retried up to 8 times with exponential backoff. The retries happen 30 seconds, 2 minutes, 10 minutes, 30 minutes, 1 hour, 3 hours, 6 hours and 12 hours after the previous attempt.
- Every event has a stable `event_id`. Deliveries can arrive more than once or out of order, so deduplicate on `event_id`.
- After the last retry the event is marked failed. Failed events can be replayed from the dashboard for 14 days.
- An endpoint that fails continuously for 72 hours is disabled automatically, and every workspace Admin gets an email.
- If your endpoint answers HTTP 410 Gone, Quaylark disables it immediately.

## Errors

Errors return a JSON body with `error.code`, `error.message` and a `request_id` to quote when contacting support.

| HTTP status | Error code              | Meaning                                                           |
| ----------- | ----------------------- | ----------------------------------------------------------------- |
| 400         | invalid_request         | The body or query string failed validation                        |
| 401         | invalid_api_key         | The key is missing, revoked or from the wrong environment         |
| 403         | insufficient_scope      | The key or token does not have the needed scope                   |
| 404         | not_found               | The object does not exist in this workspace                       |
| 409         | slot_conflict           | The dock door already has an appointment in that window           |
| 422         | outside_operating_hours | The window falls outside the site's dock hours                    |
| 429         | rate_limited            | Too many requests, wait for the Retry-After period                |
| 500         | internal_error          | Something failed on our side, retry with the same Idempotency-Key |

## Versioning and deprecation

- API v2 was deprecated on 1 March 2026 and will be switched off on 31 March 2027.
- Breaking changes only ship in a new major version, announced at least 12 months ahead.
- New fields and new event types can be added at any time. Clients must ignore fields they do not recognize in responses.
