# SAL Form Project

## About

This project powers the Reindeer AI HubSpot CRM operations — including the SAL (Sales Accepted Lead) form, lead processing automations, and company source alert workflows. The frontend is a React app (SAL form) and the backend logic runs through n8n workflows connected to HubSpot.

## Documentation

The main CRM operations guide for the team is a Google Doc:

- **Reindeer AI HubSpot CRM Operations Guide**
- Doc ID: `1AzPV57mErQ4mZVNjFCA_-D-DmgHSe3T0bxsINRepH3Y`
- URL: https://docs.google.com/document/d/1AzPV57mErQ4mZVNjFCA_-D-DmgHSe3T0bxsINRepH3Y/edit

### Document Sections

| Section | Audience | Topics |
|---------|----------|--------|
| 2. Core Concepts | All | Lead source hierarchy, lead status, lifecycle stages |
| 3. For SDRs | SDRs | Key views, daily workflow, meeting flow, recycle queue, uploading lists |
| 4. For AEs | AEs | SAL form, SAL to opportunity, deals & workflows |
| 5. For Marketing Leaders | Marketing | Lead source data, uploading lists, funnel reporting, metrics |
| 6. Automations Reference | All | All automation descriptions |
| 7. FAQ by Role | All | Role-specific Q&A |
| 8. Appendix | All | Field definitions, status options, naming conventions |

### Documentation Instructions

When asked to document something or add information to the guide:
1. Use the `google-docs` skill to edit the Google Doc directly
2. Identify the correct section based on audience and topic (see table above)
3. Insert content at the end of the relevant section, before the next section heading
4. Use `insert-from-markdown` for formatted content
5. Use the `structure` command to find current heading positions before inserting

## n8n Workflows

| Workflow | ID | URL |
|----------|-----|-----|
| SAL Form - Send to AE (v2) | nUo2BsMD5WWQiQlA | https://n8n-service-v39p.onrender.com/workflow/nUo2BsMD5WWQiQlA |
| SAL Form - Process Submission | iaDZm96LpaeDSYwU | https://n8n-service-v39p.onrender.com/workflow/iaDZm96LpaeDSYwU |
| Company Source Alert | VE6RJU1xNkOYEAfi | https://n8n-service-v39p.onrender.com/workflow/VE6RJU1xNkOYEAfi |
| Company Source Fix Handler | 7yW8s0qxmMETFU6F | https://n8n-service-v39p.onrender.com/workflow/7yW8s0qxmMETFU6F |
| Event Meeting Status Sync | 0hi0KKiF7ynVsUa0 | https://n8n-service-v39p.onrender.com/workflow/0hi0KKiF7ynVsUa0 |
| Workflow Amount Summary Rollup | CruoSuV3FXzSlRoE | https://n8n-service-v39p.onrender.com/workflow/CruoSuV3FXzSlRoE |

## Supabase

**IMPORTANT:** Always ask the user whether to create a new Supabase project or use an existing one before creating tables.

| Project | Ref | Purpose |
|---------|-----|---------|
| Reindeer SAL | lbzlhnzmifzeqzefivyx | SAL form backend |
| Watchdog | oirehnrecwzcvxusdbku | HubSpot data quality monitoring |

Access token is in `~/.claude/supabase-config.json`. Use `project_ref` from the table above based on context.

## Deployment

To deploy workflow changes:
1. Edit the local JSON file (e.g., `n8n-workflow-1-send-form.json` or `n8n-workflow-2-process-submission.json`)
2. Use n8n API to update the corresponding workflow ID

---

## HubSpot Data Watchdog

### Overview

A CRM data quality monitoring system that detects anomalies in HubSpot and alerts via Slack. Uses a hybrid architecture: deterministic checks (Tier 1) for clear rules, AI-powered checks (Tier 2) with LLM + HubSpot MCP for fuzzy matching. Self-adjusting via Slack feedback loop.

**Design doc:** `docs/plans/2026-02-17-hubspot-data-watchdog-design.md` — contains full architecture, node-by-node workflow specs, HubSpot API calls, and Supabase schema. Always read this before making changes.

### Architecture

```
Coordinator (schedule) → Fan-out to check sub-workflows → Collect results → Slack digest
```

- **Tier 1 checks:** Webhook → Supabase exceptions → HubSpot API → Code logic → Return result
- **Tier 2 checks:** Webhook → Supabase instructions + exceptions → AI Agent (LLM + HubSpot MCP) → Return result
- **Feedback handler:** Slack reply → AI classifies intent → Updates Supabase (exception or instruction)

### Supabase Tables

| Table | Purpose |
|-------|---------|
| `watchdog_checks` | Registry of all checks (id, tier, severity, schedule, webhook_url, instructions) |
| `watchdog_exceptions` | Rules to skip/ignore specific records or patterns |
| `watchdog_results` | History of every check run and violations found |
| `watchdog_feedback` | Log of all Slack feedback and actions taken |

### Check Registry

| Check ID | Tier | Schedule | Severity |
|----------|------|----------|----------|
| `missing-company-source` | 1 | daily + realtime | high |
| `missing-company-name` | 1 | daily | medium |
| `missing-contact-fields` | 1 | daily | medium |
| `contact-multi-company` | 1 | daily | high |
| `orphaned-contacts` | 1 | daily | medium |
| `orphaned-companies` | 1 | daily | medium |
| `duplicate-deals` | 1 | daily | high |
| `orphaned-deals` | 1 | daily | high |
| `meeting-status-mismatch` | 1 | hourly | critical |
| `lifecycle-pipeline-mismatch` | 1 | hourly | critical |
| `stale-companies` | 1 | daily | medium |
| `smart-duplicate-companies` | 2 | daily | high |
| `sub-company-detection` | 2 | daily | medium |
| `root-cause-analysis` | 2 | on demand | — |

### Watchdog n8n Workflows

As workflows are built, add their IDs here:

| Workflow | ID | Status |
|----------|-----|--------|
| Reindeer AI Health Check: Daily Coordinator | M6ODso1EOZKus5Ts | Built |
| Watchdog Hourly Coordinator | — | Not built |
| Reindeer AI Health Check: Missing Company Source | aMZqzQtKG8JzjWxO | Built |
| Watchdog: Missing Company Name | — | Not built |
| Reindeer AI Health Check: Missing Contact Fields | fURDoMeWjVO3N9Ci | Built |
| Watchdog: Contact Multi-Company | — | Not built |
| Reindeer AI Health Check: Orphaned Contacts | RHtIHuyYcFOdAmPi | Built |
| Watchdog: Orphaned Companies | — | Not built |
| Watchdog: Duplicate Deals | — | Not built |
| Watchdog: Orphaned Deals | — | Not built |
| Watchdog: Meeting Status Mismatch | — | Not built |
| Watchdog: Lifecycle Pipeline Mismatch | — | Not built |
| Watchdog: Stale Companies | — | Not built |
| Watchdog: Smart Duplicate Companies | — | Not built |
| Watchdog: Sub-Company Detection | — | Not built |
| Watchdog: Root Cause Analysis | — | Not built |
| Watchdog: Feedback Handler | — | Not built |
| Watchdog: Fix Status | — | Not built |
| Watchdog: Fix Associate | — | Not built |
| Watchdog: Fix Merge | — | Not built |

### Implementation Phases

| Phase | What | Status |
|-------|------|--------|
| 1 | Foundation: Supabase tables, coordinator, Slack formatter, 3 starter checks | Complete |
| 2 | Core Tier 1: remaining 8 deterministic checks | Not started |
| 3 | AI-Powered: smart duplicates, sub-company detection, root cause | Not started |
| 4 | Feedback Loop: Slack reply handler, action buttons, fix workflows | Not started |
| 5 | Real-Time: webhook triggers for critical checks | Not started |

### How to Build a New Check

1. Read the design doc for the check's specification (HubSpot API calls, business logic)
2. Create a new n8n workflow following the Tier 1 or Tier 2 template from the design doc
3. Set webhook path to `/webhook/watchdog-{check_id}`
4. Test the sub-workflow independently by calling its webhook
5. Add the workflow ID to `watchdog_checks` in Supabase (should already be seeded)
6. Update the webhook_url in Supabase with the full n8n URL
7. Update this table above with the workflow ID and set status to "Built"
8. Test via the coordinator to confirm it integrates correctly

### How to Add a New Check Type

1. Add the check specification to the design doc (HubSpot API calls, logic, severity)
2. Add a row to `watchdog_checks` in Supabase
3. Add the check to the registry table above
4. Build the workflow following the Tier 1/Tier 2 template
5. Wire it into the appropriate coordinator (daily or hourly)

### Standardized Result Format

Every check must return this JSON:

```json
{
  "check_id": "check-name",
  "status": "pass|fail|error",
  "severity": "critical|high|medium",
  "count": 0,
  "items": [
    {
      "record_type": "company|contact|deal",
      "record_id": "hubspot_id",
      "record_name": "display name",
      "details": "human-readable violation description",
      "hubspot_url": "https://app.hubspot.com/contacts/xxx/..."
    }
  ],
  "root_cause": "optional LLM explanation"
}
```
