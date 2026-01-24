# SAL Form - Deployment Checklist

Use this checklist to ensure everything is set up correctly.

---

## Phase 1: HubSpot Setup

### Custom Properties Created
- [ ] Contact: `sal_meeting_held` (dropdown: Yes/No/Rescheduled)
- [ ] Contact: `sal_identified_need` (checkbox)
- [ ] Contact: `sal_identified_decision_maker` (checkbox)
- [ ] Contact: `sal_next_step_commitment` (checkbox)
- [ ] Contact: `sal_decision` (dropdown: Accept/Reject/Disqualify)
- [ ] Contact: `sal_additional_attendees` (multi-line text)
- [ ] Contact: `sal_qualification_notes` (multi-line text)
- [ ] Contact: `sal_form_submitted_date` (date)
- [ ] Company: `sal_qualified` (checkbox)
- [ ] Company: `sal_last_qualification_date` (date)

### HubSpot Workflow
- [ ] Workflow created: "SAL Form Trigger"
- [ ] Trigger: Meeting outcome = Completed
- [ ] Webhook action configured
- [ ] Webhook URL points to n8n instance
- [ ] Workflow is ACTIVE
- [ ] Test webhook delivery successful

### HubSpot API Access
- [ ] Private App created in HubSpot
- [ ] Required scopes granted:
  - [ ] `crm.objects.contacts.read`
  - [ ] `crm.objects.contacts.write`
  - [ ] `crm.objects.companies.read`
  - [ ] `crm.objects.companies.write`
  - [ ] `crm.objects.deals.write`
  - [ ] `crm.schemas.deals.read`
- [ ] Access token copied and saved securely

---

## Phase 2: Slack Setup

### Incoming Webhooks
- [ ] Slack App created: "SAL Form Notifications"
- [ ] Incoming Webhooks enabled
- [ ] Webhook created for AE notifications
- [ ] Webhook created for SDR notifications
- [ ] Webhook URLs saved securely
- [ ] Test messages sent successfully

**Webhook URLs Saved:**
```
AE Webhook:  _________________________
SDR Webhook: _________________________
```

---

## Phase 3: n8n Setup

### n8n Installation
- [ ] n8n installed and running
- [ ] n8n accessible at: ___________________
- [ ] n8n secured (password/auth configured)
- [ ] External access enabled (if needed)

### HubSpot Credentials in n8n
- [ ] HubSpot credentials added to n8n
- [ ] Credential name: "HubSpot API"
- [ ] Connection tested successfully

### Workflow 1: Send Form to AE
- [ ] Workflow imported from `n8n-workflow-1-send-form.json`
- [ ] HubSpot credentials linked to all HubSpot nodes
- [ ] Updated: Vercel form URL in Function node
- [ ] Updated: Slack webhook URL in HTTP node
- [ ] Workflow tested with sample data
- [ ] Workflow ACTIVATED
- [ ] Webhook URL copied: ___________________

### Workflow 2: Process Form Submission
- [ ] Workflow imported from `n8n-workflow-2-process-submission.json`
- [ ] HubSpot credentials linked to all HubSpot nodes
- [ ] Updated: SDR Slack webhooks in all notification nodes
- [ ] Updated: Deal stage ID in "Update Deal" node
- [ ] Workflow tested with sample data
- [ ] Workflow ACTIVATED
- [ ] Webhook URL copied: ___________________

---

## Phase 4: Form Application

### Local Development
- [ ] Cloned repository
- [ ] Installed dependencies: `npm install`
- [ ] Updated `src/App.jsx` CONFIG:
  - [ ] `N8N_WEBHOOK_URL` set to workflow 2 webhook
- [ ] Local dev server runs: `npm run dev`
- [ ] Form loads at localhost:3000
- [ ] Form handles test token correctly

### Vercel Deployment
- [ ] Vercel account created/logged in
- [ ] Project deployed to Vercel
- [ ] Build successful (no errors)
- [ ] Deployment URL: ___________________
- [ ] Form accessible at deployment URL
- [ ] Test form submission works

### Post-Deployment Updates
- [ ] Copied Vercel URL
- [ ] Updated n8n Workflow 1:
  - [ ] Changed `formUrl` in Function node to Vercel URL
  - [ ] Saved workflow
- [ ] Re-tested workflow 1 end-to-end

---

## Phase 5: Integration Testing

### Test 1: Complete Happy Path
- [ ] Created test contact in HubSpot
- [ ] Created test meeting for contact
- [ ] Marked meeting as "Completed"
- [ ] HubSpot workflow triggered
- [ ] n8n Workflow 1 executed successfully
- [ ] AE received Slack message with form link
- [ ] Clicked form link in Slack
- [ ] Form loaded with pre-populated data
- [ ] Filled out form (Meeting held: Yes)
- [ ] Selected "Accept as SAL"
- [ ] Submitted form successfully
- [ ] n8n Workflow 2 executed successfully
- [ ] HubSpot contact updated with SAL properties
- [ ] HubSpot company marked as SAL qualified
- [ ] Deal moved to correct stage
- [ ] No errors in any system

### Test 2: Meeting Not Held
- [ ] Created second test meeting
- [ ] Triggered form
- [ ] Selected "Meeting held: No"
- [ ] Form auto-submitted
- [ ] SDR received Slack notification
- [ ] HubSpot contact shows `sal_meeting_held = No`

### Test 3: Meeting Rescheduled
- [ ] Created third test meeting
- [ ] Triggered form
- [ ] Selected "Meeting held: Rescheduled"
- [ ] Form auto-submitted
- [ ] SDR received Slack notification
- [ ] HubSpot contact shows `sal_meeting_held = Rescheduled`

### Test 4: Reject Decision
- [ ] Created fourth test meeting
- [ ] Filled form with "Meeting held: Yes"
- [ ] Selected "Reject"
- [ ] Entered rejection reason
- [ ] Submitted form
- [ ] SDR received rejection notification with reason
- [ ] Contact remained with SDR owner
- [ ] No deal stage change

### Test 5: Disqualify Decision
- [ ] Created fifth test meeting
- [ ] Filled form with "Meeting held: Yes"
- [ ] Answered qualification questions (some "No")
- [ ] Selected "Disqualify"
- [ ] Submitted form
- [ ] SDR received disqualification notification
- [ ] Contact lifecycle stage set to "Disqualified"

### Test 6: Duplicate Submission Prevention
- [ ] Submitted a form
- [ ] Tried to access same form URL again
- [ ] Saw "Already Submitted" message
- [ ] Could not submit twice

### Test 7: AE Identification
- [ ] Created test meeting
- [ ] Added attendee with @reindeer.ai email
- [ ] Verified AE name appears correctly in form data
- [ ] Verified Slack message sent to correct AE

---

## Phase 6: Monitoring Setup

### n8n Monitoring
- [ ] Checked Executions tab
- [ ] Verified successful executions appear
- [ ] Tested error notification (if configured)
- [ ] Know how to access logs

### Vercel Monitoring
- [ ] Checked Deployments page
- [ ] Verified production deployment
- [ ] Reviewed function logs
- [ ] Know how to rollback if needed

### HubSpot Monitoring
- [ ] Checked workflow execution history
- [ ] Verified webhook deliveries
- [ ] Reviewed property data on test contacts
- [ ] Know how to troubleshoot failed triggers

---

## Phase 7: Documentation & Training

### Documentation Complete
- [ ] README.md reviewed
- [ ] SETUP-GUIDE.md accessible to team
- [ ] HUBSPOT-PROPERTIES.md shared with admins
- [ ] All webhook URLs documented securely

### Team Training
- [ ] AEs trained on form usage
- [ ] AEs understand one-time submission rule
- [ ] AEs know what to do if form doesn't load
- [ ] SDRs trained on Slack notifications
- [ ] SDRs understand workflow triggers
- [ ] Admin team knows how to monitor/troubleshoot

---

## Phase 8: Go-Live

### Pre-Launch Checks
- [ ] All tests passed
- [ ] No pending errors in any system
- [ ] Backup/rollback plan in place
- [ ] Support channel established (Slack/email)
- [ ] Monitoring dashboards set up

### Launch
- [ ] Disabled test contacts (if needed)
- [ ] Enabled for all users
- [ ] Announced to team
- [ ] Monitored first few submissions closely

### Post-Launch (First Week)
- [ ] Daily check of n8n executions
- [ ] Daily check of HubSpot data quality
- [ ] Gathered feedback from AEs
- [ ] Gathered feedback from SDRs
- [ ] Documented any issues
- [ ] Made any necessary adjustments

---

## Troubleshooting Reference

### Form Won't Load
1. Check Vercel deployment status
2. Check browser console for errors
3. Verify token format in URL
4. Test with fresh token from n8n

### HubSpot Not Updating
1. Check n8n workflow 2 executions
2. Verify HubSpot credentials
3. Check property names (case-sensitive)
4. Review n8n error logs

### Slack Notifications Not Sent
1. Test webhook URL with curl
2. Check n8n HTTP request node
3. Verify webhook format
4. Check Slack workspace settings

### AE Not Identified
1. Check meeting attendee list
2. Verify email domain matching
3. Review Function node logic
4. Add fallback AE if needed

---

## Support Contacts

**HubSpot Admin:** _________________________
**n8n Admin:** _________________________
**Vercel Admin:** _________________________
**Slack Admin:** _________________________

**Emergency Contact:** _________________________

---

## Sign-Off

- [ ] All checklist items completed
- [ ] System ready for production use
- [ ] Team trained and ready

**Deployed by:** _________________________
**Date:** _________________________
**Version:** 1.0.0
