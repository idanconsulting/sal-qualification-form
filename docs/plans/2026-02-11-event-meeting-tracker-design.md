# Event Meeting Tracker

## Problem

Leadership needs visibility into meetings scheduled for events (Manifest, ProMat, etc.): which took place, which didn't, who scheduled them. HubSpot's native reports break down when combining meetings + contacts + companies — they produce bloated lists with all associations instead of a clean company-level view.

## Requirements

- **Live during events:** Auto-refreshing view every 15-30 min
- **Daily recap:** Summary of meeting outcomes
- **Post-event report:** Final tally of what happened
- **Reusable:** Works for any event, not just Manifest
- **Simple:** Leadership cares about event lead + meeting status, nothing more

## Design

### 1. Data Model

#### Contact Properties

| Property | Internal Name | Type | Values |
|----------|--------------|------|--------|
| Event Meeting Status | `event_meeting_status` | Dropdown | Completed, No Show, Scheduled, Cancelled |

The event itself is already captured by `lead_source` (e.g., "Manifest 2026"). No new property needed — just standardize values across imports (e.g., "Events_Manifest_2026.csv" should become "Manifest 2026").

#### Company Properties

| Property | Internal Name | Type | Values |
|----------|--------------|------|--------|
| Event Meeting Status | `event_meeting_status` | Dropdown | Completed, No Show, Scheduled, Cancelled, None |
| Event Name | `event_name` | Text | e.g., "Manifest 2026" |

Company status is a **roll-up** from its contacts. The "best" status wins:

```
Completed > Scheduled > No Show > Cancelled > None
```

Example: If a company has 3 contacts — one Completed, one No Show, one Scheduled — the company shows **Completed**.

### 2. Automation: n8n Workflow

**One workflow: "Event Meeting Status Sync"**

#### Triggers

- **Schedule trigger:** Every 15 min during event week, daily otherwise
- **Manual trigger:** Run on-demand for instant refresh

#### Step 1: Find Event Contacts

- Query HubSpot for all contacts where `lead_source` contains the event name parameter
- For each contact, get their meeting associations via the HubSpot API

#### Step 2: Update Contact-Level Status

For each contact with meeting associations:
- Fetch the latest meeting object
- Read `hs_meeting_outcome` property
- Map to `event_meeting_status`:
  - `COMPLETED` → "Completed"
  - `NO_SHOW` → "No Show"
  - `CANCELLED` → "Cancelled"
  - No outcome + meeting start time in future → "Scheduled"
  - No outcome + meeting start time in past → "Scheduled" (needs manual update)
- Write `event_meeting_status` on the contact via HubSpot batch update

#### Step 3: Roll Up to Company Level

- Group contacts by their associated company
- For each company, pick the best status across all its event contacts
- Write `event_meeting_status` and `event_name` on the company via HubSpot batch update

#### Step 4: Write Google Sheet

- Output a clean table to a Google Sheet:
  - Columns: Company, Contact(s), Meeting Date, Status, Scheduled By, HubSpot Link
  - Summary row at top: "X Completed, Y No Show, Z Scheduled"
- For each new event, create a new tab in the same spreadsheet

### 3. Dashboards

#### HubSpot Dashboards (for sales team)

**Company-level report:**
- Single-object report on companies
- Filter: `event_name` = "Manifest 2026"
- Columns: Company Name, Event Meeting Status
- Visualization: Pie chart (Completed vs No Show vs Scheduled)

**Contact-level report:**
- Single-object report on contacts
- Filter: `lead_source` contains "Manifest"
- Columns: Name, Company, Event Meeting Status
- Both work cleanly — no multi-object join needed

#### Google Sheet (for leadership)

- Auto-refreshed by the n8n workflow
- Clean company-level table with all relevant details
- Bookmarkable link for leadership
- Summary stats at the top of each event tab

### 4. Making It Reusable

When a new event comes up (e.g., "ProMat 2026"):

1. **Standardize lead_source values** — ensure all contacts from the event use a consistent value like "ProMat 2026"
2. **Run the workflow** with the new event name as the parameter
3. **New Google Sheet tab** is auto-created for the event
4. **HubSpot dashboard** — just change the filter to the new event name (or add a second report)

The workflow itself stays the same — only the event name input changes.

### 5. Lead Source Cleanup

As a prerequisite, standardize existing lead_source values:

| Current Value | Standardized Value |
|--------------|-------------------|
| Events_Manifest_2026.csv | Manifest 2026 |
| Manifest 2026 | Manifest 2026 (no change) |
| manifest2026 | Manifest 2026 |

This can be a one-time n8n workflow or HubSpot bulk update.

## Implementation Steps

1. **Create HubSpot properties** — `event_meeting_status` on contacts and companies, `event_name` on companies
2. **Standardize lead_source values** — clean up existing Manifest data
3. **Build n8n workflow** — "Event Meeting Status Sync" with all 4 steps
4. **Set up Google Sheet** — template with summary row
5. **Create HubSpot reports** — company-level and contact-level single-object reports
6. **Test with Manifest 2026 data** — validate against the 24 companies we already identified
7. **Set up schedule trigger** — configure for event week cadence

## Workflow Diagram

```
[Schedule/Manual Trigger]
        |
        v
[Query HubSpot: contacts by lead_source]
        |
        v
[Get meeting associations for each contact]
        |
        v
[Read meeting outcome → set contact event_meeting_status]
        |
        v
[Group by company → roll up best status]
        |
        v
[Update company event_meeting_status + event_name]
        |
        v
[Write to Google Sheet]
```
