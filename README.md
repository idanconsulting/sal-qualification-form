# SAL Qualification Form

> Automated lead qualification system for AEs after sales meetings

## What This Does

This system automates the SAL (Sales Accepted Lead) qualification process:

1. ✅ **Automatically sends** pre-populated forms to AEs after meetings
2. 📝 **Captures qualification data** with minimal admin work
3. 🔄 **Updates HubSpot** with qualification status
4. 📢 **Notifies SDRs** via Slack when needed

## Key Features

- **One-screen form** - No scrolling, mostly radio buttons
- **Auto-populated** - Contact, company, and meeting data pre-filled
- **Smart logic** - Auto-submits when meeting didn't occur
- **One-time submission** - Prevents duplicate submissions
- **Real-time updates** - Immediate sync with HubSpot
- **Slack notifications** - Keeps SDRs in the loop

## Tech Stack

- **Frontend**: React + Tailwind CSS (hosted on Vercel)
- **Automation**: n8n (self-hosted)
- **CRM**: HubSpot
- **Notifications**: Slack

## Quick Start

### Prerequisites

- n8n instance (self-hosted)
- HubSpot account with API access
- Slack workspace
- Vercel account (free tier works)
- Node.js 18+

### Installation

1. **Clone and install dependencies:**
   ```bash
   cd sal-form
   npm install
   ```

2. **Set up HubSpot, Slack, and n8n:**
   - Follow the [SETUP-GUIDE.md](./SETUP-GUIDE.md) for detailed instructions

3. **Configure the form:**
   - Update `src/App.jsx` with your n8n webhook URLs

4. **Deploy to Vercel:**
   ```bash
   npm install -g vercel
   vercel
   ```

5. **Update n8n workflows:**
   - Import the two workflow JSON files
   - Update with your Vercel URL and Slack webhooks

## Project Structure

```
sal-form/
├── src/
│   ├── App.jsx                           # Main form component
│   ├── main.jsx                          # React entry point
│   └── index.css                         # Tailwind styles
├── n8n-workflow-1-send-form.json         # n8n: Send form to AE
├── n8n-workflow-2-process-submission.json # n8n: Process form & update HubSpot
├── SETUP-GUIDE.md                        # Detailed setup instructions
├── package.json
├── vite.config.js
└── vercel.json
```

## How It Works

### 1. Meeting Completes in HubSpot
- HubSpot workflow triggers when meeting status = "Completed"
- Sends webhook to n8n with contact ID

### 2. n8n Sends Form
- Pulls contact, company, and meeting data from HubSpot
- Identifies AE from meeting attendees (looks for @reindeer.ai email)
- Generates pre-populated form link
- Sends Slack message to AE with form button

### 3. AE Fills Form
- Opens one-screen form with auto-filled data
- Answers qualification questions (radio buttons)
- Makes SAL decision (Accept/Reject/Disqualify)
- Submits

### 4. System Updates HubSpot
- Form submits to n8n webhook
- Updates contact properties
- Updates company properties (if accepted)
- Moves deal to SAL stage (if accepted)
- Sends Slack notifications to SDR (if needed)

## Form Fields

### Auto-Filled
- AE Name (from meeting attendees)
- SDR Name (from contact owner)
- Meeting Date
- Company Name
- Contact Name
- Source

### AE Fills Out
- **Meeting Held?** (Yes/No/Rescheduled)
  - If No or Rescheduled → Auto-submits and alerts SDR
- **Additional Attendees** (free text)
- **Identified Need/Pain?** (Yes/No + optional comment)
- **Identified Decision Maker?** (Yes/No + optional comment)
- **Next Step Commitment?** (Yes/No + optional comment)
- **SAL Decision** (Accept/Reject/Disqualify)
  - If all 3 criteria = Yes → Suggests "Accept"
  - Otherwise → Suggests "Disqualify"
  - Reject requires mandatory details
- **Comments** (optional)

## Form Logic

### Auto-Submit Scenarios
- **Meeting held = No** → Submits immediately, notifies SDR
- **Meeting held = Rescheduled** → Submits immediately, alerts SDR

### SAL Decision Outcomes
- **Accept** → Moves to SAL stage, qualifies company, updates deal
- **Reject** → Returns to SDR, stays in SDR pipeline, requires reason
- **Disqualify** → Sets lifecycle stage to "disqualified", notifies SDR

### One-Time Submission Protection
- Tracks submissions in browser localStorage
- Backend checks HubSpot for existing submission
- Shows "Already Submitted" if duplicate attempt

## Development

### Local Development
```bash
npm run dev
# Visit http://localhost:3000
```

### Testing with Real Data
You'll need a valid token from n8n. Generate one by:
1. Running n8n workflow 1 with test data
2. Copying the generated form URL
3. Using that URL in your browser

### Building for Production
```bash
npm run build
npm run preview  # Preview production build
```

## Deployment

### Deploy to Vercel
```bash
vercel --prod
```

### Update n8n
1. Go to n8n workflow 1
2. Update `formUrl` in "Function - Prepare Form Data" node
3. Use your new Vercel URL
4. Save and activate

## Monitoring & Maintenance

### Check n8n Executions
- Dashboard → Executions
- Filter by workflow
- Check for errors

### Check Vercel Logs
- Dashboard → Project → Deployments
- Click on deployment → Functions
- View runtime logs

### Check HubSpot
- Workflows → Your workflow → History
- Review webhook delivery status

## Troubleshooting

See [SETUP-GUIDE.md](./SETUP-GUIDE.md#6-troubleshooting) for common issues and solutions.

## Future Enhancements

Potential improvements:
- [ ] Email notifications as fallback to Slack
- [ ] Form analytics dashboard
- [ ] Auto-create contacts from additional attendees
- [ ] Mobile app version
- [ ] Form expiration (e.g., 48 hours)
- [ ] Multi-language support
- [ ] Custom branding per team

## Support

For setup help or issues:
1. Check the [SETUP-GUIDE.md](./SETUP-GUIDE.md)
2. Review n8n execution logs
3. Check browser console for form errors

## License

MIT
