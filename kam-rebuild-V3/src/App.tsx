import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AccountDetail } from '@/pages/AccountDetail'
import { Accounts } from '@/pages/Accounts'
import { Admin } from '@/pages/Admin'
import { Dashboard } from '@/pages/Dashboard'
import { Governance } from '@/pages/Governance'
import { Onboarding } from '@/pages/Onboarding'
import { Opportunities } from '@/pages/Opportunities'
import { Playbook } from '@/pages/Playbook'
import { Tasks } from '@/pages/Tasks'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/alerts" element={<Navigate to="/dashboard" replace />} />
        <Route path="/onboarding" element={<Navigate to="/accounts/onboarding" replace />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/accounts/onboarding" element={<Onboarding />} />
        <Route path="/accounts/:id" element={<AccountDetail />} />
        <Route path="/attention" element={<Navigate to="/tasks" replace />} />
        <Route path="/opportunities" element={<Opportunities />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/governance" element={<Governance />} />
        <Route path="/health-scores" element={<Navigate to="/accounts" replace />} />
        <Route path="/analytics" element={<Navigate to="/dashboard" replace />} />
        <Route path="/playbook" element={<Playbook />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/settings" element={<Navigate to="/admin?section=settings" replace />} />
      </Route>
    </Routes>
  )
}
