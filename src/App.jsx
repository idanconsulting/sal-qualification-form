import { useState, useEffect } from 'react'

// Configuration
const CONFIG = {
  N8N_WEBHOOK_URL: 'https://n8n-service-v39p.onrender.com/webhook/sal-form-submit',
  N8N_CHECK_SUBMISSION_URL: 'https://n8n-service-v39p.onrender.com/webhook/check-sal-submission'
}

function App() {
  const [formData, setFormData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)

  // Form fields
  const [formState, setFormState] = useState({
    meetingHeld: '',
    noShowReason: '',
    rescheduleDate: '',
    rescheduleNotes: '',
    additionalAttendees: '',
    identifiedNeed: '',
    identifiedNeedComment: '',
    decisionMaker: '',
    decisionMakerComment: '',
    nextStep: '',
    nextStepComment: '',
    salDecision: '',
    rejectReason: '',
    comments: ''
  })

  // Decode form data from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')

    if (!token) {
      setError('Invalid form link. Please use the link provided in Slack.')
      setLoading(false)
      return
    }

    try {
      // URLSearchParams converts + to spaces; restore them for valid base64
      const decoded = JSON.parse(atob(token.replace(/ /g, '+')))
      setFormData(decoded)

      // Check localStorage for previous submission (keyed by meetingId to handle multiple contacts)
      const submissionKey = `sal_form_${decoded.meetingId}`
      const previousSubmission = localStorage.getItem(submissionKey)

      if (previousSubmission) {
        setAlreadySubmitted(true)
      }

      setLoading(false)
    } catch (err) {
      setError('Invalid form data. Please contact support.')
      setLoading(false)
    }
  }, [])

  // Handle field changes
  const handleChange = (field, value) => {
    setFormState(prev => ({ ...prev, [field]: value }))
  }

  // No auto-submit - user must click submit for all options

  // Auto-submit handler
  const handleAutoSubmit = async () => {
    setSubmitting(true)

    const payload = {
      ...formData,
      formResponses: {
        meetingHeld: formState.meetingHeld,
        autoSubmit: true
      }
    }

    try {
      const response = await fetch(CONFIG.N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        // Mark as submitted in localStorage (keyed by meetingId)
        const submissionKey = `sal_form_${formData.meetingId}`
        localStorage.setItem(submissionKey, new Date().toISOString())
        setSubmitted(true)
      } else {
        setError('Failed to submit form. Please try again.')
      }
    } catch (err) {
      setError('Network error. Please check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle full form submission
  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validation
    if (!formState.meetingHeld) {
      setError('Please indicate if the meeting was held')
      return
    }

    if (formState.meetingHeld === 'No') {
      if (!formState.noShowReason) {
        setError('Please select why the meeting didn\'t happen')
        return
      }
    }

    if (formState.meetingHeld === 'Yes') {
      if (!formState.identifiedNeed || !formState.decisionMaker || !formState.nextStep) {
        setError('Please answer all qualification questions')
        return
      }

      if (!formState.salDecision) {
        setError('Please select a SAL decision')
        return
      }

      if (formState.salDecision === 'Reject' && !formState.rejectReason) {
        setError('Please provide details for rejection')
        return
      }
    }

    setError(null)
    setSubmitting(true)

    const payload = {
      ...formData,
      formResponses: {
        ...formState,
        autoSubmit: false,
        submittedAt: new Date().toISOString()
      }
    }

    try {
      const response = await fetch(CONFIG.N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        // Mark as submitted in localStorage (keyed by meetingId)
        const submissionKey = `sal_form_${formData.meetingId}`
        localStorage.setItem(submissionKey, new Date().toISOString())
        setSubmitted(true)
      } else {
        setError('Failed to submit form. Please try again.')
      }
    } catch (err) {
      setError('Network error. Please check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  // Calculate suggested decision
  const getSuggestedDecision = () => {
    if (formState.identifiedNeed === 'Yes' &&
        formState.decisionMaker === 'Yes' &&
        formState.nextStep === 'Yes') {
      return 'Accept'
    }
    return 'Disqualify'
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading form...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error && !formData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-red-600 text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  // Already submitted state
  if (alreadySubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-green-600 text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Already Submitted</h1>
          <p className="text-gray-600">This form has already been completed.</p>
          <p className="text-sm text-gray-500 mt-4">Contacts: {formData.contacts?.map(c => c.contactName).join(', ') || 'N/A'}</p>
        </div>
      </div>
    )
  }

  // Success state
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-green-600 text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Form Submitted</h1>
          <p className="text-gray-600">
            {formState.meetingHeld === 'No' && 'SDR has been notified that the meeting did not occur.'}
            {formState.meetingHeld === 'Rescheduled' && 'SDR has been notified that the meeting was rescheduled.'}
            {formState.meetingHeld === 'Yes' && 'The qualification has been recorded in HubSpot.'}
          </p>
        </div>
      </div>
    )
  }

  // Main form
  return (
    <div className="min-h-screen bg-gray-50 py-4 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 text-white px-6 py-4">
            <h1 className="text-2xl font-bold">SAL Qualification Form</h1>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6">
            {/* Basic Meeting Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Meeting Information</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">AE Name:</span>
                  <p className="font-medium">{formData.aeName || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-gray-600">SDR Name:</span>
                  <p className="font-medium">{formData.sdrName || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-gray-600">Meeting Date:</span>
                  <p className="font-medium">{formData.meetingDate || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-gray-600">Company:</span>
                  <p className="font-medium">{formData.companyName || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-gray-600">Contacts:</span>
                  <p className="font-medium">{formData.contacts?.map(c => c.contactName).join(', ') || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-gray-600">Source:</span>
                  <p className="font-medium">{formData.source || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Meeting Held */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                1. Meeting held? *
              </label>
              <div className="space-y-2">
                {['Yes', 'No', 'Rescheduled'].map(option => (
                  <label key={option} className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="radio"
                      name="meetingHeld"
                      value={option}
                      checked={formState.meetingHeld === option}
                      onChange={(e) => handleChange('meetingHeld', e.target.value)}
                      className="w-4 h-4 text-blue-600"
                      disabled={submitting}
                    />
                    <span className="text-gray-700">{option}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Show No-Show questions */}
            {formState.meetingHeld === 'No' && (
              <div className="mb-6 bg-red-50 rounded-lg p-4">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Why didn't the meeting happen? *
                </label>
                <div className="space-y-2 mb-3">
                  {['No-show (prospect didn\'t attend)', 'Cancelled by prospect', 'Cancelled by AE', 'Technical issues', 'Other'].map(option => (
                    <label key={option} className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="radio"
                        name="noShowReason"
                        value={option}
                        checked={formState.noShowReason === option}
                        onChange={(e) => handleChange('noShowReason', e.target.value)}
                        className="w-4 h-4 text-red-600"
                      />
                      <span className="text-gray-700">{option}</span>
                    </label>
                  ))}
                </div>
                <textarea
                  value={formState.comments}
                  onChange={(e) => handleChange('comments', e.target.value)}
                  placeholder="Additional notes (optional)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  rows="2"
                />
              </div>
            )}

            {/* Show Rescheduled questions */}
            {formState.meetingHeld === 'Rescheduled' && (
              <div className="mb-6 bg-yellow-50 rounded-lg p-4">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Reschedule Details
                </label>
                <div className="mb-3">
                  <label className="block text-sm text-gray-700 mb-1">New meeting date (if known)</label>
                  <input
                    type="date"
                    value={formState.rescheduleDate}
                    onChange={(e) => handleChange('rescheduleDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                </div>
                <textarea
                  value={formState.rescheduleNotes}
                  onChange={(e) => handleChange('rescheduleNotes', e.target.value)}
                  placeholder="Notes about the reschedule (optional)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  rows="2"
                />
              </div>
            )}

            {/* Show rest of form only if meeting was held */}
            {formState.meetingHeld === 'Yes' && (
              <>
                {/* Attendees */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    2. Additional Attendees
                  </label>
                  <p className="text-xs text-gray-500 mb-2">Booked with: {formData.contacts?.map(c => c.contactName).join(', ') || 'N/A'}</p>
                  <textarea
                    value={formState.additionalAttendees}
                    onChange={(e) => handleChange('additionalAttendees', e.target.value)}
                    placeholder="Enter names/titles of other attendees (optional)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows="2"
                  />
                </div>

                {/* Identified Need */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    3. Identified Need/Pain *
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Current operations aren't working well enough and AI is the answer, need for AI, don't know how to get started, failed POC, etc.
                  </p>
                  <div className="space-y-2 mb-2">
                    {['Yes', 'No'].map(option => (
                      <label key={option} className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="radio"
                          name="identifiedNeed"
                          value={option}
                          checked={formState.identifiedNeed === option}
                          onChange={(e) => handleChange('identifiedNeed', e.target.value)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-gray-700">{option}</span>
                      </label>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={formState.identifiedNeedComment}
                    onChange={(e) => handleChange('identifiedNeedComment', e.target.value)}
                    placeholder="Additional comments (optional)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Decision Maker */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    4. Identified Decision Maker/Champion *
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Owns/influences workflow + can push eval and/or budget path
                  </p>
                  <div className="space-y-2 mb-2">
                    {['Yes', 'No'].map(option => (
                      <label key={option} className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="radio"
                          name="decisionMaker"
                          value={option}
                          checked={formState.decisionMaker === option}
                          onChange={(e) => handleChange('decisionMaker', e.target.value)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-gray-700">{option}</span>
                      </label>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={formState.decisionMakerComment}
                    onChange={(e) => handleChange('decisionMakerComment', e.target.value)}
                    placeholder="Additional comments (optional)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Next Step */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    5. Next Step *
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Is there real commitment to engage with a clear next step or follow up meeting booked?
                  </p>
                  <div className="space-y-2 mb-2">
                    {['Yes', 'No'].map(option => (
                      <label key={option} className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="radio"
                          name="nextStep"
                          value={option}
                          checked={formState.nextStep === option}
                          onChange={(e) => handleChange('nextStep', e.target.value)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-gray-700">{option}</span>
                      </label>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={formState.nextStepComment}
                    onChange={(e) => handleChange('nextStepComment', e.target.value)}
                    placeholder="Additional comments (optional)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* SAL Decision */}
                <div className="mb-6 bg-blue-50 rounded-lg p-4">
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    6. SAL Decision *
                  </label>
                  {formState.identifiedNeed && formState.decisionMaker && formState.nextStep && (
                    <p className="text-sm text-blue-600 mb-3">
                      Suggested: {getSuggestedDecision()}
                    </p>
                  )}
                  <div className="space-y-2">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="radio"
                        name="salDecision"
                        value="Accept"
                        checked={formState.salDecision === 'Accept'}
                        onChange={(e) => handleChange('salDecision', e.target.value)}
                        className="w-4 h-4 text-green-600"
                      />
                      <span className="text-gray-700">✅ Accept as SAL</span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="radio"
                        name="salDecision"
                        value="Reject"
                        checked={formState.salDecision === 'Reject'}
                        onChange={(e) => handleChange('salDecision', e.target.value)}
                        className="w-4 h-4 text-yellow-600"
                      />
                      <span className="text-gray-700">🔄 Reject (return to SDR)</span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="radio"
                        name="salDecision"
                        value="Disqualify"
                        checked={formState.salDecision === 'Disqualify'}
                        onChange={(e) => handleChange('salDecision', e.target.value)}
                        className="w-4 h-4 text-red-600"
                      />
                      <span className="text-gray-700">❌ Disqualify</span>
                    </label>
                  </div>

                  {/* Mandatory reject reason */}
                  {formState.salDecision === 'Reject' && (
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Please provide details *
                      </label>
                      <textarea
                        value={formState.rejectReason}
                        onChange={(e) => handleChange('rejectReason', e.target.value)}
                        placeholder="Why are you rejecting this lead?"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows="2"
                        required
                      />
                    </div>
                  )}
                </div>

                {/* Comments */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    7. Additional Comments
                  </label>
                  <textarea
                    value={formState.comments}
                    onChange={(e) => handleChange('comments', e.target.value)}
                    placeholder="Any additional notes or context (optional)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows="3"
                  />
                </div>
              </>
            )}

            {/* Error message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Submit button - show for all options */}
            {formState.meetingHeld && (
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Submitting...' :
                    formState.meetingHeld === 'Yes' ? 'Submit Qualification' :
                    formState.meetingHeld === 'No' ? 'Submit No-Show Report' :
                    'Submit Reschedule'}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

export default App
