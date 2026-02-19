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
