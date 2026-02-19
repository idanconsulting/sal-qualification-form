# Watchdog Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the verbose Slack digest with a compact summary linking to a React dashboard where violations can be viewed and acted on.

**Architecture:** New `/watchdog` route in existing React app reads from Supabase `watchdog_results` (grouped by `run_id`). Three actions: View in HubSpot, Add Exception, Mark as Fixed. n8n coordinators updated to generate `run_id` and send compact Slack messages.

**Tech Stack:** React 18, Tailwind CSS, Supabase JS client (`@supabase/supabase-js`), React Router (`react-router-dom`), Vite, Vercel deployment.

---

### Task 1: Add columns to Supabase `watchdog_results`

**Files:**
- No local files — Supabase CLI migration

**Step 1: Run the SQL migration via Supabase CLI**

```bash
SUPABASE_ACCESS_TOKEN=sbp_68c74812c8b8a1fca6ce0d2bfa7facf3a3712d1d npx supabase db execute \
  --project-ref oirehnrecwzcvxusdbku \
  "ALTER TABLE watchdog_results ADD COLUMN IF NOT EXISTS run_id uuid; ALTER TABLE watchdog_results ADD COLUMN IF NOT EXISTS run_type text; ALTER TABLE watchdog_results ADD COLUMN IF NOT EXISTS resolutions jsonb DEFAULT '{}'::jsonb;"
```

**Step 2: Verify the columns exist**

```bash
SUPABASE_ACCESS_TOKEN=sbp_68c74812c8b8a1fca6ce0d2bfa7facf3a3712d1d npx supabase db execute \
  --project-ref oirehnrecwzcvxusdbku \
  "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'watchdog_results' ORDER BY ordinal_position;"
```

Expected: Should show `run_id` (uuid), `run_type` (text), `resolutions` (jsonb) among the columns.

**Step 3: Commit**

No file changes to commit for this task.

---

### Task 2: Install dependencies (react-router-dom, @supabase/supabase-js)

**Files:**
- Modify: `package.json`

**Step 1: Install packages**

```bash
cd "/Users/idanron/Desktop/Projects- cursor/Reindeer" && npm install react-router-dom @supabase/supabase-js
```

**Step 2: Verify install**

```bash
cd "/Users/idanron/Desktop/Projects- cursor/Reindeer" && cat package.json | grep -E "react-router-dom|supabase"
```

Expected: Both packages appear in `dependencies`.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-router-dom and supabase-js dependencies"
```

---

### Task 3: Set up React Router and Supabase client

**Files:**
- Create: `src/lib/supabase.js`
- Modify: `src/main.jsx`
- Modify: `src/App.jsx` (minimal — just export, no logic changes)

**Step 1: Create Supabase client**

Create `src/lib/supabase.js`:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://oirehnrecwzcvxusdbku.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pcmVobnJlY3d6Y3Z4dXNkYmt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0OTYzMTQsImV4cCI6MjA4NzA3MjMxNH0.HmPOiCkOIp2sDpN5kJxsFnOOJUXMGJnMwwKkLeaHHKI'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

Note: The anon key is safe to expose in frontend code — it's public. RLS policies on Supabase control access. Since Watchdog tables currently have RLS disabled (service_role is used from n8n), we need to either:
- Keep RLS disabled (fine for internal tool, no sensitive data exposed)
- Or add permissive RLS policies

For this internal dashboard, keeping RLS disabled is fine. If the anon key doesn't work, use the service_role key temporarily (it's already in the n8n workflows, but ideally switch to anon + RLS later).

**Step 2: Update `src/main.jsx` to add routing**

Replace the contents of `src/main.jsx` with:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import WatchdogRunList from './watchdog/WatchdogRunList'
import WatchdogRunDetail from './watchdog/WatchdogRunDetail'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/watchdog" element={<WatchdogRunList />} />
        <Route path="/watchdog/run/:runId" element={<WatchdogRunDetail />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
```

**Step 3: Create placeholder components so the app compiles**

Create `src/watchdog/WatchdogRunList.jsx`:

```jsx
export default function WatchdogRunList() {
  return <div className="p-8">Run List — loading...</div>
}
```

Create `src/watchdog/WatchdogRunDetail.jsx`:

```jsx
export default function WatchdogRunDetail() {
  return <div className="p-8">Run Detail — loading...</div>
}
```

**Step 4: Verify the app compiles and routes work**

```bash
cd "/Users/idanron/Desktop/Projects- cursor/Reindeer" && npm run build
```

Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
git add src/lib/supabase.js src/main.jsx src/watchdog/WatchdogRunList.jsx src/watchdog/WatchdogRunDetail.jsx
git commit -m "feat: set up React Router and Supabase client for Watchdog dashboard"
```

---

### Task 4: Build the Run List page (`/watchdog`)

**Files:**
- Modify: `src/watchdog/WatchdogRunList.jsx`

**Step 1: Implement the Run List page**

Replace `src/watchdog/WatchdogRunList.jsx` with the full implementation:

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2 }

function groupByRunId(results) {
  const runs = {}
  for (const r of results) {
    const key = r.run_id
    if (!key) continue
    if (!runs[key]) {
      runs[key] = {
        run_id: key,
        run_type: r.run_type || 'daily',
        run_at: r.run_at,
        results: []
      }
    }
    runs[key].results.push(r)
    // Use earliest run_at as the run timestamp
    if (r.run_at < runs[key].run_at) runs[key].run_at = r.run_at
  }
  return Object.values(runs).sort((a, b) => new Date(b.run_at) - new Date(a.run_at))
}

function getRunStats(run) {
  let critical = 0, high = 0, medium = 0, passed = 0, totalViolations = 0, resolved = 0

  for (const r of run.results) {
    if (r.status === 'pass') { passed++; continue }
    if (r.status !== 'fail') continue

    const sev = r.severity || 'medium'
    if (sev === 'critical') critical += r.violation_count || 0
    else if (sev === 'high') high += r.violation_count || 0
    else medium += r.violation_count || 0

    totalViolations += r.violation_count || 0
    resolved += Object.keys(r.resolutions || {}).length
  }

  return { critical, high, medium, passed, totalViolations, resolved }
}

export default function WatchdogRunList() {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    async function fetchRuns() {
      const { data, error } = await supabase
        .from('watchdog_results')
        .select('*')
        .not('run_id', 'is', null)
        .order('run_at', { ascending: false })
        .limit(200)

      if (error) {
        console.error('Error fetching runs:', error)
        setLoading(false)
        return
      }

      setRuns(groupByRunId(data || []))
      setLoading(false)
    }
    fetchRuns()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Watchdog Reports</h1>

        {runs.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No runs found. Runs will appear here after the coordinator executes with run_id support.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Summary</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resolved</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {runs.map(run => {
                  const stats = getRunStats(run)
                  return (
                    <tr key={run.run_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/watchdog/run/${run.run_id}`)}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(run.run_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          run.run_type === 'hourly' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {run.run_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          {stats.critical > 0 && <span className="text-red-600 font-medium">{stats.critical} Critical</span>}
                          {stats.high > 0 && <span className="text-orange-600 font-medium">{stats.high} High</span>}
                          {stats.medium > 0 && <span className="text-yellow-600 font-medium">{stats.medium} Medium</span>}
                          {stats.totalViolations === 0 && <span className="text-green-600 font-medium">All passed</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {stats.totalViolations > 0 ? `${stats.resolved}/${stats.totalViolations}` : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <span className="text-blue-600 hover:text-blue-800 font-medium">View →</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Verify build**

```bash
cd "/Users/idanron/Desktop/Projects- cursor/Reindeer" && npm run build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/watchdog/WatchdogRunList.jsx
git commit -m "feat: implement Watchdog run list page"
```

---

### Task 5: Build the Run Detail page (`/watchdog/run/:id`)

**Files:**
- Modify: `src/watchdog/WatchdogRunDetail.jsx`

**Step 1: Implement the Run Detail page**

Replace `src/watchdog/WatchdogRunDetail.jsx` with:

```jsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' },
  high: { label: 'High', bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200' },
  medium: { label: 'Medium', bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200' }
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2 }

function formatCheckName(checkId) {
  return checkId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

export default function WatchdogRunDetail() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [actionLoading, setActionLoading] = useState(null)

  async function fetchResults() {
    const { data, error } = await supabase
      .from('watchdog_results')
      .select('*')
      .eq('run_id', runId)
      .order('run_at', { ascending: true })

    if (error) {
      console.error('Error fetching run:', error)
      setLoading(false)
      return
    }
    setResults(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchResults() }, [runId])

  // Filter to failing checks with violations
  const failingResults = results
    .filter(r => r.status === 'fail' && (r.violations || []).length > 0)
    .sort((a, b) => (SEVERITY_ORDER[a.severity] || 99) - (SEVERITY_ORDER[b.severity] || 99))

  const filtered = filter === 'all'
    ? failingResults
    : failingResults.filter(r => r.severity === filter)

  // Stats
  const totalViolations = failingResults.reduce((sum, r) => sum + (r.violation_count || 0), 0)
  const totalResolved = results.reduce((sum, r) => sum + Object.keys(r.resolutions || {}).length, 0)
  const passedCount = results.filter(r => r.status === 'pass').length
  const runType = results[0]?.run_type || 'daily'
  const runAt = results[0]?.run_at

  function isResolved(result, recordId) {
    return !!(result.resolutions || {})[recordId]
  }

  function getResolution(result, recordId) {
    return (result.resolutions || {})[recordId]
  }

  async function handleMarkFixed(resultId, recordId, resolutions) {
    setActionLoading(`fixed-${resultId}-${recordId}`)
    const updated = {
      ...resolutions,
      [recordId]: { status: 'fixed', resolved_by: 'dashboard', resolved_at: new Date().toISOString() }
    }
    const { error } = await supabase
      .from('watchdog_results')
      .update({ resolutions: updated })
      .eq('id', resultId)

    if (!error) await fetchResults()
    setActionLoading(null)
  }

  async function handleAddException(checkId, recordId, recordName, resultId, resolutions) {
    const reason = prompt(`Why should "${recordName}" be excluded from "${formatCheckName(checkId)}"?`)
    if (!reason) return

    setActionLoading(`exception-${resultId}-${recordId}`)

    // Insert exception
    const { data: exception, error: exError } = await supabase
      .from('watchdog_exceptions')
      .insert({
        check_id: checkId,
        type: 'record',
        value: recordId,
        reason: reason,
        created_by: 'dashboard',
        active: true
      })
      .select()
      .single()

    if (exError) {
      console.error('Error adding exception:', exError)
      setActionLoading(null)
      return
    }

    // Mark as resolved in results
    const updated = {
      ...resolutions,
      [recordId]: { status: 'exception', exception_id: exception.id, resolved_at: new Date().toISOString() }
    }
    await supabase
      .from('watchdog_results')
      .update({ resolutions: updated })
      .eq('id', resultId)

    await fetchResults()
    setActionLoading(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-5xl mx-auto">
          <button onClick={() => navigate('/watchdog')} className="text-blue-600 hover:text-blue-800 mb-4 inline-block">← Back to runs</button>
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No results found for this run.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Back link */}
        <button onClick={() => navigate('/watchdog')} className="text-blue-600 hover:text-blue-800 mb-4 inline-block">← Back to runs</button>

        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {runType === 'hourly' ? 'Hourly' : 'Daily'} Report
              </h1>
              <p className="text-gray-500 mt-1">{runAt ? new Date(runAt).toLocaleString() : ''}</p>
            </div>
            <div className="flex items-center gap-4">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                runType === 'hourly' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
              }`}>{runType}</span>
              <span className="text-sm text-gray-500">{passedCount} passed</span>
              {totalViolations > 0 && (
                <span className="text-sm text-gray-500">{totalResolved}/{totalViolations} resolved</span>
              )}
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex gap-2 mt-4">
            {['all', 'critical', 'high', 'medium'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* No violations */}
        {filtered.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            {failingResults.length === 0
              ? <p className="text-green-600 font-medium text-lg">All checks passed!</p>
              : <p className="text-gray-500">No violations match this filter.</p>
            }
          </div>
        )}

        {/* Violation groups */}
        {filtered.map(result => {
          const sev = SEVERITY_CONFIG[result.severity] || SEVERITY_CONFIG.medium
          return (
            <div key={result.id} className={`bg-white rounded-lg shadow mb-4 border-l-4 ${sev.border}`}>
              {/* Check header */}
              <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {formatCheckName(result.check_id)}
                  </h2>
                  <span className="text-sm text-gray-500">({result.violation_count} found)</span>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${sev.bg} ${sev.text}`}>
                  {sev.label}
                </span>
              </div>

              {/* Violation rows */}
              <div className="divide-y divide-gray-50">
                {(result.violations || []).map((item, idx) => {
                  const resolved = isResolved(result, item.record_id)
                  const resolution = getResolution(result, item.record_id)
                  return (
                    <div key={item.record_id || idx} className={`px-6 py-4 ${resolved ? 'opacity-50' : ''}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-gray-900 ${resolved ? 'line-through' : ''}`}>
                            {item.record_name}
                          </p>
                          <p className="text-sm text-gray-500 mt-0.5">{item.details}</p>
                          {resolved && resolution && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${
                              resolution.status === 'fixed' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {resolution.status === 'fixed' ? 'Fixed' : 'Exception'}
                            </span>
                          )}
                        </div>
                        {!resolved && (
                          <div className="flex gap-2 flex-shrink-0">
                            <a
                              href={item.hubspot_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                            >
                              View in HubSpot
                            </a>
                            <button
                              onClick={() => handleAddException(result.check_id, item.record_id, item.record_name, result.id, result.resolutions || {})}
                              disabled={actionLoading === `exception-${result.id}-${item.record_id}`}
                              className="px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 rounded hover:bg-purple-100 transition-colors disabled:opacity-50"
                            >
                              {actionLoading === `exception-${result.id}-${item.record_id}` ? '...' : 'Add Exception'}
                            </button>
                            <button
                              onClick={() => handleMarkFixed(result.id, item.record_id, result.resolutions || {})}
                              disabled={actionLoading === `fixed-${result.id}-${item.record_id}`}
                              className="px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 rounded hover:bg-green-100 transition-colors disabled:opacity-50"
                            >
                              {actionLoading === `fixed-${result.id}-${item.record_id}` ? '...' : 'Mark Fixed'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

**Step 2: Verify build**

```bash
cd "/Users/idanron/Desktop/Projects- cursor/Reindeer" && npm run build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/watchdog/WatchdogRunDetail.jsx
git commit -m "feat: implement Watchdog run detail page with actions"
```

---

### Task 6: Update daily coordinator workflow — add `run_id` and compact Slack

**Files:**
- Modify: `n8n-workflow-watchdog-daily-coordinator.json`

**Step 1: Update the workflow JSON**

The changes needed in `n8n-workflow-watchdog-daily-coordinator.json`:

1. Add a new Code node "Code - Generate Run ID" between triggers and check HTTP requests
2. Update the "Code - Format Slack Digest" node to:
   - Generate compact Slack summary (3 lines) instead of verbose blocks
   - Include `run_id` and `run_type: "daily"` in the Supabase results
3. Update connections: triggers → Generate Run ID → fan-out to checks

The new Code node for generating run_id:

```json
{
  "parameters": {
    "mode": "runOnceForAllItems",
    "jsCode": "const run_id = crypto.randomUUID();\nreturn [{ json: { run_id } }];"
  },
  "id": "generate-run-id",
  "name": "Code - Generate Run ID",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [360, 300]
}
```

The updated Format Slack Digest jsCode:

```javascript
const results = $input.all().map(item => item.json);
const run_id = $node["Code - Generate Run ID"].json.run_id;

// Count by severity
const failures = results.filter(r => r.status === 'fail');
const critical = failures.filter(r => r.severity === 'critical').length;
const high = failures.filter(r => r.severity === 'high').length;
const medium = failures.filter(r => r.severity === 'medium').length;
const passed = results.filter(r => r.status === 'pass').length;

// Build compact Slack message
const summaryParts = [];
if (critical > 0) summaryParts.push(`🔴 ${critical} Critical`);
if (high > 0) summaryParts.push(`🟠 ${high} High`);
if (medium > 0) summaryParts.push(`🟡 ${medium} Medium`);
summaryParts.push(`✅ ${passed} Passed`);

const dashboardUrl = `https://reindeer-sal.vercel.app/watchdog/run/${run_id}`;

const blocks = [
  {
    type: 'header',
    text: { type: 'plain_text', text: '🔍 HubSpot Watchdog — Daily Report' }
  },
  {
    type: 'section',
    text: { type: 'mrkdwn', text: summaryParts.join('  |  ') }
  },
  {
    type: 'section',
    text: { type: 'mrkdwn', text: `👉 <${dashboardUrl}|View full report>` }
  }
];

// Build results for Supabase — include run_id and run_type
const supabaseResults = results.map(r => ({
  check_id: r.check_id,
  run_id: run_id,
  run_type: 'daily',
  status: r.status,
  violation_count: r.count || 0,
  violations: r.items || [],
  severity: r.severity,
  run_at: new Date().toISOString()
}));

return [{
  json: {
    hasFailures: failures.length > 0,
    slackPayload: {
      text: `Watchdog Daily: ${failures.length} checks failed`,
      blocks: blocks
    },
    supabaseResults: supabaseResults
  }
}];
```

Update the full `n8n-workflow-watchdog-daily-coordinator.json` file with:
- New "Code - Generate Run ID" node added to nodes array
- Updated jsCode in "Code - Format Slack Digest"
- Updated connections: triggers → "Code - Generate Run ID", "Code - Generate Run ID" → all checks
- Shift check node positions right to make room

**Step 2: Deploy to n8n**

```bash
# Read n8n config
N8N_URL=$(cat ~/.claude/n8n-config.json | python3 -c "import sys,json; print(json.load(sys.stdin)['n8n']['baseUrl'])")
N8N_KEY=$(cat ~/.claude/n8n-config.json | python3 -c "import sys,json; print(json.load(sys.stdin)['n8n']['apiKey'])")

# Update workflow via API (daily coordinator ID: M6ODso1EOZKus5Ts — from CLAUDE.md)
curl -s -X PUT "${N8N_URL}/api/v1/workflows/M6ODso1EOZKus5Ts" \
  -H "X-N8N-API-KEY: ${N8N_KEY}" \
  -H "Content-Type: application/json" \
  -d @"/Users/idanron/Desktop/Projects- cursor/Reindeer/n8n-workflow-watchdog-daily-coordinator.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Updated: {d.get(\"name\", \"error\")}')"
```

Expected: "Updated: Reindeer AI Health Check: Daily Coordinator"

**Step 3: Commit**

```bash
git add n8n-workflow-watchdog-daily-coordinator.json
git commit -m "feat: update daily coordinator with run_id and compact Slack summary"
```

---

### Task 7: Update hourly coordinator workflow — add `run_id` and compact Slack

**Files:**
- Modify: `n8n-workflow-watchdog-hourly-coordinator.json`

**Step 1: Apply same changes as daily coordinator**

Same pattern as Task 6 but for the hourly coordinator:
- Add "Code - Generate Run ID" node
- Update Slack digest to compact format with `run_type: 'hourly'`
- Update connections

The jsCode for the hourly Format Slack Digest is identical to the daily one except:
- Header text: `'🔍 HubSpot Watchdog — Hourly Report'`
- `run_type: 'hourly'` in supabaseResults
- Slack text: `Watchdog Hourly: ${failures.length} checks failed`

**Step 2: Deploy to n8n**

```bash
N8N_URL=$(cat ~/.claude/n8n-config.json | python3 -c "import sys,json; print(json.load(sys.stdin)['n8n']['baseUrl'])")
N8N_KEY=$(cat ~/.claude/n8n-config.json | python3 -c "import sys,json; print(json.load(sys.stdin)['n8n']['apiKey'])")

# Hourly coordinator ID: RgLCTUwsHCTCqUHk
curl -s -X PUT "${N8N_URL}/api/v1/workflows/RgLCTUwsHCTCqUHk" \
  -H "X-N8N-API-KEY: ${N8N_KEY}" \
  -H "Content-Type: application/json" \
  -d @"/Users/idanron/Desktop/Projects- cursor/Reindeer/n8n-workflow-watchdog-hourly-coordinator.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Updated: {d.get(\"name\", \"error\")}')"
```

**Step 3: Commit**

```bash
git add n8n-workflow-watchdog-hourly-coordinator.json
git commit -m "feat: update hourly coordinator with run_id and compact Slack summary"
```

---

### Task 8: Enable RLS or verify anon key access for dashboard

**Files:**
- No local files

**Step 1: Check if anon key can read watchdog tables**

```bash
curl -s "https://oirehnrecwzcvxusdbku.supabase.co/rest/v1/watchdog_results?limit=1" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pcmVobnJlY3d6Y3Z4dXNkYmt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0OTYzMTQsImV4cCI6MjA4NzA3MjMxNH0.HmPOiCkOIp2sDpN5kJxsFnOOJUXMGJnMwwKkLeaHHKI" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pcmVobnJlY3d6Y3Z4dXNkYmt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0OTYzMTQsImV4cCI6MjA4NzA3MjMxNH0.HmPOiCkOIp2sDpN5kJxsFnOOJUXMGJnMwwKkLeaHHKI"
```

If this returns data → RLS is disabled, anon key works, we're good.

If this returns `[]` even though data exists, or returns a 403 → RLS is enabled and we need to add policies:

```sql
-- Allow anon read on watchdog tables
CREATE POLICY "anon_read_results" ON watchdog_results FOR SELECT USING (true);
CREATE POLICY "anon_update_results" ON watchdog_results FOR UPDATE USING (true);
CREATE POLICY "anon_read_exceptions" ON watchdog_exceptions FOR SELECT USING (true);
CREATE POLICY "anon_insert_exceptions" ON watchdog_exceptions FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_read_checks" ON watchdog_checks FOR SELECT USING (true);
```

Run these via:

```bash
SUPABASE_ACCESS_TOKEN=sbp_68c74812c8b8a1fca6ce0d2bfa7facf3a3712d1d npx supabase db execute \
  --project-ref oirehnrecwzcvxusdbku \
  "<SQL above>"
```

**Step 2: If anon key doesn't work, update `src/lib/supabase.js`**

As a fallback, temporarily use the service_role key. This is acceptable for an internal tool but should be replaced with anon + RLS policies in future.

---

### Task 9: Test end-to-end

**Step 1: Trigger a manual daily run**

```bash
curl -s -X POST "https://n8n-service-v39p.onrender.com/webhook/watchdog-daily-run" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2)[:500])"
```

Expected: The coordinator runs, generates a run_id, saves results with run_id to Supabase, sends compact Slack.

**Step 2: Verify data in Supabase has run_id**

```bash
curl -s "https://oirehnrecwzcvxusdbku.supabase.co/rest/v1/watchdog_results?order=run_at.desc&limit=5&select=id,check_id,run_id,run_type,status,violation_count" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pcmVobnJlY3d6Y3Z4dXNkYmt1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQ5NjMxNCwiZXhwIjoyMDg3MDcyMzE0fQ.c9ZSz88tiYA423J9dudJbf7uUWaDNNDUNlNmFYoqqlo" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pcmVobnJlY3d6Y3Z4dXNkYmt1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQ5NjMxNCwiZXhwIjoyMDg3MDcyMzE0fQ.c9ZSz88tiYA423J9dudJbf7uUWaDNNDUNlNmFYoqqlo" | python3 -m json.tool
```

Expected: Recent results should have `run_id` (UUID) and `run_type` ("daily") populated.

**Step 3: Run dev server and verify dashboard**

```bash
cd "/Users/idanron/Desktop/Projects- cursor/Reindeer" && npm run dev
```

Visit `http://localhost:3000/watchdog` — should show the run list.
Click into a run — should show violations grouped by check.
Test all three actions (View in HubSpot, Add Exception, Mark Fixed).

**Step 4: Deploy to Vercel**

```bash
cd "/Users/idanron/Desktop/Projects- cursor/Reindeer" && npx vercel --prod
```

Or push to git and let Vercel auto-deploy.

**Step 5: Verify the Slack link works**

The Slack compact message should contain a link like `https://reindeer-sal.vercel.app/watchdog/run/<run_id>`. Click it and verify the dashboard loads.
