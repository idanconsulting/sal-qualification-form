# HubSpot Data Watchdog — Design Document

**Date:** 2026-02-17
**Status:** Approved

## Overview

A comprehensive CRM data quality monitoring system that detects anomalies in HubSpot and reports them to Slack. Uses a hybrid architecture: deterministic checks for well-defined rules, AI-powered checks for fuzzy matching and root cause analysis. Self-adjusting via Slack feedback loop.

---

## Architecture

### Three Layers

**Layer 1 — Coordinator Workflows (n8n)**
Fan-out pattern: scheduled trigger → parallel HTTP calls to check sub-workflows → collect results → evaluate → Slack digest.

**Layer 2 — Check Sub-Workflows (n8n)**
Each check is its own n8n workflow with a webhook endpoint. Returns a standardized result format.

**Layer 3 — Intelligence & Feedback**
AI nodes in Tier 2 checks, shared root cause analyzer, and Slack feedback handler.

### Standardized Result Format

Every check sub-workflow returns this JSON:

```json
{
  "check_id": "duplicate-companies",
  "status": "fail",
  "severity": "high",
  "count": 3,
  "items": [
    {
      "record_type": "company",
      "record_id": "123",
      "record_name": "Acme Inc",
      "details": "Duplicate of Acme Incorporated (ID: 456) — same domain acme.com",
      "hubspot_url": "https://app.hubspot.com/contacts/xxx/company/123"
    }
  ],
  "root_cause": "Acme Inc created by import (Feb 10), Acme Incorporated created manually by Sarah (Feb 14)"
}
```

---

## Coordinator Workflows

### Daily Coordinator

**Schedule:** Every day at 8:00 AM

**Nodes:**

1. **Schedule Trigger** — "Every day at 8am"

2. **HTTP Request (Supabase)** — Fetch enabled daily checks
   ```
   GET {supabase_url}/rest/v1/watchdog_checks?schedule=eq.daily&enabled=eq.true
   Headers: apikey, Authorization: Bearer {service_role_key}
   ```
   Returns list of checks with their webhook_urls.

3. **Fan-out HTTP Requests** — Call each check's webhook_url in parallel
   Each sub-workflow runs independently and returns its standardized result.
   Use the same parallel fan-out pattern as the existing health check system (one HTTP Request node per check, all triggered from the schedule node, feeding into a single Collect Results node).

4. **Collect Results (Merge node, mode: append)** — Combine all results into one array.

5. **HTTP Request (Supabase)** — Save results
   ```
   POST {supabase_url}/rest/v1/watchdog_results
   Body: array of {check_id, run_at, status, violation_count, violations, root_cause}
   ```

6. **Code node (Build Slack Digest)** — Format results into Slack Block Kit message.
   Groups violations by severity (critical → high → medium).
   Includes action buttons per violation.
   See "Slack Experience" section for exact format.

7. **IF node** — Any failures?
   Condition: `violations.length > 0`
   - True → Send Slack Alert
   - False → End (silent)

8. **HTTP Request (Slack)** — POST to Slack webhook with formatted blocks.

### Hourly Coordinator

**Schedule:** Every hour at :00

Same pattern as Daily but queries `schedule=eq.hourly`. Only runs time-sensitive checks (meeting-status-mismatch, lifecycle-pipeline-mismatch).

### Real-Time

Not a coordinator — individual workflows triggered by HubSpot webhooks. Currently only `missing-company-source` (the existing Company Source Alert workflow). Sends its own individual Slack alert immediately rather than batching into a digest.

---

## Tier 1 — Deterministic Check Workflow Template

Every Tier 1 check follows this exact 5-node pattern:

```
Webhook Trigger → Fetch Exceptions (Supabase) → Query HubSpot → Business Logic + Filter (Code) → Respond to Webhook
```

### Node-by-node:

**Node 1: Webhook**
- Path: `/webhook/watchdog-{check_id}`
- Method: POST
- Response mode: "Last Node"

**Node 2: HTTP Request — Fetch Exceptions**
```
GET {supabase_url}/rest/v1/watchdog_exceptions?check_id=eq.{check_id}&active=eq.true
Headers: apikey, Authorization
```

**Node 3: HTTP Request — Query HubSpot**
The specific HubSpot API call varies per check (detailed below for each check).

**Node 4: Code Node — Business Logic**
- Apply check-specific logic
- Filter results against exceptions from Node 2
- Format into standardized result JSON

**Node 5: Respond to Webhook**
- Returns the standardized result JSON

---

## Tier 1 Check Specifications

### Check 1: `missing-company-source`

**Trigger:** Real-time (existing workflow, migrated in Phase 5) + Daily sweep
**Severity:** high

**HubSpot API Call:**
```
POST /crm/v3/objects/companies/search
{
  "filterGroups": [
    {
      "filters": [
        { "propertyName": "motion", "operator": "NOT_HAS_PROPERTY" }
      ]
    },
    {
      "filters": [
        { "propertyName": "lead_source_category", "operator": "NOT_HAS_PROPERTY" }
      ]
    },
    {
      "filters": [
        { "propertyName": "lead_source", "operator": "NOT_HAS_PROPERTY" }
      ]
    }
  ],
  "properties": ["name", "domain", "motion", "lead_source_category", "lead_source", "hubspot_owner_id"],
  "limit": 100
}
```
Note: filterGroups are OR-ed — returns companies missing ANY of the three fields.

**Business Logic:**
- For each company, identify which fields are missing
- Fetch associated contacts to detect conflicts (company vs contact source values)
- Filter out companies matching exceptions (e.g., excluded domains)

---

### Check 2: `missing-company-name`

**Trigger:** Daily sweep
**Severity:** medium

**HubSpot API Call:**
```
POST /crm/v3/objects/companies/search
{
  "filterGroups": [{
    "filters": [{
      "propertyName": "name",
      "operator": "NOT_HAS_PROPERTY"
    }]
  }],
  "properties": ["name", "domain", "createdate", "hubspot_owner_id"],
  "limit": 100
}
```

**Business Logic:**
- Return all companies without a name
- Include domain and owner for context

---

### Check 3: `missing-contact-fields`

**Trigger:** Daily sweep
**Severity:** medium

**HubSpot API Call (two separate calls):**

Call A — Missing email:
```
POST /crm/v3/objects/contacts/search
{
  "filterGroups": [{
    "filters": [{
      "propertyName": "email",
      "operator": "NOT_HAS_PROPERTY"
    }]
  }],
  "properties": ["firstname", "lastname", "email", "createdate", "hubspot_owner_id"],
  "limit": 100
}
```

Call B — Missing name (both first and last):
```
POST /crm/v3/objects/contacts/search
{
  "filterGroups": [{
    "filters": [
      { "propertyName": "firstname", "operator": "NOT_HAS_PROPERTY" },
      { "propertyName": "lastname", "operator": "NOT_HAS_PROPERTY" }
    ]
  }],
  "properties": ["firstname", "lastname", "email", "createdate", "hubspot_owner_id"],
  "limit": 100
}
```

**Business Logic:**
- Combine results from both calls, deduplicate
- Flag which fields are missing per contact

---

### Check 4: `contact-multi-company`

**Trigger:** Daily sweep
**Severity:** high

**HubSpot API Call:**
This requires a different approach since HubSpot search can't filter by association count directly.

Step A — Get all contacts (paginated):
```
GET /crm/v3/objects/contacts?limit=100&properties=firstname,lastname,email
```

Step B — For each contact, check associations:
```
GET /crm/v4/objects/contacts/{contactId}/associations/companies
```

**Business Logic:**
- Filter to contacts with 2+ company associations
- For each, include the list of associated company names and IDs
- This is a heavy check — consider batching and pagination. May need to use HubSpot's batch associations endpoint:
  ```
  POST /crm/v4/associations/contacts/companies/batch/read
  Body: { "inputs": [{"id": "contactId1"}, {"id": "contactId2"}, ...] }
  ```
  Process contacts in batches of 100.

---

### Check 5: `orphaned-contacts`

**Trigger:** Daily sweep
**Severity:** medium

**HubSpot API Call:**
```
POST /crm/v3/objects/contacts/search
{
  "filterGroups": [{
    "filters": [{
      "propertyName": "num_associated_companies",
      "operator": "EQ",
      "value": "0"
    }]
  }],
  "properties": ["firstname", "lastname", "email", "createdate", "hubspot_owner_id"],
  "limit": 100
}
```

**Business Logic:**
- Return contacts with zero company associations
- Filter against exceptions (e.g., exclude @gmail.com contacts)

---

### Check 6: `orphaned-companies`

**Trigger:** Daily sweep
**Severity:** medium

**HubSpot API Call:**
```
POST /crm/v3/objects/companies/search
{
  "filterGroups": [{
    "filters": [{
      "propertyName": "num_associated_contacts",
      "operator": "EQ",
      "value": "0"
    }]
  }],
  "properties": ["name", "domain", "createdate", "hubspot_owner_id"],
  "limit": 100
}
```

**Business Logic:**
- Return companies with zero contact associations
- Filter against exceptions

---

### Check 7: `duplicate-deals`

**Trigger:** Daily sweep
**Severity:** high

**HubSpot API Call:**
Step A — Get all open deals:
```
POST /crm/v3/objects/deals/search
{
  "filterGroups": [{
    "filters": [{
      "propertyName": "hs_is_closed",
      "operator": "EQ",
      "value": "false"
    }]
  }],
  "properties": ["dealname", "pipeline", "dealstage", "amount", "hubspot_owner_id"],
  "limit": 100
}
```

Step B — Get company associations for each deal:
```
POST /crm/v4/associations/deals/companies/batch/read
Body: { "inputs": [{"id": "dealId1"}, {"id": "dealId2"}, ...] }
```

**Business Logic:**
- Group deals by (company_id, pipeline)
- Flag groups with 2+ deals — these are duplicates
- Include deal names, stages, and amounts for context

---

### Check 8: `orphaned-deals`

**Trigger:** Daily sweep
**Severity:** high

**HubSpot API Call:**
```
POST /crm/v3/objects/deals/search
{
  "filterGroups": [{
    "filters": [{
      "propertyName": "num_associated_companies",
      "operator": "EQ",
      "value": "0"
    }]
  }],
  "properties": ["dealname", "pipeline", "dealstage", "amount", "hubspot_owner_id", "createdate"],
  "limit": 100
}
```

**Business Logic:**
- Return deals with no company association
- Include deal details for context

---

### Check 9: `meeting-status-mismatch`

**Trigger:** Hourly sweep
**Severity:** critical

**HubSpot API Calls:**

Step A — Get upcoming meetings (next 7 days):
```
POST /crm/v3/objects/meetings/search
{
  "filterGroups": [{
    "filters": [
      {
        "propertyName": "hs_meeting_start_time",
        "operator": "GT",
        "value": "{now_epoch_ms}"
      },
      {
        "propertyName": "hs_meeting_start_time",
        "operator": "LT",
        "value": "{now_plus_7d_epoch_ms}"
      }
    ]
  }],
  "properties": ["hs_meeting_title", "hs_meeting_start_time", "hs_meeting_end_time", "hubspot_owner_id"],
  "limit": 100
}
```

Step B — Get contact associations for each meeting:
```
POST /crm/v4/associations/meetings/contacts/batch/read
```

Step C — Get company associations for each meeting:
```
POST /crm/v4/associations/meetings/companies/batch/read
```

Step D — Batch read those contacts and companies:
```
POST /crm/v3/objects/contacts/batch/read
Body: { "inputs": [...], "properties": ["firstname", "lastname", "email", "hs_lead_status"] }

POST /crm/v3/objects/companies/batch/read
Body: { "inputs": [...], "properties": ["name", "hs_lead_status"] }
```

**Business Logic:**
- **Future meetings:** Contact/company lead status should be "Meeting Scheduled"
  - Flag contacts where `hs_lead_status != "Meeting Scheduled"` but have a future meeting
  - Same for companies
- **Past meetings (last 7 days):** Contact/company lead status should be "Meeting Occurred"
  - Run the same query with `LT now` and `GT now_minus_7d`
  - Flag contacts/companies where `hs_lead_status != "Meeting Occurred"` but had a recent meeting

---

### Check 10: `lifecycle-pipeline-mismatch`

**Trigger:** Hourly sweep
**Severity:** critical

**HubSpot API Calls:**

Scenario A — Companies with meetings but not SQL:
```
POST /crm/v3/objects/companies/search
{
  "filterGroups": [{
    "filters": [
      { "propertyName": "num_associated_deals", "operator": "EQ", "value": "0" },
      { "propertyName": "hs_lead_status", "operator": "EQ", "value": "Meeting Occurred" }
    ]
  }],
  "properties": ["name", "domain", "hs_lead_status", "lifecyclestage", "hubspot_owner_id"],
  "limit": 100
}
```
These are companies where a meeting happened but no deal was created (not SQL).

Scenario B — SAL form submitted but not updated:
This check queries the watchdog_results or a dedicated tracking table to find companies that received a SAL form submission (via the SAL Form workflow) but whose lifecycle stage or lead status hasn't changed since.

Approach: Query companies where `sal_form_submitted_date` is set but `lifecyclestage` is still below "salesqualifiedlead".
```
POST /crm/v3/objects/companies/search
{
  "filterGroups": [{
    "filters": [
      { "propertyName": "sal_form_submitted_date", "operator": "HAS_PROPERTY" },
      { "propertyName": "lifecyclestage", "operator": "NEQ", "value": "salesqualifiedlead" }
    ]
  }],
  "properties": ["name", "domain", "lifecyclestage", "hs_lead_status", "sal_form_submitted_date", "hubspot_owner_id"],
  "limit": 100
}
```
Note: The exact property name for SAL form submission date may differ. Verify against actual HubSpot schema.

**Business Logic:**
- Scenario A: Flag companies stuck at "Meeting Occurred" with no deal
- Scenario B: Flag companies where SAL form was submitted but lifecycle not updated
- Include time elapsed since the event for urgency context

---

### Check 11: `stale-companies`

**Trigger:** Daily sweep
**Severity:** medium

**HubSpot API Call:**
```
POST /crm/v3/objects/companies/search
{
  "filterGroups": [{
    "filters": [
      {
        "propertyName": "notes_last_updated",
        "operator": "LT",
        "value": "{30_days_ago_epoch_ms}"
      },
      {
        "propertyName": "hs_lead_status",
        "operator": "IN",
        "values": ["Open", "In Progress", "Meeting Scheduled"]
      }
    ]
  }],
  "properties": ["name", "domain", "hs_lead_status", "notes_last_updated", "hubspot_owner_id"],
  "limit": 100
}
```

**Business Logic:**
- Companies with an active lead status but no activity in 30+ days
- Include days since last activity and current owner
- Configurable threshold (default 30 days, adjustable via Supabase)

---

## Tier 2 — AI-Powered Check Workflow Template

Tier 2 checks replace the HubSpot HTTP Request with an AI Agent node that has HubSpot MCP tools.

```
Webhook Trigger → Fetch Instructions + Exceptions (Supabase) → AI Agent Node → Format Results (Code) → Respond to Webhook
```

### Node-by-node:

**Node 1: Webhook**
- Path: `/webhook/watchdog-{check_id}`
- Method: POST
- Response mode: "Last Node"

**Node 2: HTTP Request — Fetch Instructions & Exceptions**
Two Supabase calls (or one with a join):
```
GET watchdog_checks?id=eq.{check_id} → returns instructions
GET watchdog_exceptions?check_id=eq.{check_id}&active=eq.true → returns exceptions
```

**Node 3: AI Agent Node**
- Model: Claude or GPT-4
- Connected tools: HubSpot MCP (search, read, list associations)
- System prompt built dynamically:

```
You are a HubSpot data quality checker for Reindeer AI.

YOUR TASK:
{instructions from Supabase watchdog_checks.instructions}

EXCEPTIONS TO SKIP:
{formatted exceptions from watchdog_exceptions}

PROCESS:
1. Use the HubSpot tools to search for violations according to your instructions
2. For each violation found, gather enough context to explain it
3. Return your findings as a JSON array

RETURN FORMAT:
{
  "check_id": "{check_id}",
  "status": "pass" or "fail",
  "severity": "{severity from check config}",
  "count": <number>,
  "items": [
    {
      "record_type": "company",
      "record_id": "<HubSpot ID>",
      "record_name": "<name>",
      "details": "<human-readable description of the violation>",
      "hubspot_url": "https://app.hubspot.com/contacts/{portal_id}/company/<id>"
    }
  ]
}
```

**Node 4: Code Node — Validate & Format**
- Parse LLM output, ensure valid JSON
- Apply any additional filtering
- Handle LLM errors gracefully (return check_id with status "error")

**Node 5: Respond to Webhook**

---

## Tier 2 Check Specifications

### Check 12: `smart-duplicate-companies`

**Severity:** high
**Schedule:** Daily

**Initial Instructions (stored in Supabase):**
```
Find companies that appear to be duplicates. Compare by:
- Exact domain match (two companies with identical domain)
- Subdomain relationships (labs.acme.com should be flagged against acme.com)
- Similar company names using fuzzy matching (ignore suffixes like Inc, Ltd, LLC, Corp, GmbH)
- Partial name matches (e.g., "Acme" vs "Acme Labs" vs "Acme Technologies")

For each potential duplicate pair:
1. Get both company records with full details
2. Compare their domains, names, addresses, and owner
3. Rate confidence: HIGH (same domain), MEDIUM (similar name + same city), LOW (similar name only)
4. Only report MEDIUM and HIGH confidence matches
```

**How instructions evolve via feedback:**
- "Also check by address" → appends address comparison rule
- "Ignore companies with domain gmail.com" → adds to exceptions table
- "TechCorp UK is separate from TechCorp" → adds exclusion pair to exceptions

---

### Check 13: `sub-company-detection`

**Severity:** medium
**Schedule:** Daily

**Initial Instructions (stored in Supabase):**
```
Find companies that appear to be subsidiaries or child companies of other companies. Look for:
- Company names that include another company's name plus a geographic suffix (e.g., "Acme UK", "Acme EMEA")
- Company names that include another company's name plus a division suffix (e.g., "Acme Labs", "Acme Healthcare")
- Companies with subdomains of another company's domain (uk.acme.com → acme.com)
- Companies at the same address but with slightly different names

For each potential parent-child relationship:
1. Identify the parent company (larger, more contacts, older)
2. Identify the child company
3. Note whether they share contacts or deals
4. Rate confidence: HIGH, MEDIUM, LOW
```

---

### Check 14: `root-cause-analysis` (Shared Service)

**Not a scheduled check** — called by other checks when they find violations.

**Webhook:** `/webhook/watchdog-root-cause`

**Input:** Receives a violation item with record_type and record_id.

**AI Agent Instructions:**
```
You are investigating a HubSpot data quality issue. Given a record, determine:

1. WHO created or modified this record to cause the issue
2. WHEN did it happen
3. HOW — was it manual entry, import, automation, or API integration
4. WHY — what likely led to this (e.g., bulk import without dedup, manual creation without checking existing records)

Use HubSpot tools to:
- Read the record's property history (shows who changed what and when)
- Check the record's creation source
- Look at associated records for context

Return a concise 1-2 sentence root cause explanation.
Example: "Created manually by Sarah on Feb 14 via HubSpot UI. A company with the same domain already existed from a CSV import on Feb 10."
```

---

## Data Model (Supabase)

### Table: `watchdog_checks`

```sql
CREATE TABLE watchdog_checks (
  id              text PRIMARY KEY,           -- e.g., 'duplicate-deals'
  tier            int NOT NULL,               -- 1 or 2
  severity        text NOT NULL,              -- 'critical', 'high', 'medium'
  schedule        text NOT NULL,              -- 'hourly', 'daily', 'realtime'
  enabled         boolean NOT NULL DEFAULT true,
  webhook_url     text NOT NULL,              -- sub-workflow endpoint
  instructions    text,                       -- natural language (Tier 2 only)
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
```

### Table: `watchdog_exceptions`

```sql
CREATE TABLE watchdog_exceptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id        text NOT NULL REFERENCES watchdog_checks(id),
  type            text NOT NULL,              -- 'exclude_company', 'exclude_contact', 'exclude_domain', 'exclude_pair'
  value           text NOT NULL,              -- 'TechCorp UK' or 'gmail.com' or JSON for pairs
  reason          text,                       -- why this exception exists
  created_by      text NOT NULL,              -- 'slack:idan' or 'manual'
  created_at      timestamptz DEFAULT now(),
  active          boolean NOT NULL DEFAULT true
);
```

### Table: `watchdog_results`

```sql
CREATE TABLE watchdog_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id        text NOT NULL REFERENCES watchdog_checks(id),
  run_at          timestamptz DEFAULT now(),
  status          text NOT NULL,              -- 'pass', 'fail', 'error'
  violation_count int NOT NULL DEFAULT 0,
  violations      jsonb,                      -- full details array
  root_cause      text,                       -- LLM explanation if enriched
  duration_ms     int                         -- how long the check took
);
```

### Table: `watchdog_feedback`

```sql
CREATE TABLE watchdog_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id        text,                       -- which check this applies to (null if unclear)
  slack_user      text NOT NULL,              -- who sent the feedback
  slack_thread_ts text,                       -- thread timestamp for context
  message         text NOT NULL,              -- raw Slack message
  intent          text,                       -- 'exception', 'instruction_update', 'action_request'
  action_taken    text,                       -- what the system did in response
  created_at      timestamptz DEFAULT now()
);
```

### Seed Data

Insert the check registry on setup:

```sql
INSERT INTO watchdog_checks (id, tier, severity, schedule, webhook_url, instructions) VALUES
('missing-company-source', 1, 'high', 'daily', '/webhook/watchdog-missing-company-source', NULL),
('missing-company-name', 1, 'medium', 'daily', '/webhook/watchdog-missing-company-name', NULL),
('missing-contact-fields', 1, 'medium', 'daily', '/webhook/watchdog-missing-contact-fields', NULL),
('contact-multi-company', 1, 'high', 'daily', '/webhook/watchdog-contact-multi-company', NULL),
('orphaned-contacts', 1, 'medium', 'daily', '/webhook/watchdog-orphaned-contacts', NULL),
('orphaned-companies', 1, 'medium', 'daily', '/webhook/watchdog-orphaned-companies', NULL),
('duplicate-deals', 1, 'high', 'daily', '/webhook/watchdog-duplicate-deals', NULL),
('orphaned-deals', 1, 'high', 'daily', '/webhook/watchdog-orphaned-deals', NULL),
('meeting-status-mismatch', 1, 'critical', 'hourly', '/webhook/watchdog-meeting-status-mismatch', NULL),
('lifecycle-pipeline-mismatch', 1, 'critical', 'hourly', '/webhook/watchdog-lifecycle-pipeline-mismatch', NULL),
('stale-companies', 1, 'medium', 'daily', '/webhook/watchdog-stale-companies', NULL),
('smart-duplicate-companies', 2, 'high', 'daily', '/webhook/watchdog-smart-duplicates', 'Find companies that appear to be duplicates. Compare by:\n- Exact domain match\n- Subdomain relationships (labs.acme.com → acme.com)\n- Similar company names (fuzzy match, ignore Inc/Ltd/LLC/Corp/GmbH suffixes)\n- Partial name matches (e.g., "Acme" vs "Acme Labs")'),
('sub-company-detection', 2, 'medium', 'daily', '/webhook/watchdog-sub-company-detection', 'Find companies that appear to be subsidiaries of other companies. Look for:\n- Names that include another company name plus geographic suffix (UK, EMEA)\n- Names with division suffixes (Labs, Healthcare)\n- Subdomain relationships\n- Same address with different names');
```

---

## Slack Experience

### Digest Message Format (Block Kit)

```
🔍 HubSpot Watchdog — Daily Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 3 Critical  🟡 5 High  🟢 12 Checks Passed

▸ Duplicate Companies (2 found)
  • "Acme Inc" ↔ "Acme Incorporated" — same domain acme.com
    Root cause: Acme Inc created by import (Feb 10),
    Acme Incorporated created manually by Sarah (Feb 14)
  • "Nova Labs" ↔ "Nova Labs UK" — subdomain match
    [View in HubSpot] [Ignore] [Merge]

▸ Meeting Status Mismatch (3 found)
  • John Smith — meeting tomorrow, status is "Open" not "Meeting Scheduled"
    Root cause: Meeting booked via Calendly,
    n8n sync hasn't run since Feb 15
  [View in HubSpot] [Fix Status] [Ignore]

▸ Orphaned Deals (1 found)
  • "Enterprise Plan - Q1" — no company associated
  [View in HubSpot] [Ignore]

💬 Reply to this message to add exceptions or corrections
```

### Action Buttons

Each violation can have up to 3 buttons:

- **View in HubSpot** — Direct link to the record
- **Ignore** — Adds an exception to `watchdog_exceptions` via the Fix Handler
- **Fix [action]** — Context-specific fix (e.g., "Fix Status", "Associate Company")
- **Merge** — For duplicates only, requires confirmation before executing

Button values encode the context needed to act:
```json
{
  "action": "ignore",
  "check_id": "duplicate-companies",
  "record_type": "company",
  "record_id": "123",
  "record_name": "Acme Inc"
}
```

### Slack Channels

- **Daily digest** → `#hubspot-watchdog` (or configurable channel)
- **Hourly alerts** → Same channel, but only posts when critical issues found
- **Real-time alerts** → Same channel, individual messages

---

## Feedback Handler Workflow

**Workflow: "Watchdog Feedback Handler"**

Separate n8n workflow that processes Slack thread replies to Watchdog alerts.

### Nodes:

**Node 1: Webhook** — Receives Slack interactivity payloads
- Handles both button clicks and message replies
- Path: `/webhook/watchdog-feedback`

**Node 2: Switch** — Route by interaction type
- `button_click` → Handle action (ignore, fix, merge)
- `thread_reply` → Process with AI

**Branch A: Button Actions**

**Node 3a: Code** — Parse button payload, extract action and context

**Node 4a: Switch** — Route by action type
- `ignore` → Insert exception into Supabase
- `fix` → Call appropriate fix sub-workflow
- `merge` → Post confirmation button first

**Node 5a: HTTP Request (Supabase)** — Insert exception or log action

**Node 6a: HTTP Request (Slack)** — Post confirmation in thread

**Branch B: Thread Reply (AI-powered)**

**Node 3b: HTTP Request (Supabase)** — Fetch current check config + exceptions for the check this thread relates to

**Node 4b: AI Agent Node**
- System prompt:
```
You are the HubSpot Watchdog feedback processor. A user has replied to a data quality alert.

ORIGINAL ALERT CONTEXT:
{alert message and check_id from thread}

CURRENT EXCEPTIONS FOR THIS CHECK:
{existing exceptions}

CURRENT INSTRUCTIONS (if Tier 2):
{current instructions}

USER MESSAGE:
{the reply text}

Classify the user's intent as ONE of:
1. "exception" — They want to exclude a specific record/domain/pattern from future checks
2. "instruction_update" — They want to change how the check works (add new criteria, adjust thresholds)
3. "action_request" — They want to take an action on a record (merge, update, associate)

Return JSON:
{
  "intent": "exception|instruction_update|action_request",
  "check_id": "<which check>",
  "action": {
    // For exception:
    "type": "exclude_company|exclude_domain|exclude_pair",
    "value": "<what to exclude>",
    "reason": "<why>"

    // For instruction_update:
    "updated_instructions": "<full updated instructions text>"

    // For action_request:
    "action_type": "merge|update_status|associate",
    "details": "<what to do>"
  },
  "confirmation_message": "<message to post in Slack thread>"
}
```

**Node 5b: Code** — Parse LLM response

**Node 6b: Switch** — Route by classified intent
- `exception` → INSERT into `watchdog_exceptions`
- `instruction_update` → UPDATE `watchdog_checks.instructions`
- `action_request` → Post confirmation button (no auto-execution for destructive actions)

**Node 7b: HTTP Request (Supabase)** — Execute the write operation

**Node 8b: HTTP Request (Supabase)** — Log feedback in `watchdog_feedback`

**Node 9b: HTTP Request (Slack)** — Post confirmation in thread

### Safety Rails

- **Destructive actions** (merge, delete) always require a confirmation button before execution
- **Instruction updates** post the before/after diff in thread for transparency
- **Ambiguous intent** → LLM asks a clarifying question in the thread instead of acting
- **All feedback is logged** in `watchdog_feedback` for audit trail

---

## Fix Handler Sub-Workflows

Separate n8n workflows for each type of fix action:

### Fix: Update Lead Status
- Webhook: `/webhook/watchdog-fix-status`
- Input: `{ record_type, record_id, new_status }`
- HubSpot API: PATCH contact/company with new `hs_lead_status`
- Responds with confirmation

### Fix: Associate Records
- Webhook: `/webhook/watchdog-fix-associate`
- Input: `{ from_type, from_id, to_type, to_id }`
- HubSpot API: PUT association
- Responds with confirmation

### Fix: Merge Companies
- Webhook: `/webhook/watchdog-fix-merge`
- Input: `{ primary_id, secondary_id }`
- HubSpot API: POST /crm/v3/objects/companies/merge
- **Requires prior confirmation** — only called after user clicks Confirm button
- Responds with confirmation

---

## Schedules & Timing

| Coordinator | Schedule | Checks | Expected Duration |
|-------------|----------|--------|-------------------|
| Hourly | :00 every hour | meeting-status-mismatch, lifecycle-pipeline-mismatch | ~30 seconds |
| Daily | 8:00 AM daily | All Tier 1 daily checks + Tier 2 checks | ~2-3 minutes |
| Real-time | On HubSpot event | missing-company-source | ~5 seconds |

---

## n8n Workflow Summary

| Workflow Name | Type | Purpose |
|---------------|------|---------|
| Watchdog Daily Coordinator | Coordinator | Runs daily checks, sends digest |
| Watchdog Hourly Coordinator | Coordinator | Runs hourly checks, sends alert if failures |
| Watchdog: Missing Company Source | Tier 1 Check | Detects missing source fields |
| Watchdog: Missing Company Name | Tier 1 Check | Detects companies without names |
| Watchdog: Missing Contact Fields | Tier 1 Check | Detects contacts without email/name |
| Watchdog: Contact Multi-Company | Tier 1 Check | Contacts associated with 2+ companies |
| Watchdog: Orphaned Contacts | Tier 1 Check | Contacts with no company |
| Watchdog: Orphaned Companies | Tier 1 Check | Companies with no contacts |
| Watchdog: Duplicate Deals | Tier 1 Check | Multiple deals per company per pipeline |
| Watchdog: Orphaned Deals | Tier 1 Check | Deals with no company |
| Watchdog: Meeting Status Mismatch | Tier 1 Check | Meeting vs lead status inconsistency |
| Watchdog: Lifecycle Pipeline Mismatch | Tier 1 Check | Lifecycle vs pipeline state inconsistency |
| Watchdog: Stale Companies | Tier 1 Check | Companies with no activity for 30+ days |
| Watchdog: Smart Duplicate Companies | Tier 2 Check | AI-powered fuzzy duplicate detection |
| Watchdog: Sub-Company Detection | Tier 2 Check | AI-powered subsidiary detection |
| Watchdog: Root Cause Analysis | Tier 2 Service | AI-powered violation explanation |
| Watchdog: Feedback Handler | Handler | Processes Slack replies and button clicks |
| Watchdog: Fix Status | Fix Action | Updates lead status in HubSpot |
| Watchdog: Fix Associate | Fix Action | Creates record associations |
| Watchdog: Fix Merge | Fix Action | Merges duplicate companies |

**Total: 20 n8n workflows**

---

## Implementation Phases

### Phase 1 — Foundation
Build the scaffolding and prove the pattern with 3 simple checks.

1. Create Supabase tables (watchdog_checks, watchdog_exceptions, watchdog_results, watchdog_feedback)
2. Insert seed data into watchdog_checks
3. Build Daily Coordinator workflow
4. Build Slack digest formatter (Code node, reusable)
5. Build 3 starter checks:
   - `missing-company-source`
   - `orphaned-contacts`
   - `missing-contact-fields`
6. Test end-to-end: coordinator calls checks, collects results, sends Slack digest

**Deliverable:** Working daily Slack report with 3 checks.

### Phase 2 — Core Tier 1 Checks
Add remaining deterministic checks.

7. `contact-multi-company`
8. `orphaned-companies`
9. `orphaned-deals`
10. `duplicate-deals`
11. Build Hourly Coordinator workflow
12. `meeting-status-mismatch`
13. `lifecycle-pipeline-mismatch`
14. `stale-companies`
15. `missing-company-name`

**Deliverable:** Full Tier 1 coverage with hourly + daily schedules.

### Phase 3 — AI-Powered Checks
Add intelligent checks with LLM + HubSpot MCP.

16. `smart-duplicate-companies`
17. `sub-company-detection`
18. `root-cause-analysis` (shared enrichment, wire into existing checks)

**Deliverable:** AI-powered duplicate and subsidiary detection with root cause explanations.

### Phase 4 — Feedback Loop & Actions
Make it interactive and self-adjusting.

19. Feedback Handler workflow (Slack reply → classify → update Supabase)
20. Action buttons: Ignore (adds exception)
21. Action buttons: Fix Status
22. Action buttons: Fix Associate
23. Action buttons: Merge (with confirmation)

**Deliverable:** Full Slack interactivity — fix issues and adjust rules from Slack.

### Phase 5 — Real-Time Layer
Add event-driven triggers for critical checks.

24. Migrate `missing-company-source` from standalone to coordinator integration
25. Add real-time triggers for `meeting-status-mismatch`
26. Add real-time triggers for `lifecycle-pipeline-mismatch`

**Deliverable:** Critical issues caught in real-time, not just on schedule.
