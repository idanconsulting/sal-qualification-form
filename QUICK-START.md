# SAL Form - Quick Start Guide

**New to this project? Start here!**

---

## ⚡ 5-Minute Overview

This system sends pre-filled qualification forms to AEs after sales meetings and automatically updates HubSpot.

**What happens:**
1. Meeting ends in HubSpot
2. AE gets Slack message with form link
3. AE fills out one-screen form (2 min)
4. HubSpot updates automatically
5. SDR gets notified if needed

---

## 🎯 First Time Setup (Choose Your Path)

### Path 1: I Want to Deploy Everything Now
→ Follow: `DEPLOYMENT-CHECKLIST.md`
⏱️ Time: 2-3 hours

### Path 2: I Want to Understand the System First
→ Read: `PROJECT-SUMMARY.md`
⏱️ Time: 15 minutes

### Path 3: I Need Detailed Setup Instructions
→ Follow: `SETUP-GUIDE.md`
⏱️ Time: 3-4 hours (with testing)

### Path 4: I Just Need to Know What HubSpot Properties to Create
→ See: `HUBSPOT-PROPERTIES.md`
⏱️ Time: 30 minutes

---

## 🚀 Absolute Minimum to Get Started

### 1. Prerequisites
- [ ] HubSpot account with admin access
- [ ] Slack workspace
- [ ] n8n running (self-hosted)
- [ ] Vercel account
- [ ] Node.js 18+

### 2. Critical Steps (Can't skip these)

**Step 1: HubSpot** (30 min)
```
Settings → Properties → Create 10 custom properties
Settings → Workflows → Create webhook trigger
```
Details: `HUBSPOT-PROPERTIES.md`

**Step 2: Slack** (10 min)
```
Create 2 incoming webhooks:
- One for AE notifications
- One for SDR notifications
```
Details: `SETUP-GUIDE.md` Section 2

**Step 3: n8n** (45 min)
```
1. Import workflow-1-send-form.json
2. Import workflow-2-process-submission.json
3. Add HubSpot credentials
4. Update Slack webhook URLs
5. Activate both workflows
```
Details: `SETUP-GUIDE.md` Section 3

**Step 4: Deploy Form** (30 min)
```bash
npm install
# Update src/App.jsx CONFIG with n8n webhook URL
vercel
# Copy Vercel URL
# Update n8n workflow 1 with Vercel URL
```
Details: `SETUP-GUIDE.md` Section 4

**Step 5: Test** (30 min)
```
Follow tests in DEPLOYMENT-CHECKLIST.md Section 5
```

---

## 📁 What's What?

| File | Purpose | When to Use |
|------|---------|-------------|
| `README.md` | Project overview | First time seeing project |
| `PROJECT-SUMMARY.md` | Complete project details | Understanding architecture |
| `SETUP-GUIDE.md` | Step-by-step setup | During deployment |
| `DEPLOYMENT-CHECKLIST.md` | Deployment steps | During deployment |
| `HUBSPOT-PROPERTIES.md` | HubSpot configuration | Setting up HubSpot |
| `QUICK-START.md` | This file | Starting point |
| `src/App.jsx` | Form code | Customizing form |
| `n8n-workflow-*.json` | n8n workflows | Importing to n8n |

---

## 🔧 Local Development Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Generate test token
node test-data-generator.js

# 3. Start dev server
npm run dev

# 4. Open test URL
# Copy URL from test-data-generator output
# Paste in browser
```

---

## 🆘 Help! Something's Wrong

### Form won't load
→ Check: Vercel deployment status
→ See: `SETUP-GUIDE.md` Section 6

### HubSpot not updating
→ Check: n8n workflow 2 execution logs
→ See: `SETUP-GUIDE.md` Section 6

### Slack not sending
→ Check: Webhook URLs in n8n
→ See: `SETUP-GUIDE.md` Section 6

### General troubleshooting
→ See: `SETUP-GUIDE.md` Section 6 (Troubleshooting)

---

## 📋 Required Information Checklist

Before you start, gather these:

**HubSpot:**
- [ ] Admin login credentials
- [ ] Private app access token

**Slack:**
- [ ] Admin access
- [ ] Channel/user for AE notifications
- [ ] Channel/user for SDR notifications

**n8n:**
- [ ] n8n instance URL
- [ ] Admin login

**Vercel:**
- [ ] Account login
- [ ] CLI installed (`npm install -g vercel`)

---

## 🎓 Key Concepts

### What is n8n?
Automation tool that connects HubSpot, Slack, and your form.
Think: Zapier but self-hosted.

### What is Vercel?
Hosting platform for the React form.
Think: Free, fast, easy deployment.

### What's a webhook?
URL that receives data from other systems.
HubSpot → sends data → n8n webhook → processes → sends to Slack

### What's the token?
Secure way to pass data from n8n to the form.
Contains pre-filled contact/company information.

---

## 💡 Pro Tips

1. **Start with HubSpot** - Create properties first, everything else depends on them
2. **Test locally first** - Use test-data-generator.js to test form before deploying
3. **One step at a time** - Don't skip ahead, follow checklist sequentially
4. **Save webhook URLs** - You'll need them multiple times, keep them handy
5. **Test each workflow** - Use n8n "Execute Workflow" before going live

---

## 📞 Common Questions

**Q: Do I need to code anything?**
A: No, just configuration. Unless you want to customize the form.

**Q: How long does setup take?**
A: 2-3 hours for first-time setup with testing.

**Q: Can I use this with multiple HubSpot accounts?**
A: Not currently, but you could deploy multiple instances.

**Q: What if I don't have n8n?**
A: You'll need to install it. It's free and self-hosted. See n8n.io.

**Q: Can I use Zapier instead of n8n?**
A: Theoretically yes, but you'd need to rebuild the workflows.

**Q: Is this secure?**
A: Yes. All communication over HTTPS, tokens encode data, one-time submission prevention.

**Q: What if an AE doesn't fill out the form?**
A: You can set up a reminder workflow in HubSpot or n8n (not included).

---

## 🏁 Next Steps

1. **Read** `PROJECT-SUMMARY.md` (15 min)
2. **Gather** required credentials and access
3. **Follow** `DEPLOYMENT-CHECKLIST.md`
4. **Test** everything thoroughly
5. **Train** your team
6. **Launch** 🎉

---

## 📚 Learning Path

**Beginner** (Never seen the project)
1. This file (`QUICK-START.md`)
2. `README.md`
3. `PROJECT-SUMMARY.md`
4. `DEPLOYMENT-CHECKLIST.md`

**Intermediate** (Ready to deploy)
1. `DEPLOYMENT-CHECKLIST.md`
2. `SETUP-GUIDE.md` (reference as needed)
3. `HUBSPOT-PROPERTIES.md` (for HubSpot setup)

**Advanced** (Customizing/maintaining)
1. `src/App.jsx` (form code)
2. `n8n-workflow-*.json` (workflow logic)
3. `SETUP-GUIDE.md` Section 6 (troubleshooting)

---

## ✅ Your First Session Checklist

**Before you leave today:**
- [ ] Read this file completely
- [ ] Read `PROJECT-SUMMARY.md`
- [ ] Confirm you have all prerequisites
- [ ] Schedule 3-hour block for deployment
- [ ] Gather all credentials
- [ ] Identify team members to help with testing

**In your deployment session:**
- [ ] Follow `DEPLOYMENT-CHECKLIST.md` line by line
- [ ] Don't skip any checkboxes
- [ ] Test each component before moving on
- [ ] Document any issues you encounter
- [ ] Complete at least one end-to-end test

---

**Ready to start?** → Open `DEPLOYMENT-CHECKLIST.md`

**Need more context?** → Read `PROJECT-SUMMARY.md`

**Stuck?** → Check `SETUP-GUIDE.md` Section 6
