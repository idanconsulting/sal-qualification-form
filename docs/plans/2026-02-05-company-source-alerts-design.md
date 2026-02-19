# Company Source Alerts - Design Document

**Date:** 2026-02-05
**Status:** Approved

## Overview

A system that alerts via Slack when a company has missing or conflicting source fields, allowing quick fixes directly from Slack.

### Problem

Company source fields (Motion, Lead source category, Lead source) are inherited from the first contact. When this inheritance fails or conflicts exist, the data quality suffers and there's no visibility into these issues.

### Solution

Automated detection and Slack-based resolution workflow:
1. HubSpot workflow triggers 10 minutes after company creation
2. n8n checks for missing/conflicting source fields
3. Slack alert with context and quick-fix buttons
4. Fix directly from Slack via buttons or modal form

---

## Fields Monitored

| Field | Type | Values |
|-------|------|--------|
| Motion | Dropdown | Inbound, Outbound, Events, Referral |
| Lead source category | Dropdown | PPC, Partners inbound, Signal based outbound, Sourcing outbound, Organic social, Organic search, Direct, Other campaigns, Investors referral, Customer/Prospect referral |
| Lead source | Open text | Free text |

---

## Alert Conditions

### 1. Missing Source
Company's Motion, Lead source category, or Lead source is empty.

### 2. Conflict: Company vs First Contact
Company source field value differs from the first associated contact's value.

### 3. Conflict: Contacts Disagree
Multiple associated contacts have different values for the same source field.

---

## Trigger Flow

```
Company Created in HubSpot
        ↓
HubSpot Workflow: Wait 10 minutes
        ↓
HubSpot Workflow: Send webhook to n8n (with company ID)
        ↓
n8n Workflow A: Detect issues
        ↓
If issues found → Send Slack alert
```

### Why 10-minute delay?
Allows time for contact association and field inheritance to happen naturally before checking for issues.

---

## Slack Alert Design

### Message Structure

```
🚨 Company Source Issue: [Company Name]

Type: Missing Source / Conflict Detected
Missing fields: Motion, Lead source category, Lead source (whichever apply)

📋 Company Details
• Owner: [Owner Name]
• Link: [HubSpot Company URL]

👥 Associated Contacts
━━━━━━━━━━━━━━━━━━━━━
Contact 1: [Name] ([Email]) - [HubSpot Contact Link]
• Created: [Date] | Created by: [User]
• Motion: [value] | Lead source category: [value] | Lead source: [value]
• Original traffic source: [value]
• Drill down 1: [value] | Drill down 2: [value]

Contact 2: [Name] ([Email]) - [HubSpot Contact Link]
• Created: [Date] | Created by: [User]
• Motion: [value] | Lead source category: [value] | Lead source: [value]
• Original traffic source: [value]
• Drill down 1: [value] | Drill down 2: [value]
━━━━━━━━━━━━━━━━━━━━━

[Quick Fix Buttons]
```

### Quick Fix Buttons

**Row 1 - Motion:**
- `Inbound` `Outbound` `Events` `Referral`

**Row 2 - Lead source category (most common):**
- `Direct` `Partners inbound` `Sourcing outbound` `PPC`

**Row 3:**
- `✏️ Open Full Form`

### Button Behavior
- Clicking a Motion button sets only the Motion field
- Clicking a Lead source category button sets only that field
- Multiple button clicks accumulate (click Motion, then Lead source category)
- "Open Full Form" opens modal with all fields

---

## Slack Modal Design

**Title:** Fix Company Source - [Company Name]

### Read-only Reference Section
Displays the same contact details from the alert for reference while filling the form.

### Form Fields

| Field | Type | Options |
|-------|------|---------|
| Motion | Dropdown | Inbound, Outbound, Events, Referral |
| Lead source category | Dropdown | All 10 values |
| Lead source | Text input | Free text |

### Pre-fill Behavior
- If company already has a value (conflict cases), pre-select it
- If missing, show placeholder "Select..."

### Buttons
- `Submit` - Updates HubSpot, confirms in Slack thread
- `Cancel` - Closes modal, no changes

---

## n8n Workflow Architecture

### Workflow A: Alert Sender

**Trigger:** Webhook from HubSpot (receives company ID)

**Steps:**
1. Receive company ID from HubSpot webhook
2. Get company details via HubSpot API:
   - name, domain, hubspot_owner_id
   - Motion, Lead source category, Lead source
3. Get company owner details (name)
4. Get associated contacts via HubSpot API
5. Batch read contact details:
   - firstname, lastname, email
   - createdate, hubspot_owner_id (created by)
   - Motion, Lead source category, Lead source
   - Original traffic source, Drill down 1, Drill down 2
6. Check for missing/conflict conditions
7. If issues found → format and send Slack alert with buttons
8. If no issues → end silently

### Workflow B: Fix Handler

**Trigger:** Slack interaction webhook (button click or modal submit)

**Steps:**
1. Receive Slack interaction payload
2. Parse action type:
   - Quick button → extract field and value
   - Modal submit → extract all field values
3. Extract company ID from message metadata
4. Update company in HubSpot via API
5. Send confirmation message to Slack thread
6. For quick buttons: update the original message to show what's been set

---

## Slack App Requirements

### App Name
"Company Source Alerts" (or similar)

### Features Needed

1. **Incoming Webhooks**
   - URL: `SLACK_WEBHOOK_URL`

2. **Interactivity & Shortcuts**
   - Enable interactivity
   - Request URL: n8n Workflow B webhook URL

3. **Bot Token Scopes**
   - `chat:write` - Send messages
   - `chat:write.public` - Post to channels

### Setup Steps
1. Go to api.slack.com/apps
2. Create new app (or use existing)
3. Enable Interactivity under "Interactivity & Shortcuts"
4. Set Request URL to n8n Workflow B webhook
5. Add required bot token scopes under "OAuth & Permissions"
6. Install/reinstall app to workspace

---

## HubSpot Workflow Configuration

**Workflow Name:** Company Source Alert Trigger

**Trigger:** Company is created

**Actions:**
1. Delay: 10 minutes
2. Webhook: POST to n8n Workflow A
   - Include: Company ID

**Enrollment:** All new companies

---

## Data Flow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  HubSpot    │────▶│    n8n      │────▶│   Slack     │
│  Workflow   │     │  Workflow A │     │   Alert     │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                   │
                           │                   ▼
                           │            ┌─────────────┐
                           │            │   User      │
                           │            │   Action    │
                           │            └─────────────┘
                           │                   │
                           │                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  HubSpot    │◀────│    n8n      │◀────│   Slack     │
│  Updated    │     │  Workflow B │     │  Callback   │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## HubSpot Properties Required

### Company Properties (Read)
- `name`
- `domain`
- `hubspot_owner_id`
- `motion` (custom)
- `lead_source_category` (custom)
- `lead_source` (custom)

### Company Properties (Write)
- `motion`
- `lead_source_category`
- `lead_source`

### Contact Properties (Read)
- `firstname`
- `lastname`
- `email`
- `createdate`
- `hubspot_owner_id`
- `motion`
- `lead_source_category`
- `lead_source`
- `hs_analytics_source` (Original traffic source)
- `hs_analytics_source_data_1` (Drill down 1)
- `hs_analytics_source_data_2` (Drill down 2)

---

## Implementation Checklist

### Phase 1: Slack App Setup
- [ ] Create Slack app at api.slack.com/apps
- [ ] Enable Interactivity
- [ ] Add bot token scopes
- [ ] Install to workspace

### Phase 2: n8n Workflow A (Alert Sender)
- [ ] Create webhook trigger
- [ ] Add HubSpot company fetch
- [ ] Add HubSpot contacts fetch
- [ ] Add detection logic (missing/conflict)
- [ ] Add Slack alert formatting
- [ ] Add Slack send with buttons

### Phase 3: n8n Workflow B (Fix Handler)
- [ ] Create webhook trigger for Slack interactions
- [ ] Add button click handler
- [ ] Add modal submit handler
- [ ] Add HubSpot company update
- [ ] Add Slack confirmation message

### Phase 4: HubSpot Workflow
- [ ] Create workflow with company creation trigger
- [ ] Add 10-minute delay
- [ ] Add webhook action to n8n

### Phase 5: Testing
- [ ] Test missing source detection
- [ ] Test conflict detection (company vs contact)
- [ ] Test conflict detection (contact vs contact)
- [ ] Test quick button fixes
- [ ] Test modal form submission
- [ ] Test confirmation messages

---

## Success Criteria

1. Alert sent within 11 minutes of company creation (10 min delay + processing)
2. Alert accurately identifies missing vs conflict issues
3. Quick buttons update HubSpot within 2 seconds
4. Modal form updates all three fields correctly
5. Confirmation message appears in Slack thread after fix
