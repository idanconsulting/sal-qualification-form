# SAL Qualification Form - Complete Setup Guide

## Overview
This system automates the SAL (Sales Accepted Lead) qualification process by:
1. Sending pre-populated forms to AEs after meetings
2. Processing form submissions
3. Updating HubSpot records
4. Sending Slack notifications to SDRs

---

## Table of Contents
1. [HubSpot Setup](#1-hubspot-setup)
2. [Slack Setup](#2-slack-setup)
3. [n8n Setup](#3-n8n-setup)
4. [Form Deployment](#4-form-deployment)
5. [Testing](#5-testing)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. HubSpot Setup

### Step 1.1: Create Custom Contact Properties

Navigate to: **Settings → Properties → Contact Properties → Create Property**

Create the following properties:

| Property Name | Internal Name | Field Type | Description |
|--------------|---------------|------------|-------------|
| SAL Meeting Held | `sal_meeting_held` | Dropdown | Options: Yes, No, Rescheduled |
| SAL Identified Need | `sal_identified_need` | Single checkbox | Whether need/pain was identified |
| SAL Decision Maker | `sal_identified_decision_maker` | Single checkbox | Whether decision maker identified |
| SAL Next Step | `sal_next_step_commitment` | Single checkbox | Whether next step committed |
| SAL Decision | `sal_decision` | Dropdown | Options: Accept, Reject, Disqualify |
| SAL Additional Attendees | `sal_additional_attendees` | Multi-line text | Names/titles of attendees |
| SAL Qualification Notes | `sal_qualification_notes` | Multi-line text | General comments from form |
| SAL Form Submitted Date | `sal_form_submitted_date` | Date picker | When form was submitted |

### Step 1.2: Create Custom Company Properties

Navigate to: **Settings → Properties → Company Properties → Create Property**

| Property Name | Internal Name | Field Type | Description |
|--------------|---------------|------------|-------------|
| SAL Qualified | `sal_qualified` | Single checkbox | Whether company is SAL qualified |
| SAL Last Qualification Date | `sal_last_qualification_date` | Date picker | Most recent qualification date |

### Step 1.3: Create HubSpot Workflow

Navigate to: **Automation → Workflows → Create Workflow**

**Workflow Settings:**
- Name: "SAL Form Trigger - Send to n8n"
- Type: Contact-based workflow
- Trigger: Meeting outcome = "Completed" (or your specific trigger)

**Actions:**
1. Add action: "Send webhook"
2. Webhook URL: `https://your-n8n-instance.com/webhook/sal-meeting-complete`
3. Method: POST
4. Body format: JSON

**Webhook Payload:**
```json
{
  "contactId": "{{ contact.hs_object_id }}",
  "meetingId": "{{ engagement.id }}",
  "timestamp": "{{ portal.date_time }}"
}
```

### Step 1.4: Configure Deal Pipeline (Optional)

If you want to auto-move deals to SAL stage:
1. Navigate to: **Settings → Objects → Deals → Pipelines**
2. Create or identify your SAL stage
3. Note the stage ID (you'll need this for n8n)

---

## 2. Slack Setup

### Option A: Incoming Webhooks (Recommended - Simpler)

**For Each Notification Channel (AE and SDR):**

1. Go to: https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name: "SAL Form Notifications"
4. Select your workspace
5. Navigate to "Incoming Webhooks"
6. Activate Incoming Webhooks: **ON**
7. Click "Add New Webhook to Workspace"
8. Select the channel or user to post to
9. Copy the Webhook URL (looks like: `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX`)

**You'll need webhooks for:**
- AE notifications (for sending the form)
- SDR notifications (for alerts about meeting status)

**Save these URLs - you'll need them for n8n configuration**

### Option B: Slack App with Bot Token (Advanced)

If you prefer more control:
1. Create Slack App as above
2. Add Bot Token Scopes: `chat:write`, `chat:write.public`
3. Install app to workspace
4. Copy Bot User OAuth Token
5. Use in n8n Slack nodes instead of webhooks

---

## 3. n8n Setup

### Step 3.1: Install n8n (if not already installed)

**Self-hosted with Docker:**
```bash
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

**Or with npm:**
```bash
npm install n8n -g
n8n start
```

Access n8n at: http://localhost:5678

### Step 3.2: Configure HubSpot Credentials

1. In n8n, go to: **Credentials → New → HubSpot API**
2. Choose authentication method: "Private App Token" (recommended)
3. In HubSpot:
   - Go to Settings → Integrations → Private Apps
   - Create a private app
   - Grant scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.companies.read`, `crm.objects.companies.write`, `crm.objects.deals.write`, `crm.schemas.deals.read`
   - Copy the access token
4. Paste token in n8n
5. Save credentials

### Step 3.3: Import Workflow 1 (Send Form)

1. In n8n, click "Workflows" → "Import"
2. Upload `n8n-workflow-1-send-form.json`
3. Open the imported workflow

**Update the following nodes:**

**Function - Prepare Form Data:**
- Line with `formUrl`: Change `https://your-form.vercel.app` to your actual Vercel URL

**HTTP - Send Slack Message:**
- Add your Slack webhook URL for AE notifications
- Or replace with Slack node if using Bot Token

4. **Activate the workflow**
5. Copy the webhook URL from the first node (you'll use this in HubSpot)

### Step 3.4: Import Workflow 2 (Process Submission)

1. In n8n, click "Workflows" → "Import"
2. Upload `n8n-workflow-2-process-submission.json`
3. Open the imported workflow

**Update the following nodes:**

**Notify SDR - Meeting Not Held:**
- Add your Slack webhook URL for SDR notifications

**Notify SDR - Rescheduled:**
- Add your Slack webhook URL for SDR notifications

**Notify SDR - Rejected:**
- Add your Slack webhook URL for SDR notifications

**Notify SDR - Disqualified:**
- Add your Slack webhook URL for SDR notifications

**Update Deal - Move to SAL Stage:**
- Update the `stage` value to your actual HubSpot deal stage ID

4. **Activate the workflow**
5. Copy the webhook URL from the first node

### Step 3.5: Update Form Configuration

Open `src/App.jsx` and update the `CONFIG` object:

```javascript
const CONFIG = {
  N8N_WEBHOOK_URL: 'https://your-n8n-instance.com/webhook/sal-form-submit',
  N8N_CHECK_SUBMISSION_URL: 'https://your-n8n-instance.com/webhook/check-sal-submission'
}
```

Replace with your actual n8n webhook URLs from Workflow 2.

---

## 4. Form Deployment

### Step 4.1: Install Dependencies

```bash
cd /Users/idanron/Desktop/Projects-\ cursor/sal\ form
npm install
```

### Step 4.2: Test Locally

```bash
npm run dev
```

Visit: http://localhost:3000?token=eyJ0ZXN0IjoidGVzdCJ9

(You'll need a real token from n8n in production)

### Step 4.3: Deploy to Vercel

**Option 1: Using Vercel CLI**

```bash
npm install -g vercel
vercel login
vercel
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? Select your account
- Link to existing project? **N**
- Project name? `sal-qualification-form`
- Directory? `./`
- Override settings? **N**

**Option 2: Using Vercel Dashboard**

1. Go to: https://vercel.com/new
2. Import Git Repository (if using Git)
3. Or drag and drop the project folder
4. Build settings:
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Click "Deploy"

**After Deployment:**
1. Copy your Vercel URL (e.g., `https://sal-qualification-form.vercel.app`)
2. Go back to n8n Workflow 1
3. Update the `formUrl` in the "Function - Prepare Form Data" node
4. Save the workflow

---

## 5. Testing

### Test 1: End-to-End Form Flow

1. **Trigger the HubSpot workflow manually:**
   - Create a test contact
   - Create a test meeting
   - Mark meeting as "Completed"

2. **Check n8n Workflow 1:**
   - Should receive webhook from HubSpot
   - Should pull contact/company data
   - Should send Slack message to AE

3. **Check Slack:**
   - AE should receive message with form button

4. **Fill out the form:**
   - Click the form link
   - Select "Meeting held: Yes"
   - Fill out qualification questions
   - Select a SAL decision
   - Submit

5. **Check n8n Workflow 2:**
   - Should receive form submission
   - Should update HubSpot contact
   - Should trigger appropriate notifications

6. **Check HubSpot:**
   - Contact should have updated SAL properties
   - Company should be marked as SAL qualified (if accepted)
   - Deal should move to SAL stage (if accepted)

### Test 2: Meeting Not Held

1. Fill out form with "Meeting held: No"
2. Form should auto-submit
3. SDR should receive Slack notification
4. HubSpot should show `sal_meeting_held = No`

### Test 3: One-Time Submission

1. Submit a form
2. Try to submit the same form again
3. Should see "Already Submitted" message

---

## 6. Troubleshooting

### Form doesn't load
- **Check token in URL:** Must be valid base64-encoded JSON
- **Check browser console:** Look for JavaScript errors
- **Verify Vercel deployment:** Check build logs

### Form submits but HubSpot not updated
- **Check n8n workflow 2:** Look for execution errors
- **Verify HubSpot credentials:** Make sure they have write permissions
- **Check property names:** Must match exactly (case-sensitive)

### Slack notifications not sent
- **Verify webhook URLs:** Test them with curl
- **Check n8n execution log:** Look for HTTP errors
- **Webhook format:** Ensure JSON is properly formatted

### AE identification not working
- **Check meeting attendees:** Verify they have @reindeer.ai email
- **Update domain matching:** Edit the function node if using different domain
- **Default AE:** Add a fallback AE name

### Meeting trigger not firing
- **HubSpot workflow:** Ensure it's turned ON
- **Webhook URL:** Must be accessible from internet (use ngrok for local testing)
- **Trigger criteria:** Verify meeting status matches your workflow trigger

---

## Environment Variables (Optional Enhancement)

For better security, you can use environment variables in the form:

**Create `.env` file:**
```
VITE_N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/sal-form-submit
```

**Update `src/App.jsx`:**
```javascript
const CONFIG = {
  N8N_WEBHOOK_URL: import.meta.env.VITE_N8N_WEBHOOK_URL,
}
```

**Add to Vercel:**
- Dashboard → Project → Settings → Environment Variables
- Add `VITE_N8N_WEBHOOK_URL`

---

## Maintenance

### Updating the Form
1. Make changes locally
2. Test with `npm run dev`
3. Deploy: `vercel --prod`

### Updating n8n Workflows
1. Edit in n8n UI
2. Test with "Execute Workflow" button
3. Save and re-activate

### Monitoring
- **n8n:** Check executions tab for errors
- **Vercel:** Monitor function logs
- **HubSpot:** Review workflow history

---

## Support

For issues:
1. Check n8n execution logs
2. Check Vercel deployment logs
3. Check browser console (for form issues)
4. Verify all webhook URLs are correct
5. Ensure HubSpot properties exist and names match exactly

---

## Architecture Diagram

```
┌─────────────┐
│  HubSpot    │
│  Meeting    │
│  Complete   │
└──────┬──────┘
       │ Webhook
       ▼
┌─────────────────┐
│ n8n Workflow 1  │
│ - Get Contact   │
│ - Get Company   │
│ - Get Meeting   │
│ - Build Form URL│
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Slack Message  │ ──→ AE clicks button
│  to AE          │
└─────────────────┘
       │
       ▼
┌─────────────────┐
│  Vercel Form    │
│  (React App)    │
└──────┬──────────┘
       │ Form Submit
       ▼
┌─────────────────┐
│ n8n Workflow 2  │
│ - Update Contact│
│ - Update Company│
│ - Update Deal   │
│ - Notify SDR    │
└─────────────────┘
       │
       ▼
┌─────────────────┐
│  HubSpot        │
│  Updated        │
└─────────────────┘
```
