# Reindeer AI HubSpot Documentation Design

## Overview

Create a comprehensive HubSpot CRM Operations Guide for Reindeer AI covering all implemented processes, automations, and workflows.

## Target Audiences

- SDRs
- AEs (Founders currently)
- Marketing Leaders

## Document Format

- Single Google Doc with audience-specific sections
- Both reference guide (the "why") and training manual (the "how")
- Screenshots as placeholders: `[Screenshot: description]`
- FAQ section organized by role

---

## Document Structure

### 1. Introduction & How to Use This Guide
- Document purpose
- How each role should use the guide
- Key principle: Company-centric CRM

### 2. Core Concepts

#### 2.1 Lead Source Hierarchy
- Three-tier system: Motion → Lead Source Category → Lead Source
- Rules for what's required
- Examples by Motion type
- Naming conventions for imports:
  - Events: prefix `EVE`
  - Outbound: prefix `OTB`

#### 2.2 Lead Status
- All status options with meanings and who sets them
- Non-linear movement explanation (especially around meetings)
- Recycle vs Unqualified distinction
- Recycle requirements: Date + Reason (with all reason options)

#### 2.3 Lifecycle Stages
- All stages with meanings
- MQL as the gateway (ICP criteria from Apollo)
- Key transitions:
  - Lead → MQL: Automatic (ICP match)
  - MQL → SQL: Automatic (meeting scheduled with MQL)
  - SQL → SAL: AE accepts via SAL form
  - SAL → Opportunity: AE identifies workflow
- Deal-Workflow relationship

### 3. For SDRs: Daily Operations
- Key views to use
- Daily workflow steps
- Meeting status flow (back-and-forth between scheduled/occurred)
- Managing the recycle queue
- When to recycle vs disqualify

### 4. For AEs: Managing SALs & Opportunities
- Key views to use
- SAL form process
- From SAL to Opportunity (two methods)
- Managing Deals & Workflows
- POV progression

### 5. For Marketing Leaders: Tracking & Reporting
- Understanding lead source data (three levels)
- Uploading event & outbound lists (required columns, naming conventions)
- Funnel reporting (with note on historical data accuracy)
- Key metrics to track
- Notifications received

### 6. Automations Reference
- Lead Source Automations
- Lead Status Automations
- Lifecycle Stage Automations
- Assignment Automations
- Meeting & SAL Automations
- Deal & Workflow Automations
- Utility Automations

### 7. FAQ by Role
- SDR questions (6 questions)
- AE questions (6 questions)
- Marketing Leader questions (5 questions)

### 8. Appendix
- Field definitions (Contacts)
- Field definitions (Companies)
- Recycle Reason options
- Lead Status options
- Lifecycle Stage options
- Import naming conventions
- Key HubSpot views

---

## Key Information Captured

### Lead Source Hierarchy
| Level | Field | Required |
|-------|-------|----------|
| Motion | Broadest (Outbound, Inbound, Events, Introductions) | Yes |
| Lead Source Category | Sub-category (Organic, PPC, etc.) | No |
| Lead Source | Specific campaign/event/list | Yes |

### Lead Status Values
- New, Attempting, Connected, Meeting Scheduled, No Show, Meeting Occurred, Qualified, Unqualified, Recycle

### Lifecycle Stages
- Lead → MQL (ICP match) → SQL (meeting with MQL) → SAL (AE accepts) → Opportunity (workflow identified) → Customer

### Recycle Reasons
- Not a priority right now
- Timing / revisit later
- No champion / unclear owner
- Build vs. buy undecided
- Can't reach / unresponsive

### Import Naming Conventions
- Events: `EVE - [Event Name]`
- Outbound: `OTB - [List Name]`

### Ownership Model
- Company Owner = source of truth
- SDR Owner = assigned SDR
- AE Owner = assigned AE
- Contacts should match Company Owner

---

## Implementation

Output: Google Doc with placeholder screenshots
