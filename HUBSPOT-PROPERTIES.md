# HubSpot Custom Properties Reference

## Quick Copy-Paste for HubSpot Setup

### Contact Properties

#### 1. SAL Meeting Held
```
Label: SAL Meeting Held
Internal Name: sal_meeting_held
Field Type: Dropdown select
Group: Deal Information (or create "SAL Qualification")

Options:
- Yes
- No
- Rescheduled
```

#### 2. SAL Identified Need
```
Label: SAL Identified Need
Internal Name: sal_identified_need
Field Type: Single checkbox
Group: SAL Qualification
Description: Whether a clear business need/pain was identified during the meeting
```

#### 3. SAL Decision Maker Identified
```
Label: SAL Decision Maker Identified
Internal Name: sal_identified_decision_maker
Field Type: Single checkbox
Group: SAL Qualification
Description: Whether a decision maker or champion was identified who can push evaluation and budget
```

#### 4. SAL Next Step Commitment
```
Label: SAL Next Step Commitment
Internal Name: sal_next_step_commitment
Field Type: Single checkbox
Group: SAL Qualification
Description: Whether there is real commitment to engage with a clear next step or follow-up meeting booked
```

#### 5. SAL Decision
```
Label: SAL Decision
Internal Name: sal_decision
Field Type: Dropdown select
Group: SAL Qualification

Options:
- Accept
- Reject
- Disqualify
```

#### 6. SAL Additional Attendees
```
Label: SAL Additional Attendees
Internal Name: sal_additional_attendees
Field Type: Multi-line text
Group: SAL Qualification
Description: Names and titles of additional meeting attendees beyond the primary contact
```

#### 7. SAL Qualification Notes
```
Label: SAL Qualification Notes
Internal Name: sal_qualification_notes
Field Type: Multi-line text
Group: SAL Qualification
Description: Additional comments and context from the SAL qualification process
```

#### 8. SAL Form Submitted Date
```
Label: SAL Form Submitted Date
Internal Name: sal_form_submitted_date
Field Type: Date picker
Group: SAL Qualification
Description: Date when the SAL qualification form was submitted
```

---

### Company Properties

#### 1. SAL Qualified
```
Label: SAL Qualified
Internal Name: sal_qualified
Field Type: Single checkbox
Group: Company Information
Description: Whether this company has been qualified as a Sales Accepted Lead
```

#### 2. SAL Last Qualification Date
```
Label: SAL Last Qualification Date
Internal Name: sal_last_qualification_date
Field Type: Date picker
Group: Company Information
Description: The most recent date this company was SAL qualified
```

---

## Property Groups

It's recommended to create a custom property group called **"SAL Qualification"** to keep all these properties organized.

### To Create a Property Group:
1. Settings → Properties → Contact Properties
2. Click "Create a group"
3. Name: "SAL Qualification"
4. Internal name: `sal_qualification`
5. Click "Create"

Then assign all SAL-related properties to this group.

---

## HubSpot Workflow Configuration

### Workflow Name
`SAL Form Trigger - Send to n8n`

### Trigger
**Enrollment Triggers:**
- Object type: Contact
- Filter: Meeting outcome is "Completed"
  - Or: Meeting type is any of "Meeting" AND Meeting end date is known

### Actions

#### 1. Send Webhook
```
Method: POST
URL: https://your-n8n-instance.com/webhook/sal-meeting-complete

Body (JSON):
{
  "contactId": "{{ contact.hs_object_id }}",
  "meetingId": "{{ engagement.id }}",
  "timestamp": "{{ portal.date_time }}"
}

Headers:
Content-Type: application/json
```

### Workflow Settings
- Re-enrollment: Allow
- Suppress for: None (or configure based on your needs)

---

## Testing Properties in HubSpot

### Manual Test
1. Create a test contact
2. Manually set property values using the property editor
3. Verify they appear in the contact record
4. Test filtering/reporting with these properties

### API Test (using curl)
```bash
# Get contact with SAL properties
curl -X GET \
  'https://api.hubapi.com/crm/v3/objects/contacts/{contactId}?properties=sal_meeting_held,sal_decision,sal_identified_need,sal_identified_decision_maker,sal_next_step_commitment' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'

# Update contact SAL properties
curl -X PATCH \
  'https://api.hubapi.com/crm/v3/objects/contacts/{contactId}' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "properties": {
      "sal_meeting_held": "Yes",
      "sal_identified_need": "true",
      "sal_identified_decision_maker": "true",
      "sal_next_step_commitment": "true",
      "sal_decision": "Accept"
    }
  }'
```

---

## HubSpot Reports & Dashboards

### Useful Reports

#### 1. SAL Conversion Rate
- Report type: Custom report
- Data source: Contacts
- Metrics: Count of contacts
- Filters:
  - SAL Decision is known
  - SAL Form Submitted Date in last 30 days
- Breakdown by: SAL Decision

#### 2. AE SAL Performance
- Report type: Custom report
- Data source: Contacts
- Metrics: Count of contacts
- Filters: SAL Decision is "Accept"
- Breakdown by: Contact Owner (AE)

#### 3. SAL Qualification Criteria
- Report type: Custom report
- Data source: Contacts
- Show: Count where each SAL criterion is true
- Filters: SAL Meeting Held is "Yes"

---

## Data Quality Checks

### Required Fields Validation
Create a workflow to alert if:
- SAL Decision is set but SAL Meeting Held is empty
- SAL Decision is "Reject" but SAL Qualification Notes is empty
- SAL Identified Need is true but no follow-up task exists

### Example Workflow:
```
Trigger: SAL Decision is known
Condition: SAL Meeting Held is unknown
Action: Create task for data cleanup
```

---

## Property Dependencies

These properties work together:

```
IF sal_meeting_held = "Yes"
  THEN require:
    - sal_identified_need
    - sal_identified_decision_maker
    - sal_next_step_commitment
    - sal_decision

IF sal_decision = "Reject"
  THEN require:
    - sal_qualification_notes (must not be empty)

IF sal_decision = "Accept"
  THEN set:
    - Company.sal_qualified = true
    - Company.sal_last_qualification_date = today
    - Deal.stage = "SAL Qualified"
```

---

## Import/Export

### Export Properties Template (CSV)
```csv
Property Name,Internal Name,Field Type,Options,Group
SAL Meeting Held,sal_meeting_held,dropdown,"Yes;No;Rescheduled",SAL Qualification
SAL Identified Need,sal_identified_need,checkbox,,SAL Qualification
SAL Decision Maker Identified,sal_identified_decision_maker,checkbox,,SAL Qualification
SAL Next Step Commitment,sal_next_step_commitment,checkbox,,SAL Qualification
SAL Decision,sal_decision,dropdown,"Accept;Reject;Disqualify",SAL Qualification
SAL Additional Attendees,sal_additional_attendees,multiline,,SAL Qualification
SAL Qualification Notes,sal_qualification_notes,multiline,,SAL Qualification
SAL Form Submitted Date,sal_form_submitted_date,date,,SAL Qualification
```

---

## Lifecycle Stage Integration

Consider adding a custom lifecycle stage:

### New Lifecycle Stage: "SAL Qualified"
1. Settings → Objects → Contacts → Lifecycle Stages
2. Add custom stage: "SAL Qualified"
3. Position after "Marketing Qualified Lead"
4. Position before "Sales Qualified Lead"

### Auto-Update Lifecycle
In your HubSpot workflows:
- When `sal_decision` = "Accept" → Set lifecycle stage to "SAL Qualified"
- When `sal_decision` = "Disqualify" → Set lifecycle stage to "Disqualified"

---

## Privacy & Compliance

These properties store business data. Ensure:
- ✅ No PII beyond what's already in HubSpot
- ✅ Properties respect GDPR/data retention policies
- ✅ Access controls configured appropriately
- ✅ Audit trail enabled for changes

---

## Maintenance

### Quarterly Review
- Check property usage
- Archive unused properties
- Update dropdown options based on feedback
- Review reporting accuracy

### Annual Cleanup
- Identify contacts with incomplete SAL data
- Archive old SAL decisions (>2 years)
- Update property descriptions if process changes
