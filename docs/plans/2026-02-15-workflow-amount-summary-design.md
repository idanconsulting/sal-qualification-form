# Workflow Amount Summary Rollup

## Problem

HubSpot doesn't support native cross-object rollup calculations from Services (Workflows) to Deals. We need a "Amount Summary of Workflows" field on each Deal that shows the total sum of `amount` from all associated Service (Workflow) records.

## Solution

An event-driven n8n workflow that recalculates the sum whenever a Service's amount changes or a new Service is associated with a Deal.

## Components

### 1. HubSpot Deal Property

| Field | Value |
|-------|-------|
| Internal name | `amount_summary_of_workflows` |
| Label | Amount Summary of Workflows |
| Type | number (currency) |
| Group | dealinformation |
| Object | Deals |

### 2. n8n Workflow: Workflow Amount Summary Rollup

- **ID:** `CruoSuV3FXzSlRoE`
- **Webhook path:** `workflow-amount-rollup`
- **Webhook URL:** `https://n8n-service-v39p.onrender.com/webhook/workflow-amount-rollup`

### 3. HubSpot Workflow Triggers (to be set up in HubSpot UI)

Two HubSpot workflows need to be created to fire the n8n webhook:

**Trigger 1: Service amount changed**
- Object: Services (Workflows)
- Enrollment: When `amount` property is updated
- Action: Webhook POST to n8n with `{ "serviceId": "<service_record_id>" }`

**Trigger 2: Service associated with a Deal**
- Object: Services (Workflows)
- Enrollment: When associated with a Deal
- Action: Webhook POST to n8n with `{ "serviceId": "<service_record_id>" }`

## Data Flow

```
HubSpot trigger (amount change or new association)
    ↓
POST webhook: { "serviceId": "123" }
    ↓
Get Service → Deal associations (v4 API, type 794)
    ↓
For each associated Deal:
    ↓
    Get Deal → Service associations (v4 API, type 795)
    ↓
    Batch read all Service amounts
    ↓
    Sum amounts (null treated as 0)
    ↓
    PATCH Deal: amount_summary_of_workflows = sum
```

## Association Types

| Direction | Type ID |
|-----------|---------|
| Service → Deal | 794 |
| Deal → Service | 795 |

## Edge Cases

- **No deal associated:** Webhook responds with `{ "status": "no_deal_associated" }` and takes no action
- **All amounts null:** Sets the deal field to `0`
- **Service on multiple deals:** Updates each deal independently
- **Concurrent updates:** Idempotent — always recalculates from scratch, so the last write wins with the correct value

## Manual Setup Required

After deployment, create two HubSpot workflows in the HubSpot UI:

1. Go to **Automations > Workflows** in HubSpot
2. Create workflow on **Services** object
3. Set enrollment trigger to "Property value changed" → `amount`
4. Add action: "Send webhook" → POST to `https://n8n-service-v39p.onrender.com/webhook/workflow-amount-rollup`
5. Body: `{ "serviceId": "{{hs_object_id}}" }`
6. Repeat for the "Associated with Deal" trigger
