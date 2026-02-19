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
