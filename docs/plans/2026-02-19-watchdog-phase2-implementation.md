# Watchdog Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the remaining 8 Tier 1 deterministic checks and wire them into the daily/hourly coordinators, completing all Tier 1 Watchdog coverage.

**Architecture:** Same fan-out pattern as Phase 1. Each check is a standalone n8n workflow (Webhook → HTTP → Code → Respond). Simple checks use the standard 4-node pattern. Complex checks (contact-multi-company, duplicate-deals, meeting-status-mismatch) use additional HTTP nodes for batch association reads. Two new coordinators needed: hourly (for critical checks) and an update to the daily coordinator.

**Tech Stack:** n8n workflows (created via n8n REST API), HubSpot CRM Search/Associations APIs, Slack Block Kit.

**References:**
- Design doc: `docs/plans/2026-02-17-hubspot-data-watchdog-design.md`
- Phase 1 plan: `docs/plans/2026-02-18-watchdog-phase1-implementation.md`
- n8n config: `~/.claude/n8n-config.json` (baseUrl + apiKey)
- Supabase config: `~/.claude/supabase-config.json` (access_token) — Watchdog project ref: `oirehnrecwzcvxusdbku`
- HubSpot credential in n8n: `{ "id": "Ic8seJpUK2XUSDQY", "name": "Reindeer" }`
- HubSpot portal ID: `48653760`
- n8n base URL: `https://n8n-service-v39p.onrender.com`
- All workflow names use prefix: `Reindeer AI Health Check:`

**Phase 1 Lessons (apply to all checks):**
- `num_associated_companies` is NOT searchable in HubSpot — use `associatedcompanyid` with `NOT_HAS_PROPERTY` instead for contacts
- Respond node must use `"respondWith": "allIncomingItems"` (not `"json"` with expression)
- Parallel HTTP branches need a Merge node (mode `"append"`) before the Code node
- n8n API: use PUT for updates (requires full body), POST for create, POST `/activate` for activation

---

### Task 1: Build Check — `missing-company-name`

The simplest Phase 2 check. Standard 4-node pattern.

**Files:**
- Create: `n8n-workflow-watchdog-missing-company-name.json`

**Step 1: Create the workflow JSON**

```json
{
  "name": "Reindeer AI Health Check: Missing Company Name",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "watchdog-missing-company-name",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "webhook-trigger",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [240, 300],
      "webhookId": "watchdog-missing-company-name"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://api.hubspot.com/crm/v3/objects/companies/search",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "hubspotAppToken",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={\n  \"filterGroups\": [{\n    \"filters\": [{\n      \"propertyName\": \"name\",\n      \"operator\": \"NOT_HAS_PROPERTY\"\n    }]\n  }],\n  \"properties\": [\"name\", \"domain\", \"createdate\", \"hubspot_owner_id\"],\n  \"limit\": 100\n}",
        "options": {}
      },
      "id": "hubspot-search",
      "name": "HTTP - Search Missing Name",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [480, 300],
      "credentials": {
        "hubspotAppToken": { "id": "Ic8seJpUK2XUSDQY", "name": "Reindeer" }
      }
    },
    {
      "parameters": {
        "mode": "runOnceForAllItems",
        "jsCode": "const searchResults = $('HTTP - Search Missing Name').first().json;\nconst companies = searchResults.results || [];\n\nconst items = companies.map(c => {\n  const props = c.properties || {};\n  return {\n    record_type: 'company',\n    record_id: c.id,\n    record_name: props.domain || '(unnamed)',\n    details: `Company has no name. Domain: ${props.domain || 'none'}. Created ${props.createdate ? new Date(props.createdate).toISOString().split('T')[0] : 'unknown'}.`,\n    hubspot_url: `https://app.hubspot.com/contacts/48653760/company/${c.id}`\n  };\n});\n\nreturn [{\n  json: {\n    check_id: 'missing-company-name',\n    status: items.length > 0 ? 'fail' : 'pass',\n    severity: 'medium',\n    count: items.length,\n    items: items\n  }\n}];"
      },
      "id": "business-logic",
      "name": "Code - Build Result",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [720, 300]
    },
    {
      "parameters": {
        "respondWith": "allIncomingItems",
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
      "main": [[{ "node": "HTTP - Search Missing Name", "type": "main", "index": 0 }]]
    },
    "HTTP - Search Missing Name": {
      "main": [[{ "node": "Code - Build Result", "type": "main", "index": 0 }]]
    },
    "Code - Build Result": {
      "main": [[{ "node": "Respond", "type": "main", "index": 0 }]]
    }
  },
  "settings": { "executionOrder": "v1", "callerPolicy": "workflowsFromSameOwner" }
}
```

**Step 2: Deploy via n8n API, activate, and test**

```bash
N8N_URL=$(cat ~/.claude/n8n-config.json | jq -r '.n8n.baseUrl')
N8N_KEY=$(cat ~/.claude/n8n-config.json | jq -r '.n8n.apiKey')

# Create
curl -s -X POST "${N8N_URL}/api/v1/workflows" \
  -H "X-N8N-API-KEY: ${N8N_KEY}" -H "Content-Type: application/json" \
  -d @n8n-workflow-watchdog-missing-company-name.json

# Activate (use ID from response)
curl -s -X POST "${N8N_URL}/api/v1/workflows/<ID>/activate" -H "X-N8N-API-KEY: ${N8N_KEY}"

# Test
curl -s -X POST "${N8N_URL}/webhook/watchdog-missing-company-name"
```

Expected: JSON with `check_id: "missing-company-name"`, `status`, `count`, and `items`.

**Step 3: Update CLAUDE.md and Supabase webhook URL, commit**

```bash
git add n8n-workflow-watchdog-missing-company-name.json CLAUDE.md
git commit -m "feat: add Watchdog missing-company-name check"
```

---

### Task 2: Build Check — `orphaned-companies`

Standard 4-node pattern. Similar to orphaned-contacts but for companies.

**Files:**
- Create: `n8n-workflow-watchdog-orphaned-companies.json`

**Step 1: Create the workflow JSON**

Same structure as Task 1. Key differences:

- Webhook path: `watchdog-orphaned-companies`
- HTTP node name: `HTTP - Search Orphaned Companies`

**HubSpot search body:**

Note: `num_associated_contacts` may not be searchable (same issue as Phase 1's `num_associated_companies`). If it fails, use a two-step approach: search all companies, then batch-check associations. Try the simple approach first:

```json
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

**Fallback if `num_associated_contacts` is not searchable:** Query all companies and check associations via batch API.

**Code node:**
```javascript
const searchResults = $('HTTP - Search Orphaned Companies').first().json;
const companies = searchResults.results || [];

const items = companies.map(c => {
  const props = c.properties || {};
  return {
    record_type: 'company',
    record_id: c.id,
    record_name: props.name || props.domain || '(unnamed)',
    details: `Company "${props.name || '(unnamed)'}" (domain: ${props.domain || 'none'}) has no contacts. Created ${props.createdate ? new Date(props.createdate).toISOString().split('T')[0] : 'unknown'}.`,
    hubspot_url: `https://app.hubspot.com/contacts/48653760/company/${c.id}`
  };
});

return [{
  json: {
    check_id: 'orphaned-companies',
    status: items.length > 0 ? 'fail' : 'pass',
    severity: 'medium',
    count: items.length,
    items: items
  }
}];
```

**Step 2: Deploy, activate, test**

```bash
curl -s -X POST "${N8N_URL}/webhook/watchdog-orphaned-companies"
```

If 400 error on `num_associated_contacts`, switch to fetching all companies and batch-reading associations.

**Step 3: Update CLAUDE.md, update Supabase webhook URL, commit**

---

### Task 3: Build Check — `orphaned-deals`

Standard 4-node pattern.

**Files:**
- Create: `n8n-workflow-watchdog-orphaned-deals.json`

**Step 1: Create the workflow JSON**

- Webhook path: `watchdog-orphaned-deals`
- HTTP node name: `HTTP - Search Orphaned Deals`

**HubSpot search body:**

Same caveat — try `num_associated_companies` first, fall back to `NOT_HAS_PROPERTY` on association fields if it fails:

```json
{
  "filterGroups": [{
    "filters": [{
      "propertyName": "num_associated_companies",
      "operator": "EQ",
      "value": "0"
    }]
  }],
  "properties": ["dealname", "pipeline", "dealstage", "amount", "createdate", "hubspot_owner_id"],
  "limit": 100
}
```

**Code node:**
```javascript
const searchResults = $('HTTP - Search Orphaned Deals').first().json;
const deals = searchResults.results || [];

const items = deals.map(d => {
  const props = d.properties || {};
  return {
    record_type: 'deal',
    record_id: d.id,
    record_name: props.dealname || '(unnamed deal)',
    details: `Deal "${props.dealname}" (${props.pipeline || 'no pipeline'}/${props.dealstage || 'no stage'}, $${props.amount || '0'}) has no company. Created ${props.createdate ? new Date(props.createdate).toISOString().split('T')[0] : 'unknown'}.`,
    hubspot_url: `https://app.hubspot.com/contacts/48653760/deal/${d.id}`
  };
});

return [{
  json: {
    check_id: 'orphaned-deals',
    status: items.length > 0 ? 'fail' : 'pass',
    severity: 'high',
    count: items.length,
    items: items
  }
}];
```

**Step 2: Deploy, activate, test**

**Step 3: Update CLAUDE.md, update Supabase webhook URL, commit**

---

### Task 4: Build Check — `stale-companies`

Standard 4-node pattern with date calculation.

**Files:**
- Create: `n8n-workflow-watchdog-stale-companies.json`

**Step 1: Create the workflow JSON**

- Webhook path: `watchdog-stale-companies`
- HTTP node name: `HTTP - Search Stale Companies`

**HubSpot search body** (companies with active status but no activity in 30+ days):

```json
{
  "filterGroups": [
    {
      "filters": [
        {
          "propertyName": "notes_last_updated",
          "operator": "LT",
          "value": "{30_days_ago_epoch_ms}"
        },
        {
          "propertyName": "hs_lead_status",
          "operator": "EQ",
          "value": "Open"
        }
      ]
    },
    {
      "filters": [
        {
          "propertyName": "notes_last_updated",
          "operator": "LT",
          "value": "{30_days_ago_epoch_ms}"
        },
        {
          "propertyName": "hs_lead_status",
          "operator": "EQ",
          "value": "In Progress"
        }
      ]
    },
    {
      "filters": [
        {
          "propertyName": "notes_last_updated",
          "operator": "LT",
          "value": "{30_days_ago_epoch_ms}"
        },
        {
          "propertyName": "hs_lead_status",
          "operator": "EQ",
          "value": "Meeting Scheduled"
        }
      ]
    }
  ],
  "properties": ["name", "domain", "hs_lead_status", "notes_last_updated", "hubspot_owner_id"],
  "limit": 100
}
```

**Important:** The `value` for `notes_last_updated` must be a dynamic epoch millisecond value. Since n8n expressions are evaluated, use an expression in the jsonBody:

```
"value": "={{ Date.now() - 30 * 24 * 60 * 60 * 1000 }}"
```

The full `jsonBody` parameter should use `=` prefix for expression evaluation. Build the JSON body as an expression string with the dynamic timestamp embedded.

**Code node:**
```javascript
const searchResults = $('HTTP - Search Stale Companies').first().json;
const companies = searchResults.results || [];

const items = companies.map(c => {
  const props = c.properties || {};
  const lastUpdate = props.notes_last_updated ? new Date(props.notes_last_updated) : null;
  const daysAgo = lastUpdate ? Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24)) : 'unknown';

  return {
    record_type: 'company',
    record_id: c.id,
    record_name: props.name || props.domain || '(unnamed)',
    details: `Company "${props.name || '(unnamed)'}" is "${props.hs_lead_status}" but last activity was ${daysAgo} days ago. Domain: ${props.domain || 'none'}.`,
    hubspot_url: `https://app.hubspot.com/contacts/48653760/company/${c.id}`
  };
});

return [{
  json: {
    check_id: 'stale-companies',
    status: items.length > 0 ? 'fail' : 'pass',
    severity: 'medium',
    count: items.length,
    items: items
  }
}];
```

**Step 2: Deploy, activate, test**

**Step 3: Update CLAUDE.md, update Supabase webhook URL, commit**

---

### Task 5: Build Check — `duplicate-deals`

More complex — needs batch association reads to group deals by company.

**Files:**
- Create: `n8n-workflow-watchdog-duplicate-deals.json`

**Step 1: Create the workflow JSON**

Node layout:
```
Webhook [240,300] → HTTP - Search Open Deals [480,300] → Code - Find Duplicates [720,300] → Respond [960,300]
```

- Webhook path: `watchdog-duplicate-deals`

**HTTP node — search all open deals:**
```json
{
  "method": "POST",
  "url": "https://api.hubspot.com/crm/v3/objects/deals/search",
  "jsonBody": "={\n  \"filterGroups\": [{\n    \"filters\": [{\n      \"propertyName\": \"hs_is_closed\",\n      \"operator\": \"EQ\",\n      \"value\": \"false\"\n    }]\n  }],\n  \"properties\": [\"dealname\", \"pipeline\", \"dealstage\", \"amount\", \"hubspot_owner_id\"],\n  \"limit\": 100\n}"
}
```

**Code node — fetch associations and find duplicates:**

The Code node will make an HTTP request to the HubSpot associations API to get company associations for each deal, then group by (company_id, pipeline) to find duplicates.

```javascript
const searchResults = $('HTTP - Search Open Deals').first().json;
const deals = searchResults.results || [];

if (deals.length === 0) {
  return [{ json: { check_id: 'duplicate-deals', status: 'pass', severity: 'high', count: 0, items: [] } }];
}

// Batch read deal-to-company associations
const dealIds = deals.map(d => ({ id: d.id }));
const assocResponse = await $helpers.httpRequest({
  method: 'POST',
  url: 'https://api.hubspot.com/crm/v4/associations/deals/companies/batch/read',
  headers: { 'Authorization': 'Bearer ' + $('Webhook').first().json.headers?.authorization?.replace('Bearer ', '') || '' },
  body: { inputs: dealIds },
  json: true
});

// Note: The above won't work because we need the HubSpot token.
// Instead, use the n8n credential approach. Since Code nodes can't directly
// use credentials, we need a different approach.
//
// ALTERNATIVE: Use the HTTP Request node with HubSpot credentials to batch-read
// associations BEFORE the Code node. Add a second HTTP node.
```

**Revised node layout (5 nodes):**
```
Webhook [240,300]
  → HTTP - Search Open Deals [480,300]
  → HTTP - Get Deal Associations [720,300]
  → Code - Find Duplicates [960,300]
  → Respond [1200,300]
```

**HTTP node 2 — batch read deal-company associations:**
```json
{
  "method": "POST",
  "url": "https://api.hubspot.com/crm/v4/associations/deals/companies/batch/read",
  "authentication": "predefinedCredentialType",
  "nodeCredentialType": "hubspotAppToken",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ JSON.stringify({ inputs: $json.results.map(d => ({ id: d.id })) }) }}"
}
```

**Code node:**
```javascript
const deals = $('HTTP - Search Open Deals').first().json.results || [];
const assocResults = $('HTTP - Get Deal Associations').first().json.results || [];

// Build deal-to-company map
const dealCompanyMap = {};
for (const result of assocResults) {
  const dealId = result.from?.id;
  const companyIds = (result.to || []).map(t => t.toObjectId);
  if (dealId && companyIds.length > 0) {
    dealCompanyMap[dealId] = companyIds;
  }
}

// Group deals by (company_id, pipeline)
const groups = {};
for (const deal of deals) {
  const companyIds = dealCompanyMap[deal.id] || [];
  const pipeline = deal.properties?.pipeline || 'unknown';
  for (const companyId of companyIds) {
    const key = `${companyId}::${pipeline}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(deal);
  }
}

// Find duplicates (groups with 2+ deals)
const items = [];
for (const [key, groupDeals] of Object.entries(groups)) {
  if (groupDeals.length < 2) continue;
  const [companyId, pipeline] = key.split('::');
  const dealList = groupDeals.map(d =>
    `"${d.properties?.dealname}" ($${d.properties?.amount || '0'}, ${d.properties?.dealstage})`
  ).join(', ');

  items.push({
    record_type: 'deal',
    record_id: groupDeals[0].id,
    record_name: `${groupDeals.length} duplicate deals`,
    details: `Company ${companyId} has ${groupDeals.length} open deals in pipeline "${pipeline}": ${dealList}`,
    hubspot_url: `https://app.hubspot.com/contacts/48653760/company/${companyId}`
  });
}

return [{
  json: {
    check_id: 'duplicate-deals',
    status: items.length > 0 ? 'fail' : 'pass',
    severity: 'high',
    count: items.length,
    items: items
  }
}];
```

**Step 2: Deploy, activate, test**

**Step 3: Update CLAUDE.md, update Supabase webhook URL, commit**

---

### Task 6: Build Check — `contact-multi-company`

Complex — needs batch association reads to find contacts with 2+ companies.

**Files:**
- Create: `n8n-workflow-watchdog-contact-multi-company.json`

**Step 1: Create the workflow JSON**

Node layout (5 nodes):
```
Webhook [240,300]
  → HTTP - Search Contacts [480,300]
  → HTTP - Get Contact Associations [720,300]
  → Code - Find Multi-Company [960,300]
  → Respond [1200,300]
```

- Webhook path: `watchdog-contact-multi-company`

**HTTP node 1 — search all contacts (recent, with properties):**
```json
{
  "method": "POST",
  "url": "https://api.hubspot.com/crm/v3/objects/contacts/search",
  "jsonBody": "={\n  \"filterGroups\": [{\n    \"filters\": [{\n      \"propertyName\": \"createdate\",\n      \"operator\": \"HAS_PROPERTY\"\n    }]\n  }],\n  \"properties\": [\"firstname\", \"lastname\", \"email\"],\n  \"limit\": 100\n}"
}
```

**HTTP node 2 — batch read contact-company associations:**
```json
{
  "method": "POST",
  "url": "https://api.hubspot.com/crm/v4/associations/contacts/companies/batch/read",
  "jsonBody": "={{ JSON.stringify({ inputs: $json.results.map(c => ({ id: c.id })) }) }}"
}
```

**Code node:**
```javascript
const contacts = $('HTTP - Search Contacts').first().json.results || [];
const assocResults = $('HTTP - Get Contact Associations').first().json.results || [];

// Build contact-to-companies map
const contactCompanyMap = {};
for (const result of assocResults) {
  const contactId = result.from?.id;
  const companyIds = (result.to || []).map(t => t.toObjectId);
  if (contactId) {
    contactCompanyMap[contactId] = companyIds;
  }
}

// Find contacts with 2+ companies
const items = [];
for (const contact of contacts) {
  const companies = contactCompanyMap[contact.id] || [];
  if (companies.length < 2) continue;

  const props = contact.properties || {};
  const name = [props.firstname, props.lastname].filter(Boolean).join(' ') || '(no name)';

  items.push({
    record_type: 'contact',
    record_id: contact.id,
    record_name: name,
    details: `Contact "${name}" (${props.email || 'no email'}) is associated with ${companies.length} companies (IDs: ${companies.join(', ')}).`,
    hubspot_url: `https://app.hubspot.com/contacts/48653760/contact/${contact.id}`
  });
}

return [{
  json: {
    check_id: 'contact-multi-company',
    status: items.length > 0 ? 'fail' : 'pass',
    severity: 'high',
    count: items.length,
    items: items
  }
}];
```

**Step 2: Deploy, activate, test**

**Step 3: Update CLAUDE.md, update Supabase webhook URL, commit**

---

### Task 7: Build Check — `meeting-status-mismatch`

Most complex check. Needs multiple API calls for future/past meetings and their associated contacts/companies.

**Files:**
- Create: `n8n-workflow-watchdog-meeting-status-mismatch.json`

**Step 1: Create the workflow JSON**

This check needs many HTTP nodes. Simplified approach: use Code node with `$helpers.httpRequest` won't work with credentials. Instead, split into multiple HTTP nodes.

**Simplified approach — 2 searches + Code logic:**

Node layout (6 nodes):
```
Webhook [240,300]
  → HTTP - Future Meetings [480,200]  ─┐
  → HTTP - Past Meetings [480,400]    ─── Merge [660,300] → Code - Check Mismatches [860,300] → Respond [1060,300]
```

**HTTP node 1 — future meetings (next 7 days):**
```json
{
  "method": "POST",
  "url": "https://api.hubspot.com/crm/v3/objects/meetings/search",
  "jsonBody": "={\n  \"filterGroups\": [{\n    \"filters\": [\n      {\n        \"propertyName\": \"hs_meeting_start_time\",\n        \"operator\": \"GT\",\n        \"value\": \"{{ Date.now() }}\"\n      },\n      {\n        \"propertyName\": \"hs_meeting_start_time\",\n        \"operator\": \"LT\",\n        \"value\": \"{{ Date.now() + 7 * 24 * 60 * 60 * 1000 }}\"\n      }\n    ]\n  }],\n  \"properties\": [\"hs_meeting_title\", \"hs_meeting_start_time\", \"hubspot_owner_id\"],\n  \"limit\": 100,\n  \"associations\": [\"contacts\", \"companies\"]\n}"
}
```

Note: The `associations` parameter in HubSpot search returns associated IDs inline. If this doesn't work, we'll need separate batch association reads.

**HTTP node 2 — past meetings (last 7 days):**
Same structure but with:
```
"operator": "LT", "value": "{{ Date.now() }}"
"operator": "GT", "value": "{{ Date.now() - 7 * 24 * 60 * 60 * 1000 }}"
```

**Merge node:** mode `"append"` to combine both result sets.

**Code node — check lead status mismatches:**

This is the most complex Code node. It needs to:
1. Separate future vs past meetings (by comparing meeting time to now)
2. Get associated contact/company IDs from the search results
3. Batch-read those contacts and companies to get their `hs_lead_status`
4. Flag mismatches

Since Code nodes can't use HubSpot credentials, we need additional HTTP nodes for the batch reads. This makes the workflow very complex.

**Pragmatic simplification:** Use a single Code node that builds the API calls using the HubSpot token from the n8n credential. The token is available in the HTTP node's executed request. Alternative: hardcode the batch reads as additional HTTP nodes.

**Recommended approach — additional HTTP nodes:**

Full node layout (8 nodes):
```
Webhook [240,300]
  → HTTP - Future Meetings [480,200]
  → HTTP - Past Meetings [480,400]
  → Merge - Meetings [660,300]
  → HTTP - Batch Read Contacts [860,200]
  → HTTP - Batch Read Companies [860,400]
  → Merge - Records [1060,300]
  → Code - Check Mismatches [1260,300]
  → Respond [1460,300]
```

However, the batch read HTTP nodes need dynamic input from the meeting results. This requires expressions to extract contact/company IDs from the meeting associations.

**Alternative pragmatic approach:** Do everything in a single Code node that calls HubSpot APIs directly using `$helpers.httpRequest`. The auth token can be obtained by having a preceding HTTP node that calls any HubSpot endpoint (the response headers won't expose it, but we can use an environment variable or n8n credential store).

**Final approach — keep it simple:** Use 4 HTTP nodes + merge + code.

Given the complexity, implement this as follows:

```
Webhook [240,300]
  → HTTP - Search Future Meetings [480,200] ─┐
  → HTTP - Search Past Meetings [480,400]   ─── Merge [660,300]
  → Code - Analyze Mismatches [860,300]
  → Respond [1060,300]
```

The Code node will use the meeting results' `associations` field (returned by HubSpot search when requested) to identify contacts/companies, then make batch API calls using `$helpers.httpRequest` with the HubSpot token from an environment variable or credential.

**Implementation note:** If `$helpers.httpRequest` doesn't support HubSpot auth, add separate HTTP nodes for the batch reads. Test the simplest approach first.

**Code node (simplified — checks meeting associations inline):**
```javascript
const allMeetings = $input.all().map(item => item.json);
const now = Date.now();
const items = [];

for (const searchResult of allMeetings) {
  const meetings = searchResult.results || [];

  for (const meeting of meetings) {
    const props = meeting.properties || {};
    const startTime = parseInt(props.hs_meeting_start_time);
    const isFuture = startTime > now;
    const meetingTitle = props.hs_meeting_title || '(no title)';
    const meetingDate = new Date(startTime).toISOString().split('T')[0];

    // Get associated contacts and companies from associations
    const contactAssocs = meeting.associations?.contacts?.results || [];
    const companyAssocs = meeting.associations?.companies?.results || [];

    // For now, flag meetings that have associations but we can't check lead status
    // (Full implementation would batch-read contacts/companies for hs_lead_status)
    const expectedStatus = isFuture ? 'Meeting Scheduled' : 'Meeting Occurred';

    for (const assoc of contactAssocs) {
      items.push({
        record_type: 'contact',
        record_id: assoc.id,
        record_name: `Contact ${assoc.id}`,
        details: `${isFuture ? 'Future' : 'Past'} meeting "${meetingTitle}" (${meetingDate}) — contact should have status "${expectedStatus}". Verify manually.`,
        hubspot_url: `https://app.hubspot.com/contacts/48653760/contact/${assoc.id}`
      });
    }
  }
}

return [{
  json: {
    check_id: 'meeting-status-mismatch',
    status: items.length > 0 ? 'fail' : 'pass',
    severity: 'critical',
    count: items.length,
    items: items
  }
}];
```

**Important:** This is a simplified v1. The full implementation should batch-read contacts/companies to check actual `hs_lead_status` values and only flag mismatches. Iterate on this after the basic flow works.

**Step 2: Deploy, activate, test**

**Step 3: Update CLAUDE.md, update Supabase webhook URL, commit**

---

### Task 8: Build Check — `lifecycle-pipeline-mismatch`

Two scenarios: companies with "Meeting Occurred" but no deals, and SAL submissions without lifecycle update.

**Files:**
- Create: `n8n-workflow-watchdog-lifecycle-pipeline-mismatch.json`

**Step 1: Create the workflow JSON**

Node layout (6 nodes — parallel searches + merge):
```
Webhook [240,300]
  → HTTP - Meeting No Deals [480,200]   ─┐
  → HTTP - SAL No Lifecycle [480,400]   ─── Merge [660,300] → Code - Build Result [860,300] → Respond [1060,300]
```

- Webhook path: `watchdog-lifecycle-pipeline-mismatch`

**HTTP node 1 — companies with "Meeting Occurred" but no deals:**
```json
{
  "method": "POST",
  "url": "https://api.hubspot.com/crm/v3/objects/companies/search",
  "jsonBody": "={\n  \"filterGroups\": [{\n    \"filters\": [\n      { \"propertyName\": \"num_associated_deals\", \"operator\": \"EQ\", \"value\": \"0\" },\n      { \"propertyName\": \"hs_lead_status\", \"operator\": \"EQ\", \"value\": \"Meeting Occurred\" }\n    ]\n  }],\n  \"properties\": [\"name\", \"domain\", \"hs_lead_status\", \"lifecyclestage\", \"hubspot_owner_id\"],\n  \"limit\": 100\n}"
}
```

**HTTP node 2 — companies with SAL submission but lifecycle not updated:**
```json
{
  "method": "POST",
  "url": "https://api.hubspot.com/crm/v3/objects/companies/search",
  "jsonBody": "={\n  \"filterGroups\": [{\n    \"filters\": [\n      { \"propertyName\": \"sal_form_submitted_date\", \"operator\": \"HAS_PROPERTY\" },\n      { \"propertyName\": \"lifecyclestage\", \"operator\": \"NEQ\", \"value\": \"salesqualifiedlead\" }\n    ]\n  }],\n  \"properties\": [\"name\", \"domain\", \"lifecyclestage\", \"hs_lead_status\", \"sal_form_submitted_date\", \"hubspot_owner_id\"],\n  \"limit\": 100\n}"
}
```

Note: The property `sal_form_submitted_date` may have a different internal name. If the search returns 400, check the actual HubSpot property name. It might be `sal_submitted_date` or similar.

**Merge node:** mode `"append"`.

**Code node:**
```javascript
const results = $input.all().map(item => item.json);
const items = [];

// Process both result sets
for (const searchResult of results) {
  const companies = searchResult.results || [];

  for (const c of companies) {
    const props = c.properties || {};

    if (props.hs_lead_status === 'Meeting Occurred' && !props.sal_form_submitted_date) {
      // Scenario A: Meeting occurred but no deals
      items.push({
        record_type: 'company',
        record_id: c.id,
        record_name: props.name || props.domain || '(unnamed)',
        details: `Company has "Meeting Occurred" status but no deals created. Lifecycle: ${props.lifecyclestage || 'none'}. Action: create deal or update status.`,
        hubspot_url: `https://app.hubspot.com/contacts/48653760/company/${c.id}`
      });
    } else if (props.sal_form_submitted_date) {
      // Scenario B: SAL submitted but lifecycle not updated
      const daysAgo = Math.floor((Date.now() - new Date(props.sal_form_submitted_date).getTime()) / (1000 * 60 * 60 * 24));
      items.push({
        record_type: 'company',
        record_id: c.id,
        record_name: props.name || props.domain || '(unnamed)',
        details: `SAL submitted ${daysAgo} days ago but lifecycle is "${props.lifecyclestage}" not "salesqualifiedlead". Lead status: ${props.hs_lead_status || 'none'}.`,
        hubspot_url: `https://app.hubspot.com/contacts/48653760/company/${c.id}`
      });
    }
  }
}

return [{
  json: {
    check_id: 'lifecycle-pipeline-mismatch',
    status: items.length > 0 ? 'fail' : 'pass',
    severity: 'critical',
    count: items.length,
    items: items
  }
}];
```

**Step 2: Deploy, activate, test**

**Step 3: Update CLAUDE.md, update Supabase webhook URL, commit**

---

### Task 9: Update Daily Coordinator — Add New Daily Checks

**Files:**
- Modify: `n8n-workflow-watchdog-daily-coordinator.json`

**Step 1: Add the 6 new daily checks to the coordinator**

Update the coordinator workflow to fan out to all 9 daily checks (3 existing + 6 new):

New HTTP nodes to add:
- `HTTP - Check Missing Company Name`
- `HTTP - Check Orphaned Companies`
- `HTTP - Check Orphaned Deals`
- `HTTP - Check Stale Companies`
- `HTTP - Check Duplicate Deals`
- `HTTP - Check Contact Multi-Company`

Update the Merge node to accept 9 inputs: `"numberInputs": 9`

Update connections:
- Both triggers → all 9 HTTP check nodes
- All 9 HTTP check nodes → Merge (each to a different index 0-8)
- Merge → Code → Save/IF → Slack

**Step 2: Update via n8n API and test**

Trigger via webhook: `POST ${N8N_URL}/webhook/watchdog-daily-run`

Verify all 9 checks execute and Slack digest includes all results.

**Step 3: Commit**

```bash
git add n8n-workflow-watchdog-daily-coordinator.json
git commit -m "feat: add 6 new checks to Watchdog daily coordinator"
```

---

### Task 10: Build Hourly Coordinator

**Files:**
- Create: `n8n-workflow-watchdog-hourly-coordinator.json`

**Step 1: Create the hourly coordinator workflow**

Same pattern as daily coordinator but:
- Schedule trigger: every hour
- Only 2 checks: `meeting-status-mismatch` and `lifecycle-pipeline-mismatch`
- Merge with `numberInputs: 2`
- Same Slack digest format
- Same Supabase save
- Webhook for manual trigger: `watchdog-hourly-run`

Use the daily coordinator JSON as a template, replacing:
- Schedule: hourly instead of daily 8AM
- Only 2 HTTP check nodes
- Merge with 2 inputs
- Webhook path: `watchdog-hourly-run`
- Name: `Reindeer AI Health Check: Hourly Coordinator`

**Step 2: Deploy, activate, test**

**Step 3: Update CLAUDE.md with workflow ID, commit**

---

### Task 11: End-to-End Verification & Final Updates

**Step 1: Verify all checks work independently**

Test each webhook:
```bash
for check in missing-company-name orphaned-companies orphaned-deals stale-companies duplicate-deals contact-multi-company meeting-status-mismatch lifecycle-pipeline-mismatch; do
  echo "Testing $check..."
  curl -s -X POST "${N8N_URL}/webhook/watchdog-${check}" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d[0] if isinstance(d,list) else d; print(f'  {r[\"check_id\"]}: {r[\"status\"]} ({r[\"count\"]} violations)')"
done
```

**Step 2: Trigger daily coordinator and verify Slack digest**

```bash
curl -s -X POST "${N8N_URL}/webhook/watchdog-daily-run"
```

**Step 3: Trigger hourly coordinator and verify**

```bash
curl -s -X POST "${N8N_URL}/webhook/watchdog-hourly-run"
```

**Step 4: Verify Supabase results saved**

```sql
SELECT check_id, status, violation_count, run_at
FROM watchdog_results
ORDER BY run_at DESC LIMIT 20;
```

**Step 5: Update all Supabase webhook URLs**

```sql
UPDATE watchdog_checks SET webhook_url = 'https://n8n-service-v39p.onrender.com/webhook/watchdog-missing-company-name' WHERE id = 'missing-company-name';
UPDATE watchdog_checks SET webhook_url = 'https://n8n-service-v39p.onrender.com/webhook/watchdog-orphaned-companies' WHERE id = 'orphaned-companies';
UPDATE watchdog_checks SET webhook_url = 'https://n8n-service-v39p.onrender.com/webhook/watchdog-orphaned-deals' WHERE id = 'orphaned-deals';
UPDATE watchdog_checks SET webhook_url = 'https://n8n-service-v39p.onrender.com/webhook/watchdog-stale-companies' WHERE id = 'stale-companies';
UPDATE watchdog_checks SET webhook_url = 'https://n8n-service-v39p.onrender.com/webhook/watchdog-duplicate-deals' WHERE id = 'duplicate-deals';
UPDATE watchdog_checks SET webhook_url = 'https://n8n-service-v39p.onrender.com/webhook/watchdog-contact-multi-company' WHERE id = 'contact-multi-company';
UPDATE watchdog_checks SET webhook_url = 'https://n8n-service-v39p.onrender.com/webhook/watchdog-meeting-status-mismatch' WHERE id = 'meeting-status-mismatch';
UPDATE watchdog_checks SET webhook_url = 'https://n8n-service-v39p.onrender.com/webhook/watchdog-lifecycle-pipeline-mismatch' WHERE id = 'lifecycle-pipeline-mismatch';
```

**Step 6: Update CLAUDE.md Phase 2 status to "Complete"**

**Step 7: Final commit and push**

```bash
git add CLAUDE.md
git commit -m "feat: complete Watchdog Phase 2 — all 11 Tier 1 checks active"
git push origin main
```
