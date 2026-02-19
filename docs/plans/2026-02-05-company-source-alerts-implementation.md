# Company Source Alerts - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Slack alerting system that detects missing/conflicting company source fields and allows quick fixes via Slack buttons and modals.

**Architecture:** HubSpot workflow triggers n8n 10 minutes after company creation. n8n checks for missing/conflicting source fields, sends Slack alert with interactive buttons. Second n8n workflow handles Slack interactions and updates HubSpot.

**Tech Stack:** n8n workflows, Slack Block Kit (buttons + modals), HubSpot API, Slack API

---

## Prerequisites

Before starting, ensure you have:
- n8n instance access (https://n8n-service-v39p.onrender.com)
- HubSpot admin access (Portal ID: 48653760)
- Slack workspace admin access

## Reference Data

**HubSpot Properties:**
| Field | Property Name | Type |
|-------|---------------|------|
| Motion | `motion` | Dropdown |
| Lead source category | `lead_source_category` | Dropdown |
| Lead source | `lead_source` | Text |
| Original traffic source | `hs_analytics_source` | Text |
| Drill down 1 | `hs_analytics_source_data_1` | Text |
| Drill down 2 | `hs_analytics_source_data_2` | Text |

**Motion Values:** Inbound, Outbound, Events, Referral

**Lead Source Category Values:** PPC, Partners inbound, Signal based outbound, Sourcing outbound, Organic social, Organic search, Direct, Other campaigns, Investors referral, Customer/Prospect referral

**HubSpot URLs:**
- Company: `https://app.hubspot.com/contacts/48653760/company/{companyId}`
- Contact: `https://app.hubspot.com/contacts/48653760/contact/{contactId}`

**Slack Webhook:** `SLACK_WEBHOOK_URL`

---

## Task 1: Create Slack App with Interactivity

**Goal:** Set up Slack app that can receive button clicks and modal submissions.

**Step 1: Create the Slack App**

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name: `Company Source Alerts`
4. Workspace: Select your workspace
5. Click "Create App"

**Step 2: Enable Interactivity**

1. In left sidebar, click "Interactivity & Shortcuts"
2. Toggle "Interactivity" to ON
3. Request URL: `https://n8n-service-v39p.onrender.com/webhook/company-source-fix` (we'll create this webhook in Task 3)
4. Click "Save Changes"

**Step 3: Add Bot Token Scopes**

1. In left sidebar, click "OAuth & Permissions"
2. Scroll to "Scopes" → "Bot Token Scopes"
3. Add these scopes:
   - `chat:write`
   - `chat:write.public`
4. Click "Save Changes"

**Step 4: Install App to Workspace**

1. Scroll up to "OAuth Tokens for Your Workspace"
2. Click "Install to Workspace"
3. Click "Allow"
4. Copy the "Bot User OAuth Token" (starts with `xoxb-`) - save this for Task 2

**Step 5: Verify setup**

Note down:
- Bot Token: `xoxb-...` (save securely)
- Interactivity Request URL: `https://n8n-service-v39p.onrender.com/webhook/company-source-fix`

---

## Task 2: Create n8n Workflow A - Alert Sender

**Goal:** Receive company ID from HubSpot, check for issues, send Slack alert.

**Files:**
- Create: `n8n-workflow-company-source-alert.json`

### Step 1: Create new workflow in n8n

1. Open n8n: https://n8n-service-v39p.onrender.com
2. Create new workflow named "Company Source Alert"

### Step 2: Add Webhook Trigger

Add node: **Webhook**
- Name: `Webhook - HubSpot Trigger`
- HTTP Method: POST
- Path: `company-source-check`
- Response Mode: `Last Node`

This creates webhook URL: `https://n8n-service-v39p.onrender.com/webhook/company-source-check`

### Step 3: Add HTTP Request - Get Company

Add node: **HTTP Request**
- Name: `HTTP - Get Company`
- Method: GET
- URL: `https://api.hubspot.com/crm/v3/objects/companies/{{ $json.body.companyId }}`
- Query Parameters:
  - `properties`: `name,domain,hubspot_owner_id,motion,lead_source_category,lead_source`
- Authentication: Predefined Credential Type → HubSpot API
- Connect from Webhook

### Step 4: Add HTTP Request - Get Company Owner

Add node: **HTTP Request**
- Name: `HTTP - Get Owner`
- Method: GET
- URL: `https://api.hubspot.com/crm/v3/owners/{{ $json.properties.hubspot_owner_id }}`
- Authentication: HubSpot API
- Connect from HTTP - Get Company

### Step 5: Add HTTP Request - Get Associated Contacts

Add node: **HTTP Request**
- Name: `HTTP - Get Contact Associations`
- Method: GET
- URL: `https://api.hubspot.com/crm/v4/objects/companies/{{ $node["HTTP - Get Company"].json.id }}/associations/contacts`
- Authentication: HubSpot API
- Connect from HTTP - Get Owner

### Step 6: Add Code Node - Extract Contact IDs

Add node: **Code**
- Name: `Code - Extract Contact IDs`
- Mode: Run Once for All Items
- Language: JavaScript

```javascript
const associations = $input.first().json.results || [];
const contactIds = associations.map(a => a.toObjectId);

return [{
  json: {
    contactIds,
    hasContacts: contactIds.length > 0
  }
}];
```

Connect from HTTP - Get Contact Associations

### Step 7: Add IF Node - Has Contacts?

Add node: **IF**
- Name: `IF - Has Contacts`
- Conditions: `{{ $json.hasContacts }}` equals `true`
- Connect from Code - Extract Contact IDs

### Step 8: Add HTTP Request - Batch Read Contacts (True branch)

Add node: **HTTP Request**
- Name: `HTTP - Get Contacts`
- Method: POST
- URL: `https://api.hubspot.com/crm/v3/objects/contacts/batch/read`
- Body Content Type: JSON
- Body:
```json
{
  "inputs": {{ $json.contactIds.map(id => ({ id })) }},
  "properties": ["firstname", "lastname", "email", "createdate", "hubspot_owner_id", "motion", "lead_source_category", "lead_source", "hs_analytics_source", "hs_analytics_source_data_1", "hs_analytics_source_data_2"]
}
```
- Authentication: HubSpot API
- Connect from IF - Has Contacts (True)

### Step 9: Add Code Node - Check for Issues

Add node: **Code**
- Name: `Code - Detect Issues`
- Mode: Run Once for All Items
- Language: JavaScript

```javascript
const company = $node["HTTP - Get Company"].json;
const owner = $node["HTTP - Get Owner"].json;
const contactsResponse = $input.first().json;
const contacts = contactsResponse.results || [];

const companyProps = company.properties;
const companyMotion = companyProps.motion || null;
const companyCategory = companyProps.lead_source_category || null;
const companySource = companyProps.lead_source || null;

// Check for missing fields
const missingFields = [];
if (!companyMotion) missingFields.push('Motion');
if (!companyCategory) missingFields.push('Lead source category');
if (!companySource) missingFields.push('Lead source');

// Check for conflicts
const conflicts = [];

if (contacts.length > 0) {
  const firstContact = contacts[0].properties;

  // Company vs first contact conflict
  if (companyMotion && firstContact.motion && companyMotion !== firstContact.motion) {
    conflicts.push({
      field: 'Motion',
      type: 'company_vs_contact',
      companyValue: companyMotion,
      contactValue: firstContact.motion
    });
  }
  if (companyCategory && firstContact.lead_source_category && companyCategory !== firstContact.lead_source_category) {
    conflicts.push({
      field: 'Lead source category',
      type: 'company_vs_contact',
      companyValue: companyCategory,
      contactValue: firstContact.lead_source_category
    });
  }
  if (companySource && firstContact.lead_source && companySource !== firstContact.lead_source) {
    conflicts.push({
      field: 'Lead source',
      type: 'company_vs_contact',
      companyValue: companySource,
      contactValue: firstContact.lead_source
    });
  }

  // Contact vs contact conflict
  if (contacts.length > 1) {
    const motionValues = [...new Set(contacts.map(c => c.properties.motion).filter(Boolean))];
    const categoryValues = [...new Set(contacts.map(c => c.properties.lead_source_category).filter(Boolean))];
    const sourceValues = [...new Set(contacts.map(c => c.properties.lead_source).filter(Boolean))];

    if (motionValues.length > 1) {
      conflicts.push({
        field: 'Motion',
        type: 'contact_vs_contact',
        values: motionValues
      });
    }
    if (categoryValues.length > 1) {
      conflicts.push({
        field: 'Lead source category',
        type: 'contact_vs_contact',
        values: categoryValues
      });
    }
    if (sourceValues.length > 1) {
      conflicts.push({
        field: 'Lead source',
        type: 'contact_vs_contact',
        values: sourceValues
      });
    }
  }
}

const hasIssues = missingFields.length > 0 || conflicts.length > 0;

// Format contacts for display
const formattedContacts = contacts.map(c => {
  const p = c.properties;
  return {
    id: c.id,
    name: `${p.firstname || ''} ${p.lastname || ''}`.trim() || 'Unknown',
    email: p.email || 'No email',
    createdDate: p.createdate ? new Date(p.createdate).toLocaleDateString() : 'Unknown',
    createdBy: p.hubspot_owner_id || 'Unknown',
    motion: p.motion || '—',
    leadSourceCategory: p.lead_source_category || '—',
    leadSource: p.lead_source || '—',
    originalTrafficSource: p.hs_analytics_source || '—',
    drillDown1: p.hs_analytics_source_data_1 || '—',
    drillDown2: p.hs_analytics_source_data_2 || '—',
    link: `https://app.hubspot.com/contacts/48653760/contact/${c.id}`
  };
});

return [{
  json: {
    hasIssues,
    missingFields,
    conflicts,
    company: {
      id: company.id,
      name: companyProps.name,
      domain: companyProps.domain,
      motion: companyMotion,
      leadSourceCategory: companyCategory,
      leadSource: companySource,
      link: `https://app.hubspot.com/contacts/48653760/company/${company.id}`
    },
    owner: {
      name: `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || 'Unassigned',
      email: owner.email || ''
    },
    contacts: formattedContacts
  }
}];
```

Connect from HTTP - Get Contacts

### Step 10: Add Code Node - No Contacts Path

Add node: **Code**
- Name: `Code - No Contacts Check`
- Mode: Run Once for All Items
- Language: JavaScript

```javascript
const company = $node["HTTP - Get Company"].json;
const owner = $node["HTTP - Get Owner"].json;

const companyProps = company.properties;
const companyMotion = companyProps.motion || null;
const companyCategory = companyProps.lead_source_category || null;
const companySource = companyProps.lead_source || null;

// Check for missing fields
const missingFields = [];
if (!companyMotion) missingFields.push('Motion');
if (!companyCategory) missingFields.push('Lead source category');
if (!companySource) missingFields.push('Lead source');

const hasIssues = missingFields.length > 0;

return [{
  json: {
    hasIssues,
    missingFields,
    conflicts: [],
    company: {
      id: company.id,
      name: companyProps.name,
      domain: companyProps.domain,
      motion: companyMotion,
      leadSourceCategory: companyCategory,
      leadSource: companySource,
      link: `https://app.hubspot.com/contacts/48653760/company/${company.id}`
    },
    owner: {
      name: `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || 'Unassigned',
      email: owner.email || ''
    },
    contacts: []
  }
}];
```

Connect from IF - Has Contacts (False)

### Step 11: Add Merge Node

Add node: **Merge**
- Name: `Merge - Combine Paths`
- Mode: Combine
- Combination Mode: Merge by Position
- Connect both Code nodes to this

### Step 12: Add IF Node - Has Issues?

Add node: **IF**
- Name: `IF - Has Issues`
- Conditions: `{{ $json.hasIssues }}` equals `true`
- Connect from Merge

### Step 13: Add Code Node - Build Slack Message

Add node: **Code**
- Name: `Code - Build Slack Message`
- Mode: Run Once for All Items
- Language: JavaScript

```javascript
const data = $input.first().json;
const { company, owner, contacts, missingFields, conflicts } = data;

// Determine alert type
let alertType = '';
if (missingFields.length > 0 && conflicts.length > 0) {
  alertType = 'Missing Source & Conflict Detected';
} else if (missingFields.length > 0) {
  alertType = 'Missing Source';
} else if (conflicts.length > 0) {
  alertType = 'Conflict Detected';
}

// Build issue description
let issueText = '';
if (missingFields.length > 0) {
  issueText += `*Missing fields:* ${missingFields.join(', ')}\n`;
}
if (conflicts.length > 0) {
  conflicts.forEach(c => {
    if (c.type === 'company_vs_contact') {
      issueText += `*Conflict (${c.field}):* Company has "${c.companyValue}" but first contact has "${c.contactValue}"\n`;
    } else {
      issueText += `*Conflict (${c.field}):* Contacts have different values: ${c.values.join(', ')}\n`;
    }
  });
}

// Build contacts section
let contactsText = '';
contacts.forEach((c, i) => {
  contactsText += `*Contact ${i + 1}:* <${c.link}|${c.name}> (${c.email})\n`;
  contactsText += `• Created: ${c.createdDate} | Created by: ${c.createdBy}\n`;
  contactsText += `• Motion: ${c.motion} | Category: ${c.leadSourceCategory} | Source: ${c.leadSource}\n`;
  contactsText += `• Original traffic: ${c.originalTrafficSource}\n`;
  contactsText += `• Drill down 1: ${c.drillDown1} | Drill down 2: ${c.drillDown2}\n\n`;
});

if (contacts.length === 0) {
  contactsText = '_No contacts associated with this company_\n';
}

// Build Slack blocks
const blocks = [
  {
    type: "header",
    text: {
      type: "plain_text",
      text: `🚨 Company Source Issue: ${company.name}`,
      emoji: true
    }
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Type:* ${alertType}\n${issueText}`
    }
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*📋 Company Details*\n• Owner: ${owner.name}\n• Link: <${company.link}|Open in HubSpot>`
    }
  },
  {
    type: "divider"
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*👥 Associated Contacts*\n${contactsText}`
    }
  },
  {
    type: "divider"
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "*Quick Fix - Motion:*"
    }
  },
  {
    type: "actions",
    block_id: "motion_buttons",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Inbound", emoji: true },
        value: JSON.stringify({ companyId: company.id, field: "motion", value: "Inbound" }),
        action_id: "quick_fix_motion_inbound"
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Outbound", emoji: true },
        value: JSON.stringify({ companyId: company.id, field: "motion", value: "Outbound" }),
        action_id: "quick_fix_motion_outbound"
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Events", emoji: true },
        value: JSON.stringify({ companyId: company.id, field: "motion", value: "Events" }),
        action_id: "quick_fix_motion_events"
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Referral", emoji: true },
        value: JSON.stringify({ companyId: company.id, field: "motion", value: "Referral" }),
        action_id: "quick_fix_motion_referral"
      }
    ]
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "*Quick Fix - Lead Source Category:*"
    }
  },
  {
    type: "actions",
    block_id: "category_buttons",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Direct", emoji: true },
        value: JSON.stringify({ companyId: company.id, field: "lead_source_category", value: "Direct" }),
        action_id: "quick_fix_category_direct"
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Partners inbound", emoji: true },
        value: JSON.stringify({ companyId: company.id, field: "lead_source_category", value: "Partners inbound" }),
        action_id: "quick_fix_category_partners"
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Sourcing outbound", emoji: true },
        value: JSON.stringify({ companyId: company.id, field: "lead_source_category", value: "Sourcing outbound" }),
        action_id: "quick_fix_category_sourcing"
      },
      {
        type: "button",
        text: { type: "plain_text", text: "PPC", emoji: true },
        value: JSON.stringify({ companyId: company.id, field: "lead_source_category", value: "PPC" }),
        action_id: "quick_fix_category_ppc"
      }
    ]
  },
  {
    type: "actions",
    block_id: "modal_button",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "✏️ Open Full Form", emoji: true },
        value: JSON.stringify({
          companyId: company.id,
          companyName: company.name,
          currentMotion: company.motion || '',
          currentCategory: company.leadSourceCategory || '',
          currentSource: company.leadSource || '',
          contacts: contacts
        }),
        action_id: "open_modal",
        style: "primary"
      }
    ]
  }
];

return [{
  json: {
    blocks,
    text: `Company Source Issue: ${company.name}`
  }
}];
```

Connect from IF - Has Issues (True)

### Step 14: Add HTTP Request - Send Slack Message

Add node: **HTTP Request**
- Name: `HTTP - Send Slack Alert`
- Method: POST
- URL: `SLACK_WEBHOOK_URL`
- Body Content Type: JSON
- Body:
```json
{
  "text": "{{ $json.text }}",
  "blocks": {{ JSON.stringify($json.blocks) }}
}
```
- Connect from Code - Build Slack Message

### Step 15: Add Respond to Webhook Node

Add node: **Respond to Webhook**
- Name: `Respond - Success`
- Response Code: 200
- Response Body: `{"status": "alert_sent"}`
- Connect from HTTP - Send Slack Alert

### Step 16: Add Respond to Webhook Node (No Issues Path)

Add node: **Respond to Webhook**
- Name: `Respond - No Issues`
- Response Code: 200
- Response Body: `{"status": "no_issues"}`
- Connect from IF - Has Issues (False)

### Step 17: Save and activate workflow

1. Save workflow
2. Toggle to Active
3. Note the webhook URL: `https://n8n-service-v39p.onrender.com/webhook/company-source-check`

### Step 18: Export workflow JSON

Export the workflow and save to `n8n-workflow-company-source-alert.json`

---

## Task 3: Create n8n Workflow B - Fix Handler

**Goal:** Handle Slack button clicks and modal submissions, update HubSpot.

**Files:**
- Create: `n8n-workflow-company-source-fix.json`

### Step 1: Create new workflow in n8n

Create new workflow named "Company Source Fix Handler"

### Step 2: Add Webhook Trigger

Add node: **Webhook**
- Name: `Webhook - Slack Interaction`
- HTTP Method: POST
- Path: `company-source-fix`
- Response Mode: `Respond to Webhook Node`

Webhook URL: `https://n8n-service-v39p.onrender.com/webhook/company-source-fix`

### Step 3: Add Code Node - Parse Slack Payload

Add node: **Code**
- Name: `Code - Parse Payload`
- Mode: Run Once for All Items
- Language: JavaScript

```javascript
// Slack sends payload as URL-encoded form data
const rawPayload = $input.first().json.body.payload;
const payload = JSON.parse(rawPayload);

const isModal = payload.type === 'view_submission';
const isButtonClick = payload.type === 'block_actions';

let action = null;
let companyId = null;
let updates = {};

if (isButtonClick) {
  const buttonAction = payload.actions[0];
  const actionId = buttonAction.action_id;

  if (actionId === 'open_modal') {
    // Return modal trigger info
    const value = JSON.parse(buttonAction.value);
    return [{
      json: {
        actionType: 'open_modal',
        triggerId: payload.trigger_id,
        companyId: value.companyId,
        companyName: value.companyName,
        currentMotion: value.currentMotion,
        currentCategory: value.currentCategory,
        currentSource: value.currentSource,
        contacts: value.contacts,
        responseUrl: payload.response_url,
        channelId: payload.channel.id,
        messageTs: payload.message.ts
      }
    }];
  } else {
    // Quick fix button
    const value = JSON.parse(buttonAction.value);
    return [{
      json: {
        actionType: 'quick_fix',
        companyId: value.companyId,
        field: value.field,
        value: value.value,
        responseUrl: payload.response_url,
        channelId: payload.channel.id,
        messageTs: payload.message.ts,
        userName: payload.user.name
      }
    }];
  }
}

if (isModal) {
  const values = payload.view.state.values;
  const privateMetadata = JSON.parse(payload.view.private_metadata);

  return [{
    json: {
      actionType: 'modal_submit',
      companyId: privateMetadata.companyId,
      motion: values.motion_input?.motion_select?.selected_option?.value || null,
      leadSourceCategory: values.category_input?.category_select?.selected_option?.value || null,
      leadSource: values.source_input?.source_text?.value || null,
      responseUrl: privateMetadata.responseUrl,
      channelId: privateMetadata.channelId,
      messageTs: privateMetadata.messageTs,
      userName: payload.user.name
    }
  }];
}

return [{ json: { actionType: 'unknown' } }];
```

Connect from Webhook

### Step 4: Add Switch Node - Action Type

Add node: **Switch**
- Name: `Switch - Action Type`
- Mode: Rules
- Routing Rules:
  - Rule 1: `{{ $json.actionType }}` equals `quick_fix` → Output 0
  - Rule 2: `{{ $json.actionType }}` equals `open_modal` → Output 1
  - Rule 3: `{{ $json.actionType }}` equals `modal_submit` → Output 2
- Connect from Code - Parse Payload

### Step 5: Add HTTP Request - Quick Fix Update (Output 0)

Add node: **HTTP Request**
- Name: `HTTP - Quick Fix Update`
- Method: PATCH
- URL: `https://api.hubspot.com/crm/v3/objects/companies/{{ $json.companyId }}`
- Body Content Type: JSON
- Body:
```json
{
  "properties": {
    "{{ $json.field }}": "{{ $json.value }}"
  }
}
```
- Authentication: HubSpot API
- Connect from Switch (Output 0)

### Step 6: Add HTTP Request - Quick Fix Confirmation

Add node: **HTTP Request**
- Name: `HTTP - Quick Fix Confirm`
- Method: POST
- URL: `{{ $node["Code - Parse Payload"].json.responseUrl }}`
- Body Content Type: JSON
- Body:
```json
{
  "text": "✅ Updated {{ $node['Code - Parse Payload'].json.field }} to \"{{ $node['Code - Parse Payload'].json.value }}\" by {{ $node['Code - Parse Payload'].json.userName }}",
  "response_type": "in_channel",
  "replace_original": false
}
```
- Connect from HTTP - Quick Fix Update

### Step 7: Add Respond to Webhook - Quick Fix

Add node: **Respond to Webhook**
- Name: `Respond - Quick Fix Done`
- Response Code: 200
- Response Body: (empty or `{}`)
- Connect from HTTP - Quick Fix Confirm

### Step 8: Add Code Node - Build Modal (Output 1)

Add node: **Code**
- Name: `Code - Build Modal`
- Mode: Run Once for All Items
- Language: JavaScript

```javascript
const data = $input.first().json;

// Build contacts reference text
let contactsText = '';
if (data.contacts && data.contacts.length > 0) {
  data.contacts.forEach((c, i) => {
    contactsText += `*Contact ${i + 1}:* ${c.name} (${c.email})\n`;
    contactsText += `Motion: ${c.motion} | Category: ${c.leadSourceCategory} | Source: ${c.leadSource}\n`;
    contactsText += `Original: ${c.originalTrafficSource} | DD1: ${c.drillDown1} | DD2: ${c.drillDown2}\n\n`;
  });
} else {
  contactsText = '_No contacts associated_';
}

const modal = {
  type: "modal",
  callback_id: "company_source_modal",
  private_metadata: JSON.stringify({
    companyId: data.companyId,
    responseUrl: data.responseUrl,
    channelId: data.channelId,
    messageTs: data.messageTs
  }),
  title: {
    type: "plain_text",
    text: "Fix Company Source"
  },
  submit: {
    type: "plain_text",
    text: "Submit"
  },
  close: {
    type: "plain_text",
    text: "Cancel"
  },
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Company:* ${data.companyName}`
      }
    },
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Contact Reference:*\n${contactsText}`
      }
    },
    {
      type: "divider"
    },
    {
      type: "input",
      block_id: "motion_input",
      optional: true,
      element: {
        type: "static_select",
        action_id: "motion_select",
        placeholder: {
          type: "plain_text",
          text: "Select Motion"
        },
        initial_option: data.currentMotion ? {
          text: { type: "plain_text", text: data.currentMotion },
          value: data.currentMotion
        } : undefined,
        options: [
          { text: { type: "plain_text", text: "Inbound" }, value: "Inbound" },
          { text: { type: "plain_text", text: "Outbound" }, value: "Outbound" },
          { text: { type: "plain_text", text: "Events" }, value: "Events" },
          { text: { type: "plain_text", text: "Referral" }, value: "Referral" }
        ]
      },
      label: {
        type: "plain_text",
        text: "Motion"
      }
    },
    {
      type: "input",
      block_id: "category_input",
      optional: true,
      element: {
        type: "static_select",
        action_id: "category_select",
        placeholder: {
          type: "plain_text",
          text: "Select Lead Source Category"
        },
        initial_option: data.currentCategory ? {
          text: { type: "plain_text", text: data.currentCategory },
          value: data.currentCategory
        } : undefined,
        options: [
          { text: { type: "plain_text", text: "Direct" }, value: "Direct" },
          { text: { type: "plain_text", text: "Partners inbound" }, value: "Partners inbound" },
          { text: { type: "plain_text", text: "Sourcing outbound" }, value: "Sourcing outbound" },
          { text: { type: "plain_text", text: "PPC" }, value: "PPC" },
          { text: { type: "plain_text", text: "Signal based outbound" }, value: "Signal based outbound" },
          { text: { type: "plain_text", text: "Organic social" }, value: "Organic social" },
          { text: { type: "plain_text", text: "Organic search" }, value: "Organic search" },
          { text: { type: "plain_text", text: "Other campaigns" }, value: "Other campaigns" },
          { text: { type: "plain_text", text: "Investors referral" }, value: "Investors referral" },
          { text: { type: "plain_text", text: "Customer/Prospect referral" }, value: "Customer/Prospect referral" }
        ]
      },
      label: {
        type: "plain_text",
        text: "Lead Source Category"
      }
    },
    {
      type: "input",
      block_id: "source_input",
      optional: true,
      element: {
        type: "plain_text_input",
        action_id: "source_text",
        placeholder: {
          type: "plain_text",
          text: "Enter lead source"
        },
        initial_value: data.currentSource || ''
      },
      label: {
        type: "plain_text",
        text: "Lead Source"
      }
    }
  ]
};

// Remove initial_option if undefined (Slack doesn't like undefined)
modal.blocks.forEach(block => {
  if (block.element && block.element.initial_option === undefined) {
    delete block.element.initial_option;
  }
});

return [{
  json: {
    triggerId: data.triggerId,
    modal
  }
}];
```

Connect from Switch (Output 1)

### Step 9: Add HTTP Request - Open Modal

Add node: **HTTP Request**
- Name: `HTTP - Open Modal`
- Method: POST
- URL: `https://slack.com/api/views.open`
- Headers:
  - `Authorization`: `Bearer YOUR_SLACK_BOT_TOKEN` (replace with actual token)
  - `Content-Type`: `application/json`
- Body Content Type: JSON
- Body:
```json
{
  "trigger_id": "{{ $json.triggerId }}",
  "view": {{ JSON.stringify($json.modal) }}
}
```
- Connect from Code - Build Modal

### Step 10: Add Respond to Webhook - Modal Opened

Add node: **Respond to Webhook**
- Name: `Respond - Modal Opened`
- Response Code: 200
- Response Body: (empty)
- Connect from HTTP - Open Modal

### Step 11: Add Code Node - Build Modal Update (Output 2)

Add node: **Code**
- Name: `Code - Build Update Properties`
- Mode: Run Once for All Items
- Language: JavaScript

```javascript
const data = $input.first().json;
const properties = {};

if (data.motion) properties.motion = data.motion;
if (data.leadSourceCategory) properties.lead_source_category = data.leadSourceCategory;
if (data.leadSource) properties.lead_source = data.leadSource;

return [{
  json: {
    ...data,
    properties,
    hasUpdates: Object.keys(properties).length > 0
  }
}];
```

Connect from Switch (Output 2)

### Step 12: Add IF Node - Has Updates?

Add node: **IF**
- Name: `IF - Has Updates`
- Conditions: `{{ $json.hasUpdates }}` equals `true`
- Connect from Code - Build Update Properties

### Step 13: Add HTTP Request - Modal Update (True branch)

Add node: **HTTP Request**
- Name: `HTTP - Modal Update`
- Method: PATCH
- URL: `https://api.hubspot.com/crm/v3/objects/companies/{{ $json.companyId }}`
- Body Content Type: JSON
- Body:
```json
{
  "properties": {{ JSON.stringify($json.properties) }}
}
```
- Authentication: HubSpot API
- Connect from IF - Has Updates (True)

### Step 14: Add HTTP Request - Modal Confirmation

Add node: **HTTP Request**
- Name: `HTTP - Modal Confirm`
- Method: POST
- URL: `{{ $node["Code - Build Update Properties"].json.responseUrl }}`
- Body Content Type: JSON
- Body:
```json
{
  "text": "✅ Company source updated via form by {{ $node['Code - Build Update Properties'].json.userName }}:\n• Motion: {{ $node['Code - Build Update Properties'].json.motion || 'unchanged' }}\n• Category: {{ $node['Code - Build Update Properties'].json.leadSourceCategory || 'unchanged' }}\n• Source: {{ $node['Code - Build Update Properties'].json.leadSource || 'unchanged' }}",
  "response_type": "in_channel",
  "replace_original": false
}
```
- Connect from HTTP - Modal Update

### Step 15: Add Respond to Webhook - Modal Done

Add node: **Respond to Webhook**
- Name: `Respond - Modal Done`
- Response Code: 200
- Response Body: (empty)
- Connect from HTTP - Modal Confirm

### Step 16: Add Respond to Webhook - No Updates

Add node: **Respond to Webhook**
- Name: `Respond - No Updates`
- Response Code: 200
- Response Body: (empty)
- Connect from IF - Has Updates (False)

### Step 17: Save and activate workflow

1. Save workflow
2. Toggle to Active
3. Verify webhook URL matches Slack app Interactivity URL: `https://n8n-service-v39p.onrender.com/webhook/company-source-fix`

### Step 18: Update Slack App Interactivity URL

1. Go to api.slack.com/apps → Your app → Interactivity & Shortcuts
2. Ensure Request URL is: `https://n8n-service-v39p.onrender.com/webhook/company-source-fix`
3. Save Changes

### Step 19: Export workflow JSON

Export and save to `n8n-workflow-company-source-fix.json`

---

## Task 4: Create HubSpot Workflow

**Goal:** Trigger n8n workflow 10 minutes after company creation.

### Step 1: Create new workflow in HubSpot

1. Go to HubSpot → Automation → Workflows
2. Click "Create workflow"
3. Select "Company-based"
4. Click "Create workflow"

### Step 2: Set enrollment trigger

1. Click "Set up triggers"
2. Select "When filter criteria is met"
3. Add filter: "Create date" is known
4. This enrolls all new companies

### Step 3: Add delay action

1. Click "+" to add action
2. Select "Delay"
3. Set: Delay for 10 minutes
4. Save

### Step 4: Add webhook action

1. Click "+" to add action after delay
2. Select "Send a webhook" (under "External communication")
3. Configure:
   - Method: POST
   - Webhook URL: `https://n8n-service-v39p.onrender.com/webhook/company-source-check`
   - Request body:
   ```json
   {
     "companyId": "{{ company.hs_object_id }}"
   }
   ```
4. Save

### Step 5: Name and activate workflow

1. Name: "Company Source Alert Trigger"
2. Click "Review and publish"
3. Toggle "Enroll existing companies" to OFF (only new companies)
4. Click "Turn on"

---

## Task 5: Test End-to-End

### Step 1: Test with missing source

1. Create a new test company in HubSpot with empty Motion, Lead source category, Lead source
2. Wait 10-11 minutes
3. Verify Slack alert appears with "Missing Source" type
4. Test clicking a Motion button → verify HubSpot updates
5. Test clicking a Category button → verify HubSpot updates

### Step 2: Test with conflict

1. Create a company with Motion = "Inbound"
2. Associate a contact with Motion = "Outbound"
3. Trigger the n8n workflow manually (POST to webhook with companyId)
4. Verify Slack alert shows conflict
5. Test "Open Full Form" button → verify modal opens
6. Submit modal → verify HubSpot updates

### Step 3: Test no issues scenario

1. Create a company with all three source fields populated
2. Associate a contact with matching source fields
3. Trigger the workflow
4. Verify no Slack alert is sent (workflow responds with "no_issues")

---

## Task 6: Commit and Document

### Step 1: Export both n8n workflows

Export JSON files from n8n.

### Step 2: Commit workflow files

```bash
git add n8n-workflow-company-source-alert.json n8n-workflow-company-source-fix.json
git commit -m "feat: add company source alert n8n workflows

Two workflows for detecting and fixing company source issues:
- Alert Sender: detects missing/conflicting source fields, sends Slack alert
- Fix Handler: handles Slack button clicks and modal submissions

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### Step 3: Update CLAUDE.md

Add the new workflow IDs to the project documentation.

---

## Summary

| Component | Status | URL/ID |
|-----------|--------|--------|
| Slack App | To create | Company Source Alerts |
| n8n Workflow A | To create | /webhook/company-source-check |
| n8n Workflow B | To create | /webhook/company-source-fix |
| HubSpot Workflow | To create | Company Source Alert Trigger |
