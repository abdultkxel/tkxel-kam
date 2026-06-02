import { Navigate, Route, Routes } from 'react-router-dom'
import { GuestRoute, RequireAuth } from '@/components/auth/RequireAuth'
import { AppShell } from '@/components/layout/AppShell'
import { AccountDetail } from '@/pages/AccountDetail'
import { Accounts } from '@/pages/Accounts'
import { Admin } from '@/pages/Admin'
import { Analytics } from '@/pages/Analytics'
import { Dashboard } from '@/pages/Dashboard'
import { Escalations } from '@/pages/Escalations'
import { EngagementDetail } from '@/pages/EngagementDetail'
import { Governance } from '@/pages/Governance'
import { HealthScores } from '@/pages/HealthScores'
import { Login } from '@/pages/Login'
import { Notifications } from '@/pages/Notifications'
import { Onboarding } from '@/pages/Onboarding'
import { Opportunities } from '@/pages/Opportunities'
import { Playbook } from '@/pages/Playbook'
import { Profile } from '@/pages/Profile'
import { Reports } from '@/pages/Reports'
import { ResetPassword } from '@/pages/ResetPassword'
import { Tasks } from '@/pages/Tasks'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/reset-password" element={<GuestRoute><ResetPassword /></GuestRoute>} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/alerts" element={<Navigate to="/dashboard" replace />} />
        <Route path="/onboarding" element={<Navigate to="/accounts/onboarding" replace />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/accounts/onboarding" element={<Onboarding />} />
        <Route path="/accounts/:accountId/engagements/:engagementId" element={<EngagementDetail />} />
        <Route path="/accounts/:id" element={<AccountDetail />} />
        <Route path="/attention" element={<Navigate to="/tasks" replace />} />
        <Route path="/opportunities" element={<Opportunities />} />
        <Route path="/escalations" element={<Escalations />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/governance" element={<Governance />} />
        <Route path="/health-scores" element={<HealthScores />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/playbook" element={<Playbook />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Navigate to="/profile" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
