import { Navigate, Route, Routes } from 'react-router-dom'
import { GuestRoute, RequireAuth } from '@/components/auth/RequireAuth'
import { AppShell } from '@/components/layout/AppShell'
import { AccountDetail } from '@/pages/AccountDetail'
import { Accounts } from '@/pages/Accounts'
import { Admin } from '@/pages/Admin'
import { Dashboard } from '@/pages/Dashboard'
import { Escalations } from '@/pages/Escalations'
import { Governance } from '@/pages/Governance'
import { Login } from '@/pages/Login'
import { Onboarding } from '@/pages/Onboarding'
import { Opportunities } from '@/pages/Opportunities'
import { Playbook } from '@/pages/Playbook'
import { Profile } from '@/pages/Profile'
import { ResetPassword } from '@/pages/ResetPassword'
import { Retention } from '@/pages/Retention'
import { Tasks } from '@/pages/Tasks'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/reset-password" element={<GuestRoute><ResetPassword /></GuestRoute>} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/alerts" element={<Navigate to="/dashboard" replace />} />
        <Route path="/onboarding" element={<Navigate to="/accounts/onboarding" replace />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/accounts/onboarding" element={<Onboarding />} />
        <Route path="/accounts/:id" element={<AccountDetail />} />
        <Route path="/attention" element={<Navigate to="/tasks" replace />} />
        <Route path="/opportunities" element={<Opportunities />} />
        <Route path="/retention" element={<Retention />} />
        <Route path="/escalations" element={<Escalations />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/governance" element={<Governance />} />
        <Route path="/health-scores" element={<Navigate to="/accounts" replace />} />
        <Route path="/analytics" element={<Navigate to="/dashboard" replace />} />
        <Route path="/playbook" element={<Playbook />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Navigate to="/profile" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
