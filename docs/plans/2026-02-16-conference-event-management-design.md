# Conference & Event Management System Design

**Date:** 2026-02-16
**Status:** Approved
**Project:** Reindeer AI HubSpot CRM

## Problem

Reindeer AI attends 5-10 conferences/events per year with 20-50 meetings each. The current process is fragmented: attendee lists live in spreadsheets, reps post updates in Slack with no structure, meeting data isn't systematically captured in HubSpot, and post-event follow-ups are manual and inconsistent. Leadership lacks real-time visibility into event activity.

## Solution

A three-phase event lifecycle system using **Google Sheets as the live workspace** and **HubSpot as the CRM of record**, connected by n8n workflows. Slack serves as the input channel for reps during events, with AI parsing free-form messages into structured data.

## Architecture

```
Google Sheets (live workspace)  <-->  n8n  <-->  HubSpot (CRM of record)
         ^
       Slack (rep input via AI parsing)
```

- **Google Sheets:** Source of truth during event — attendee list, live meeting tracker, leadership dashboard
- **HubSpot:** Source of truth for CRM data — contacts, companies, meeting activities, follow-up tasks, sequences
- **n8n:** Orchestration layer — parses Slack, syncs Sheet to HubSpot, generates follow-ups
- **Slack:** Low-friction input for reps on the conference floor

## Three Phases

### Phase 1: Pre-Event (1-4 weeks before)

1. Create event Google Sheet from template (3 tabs)
2. Import full attendee list into "Attendee List" tab
3. Create `#event-[name]` Slack channel
4. Configure n8n workflows with event name parameter
5. SDRs browse attendee list, mark priority targets, begin outreach
6. Contacts who respond or book meetings get imported to HubSpot with `lead_source = "Event Name YYYY"`
7. If outreach via HubSpot sequences: bulk import with `event_outreach_status = "Contacted"`, update to "Replied" on response

**Import rule:** Only contacts who reply or book a meeting get imported to HubSpot. The full attendee list stays in Google Sheets as a reference. If outreach happens via HubSpot sequences, contacts are imported with an `event_outreach_status` property to distinguish them from real pipeline.

### Phase 2: During Event (live)

1. Reps post free-form updates in `#event-[name]` Slack channel
2. n8n + AI parses messages → extracts company, contact, status, notes, interest level
3. Parsed data written to "Meetings & Interactions" tab in Google Sheet
4. n8n confirms in Slack thread what was captured (rep can correct)
5. Sheet → HubSpot sync runs every 15-30 minutes
6. Leadership monitors Sheet Summary tab + HubSpot dashboard in real-time

### Phase 3: Post-Event (within 1 week)

1. Final Sheet → HubSpot sync
2. Run follow-up generator workflow
3. "Follow-Up Review" tab created in Sheet with proposed actions per company
4. Rep/AE reviews and approves follow-up actions before sequences fire
5. Approved: hot leads enrolled in sequences, tasks created for all tiers
6. Summary Slack message sent to team
7. Marketing pulls event ROI data from HubSpot

## Google Sheet Structure

### Tab 1: "Attendee List" (pre-event reference)

| Column | Purpose |
|--------|---------|
| Company | Company name |
| Contact Name | Full name |
| Title | Job title |
| Email | Contact email |
| LinkedIn | Profile URL |
| Priority | High / Medium / Low (SDR marks manually) |
| Outreach Status | Not Started / Contacted / Replied / Meeting Booked |
| Notes | SDR notes on why they want to meet |

### Tab 2: "Meetings & Interactions" (live tracker)

| Column | Purpose |
|--------|---------|
| Date/Time | When the meeting/interaction happened |
| Rep | Who from Reindeer AI |
| Company | Company name |
| Contact Name | Who they met |
| Contact Title | Title |
| Contact Email | For HubSpot matching |
| Type | Scheduled Meeting / Walk-up / Booth Visit |
| Status | Completed / No Show / Scheduled / Cancelled |
| Interest Level | Hot / Warm / Cool / Not Relevant |
| Meeting Source | Event App / Outreach / Inbound / Walk-up |
| Notes | What was discussed, interest level, next steps |
| Follow-up Action | Demo / Send Info / Intro to AE / Nurture / None |
| HubSpot Synced | Yes/No (auto-updated by n8n) |

### Tab 3: "Summary Dashboard" (for leadership)

Auto-generated aggregations:
- Total meetings by status (Completed / No Show / Scheduled / Cancelled)
- Companies met vs. targeted
- Rep activity breakdown
- Interest level distribution
- Follow-up action summary

## Company-Centric Tracking

Reindeer AI tracks companies primarily. Multiple contacts from the same company may be met during an event. The system handles this by:

- **Per-company rollup:** Aggregates meeting status and interest level across all contacts
- **Status priority:** Completed > Scheduled > No Show > Cancelled
- **Interest priority:** Hot > Warm > Cool > Not Relevant
- **Metrics tracked:** Meetings per company, unique contacts met per company, unique companies engaged

## n8n Workflows

### Workflow: Slack → Google Sheet (AI Parser)

**Trigger:** New message in `#event-[name]` Slack channel

1. Receive Slack message
2. AI (Claude) parses free-form text → extracts: company, contact name, title, status, notes, interest level, follow-up action
3. AI matches against existing rows in Sheet (updates if same company/contact)
4. Write new row or update existing row in "Meetings & Interactions" tab
5. Reply in Slack thread confirming what was captured

### Workflow: Google Sheet → HubSpot Sync

**Trigger:** Scheduled (every 15-30 min during event, daily otherwise) + manual trigger

1. Read "Meetings & Interactions" tab — filter `HubSpot Synced = No`
2. For each row:
   - Search HubSpot for contact by email (or create if new)
   - Set `lead_source = "Event Name YYYY"` (if not already set with higher-priority source)
   - Create an **Event Interaction** custom object record with all event fields
   - Associate the Event Interaction to the contact and company
3. Mark `HubSpot Synced = Yes` in Sheet
4. Update Summary Dashboard tab

### Workflow: Post-Event Follow-Up Generator

**Trigger:** Manual (run once after event wraps)

1. Read all "Meetings & Interactions" rows
2. Group by company → generate company-level summary
3. For each company:
   - **Hot:** Create follow-up task + flag for sequence enrollment (pending review)
   - **Warm:** Create follow-up task with 3-day deadline
   - **Cool:** Create task with 1-week deadline
   - **No-show:** Create re-engagement task
4. Generate "Follow-Up Review" tab in Sheet with proposed actions
5. Send Slack summary to team

**Follow-ups require review before sequences fire.** The "Follow-Up Review" tab lets reps/AEs approve or modify proposed actions before enrollment.

### Existing Workflow: Event Meeting Status Sync (Enhanced)

The existing workflow (`0hi0KKiF7ynVsUa0`) continues handling HubSpot meeting outcome tracking. It complements the Sheet → HubSpot sync by catching meetings logged directly in HubSpot (e.g., from calendar integrations).

## HubSpot Custom Object: Event Interaction

To support contacts and companies attending multiple events without data loss, all event data is stored in a **custom object** called `Event Interaction`, created via the HubSpot API (available on Pro plans).

### Why a Custom Object?

If event data were stored as contact properties, attending a second event would overwrite the first event's data. The custom object gives each event touchpoint its own record — full history preserved, fully reportable.

### Event Interaction Fields

| Field | Type | Values |
|-------|------|--------|
| `event_name` | Text | e.g., "Manifest 2026" |
| `event_date` | Date | When the interaction happened |
| `interaction_type` | Dropdown | Scheduled Meeting / Walk-up / Booth Visit |
| `meeting_status` | Dropdown | Completed / No Show / Scheduled / Cancelled |
| `interest_level` | Dropdown | Hot / Warm / Cool / Not Relevant |
| `meeting_source` | Dropdown | Event App / Outreach / Inbound / Walk-up |
| `follow_up_action` | Dropdown | Demo / Send Info / Intro to AE / Nurture / None |
| `notes` | Text | Meeting notes |
| `rep_name` | Text | Who from Reindeer AI |

### Associations

- Event Interaction → Contact (many-to-one)
- Event Interaction → Company (many-to-one)

### Example

Sarah Chen from LogiCorp attends 3 events:
- Event Interaction #1: Manifest 2026 — Hot, Completed, wants demo
- Event Interaction #2: ProMat 2026 — Warm, Booth Visit
- Event Interaction #3: SaaStr 2026 — Hot, Completed, signed pilot

All three records are visible on both Sarah's contact record and LogiCorp's company record.

### Contact & Company Properties (Minimal)

Only the `event_outreach_status` property remains on the contact level for pre-event outreach tracking via HubSpot sequences:

| Property | Type | Values |
|----------|------|--------|
| `event_outreach_status` | Dropdown | Not Started / Contacted / Replied / Meeting Booked |

### Existing Properties (Already in Use)

- `event_meeting_status` (contact + company) — from Event Meeting Status Sync workflow
- `event_name` (company) — already exists
- `lead_source` — set to event name for sourced contacts

## Reporting

All event reports use the **Event Interaction custom object**, enabling cross-event analysis without data loss.

### For Sales Reps
- "My Event Meetings" — Event Interactions filtered by rep_name, grouped by event
- Follow-up tasks assigned to them

### For Sales Leadership
- "Event Pipeline Dashboard" — Event Interactions grouped by company and interest level
- Cross-event view: "Which companies have we met at 2+ events?"
- Google Sheet Summary tab for real-time event monitoring

### For Marketing
- "Event ROI" — Event Interactions per event, pipeline generated, meetings held vs. targeted
- "Event Comparison" — side-by-side metrics across all events (contacts met, hot leads, conversions)
- Lead source filter across standard funnel reports

## Event Lifecycle Playbook

| When | What | Who |
|------|------|-----|
| 4 weeks before | Create Sheet, import attendees, create Slack channel, configure n8n | HubSpot manager |
| 2-1 weeks before | Browse targets, begin outreach, import responders to HubSpot | SDRs |
| During event | Post in Slack, AI parses to Sheet, auto-sync to HubSpot | Sales reps |
| During event | Monitor Sheet Summary + HubSpot dashboard | Leadership |
| 1 week after | Run follow-up generator, review proposed actions | Reps + AEs |
| 1 week after | Approve sequences, complete follow-up tasks | AEs |
| 2 weeks after | Pull event ROI metrics | Marketing |
