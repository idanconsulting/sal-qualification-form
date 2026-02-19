# Watchdog Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Watchdog foundation — Supabase tables, Daily Coordinator, Slack digest, and 3 starter checks — delivering a working daily Slack report.

**Architecture:** Fan-out coordinator pattern in n8n. Schedule trigger calls check sub-workflows in parallel via HTTP, collects results, saves to Supabase, formats Slack digest. Each check is its own n8n workflow with a webhook endpoint.

**Tech Stack:** n8n workflows (created via n8n REST API), Supabase (Postgres tables via SQL), HubSpot API, Slack Block Kit webhooks.

**References:**
- Design doc: `docs/plans/2026-02-17-hubspot-data-watchdog-design.md`
- n8n config: `~/.claude/n8n-config.json` (baseUrl + apiKey)
- Supabase config: `~/.claude/supabase-config.json` (access_token + project_ref)
- HubSpot credential in n8n: `{ "id": "Ic8seJpUK2XUSDQY", "name": "Reindeer" }`
- HubSpot portal ID: `48653760`
- Slack webhook: `SLACK_WEBHOOK_URL`
- n8n base URL: `https://n8n-service-v39p.onrender.com`

---

### Task 1: Create Supabase Tables

**Files:**
- Create: `supabase/migrations/20260218_watchdog_tables.sql`

**Step 1: Write the migration SQL file**

```sql
-- Watchdog Data Quality Monitoring Tables

CREATE TABLE watchdog_checks (
  id              text PRIMARY KEY,
  tier            int NOT NULL,
  severity        text NOT NULL CHECK (severity IN ('critical', 'high', 'medium')),
  schedule        text NOT NULL CHECK (schedule IN ('hourly', 'daily', 'realtime')),
  enabled         boolean NOT NULL DEFAULT true,
  webhook_url     text NOT NULL,
  instructions    text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE watchdog_exceptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id        text NOT NULL REFERENCES watchdog_checks(id),
  type            text NOT NULL,
  value           text NOT NULL,
  reason          text,
  created_by      text NOT NULL,
  created_at      timestamptz DEFAULT now(),
  active          boolean NOT NULL DEFAULT true
);

CREATE TABLE watchdog_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id        text NOT NULL REFERENCES watchdog_checks(id),
  run_at          timestamptz DEFAULT now(),
  status          text NOT NULL CHECK (status IN ('pass', 'fail', 'error')),
  violation_count int NOT NULL DEFAULT 0,
  violations      jsonb,
  root_cause      text,
  duration_ms     int
);

CREATE TABLE watchdog_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id        text,
  slack_user      text NOT NULL,
  slack_thread_ts text,
  message         text NOT NULL,
  intent          text,
  action_taken    text,
  created_at      timestamptz DEFAULT now()
);

-- Index for frequent queries
CREATE INDEX idx_watchdog_checks_schedule ON watchdog_checks(schedule, enabled);
CREATE INDEX idx_watchdog_exceptions_check ON watchdog_exceptions(check_id, active);
CREATE INDEX idx_watchdog_results_check ON watchdog_results(check_id, run_at DESC);
```

**Step 2: Run the migration against Supabase**

```bash
# Read credentials
SUPABASE_ACCESS_TOKEN=$(cat ~/.claude/supabase-config.json | jq -r '.access_token')
PROJECT_REF=$(cat ~/.claude/supabase-config.json | jq -r '.project_ref')

# Run migration via Supabase Management API
# Use the SQL endpoint to execute the migration
curl -s -X POST "https://${PROJECT_REF}.supabase.co/rest/v1/rpc" \
  -H "apikey: <service_role_key>" \
  -H "Authorization: Bearer <service_role_key>" \
  ...
```

Alternative: Use the Supabase CLI:
```bash
SUPABASE_ACCESS_TOKEN=$(cat ~/.claude/supabase-config.json | jq -r '.access_token') \
  npx supabase db push --project-ref $(cat ~/.claude/supabase-config.json | jq -r '.project_ref')
```

Or use the Supabase SQL Editor API:
```bash
SUPABASE_ACCESS_TOKEN=$(cat ~/.claude/supabase-config.json | jq -r '.access_token')
PROJECT_REF=$(cat ~/.claude/supabase-config.json | jq -r '.project_ref')

curl -s -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query": "<SQL from step 1>"}'
```

**Step 3: Verify tables exist**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT table_name FROM information_schema.tables WHERE table_schema = '\''public'\'' AND table_name LIKE '\''watchdog_%'\'';"}'
```

Expected: 4 tables listed (watchdog_checks, watchdog_exceptions, watchdog_results, watchdog_feedback).

**Step 4: Commit**

```bash
git add supabase/migrations/20260218_watchdog_tables.sql
git commit -m "feat: add Watchdog Supabase tables migration"
```

---

### Task 2: Seed the Check Registry

**Step 1: Insert seed data into watchdog_checks**

Run this SQL against Supabase (via the same query API from Task 1):

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
('smart-duplicate-companies', 2, 'high', 'daily', '/webhook/watchdog-smart-duplicates', 'Find companies that appear to be duplicates. Compare by:
- Exact domain match (two companies with identical domain)
- Subdomain relationships (labs.acme.com should be flagged against acme.com)
- Similar company names using fuzzy matching (ignore suffixes like Inc, Ltd, LLC, Corp, GmbH)
- Partial name matches (e.g., "Acme" vs "Acme Labs" vs "Acme Technologies")'),
('sub-company-detection', 2, 'medium', 'daily', '/webhook/watchdog-sub-company-detection', 'Find companies that appear to be subsidiaries of other companies. Look for:
- Company names that include another company name plus a geographic suffix (e.g., "Acme UK", "Acme EMEA")
- Company names that include another company name plus a division suffix (e.g., "Acme Labs", "Acme Healthcare")
- Companies with subdomains of another company domain (uk.acme.com -> acme.com)
- Companies at the same address but with slightly different names');
```

**Step 2: Verify seed data**

```sql
SELECT id, tier, severity, schedule FROM watchdog_checks ORDER BY tier, id;
```

Expected: 13 rows returned.

---

### Task 3: Build Check Sub-Workflow — `orphaned-contacts`

The simplest check. Build this first to establish the pattern.

**Files:**
- Create: `n8n-workflow-watchdog-orphaned-contacts.json`

**Step 1: Create the n8n workflow via API**

Use the n8n REST API to create the workflow. The workflow has 4 nodes:

**Node layout:**
```
Webhook [240,300] → HTTP HubSpot Search [480,300] → Code Business Logic [720,300] → Respond [960,300]
```

**Full workflow JSON:**

```json
{
  "name": "Watchdog: Orphaned Contacts",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "watchdog-orphaned-contacts",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "webhook-trigger",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [240, 300],
      "webhookId": "watchdog-orphaned-contacts"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://api.hubspot.com/crm/v3/objects/contacts/search",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "hubspotAppToken",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={\n  \"filterGroups\": [{\n    \"filters\": [{\n      \"propertyName\": \"num_associated_companies\",\n      \"operator\": \"EQ\",\n      \"value\": \"0\"\n    }]\n  }],\n  \"properties\": [\"firstname\", \"lastname\", \"email\", \"createdate\", \"hubspot_owner_id\"],\n  \"limit\": 100\n}",
        "options": {}
      },
      "id": "hubspot-search",
      "name": "HTTP - Search Orphaned Contacts",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [480, 300],
      "credentials": {
        "hubspotAppToken": {
          "id": "Ic8seJpUK2XUSDQY",
          "name": "Reindeer"
        }
      }
    },
    {
      "parameters": {
        "mode": "runOnceForAllItems",
        "jsCode": "const searchResults = $('HTTP - Search Orphaned Contacts').first().json;\nconst contacts = searchResults.results || [];\n\n// Build violation items\nconst items = contacts.map(c => {\n  const props = c.properties || {};\n  const name = [props.firstname, props.lastname].filter(Boolean).join(' ') || '(no name)';\n  return {\n    record_type: 'contact',\n    record_id: c.id,\n    record_name: name,\n    details: `Contact \"${name}\" (${props.email || 'no email'}) has no company association. Created ${props.createdate ? new Date(props.createdate).toISOString().split('T')[0] : 'unknown'}.`,\n    hubspot_url: `https://app.hubspot.com/contacts/48653760/contact/${c.id}`\n  };\n});\n\nreturn [{\n  json: {\n    check_id: 'orphaned-contacts',\n    status: items.length > 0 ? 'fail' : 'pass',\n    severity: 'medium',\n    count: items.length,\n    items: items\n  }\n}];"
      },
      "id": "business-logic",
      "name": "Code - Build Result",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [720, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify($json) }}",
        "options": {}
      },
      "id": "respond",
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [960, 300]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [
        [{ "node": "HTTP - Search Orphaned Contacts", "type": "main", "index": 0 }]
      ]
    },
    "HTTP - Search Orphaned Contacts": {
      "main": [
        [{ "node": "Code - Build Result", "type": "main", "index": 0 }]
      ]
    },
    "Code - Build Result": {
      "main": [
        [{ "node": "Respond", "type": "main", "index": 0 }]
      ]
    }
  },
  "settings": {
    "executionOrder": "v1",
    "callerPolicy": "workflowsFromSameOwner"
  }
}
```

Create via n8n API:
```bash
N8N_URL=$(cat ~/.claude/n8n-config.json | jq -r '.n8n.baseUrl')
N8N_KEY=$(cat ~/.claude/n8n-config.json | jq -r '.n8n.apiKey')

curl -s -X POST "${N8N_URL}/api/v1/workflows" \
  -H "X-N8N-API-KEY: ${N8N_KEY}" \
  -H "Content-Type: application/json" \
  -d @n8n-workflow-watchdog-orphaned-contacts.json
```

**Step 2: Activate the workflow**

```bash
# Get the workflow ID from the creation response, then activate
curl -s -X PATCH "${N8N_URL}/api/v1/workflows/<WORKFLOW_ID>" \
  -H "X-N8N-API-KEY: ${N8N_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"active": true}'
```

**Step 3: Test the webhook**

```bash
curl -s -X POST "${N8N_URL}/webhook/watchdog-orphaned-contacts"
```

Expected: JSON response with `check_id: "orphaned-contacts"`, `status: "pass"` or `"fail"`, and `items` array.

**Step 4: Save workflow JSON locally and update CLAUDE.md**

Save the response JSON (with the assigned ID) to the local file. Update CLAUDE.md watchdog workflow table with the new workflow ID and status "Built".

**Step 5: Commit**

```bash
git add n8n-workflow-watchdog-orphaned-contacts.json CLAUDE.md
git commit -m "feat: add Watchdog orphaned-contacts check workflow"
```

---

### Task 4: Build Check Sub-Workflow — `missing-contact-fields`

**Files:**
- Create: `n8n-workflow-watchdog-missing-contact-fields.json`

**Step 1: Create the n8n workflow**

Same 4-node pattern as Task 3. Key differences:

- Webhook path: `watchdog-missing-contact-fields`
- Two HubSpot search calls needed (missing email + missing name), so we need 5 nodes:

**Node layout:**
```
Webhook [240,300]
  → HTTP Search Missing Email [480,200]  ──┐
  → HTTP Search Missing Name [480,400]  ──── Code - Build Result [720,300] → Respond [960,300]
```

**HTTP node for missing email:**
```json
{
  "parameters": {
    "method": "POST",
    "url": "https://api.hubspot.com/crm/v3/objects/contacts/search",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "hubspotAppToken",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={\n  \"filterGroups\": [{\n    \"filters\": [{\n      \"propertyName\": \"email\",\n      \"operator\": \"NOT_HAS_PROPERTY\"\n    }]\n  }],\n  \"properties\": [\"firstname\", \"lastname\", \"email\", \"createdate\", \"hubspot_owner_id\"],\n  \"limit\": 100\n}",
    "options": {}
  },
  "id": "search-missing-email",
  "name": "HTTP - Missing Email",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [480, 200],
  "credentials": {
    "hubspotAppToken": { "id": "Ic8seJpUK2XUSDQY", "name": "Reindeer" }
  }
}
```

**HTTP node for missing name (both first AND last):**
```json
{
  "parameters": {
    "method": "POST",
    "url": "https://api.hubspot.com/crm/v3/objects/contacts/search",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "hubspotAppToken",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={\n  \"filterGroups\": [{\n    \"filters\": [\n      { \"propertyName\": \"firstname\", \"operator\": \"NOT_HAS_PROPERTY\" },\n      { \"propertyName\": \"lastname\", \"operator\": \"NOT_HAS_PROPERTY\" }\n    ]\n  }],\n  \"properties\": [\"firstname\", \"lastname\", \"email\", \"createdate\", \"hubspot_owner_id\"],\n  \"limit\": 100\n}",
    "options": {}
  },
  "id": "search-missing-name",
  "name": "HTTP - Missing Name",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [480, 400],
  "credentials": {
    "hubspotAppToken": { "id": "Ic8seJpUK2XUSDQY", "name": "Reindeer" }
  }
}
```

**Code node (combines both results):**
```javascript
const emailResults = $('HTTP - Missing Email').first().json;
const nameResults = $('HTTP - Missing Name').first().json;

const missingEmail = (emailResults.results || []);
const missingName = (nameResults.results || []);

// Deduplicate by contact ID
const seen = new Set();
const items = [];

for (const c of missingEmail) {
  seen.add(c.id);
  const props = c.properties || {};
  const name = [props.firstname, props.lastname].filter(Boolean).join(' ') || '(no name)';
  items.push({
    record_type: 'contact',
    record_id: c.id,
    record_name: name,
    details: `Missing email. Name: "${name}". Created ${props.createdate ? new Date(props.createdate).toISOString().split('T')[0] : 'unknown'}.`,
    hubspot_url: `https://app.hubspot.com/contacts/48653760/contact/${c.id}`
  });
}

for (const c of missingName) {
  if (seen.has(c.id)) {
    // Already flagged for email — update details to mention both
    const existing = items.find(i => i.record_id === c.id);
    if (existing) existing.details = existing.details.replace('Missing email', 'Missing email and name');
    continue;
  }
  const props = c.properties || {};
  items.push({
    record_type: 'contact',
    record_id: c.id,
    record_name: props.email || '(no name or email)',
    details: `Missing first and last name. Email: "${props.email || 'none'}". Created ${props.createdate ? new Date(props.createdate).toISOString().split('T')[0] : 'unknown'}.`,
    hubspot_url: `https://app.hubspot.com/contacts/48653760/contact/${c.id}`
  });
}

return [{
  json: {
    check_id: 'missing-contact-fields',
    status: items.length > 0 ? 'fail' : 'pass',
    severity: 'medium',
    count: items.length,
    items: items
  }
}];
```

**Connections:** Webhook → both HTTP nodes in parallel. Both HTTP nodes → Code node. Code → Respond.

```json
"connections": {
  "Webhook": {
    "main": [
      [
        { "node": "HTTP - Missing Email", "type": "main", "index": 0 },
        { "node": "HTTP - Missing Name", "type": "main", "index": 0 }
      ]
    ]
  },
  "HTTP - Missing Email": {
    "main": [
      [{ "node": "Code - Build Result", "type": "main", "index": 0 }]
    ]
  },
  "HTTP - Missing Name": {
    "main": [
      [{ "node": "Code - Build Result", "type": "main", "index": 0 }]
    ]
  },
  "Code - Build Result": {
    "main": [
      [{ "node": "Respond", "type": "main", "index": 0 }]
    ]
  }
}
```

**Step 2: Create via n8n API, activate, and test**

Same process as Task 3. Test:
```bash
curl -s -X POST "${N8N_URL}/webhook/watchdog-missing-contact-fields"
```

**Step 3: Save JSON locally, update CLAUDE.md, commit**

```bash
git add n8n-workflow-watchdog-missing-contact-fields.json CLAUDE.md
git commit -m "feat: add Watchdog missing-contact-fields check workflow"
```

---

### Task 5: Build Check Sub-Workflow — `missing-company-source`

**Files:**
- Create: `n8n-workflow-watchdog-missing-company-source.json`

**Step 1: Create the n8n workflow**

Same 4-node pattern. This check searches for companies missing ANY of: motion, lead_source_category, lead_source.

**HubSpot search body (filterGroups are OR-ed):**
```json
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

**Code node logic:**
```javascript
const searchResults = $('HTTP - Search Missing Source').first().json;
const companies = searchResults.results || [];

const items = companies.map(c => {
  const props = c.properties || {};
  const missing = [];
  if (!props.motion) missing.push('motion');
  if (!props.lead_source_category) missing.push('lead_source_category');
  if (!props.lead_source) missing.push('lead_source');

  return {
    record_type: 'company',
    record_id: c.id,
    record_name: props.name || props.domain || '(unnamed)',
    details: `Missing fields: ${missing.join(', ')}. Domain: ${props.domain || 'none'}.`,
    hubspot_url: `https://app.hubspot.com/contacts/48653760/company/${c.id}`
  };
});

return [{
  json: {
    check_id: 'missing-company-source',
    status: items.length > 0 ? 'fail' : 'pass',
    severity: 'high',
    count: items.length,
    items: items
  }
}];
```

**Step 2: Create via n8n API, activate, and test**

```bash
curl -s -X POST "${N8N_URL}/webhook/watchdog-missing-company-source"
```

**Step 3: Save JSON locally, update CLAUDE.md, commit**

```bash
git add n8n-workflow-watchdog-missing-company-source.json CLAUDE.md
git commit -m "feat: add Watchdog missing-company-source check workflow"
```

---

### Task 6: Build the Daily Coordinator Workflow

**Files:**
- Create: `n8n-workflow-watchdog-daily-coordinator.json`

**Step 1: Create the coordinator workflow**

This is the most complex workflow. It follows the fan-out pattern.

**Node layout:**
```
Schedule Trigger [240,300]
  → HTTP - Check Orphaned Contacts [480,100]        ──┐
  → HTTP - Check Missing Contact Fields [480,300]    ──── Merge [720,300] → Code - Save & Format [960,300] → IF - Has Failures [1200,300]
  → HTTP - Check Missing Company Source [480,500]    ──┘       │                                                   │
                                                               ↓                                                   ↓ True
                                                    HTTP - Save to Supabase [960,500]                    HTTP - Send Slack [1440,200]
                                                                                                                   ↓ False
                                                                                                         (end - no output)
```

**Important:** The coordinator calls each check's webhook URL. Since the check workflows are on the same n8n instance, use the full URL: `https://n8n-service-v39p.onrender.com/webhook/watchdog-<check-id>`.

However, for Phase 1 we have only 3 checks. We hardcode 3 HTTP Request nodes (one per check) that fan out from the Schedule Trigger, merge results, then format and send.

**Full workflow nodes:**

1. **Schedule Trigger** — runs daily at 8:00 AM
```json
{
  "parameters": {
    "rule": {
      "interval": [{ "triggerAtHour": 8 }]
    }
  },
  "id": "schedule",
  "name": "Schedule - Daily 8AM",
  "type": "n8n-nodes-base.scheduleTrigger",
  "typeVersion": 1.2,
  "position": [240, 300]
}
```

2. **HTTP - Check Orphaned Contacts** — POST to sub-workflow webhook
```json
{
  "parameters": {
    "method": "POST",
    "url": "https://n8n-service-v39p.onrender.com/webhook/watchdog-orphaned-contacts",
    "options": { "timeout": 30000 }
  },
  "id": "check-orphaned-contacts",
  "name": "HTTP - Check Orphaned Contacts",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [480, 100]
}
```

3. **HTTP - Check Missing Contact Fields** — same pattern, different URL
```json
{
  "parameters": {
    "method": "POST",
    "url": "https://n8n-service-v39p.onrender.com/webhook/watchdog-missing-contact-fields",
    "options": { "timeout": 30000 }
  },
  "id": "check-missing-contact-fields",
  "name": "HTTP - Check Missing Contact Fields",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [480, 300]
}
```

4. **HTTP - Check Missing Company Source** — same pattern
```json
{
  "parameters": {
    "method": "POST",
    "url": "https://n8n-service-v39p.onrender.com/webhook/watchdog-missing-company-source",
    "options": { "timeout": 30000 }
  },
  "id": "check-missing-company-source",
  "name": "HTTP - Check Missing Company Source",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [480, 500]
}
```

5. **Merge - Collect Results** — appends all check results into one array
```json
{
  "parameters": {
    "mode": "append",
    "options": {}
  },
  "id": "merge-results",
  "name": "Merge - Collect Results",
  "type": "n8n-nodes-base.merge",
  "typeVersion": 3,
  "position": [720, 300]
}
```

Note: The Merge node with 3 inputs needs `numberInputs: 3`:
```json
{
  "parameters": {
    "mode": "append",
    "numberInputs": 3,
    "options": {}
  }
}
```

6. **Code - Format Slack Digest** — builds Slack Block Kit message from all results
```javascript
const results = $input.all().map(item => item.json);

// Count by severity
const failures = results.filter(r => r.status === 'fail');
const critical = failures.filter(r => r.severity === 'critical').length;
const high = failures.filter(r => r.severity === 'high').length;
const medium = failures.filter(r => r.severity === 'medium').length;
const passed = results.filter(r => r.status === 'pass').length;

// Build Slack blocks
const blocks = [];

// Header
blocks.push({
  type: 'header',
  text: { type: 'plain_text', text: '🔍 HubSpot Watchdog — Daily Report' }
});

// Summary line
const summaryParts = [];
if (critical > 0) summaryParts.push(`🔴 ${critical} Critical`);
if (high > 0) summaryParts.push(`🟡 ${high} High`);
if (medium > 0) summaryParts.push(`🟠 ${medium} Medium`);
summaryParts.push(`🟢 ${passed} Passed`);

blocks.push({
  type: 'section',
  text: { type: 'mrkdwn', text: summaryParts.join('  ') }
});

blocks.push({ type: 'divider' });

// Detail blocks for each failing check
for (const result of failures) {
  const checkName = result.check_id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*▸ ${checkName} (${result.count} found)*`
    }
  });

  // Show first 5 items max to avoid Slack message limits
  const displayItems = (result.items || []).slice(0, 5);
  for (const item of displayItems) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `• *${item.record_name}* — ${item.details}\n<${item.hubspot_url}|View in HubSpot>`
      }
    });
  }

  if ((result.items || []).length > 5) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `_...and ${result.items.length - 5} more_` }
    });
  }

  blocks.push({ type: 'divider' });
}

// Footer
blocks.push({
  type: 'context',
  elements: [{ type: 'mrkdwn', text: '💬 Reply to this message to add exceptions or corrections' }]
});

// Also build the results array for saving to Supabase
const supabaseResults = results.map(r => ({
  check_id: r.check_id,
  status: r.status,
  violation_count: r.count || 0,
  violations: r.items || [],
  run_at: new Date().toISOString()
}));

return [{
  json: {
    hasFailures: failures.length > 0,
    slackPayload: {
      text: `Watchdog Daily: ${failures.length} checks failed`,
      blocks: blocks
    },
    supabaseResults: supabaseResults
  }
}];
```

7. **HTTP - Save to Supabase** — POST results to watchdog_results table

This needs the Supabase REST API URL and anon/service key. The URL pattern is:
```
POST https://lbzlhnzmifzeqzefivyx.supabase.co/rest/v1/watchdog_results
Headers:
  apikey: <supabase_anon_key>
  Authorization: Bearer <supabase_anon_key>
  Content-Type: application/json
  Prefer: return=minimal
Body: {{ $json.supabaseResults }}
```

**Important:** The Supabase anon key needs to be stored as an n8n credential or hardcoded. For Phase 1, we can use the Supabase REST API with the anon key. You'll need to get this from the Supabase dashboard (Project Settings → API → anon/public key).

```json
{
  "parameters": {
    "method": "POST",
    "url": "https://lbzlhnzmifzeqzefivyx.supabase.co/rest/v1/watchdog_results",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "apikey", "value": "<SUPABASE_ANON_KEY>" },
        { "name": "Authorization", "value": "Bearer <SUPABASE_ANON_KEY>" },
        { "name": "Prefer", "value": "return=minimal" }
      ]
    },
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify($json.supabaseResults) }}",
    "options": {}
  },
  "id": "save-supabase",
  "name": "HTTP - Save to Supabase",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [960, 500]
}
```

8. **IF - Has Failures** — check if any checks failed
```json
{
  "parameters": {
    "conditions": {
      "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
      "conditions": [{
        "id": "has-failures",
        "leftValue": "={{ $json.hasFailures }}",
        "rightValue": true,
        "operator": { "type": "boolean", "operation": "equals" }
      }],
      "combinator": "and"
    },
    "options": {}
  },
  "id": "if-failures",
  "name": "IF - Has Failures",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2,
  "position": [1200, 300]
}
```

9. **HTTP - Send Slack Alert** — POST to Slack webhook (true branch only)
```json
{
  "parameters": {
    "method": "POST",
    "url": "SLACK_WEBHOOK_URL",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify($json.slackPayload) }}",
    "options": {}
  },
  "id": "send-slack",
  "name": "HTTP - Send Slack Alert",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [1440, 200]
}
```

**Connections:**
```json
{
  "Schedule - Daily 8AM": {
    "main": [[
      { "node": "HTTP - Check Orphaned Contacts", "type": "main", "index": 0 },
      { "node": "HTTP - Check Missing Contact Fields", "type": "main", "index": 0 },
      { "node": "HTTP - Check Missing Company Source", "type": "main", "index": 0 }
    ]]
  },
  "HTTP - Check Orphaned Contacts": {
    "main": [[{ "node": "Merge - Collect Results", "type": "main", "index": 0 }]]
  },
  "HTTP - Check Missing Contact Fields": {
    "main": [[{ "node": "Merge - Collect Results", "type": "main", "index": 1 }]]
  },
  "HTTP - Check Missing Company Source": {
    "main": [[{ "node": "Merge - Collect Results", "type": "main", "index": 2 }]]
  },
  "Merge - Collect Results": {
    "main": [[{ "node": "Code - Format Slack Digest", "type": "main", "index": 0 }]]
  },
  "Code - Format Slack Digest": {
    "main": [[
      { "node": "HTTP - Save to Supabase", "type": "main", "index": 0 },
      { "node": "IF - Has Failures", "type": "main", "index": 0 }
    ]]
  },
  "IF - Has Failures": {
    "main": [
      [{ "node": "HTTP - Send Slack Alert", "type": "main", "index": 0 }],
      []
    ]
  }
}
```

**Step 2: Before creating — get the Supabase anon key**

```bash
SUPABASE_ACCESS_TOKEN=$(cat ~/.claude/supabase-config.json | jq -r '.access_token')
PROJECT_REF=$(cat ~/.claude/supabase-config.json | jq -r '.project_ref')

curl -s "https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}"
```

Use the `anon` key in the HTTP - Save to Supabase node.

**Step 3: Create the workflow via n8n API and activate**

**Step 4: Test end-to-end**

Manually trigger the coordinator workflow from the n8n UI (or add a Manual Trigger node temporarily). Verify:
1. All 3 checks are called
2. Results are saved to Supabase `watchdog_results`
3. Slack message appears in the channel

**Step 5: Update Supabase `watchdog_checks` rows with full webhook URLs**

Now that the check workflows are created and active, update the `webhook_url` column with full URLs:

```sql
UPDATE watchdog_checks SET webhook_url = 'https://n8n-service-v39p.onrender.com/webhook/watchdog-orphaned-contacts' WHERE id = 'orphaned-contacts';
UPDATE watchdog_checks SET webhook_url = 'https://n8n-service-v39p.onrender.com/webhook/watchdog-missing-contact-fields' WHERE id = 'missing-contact-fields';
UPDATE watchdog_checks SET webhook_url = 'https://n8n-service-v39p.onrender.com/webhook/watchdog-missing-company-source' WHERE id = 'missing-company-source';
```

**Step 6: Save workflow JSON locally, update CLAUDE.md, commit**

```bash
git add n8n-workflow-watchdog-daily-coordinator.json CLAUDE.md
git commit -m "feat: add Watchdog daily coordinator workflow"
```

---

### Task 7: End-to-End Verification & Final Updates

**Step 1: Verify Supabase data**

Query `watchdog_results` to confirm results were saved:
```sql
SELECT check_id, status, violation_count, run_at FROM watchdog_results ORDER BY run_at DESC LIMIT 10;
```

**Step 2: Verify Slack message**

Check the Slack channel for the digest message. It should show:
- Header: "HubSpot Watchdog — Daily Report"
- Summary counts by severity
- Details for each failing check with HubSpot links

**Step 3: Update CLAUDE.md phase status**

Change Phase 1 status from "Not started" to "Complete".

**Step 4: Final commit**

```bash
git add CLAUDE.md
git commit -m "feat: complete Watchdog Phase 1 — foundation with 3 checks"
```
