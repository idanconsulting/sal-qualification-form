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
