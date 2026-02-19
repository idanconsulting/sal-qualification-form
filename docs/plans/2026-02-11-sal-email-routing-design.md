# SAL Form Email Routing — Meeting-Based AE Detection

**Date:** 2026-02-11
**Workflow:** SAL Form - Send to AE (v2) (`nUo2BsMD5WWQiQlA`)

## Problem

The SAL form email currently routes to whoever is set as `ae_owner` on the company, falling back to `hubspot_owner_id` (company owner). This can result in the email being sent to SDRs (Lisa Ceresne or Liza Dymava) who are not AEs and shouldn't receive it.

## Solution

Replace the blind company-field lookup with meeting-participant-based AE detection. Check who is actually on the meeting (host + attendees) and route to the correct AE.

## Routing Priority

1. **Yoav Naveh** — If his owner ID (`76222677` or `75650460`) appears as meeting host or attendee, send to `yoav@reindeer.ai`
2. **Yair Weinberger** — If his owner ID (`76301426` or `75813016`) appears as meeting host or attendee, send to `yair@reindeer.ai`
3. **Company ae_owner** — Fall back to the company's `ae_owner` field, unless it resolves to Lisa (`87078486`) or Liza (`76139933`, `75629883`)
4. **Idan Ron** — Last resort fallback, send to `idan.ron@reindeerlabs.ai`

## Owner ID Reference

| Person | Role | Owner IDs | Email |
|--------|------|-----------|-------|
| Yoav Naveh | AE | `76222677`, `75650460` | yoav@reindeer.ai |
| Yair Weinberger | AE | `76301426`, `75813016` | yair@reindeer.ai |
| Lisa Ceresne | SDR (excluded) | `87078486` | lisa.c@reindeer.ai |
| Liza Dymava | SDR (excluded) | `76139933`, `75629883` | liza.d@reindeer.ai |
| Idan Ron | Fallback | `86787169` | idan.ron@reindeerlabs.ai |

## Implementation

**Single node change:** Only the "Code - Prepare Form Data" node is modified. No workflow structure changes.

The meeting data is already available in the Code node:
- `meeting.properties.hubspot_owner_id` — meeting host owner ID
- `meeting.properties.hs_attendee_owner_ids` — comma-separated attendee owner IDs

### Updated logic in the Code node:

```javascript
// 1. Collect all meeting participant owner IDs
const meetingHost = meeting.properties.hubspot_owner_id || "";
const attendeeIds = (meeting.properties.hs_attendee_owner_ids || "").split(";").map(id => id.trim()).filter(Boolean);
const allParticipantIds = [meetingHost, ...attendeeIds];

// 2. AE detection priority
const YOAV_IDS = ["76222677", "75650460"];
const YAIR_IDS = ["76301426", "75813016"];
const SDR_IDS = ["87078486", "76139933", "75629883"]; // Lisa, Liza

let resolvedAeName, resolvedAeEmail;

if (YOAV_IDS.some(id => allParticipantIds.includes(id))) {
  resolvedAeName = "Yoav Naveh";
  resolvedAeEmail = "yoav@reindeer.ai";
} else if (YAIR_IDS.some(id => allParticipantIds.includes(id))) {
  resolvedAeName = "Yair Weinberger";
  resolvedAeEmail = "yair@reindeer.ai";
} else if (aeOwner && aeOwner.email && !SDR_IDS.includes(aeOwner.id)) {
  resolvedAeName = `${aeOwner.firstName || ""} ${aeOwner.lastName || ""}`.trim() || "Unknown AE";
  resolvedAeEmail = aeOwner.email;
} else {
  resolvedAeName = "Idan Ron";
  resolvedAeEmail = "idan.ron@reindeerlabs.ai";
}

// 3. Use resolvedAeName / resolvedAeEmail in formData instead of aeName / aeEmail
```

### What stays the same:
- Workflow structure and connections
- "HTTP - Get AE Owner" node (still fetches company ae_owner for fallback)
- Email template, BCC list, SDR lookup, form URL generation
- The greeting says "Hi {aeName}" using whichever AE was resolved

## Test Blueprint

### Surface Area
- **Tables:** None (no database changes)
- **Edge functions:** None
- **UI components:** None (email content only)
- **External systems:** n8n workflow, HubSpot API (meeting data), Gmail

### Success Signals
- **Email:** Correct AE receives the SAL form email
- **Email greeting:** Says "Hi Yoav Naveh" / "Hi Yair Weinberger" / etc. matching the resolved AE
- **Webhook response:** Returns the correct `aeEmail` and `aeName`

### Failure Signals
- **Email:** Lisa or Liza receives the SAL form email
- **Email:** Email sent to wrong AE (e.g., Yair when Yoav was on the meeting)
- **Email:** No email sent (routing logic error)

### Test Scenarios

#### Happy Path
1. **Yoav is meeting host** — Email goes to yoav@reindeer.ai, greeting says "Hi Yoav Naveh"
2. **Yoav is an attendee (not host)** — Same result, email goes to Yoav
3. **Yair is meeting host, Yoav not present** — Email goes to yair@reindeer.ai
4. **Neither AE on meeting, valid ae_owner on company** — Falls back to company ae_owner
5. **Neither AE on meeting, no ae_owner** — Falls back to Idan

#### Failure Path
1. **Meeting has no host or attendee IDs** — Should fall back to ae_owner, then Idan
2. **ae_owner field is Lisa's owner ID** — Should skip Lisa and fall back to Idan
3. **ae_owner field is Liza's owner ID** — Should skip Liza and fall back to Idan

#### Adversarial
1. **Both Yoav AND Yair on the meeting** — Yoav takes priority (first in chain)
2. **Yoav + Lisa on the meeting** — Yoav selected, Lisa ignored
3. **Only Lisa on the meeting** — Falls through to ae_owner or Idan
4. **hs_attendee_owner_ids has unexpected format** (extra spaces, empty strings) — Parsing handles gracefully

### Risk Assessment
| Category | Applies | Risk Level | Notes |
|----------|---------|------------|-------|
| Wrong target | yes | medium | Core risk — email to wrong person. Mitigated by priority chain + SDR exclusion |
| Duplicate execution | no | low | Workflow is webhook-triggered, single execution |
| Data loss | no | low | Read-only change, no CRM writes |
| Hardcoded IDs | yes | medium | If team changes or new AEs join, IDs need updating |
