import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from '@/App'
import { AuthProvider } from '@/contexts/AuthContext'
import '@/index.css'

const Router = import.meta.env.VITE_SINGLE_FILE_EXPORT === 'true' ? HashRouter : BrowserRouter

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <Router>
        <App />
      </Router>
    </AuthProvider>
  </React.StrictMode>,
)
