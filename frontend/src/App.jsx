import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthGuard, GuestGuard, AdminGuard } from './components/AuthGuard.jsx'
import { DashboardLayout } from './layouts/DashboardLayout.jsx'
import { Login } from './pages/Login.jsx'
import { Register } from './pages/Register.jsx'
import { Dashboard } from './pages/Dashboard.jsx'
import { Agents } from './pages/Agents.jsx'
import { AgentDetail } from './pages/AgentDetail.jsx'
import { Conversations } from './pages/Conversations.jsx'
import { ConversationDetail } from './pages/ConversationDetail.jsx'
import { CompanyProfile } from './pages/CompanyProfile.jsx'
import { Services } from './pages/Services.jsx'
import { Appointments } from './pages/Appointments.jsx'
import { LlmKeys } from './pages/LlmKeys.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route element={<GuestGuard />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        <Route element={<AuthGuard />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/agents/:id" element={<AgentDetail />} />
            <Route path="/conversations" element={<Conversations />} />
            <Route path="/conversations/:id" element={<ConversationDetail />} />
            <Route path="/company" element={<CompanyProfile />} />
            <Route path="/services" element={<Services />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route element={<AdminGuard />}>
              <Route path="/llm-keys" element={<LlmKeys />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
