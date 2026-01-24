# SAL Form - Architecture Diagram

## High-Level System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         HUBSPOT CRM                             │
│                                                                 │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐ │
│  │   Contact    │──────│   Company    │──────│     Deal     │ │
│  │ Properties   │      │ Properties   │      │   Pipeline   │ │
│  └──────────────┘      └──────────────┘      └──────────────┘ │
│         ▲                      ▲                      ▲        │
│         │                      │                      │        │
│         │              ┌───────┴───────┐              │        │
│         │              │   Workflow    │              │        │
│         │              │  Meeting →    │              │        │
│         │              │   Webhook     │              │        │
│         │              └───────┬───────┘              │        │
└─────────┼──────────────────────┼──────────────────────┼────────┘
          │                      │                      │
          │                      ▼                      │
          │         ┌────────────────────────┐          │
          │         │    n8n AUTOMATION      │          │
          │         │                        │          │
          │         │  ┌──────────────────┐  │          │
          │         │  │  Workflow 1:     │  │          │
          │         │  │  Send Form       │  │          │
          │         │  │                  │  │          │
          │         │  │  1. Get Contact  │  │          │
          │         │  │  2. Get Company  │  │          │
          │         │  │  3. Get Meeting  │  │          │
          │         │  │  4. Build Token  │  │          │
          │         │  │  5. Send Slack   │  │          │
          │         │  └────────┬─────────┘  │          │
          │         │           │            │          │
          │         └───────────┼────────────┘          │
          │                     │                       │
          │                     ▼                       │
          │         ┌────────────────────────┐          │
          │         │   SLACK WORKSPACE      │          │
          │         │                        │          │
          │         │  ┌──────────────────┐  │          │
          │         │  │  Message to AE   │  │          │
          │         │  │                  │  │          │
          │         │  │  [Button: Open   │  │          │
          │         │  │   SAL Form]      │  │          │
          │         │  └────────┬─────────┘  │          │
          │         │           │            │          │
          │         └───────────┼────────────┘          │
          │                     │                       │
          │                     ▼                       │
          │         ┌────────────────────────┐          │
          │         │   VERCEL HOSTING       │          │
          │         │                        │          │
          │         │  ┌──────────────────┐  │          │
          │         │  │  React Form      │  │          │
          │         │  │  (One Screen)    │  │          │
          │         │  │                  │  │          │
          │         │  │  - Auto-filled   │  │          │
          │         │  │  - Radio buttons │  │          │
          │         │  │  - Validation    │  │          │
          │         │  │  - Submit        │  │          │
          │         │  └────────┬─────────┘  │          │
          │         │           │            │          │
          │         └───────────┼────────────┘          │
          │                     │                       │
          │                     ▼                       │
          │         ┌────────────────────────┐          │
          │         │    n8n AUTOMATION      │          │
          │         │                        │          │
          │         │  ┌──────────────────┐  │          │
          │         │  │  Workflow 2:     │  │          │
          │         │  │  Process Form    │  │          │
          │         │  │                  │  │          │
          │         │  │  1. Receive      │  │          │
          │         │  │  2. Route Logic  │  │          │
          │         │  │  3. Update CRM   │──┼──────────┘
          │         │  │  4. Notify SDR   │──┼───────────┐
          │         │  └──────────────────┘  │           │
          │         └────────────────────────┘           │
          │                                              │
          └──────────────────────────────────────────────┘
                                                         │
                                                         ▼
                                          ┌──────────────────────┐
                                          │  SLACK WORKSPACE     │
                                          │                      │
                                          │  Message to SDR      │
                                          │  (if meeting         │
                                          │   not held, etc.)    │
                                          └──────────────────────┘
```

---

## Detailed Data Flow

### Scenario 1: Meeting Held - Accept as SAL

```
1. HubSpot Meeting Status → "Completed"
   │
2. HubSpot Workflow Triggers
   │
   └─→ POST /webhook/sal-meeting-complete
       {
         "contactId": "12345",
         "meetingId": "67890"
       }
   │
3. n8n Workflow 1 Executes
   │
   ├─→ GET /crm/v3/objects/contacts/12345
   │   Returns: { firstname, lastname, email, owner, ... }
   │
   ├─→ GET /crm/v3/objects/companies/{companyId}
   │   Returns: { name, size, industry, ... }
   │
   ├─→ GET /crm/v3/objects/meetings/67890
   │   Returns: { date, attendees, ... }
   │
   ├─→ Function: Build Form Data
   │   {
   │     contactId: "12345",
   │     contactName: "John Smith",
   │     companyName: "Acme Corp",
   │     aeName: "Sarah Johnson",
   │     ...
   │   }
   │
   ├─→ Function: Generate Token
   │   token = base64(JSON.stringify(formData))
   │
   ├─→ Function: Build Form URL
   │   url = "https://form.vercel.app?token=xyz..."
   │
   └─→ POST https://hooks.slack.com/services/XXX
       {
         "blocks": [
           {
             "type": "button",
             "url": "https://form.vercel.app?token=xyz..."
           }
         ]
       }
   │
4. AE Receives Slack Message
   │
5. AE Clicks Button
   │
6. Form Loads (Vercel)
   │
   ├─→ Parse token from URL
   │   formData = JSON.parse(atob(token))
   │
   ├─→ Pre-populate form fields
   │   - Contact Name: "John Smith"
   │   - Company: "Acme Corp"
   │   - etc.
   │
   └─→ Render form (wait for AE input)
   │
7. AE Fills Form
   │
   ├─→ Meeting held: Yes ✓
   ├─→ Identified need: Yes ✓
   ├─→ Decision maker: Yes ✓
   ├─→ Next step: Yes ✓
   └─→ SAL Decision: Accept ✓
   │
8. AE Submits Form
   │
   └─→ POST /webhook/sal-form-submit
       {
         contactId: "12345",
         formResponses: {
           meetingHeld: "Yes",
           identifiedNeed: "Yes",
           decisionMaker: "Yes",
           nextStep: "Yes",
           salDecision: "Accept",
           comments: "Great fit!"
         }
       }
   │
9. n8n Workflow 2 Executes
   │
   ├─→ Check: meetingHeld === "Yes" ✓
   │
   ├─→ PATCH /crm/v3/objects/contacts/12345
   │   {
   │     properties: {
   │       sal_meeting_held: "Yes",
   │       sal_identified_need: true,
   │       sal_identified_decision_maker: true,
   │       sal_next_step_commitment: true,
   │       sal_decision: "Accept",
   │       sal_form_submitted_date: "2026-01-22"
   │     }
   │   }
   │
   ├─→ PATCH /crm/v3/objects/companies/{companyId}
   │   {
   │     properties: {
   │       sal_qualified: true,
   │       sal_last_qualification_date: "2026-01-22"
   │     }
   │   }
   │
   ├─→ PATCH /crm/v3/objects/deals/{dealId}
   │   {
   │     properties: {
   │       dealstage: "sal_qualified"
   │     }
   │   }
   │
   └─→ Return 200 OK
       { success: true }
   │
10. Form Shows Success Message
    ✓ Form Submitted
    The qualification has been recorded in HubSpot.
```

---

### Scenario 2: Meeting Not Held

```
1-6. [Same as above until form loads]
│
7. AE Selects "Meeting held: No"
   │
   └─→ Triggers auto-submit
   │
8. Form Submits Immediately
   │
   └─→ POST /webhook/sal-form-submit
       {
         contactId: "12345",
         formResponses: {
           meetingHeld: "No",
           autoSubmit: true
         }
       }
   │
9. n8n Workflow 2 Executes
   │
   ├─→ Check: meetingHeld === "No" ✓
   │
   ├─→ PATCH /crm/v3/objects/contacts/12345
   │   {
   │     properties: {
   │       sal_meeting_held: "No",
   │       sal_form_submitted_date: "2026-01-22"
   │     }
   │   }
   │
   └─→ POST https://hooks.slack.com/services/XXX (SDR webhook)
       {
         "text": "⚠️ Meeting did not occur",
         "blocks": [
           {
             "text": "Contact: John Smith\nPlease follow up..."
           }
         ]
       }
   │
10. SDR Receives Slack Notification
```

---

## Component Responsibilities

### HubSpot
**Responsibilities:**
- Store contact, company, deal data
- Trigger workflow on meeting completion
- Receive updates from n8n
- Manage lifecycle stages

**APIs Used:**
- CRM API v3 (contacts, companies, deals)
- Workflows API (webhook trigger)

---

### n8n Workflow 1: Send Form
**Responsibilities:**
- Receive webhook from HubSpot
- Fetch contact data
- Fetch company data
- Fetch meeting data
- Identify AE from attendees
- Generate secure token
- Build form URL
- Send Slack message to AE

**Nodes:**
- Webhook Trigger
- HubSpot (Get Contact)
- HubSpot (Get Company)
- HubSpot (Get Meeting)
- Function (Prepare Data)
- HTTP Request (Slack)

---

### Slack
**Responsibilities:**
- Deliver messages to AEs
- Deliver notifications to SDRs
- Provide button to open form

**Webhooks:**
- Incoming Webhook for AEs
- Incoming Webhook for SDRs

---

### React Form (Vercel)
**Responsibilities:**
- Decode token from URL
- Display pre-filled data
- Collect AE input
- Validate form data
- Handle auto-submit logic
- Prevent duplicate submissions
- Submit to n8n webhook

**Features:**
- Single-page UI
- Radio buttons
- Conditional fields
- Real-time validation
- Loading states
- Success/error messages

---

### n8n Workflow 2: Process Submission
**Responsibilities:**
- Receive form submission
- Route based on meeting status
- Update HubSpot contact
- Update HubSpot company (if accepted)
- Update deal stage (if accepted)
- Send SDR notifications (if needed)
- Handle errors gracefully

**Nodes:**
- Webhook Trigger
- IF (Meeting Not Held)
- IF (Meeting Rescheduled)
- Switch (SAL Decision)
- HubSpot (Update Contact) x3
- HubSpot (Update Company)
- HubSpot (Update Deal)
- HTTP Request (Slack) x4

---

## Security Flow

```
┌─────────────┐
│  HubSpot    │
│  Trusted    │
└──────┬──────┘
       │ HTTPS + API Key
       ▼
┌─────────────┐
│    n8n      │
│  Trusted    │
└──────┬──────┘
       │ HTTPS + Base64 Token
       ▼
┌─────────────┐
│  Form (AE)  │
│  Browser    │
└──────┬──────┘
       │ HTTPS + Token
       ▼
┌─────────────┐
│    n8n      │
│  Trusted    │
└──────┬──────┘
       │ HTTPS + API Key
       ▼
┌─────────────┐
│  HubSpot    │
│  Updated    │
└─────────────┘
```

**Security Layers:**
1. HTTPS everywhere
2. API keys never exposed to browser
3. Token includes only necessary data
4. One-time submission check
5. HubSpot API validates all updates

---

## Error Handling

```
If Error Occurs → Log in n8n → Continue Workflow (where possible)

Critical Errors (stop workflow):
- HubSpot API unreachable
- Invalid credentials
- Missing required data

Non-Critical Errors (log and continue):
- Slack webhook fails (user can still submit)
- AE identification fails (use default)
- Optional field missing

Form Validation Errors:
- Show inline error message
- Prevent submission
- User corrects and resubmits
```

---

## Scalability Considerations

**Current Design:**
- ✅ Handles ~100 forms/day easily
- ✅ n8n can process concurrent requests
- ✅ Vercel scales automatically
- ✅ HubSpot API has rate limits (handle in n8n)

**If Scaling Needed:**
- Add queue system (Redis/RabbitMQ)
- Implement retry logic
- Add caching layer
- Monitor API rate limits
- Consider HubSpot API batching

---

## Monitoring Points

```
1. HubSpot Workflow
   └─→ Check: Webhook delivery success rate

2. n8n Workflow 1
   └─→ Check: Execution success rate
   └─→ Check: Average execution time

3. Slack
   └─→ Check: Message delivery rate

4. Form (Vercel)
   └─→ Check: Load time
   └─→ Check: Submission success rate
   └─→ Check: Error rate

5. n8n Workflow 2
   └─→ Check: Execution success rate
   └─→ Check: HubSpot update success rate
```

---

## Technology Stack Details

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend | React | 18.3.1 | Form UI |
| Build Tool | Vite | 5.4.11 | Fast dev & build |
| Styling | Tailwind CSS | 3.4.17 | Responsive design |
| Hosting | Vercel | Latest | Form hosting |
| Automation | n8n | Latest | Workflow engine |
| CRM | HubSpot | API v3 | Data storage |
| Notifications | Slack | Webhooks | Messaging |

---

**Last Updated:** 2026-01-22
**Architecture Version:** 1.0.0
