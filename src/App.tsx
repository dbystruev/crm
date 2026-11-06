import { BrowserRouter, Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { AppShell } from './components/AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ToastProvider } from './components/Toast'
import { LanguageProvider } from './i18n/LanguageProvider'
import { useLanguage } from './i18n/language-context'
import { isLanguage } from './i18n/translations'
import { LoginPage } from './pages/Login'
import { MyTasksPage } from './pages/MyTasks'
import { ObjectDetailPage } from './pages/ObjectDetail'
import { ObjectsPage } from './pages/Objects'
import { NotFoundPage } from './pages/NotFound'
import { TaskDetailPage } from './pages/TaskDetail'

function RootRedirect() {
  const { language } = useLanguage()
  return <Navigate to={`/${language}`} replace />
}

function LegacyRedirect({ to }: { to: string }) {
  const { path } = useLanguage()
  return <Navigate to={path(to)} replace />
}

function LegacyObjectRedirect() {
  const { id } = useParams<{ id: string }>()
  const { path } = useLanguage()
  return <Navigate to={path(id ? `/objects/${id}` : '/')} replace />
}

function LanguageLayout() {
  const { lang } = useParams<{ lang: string }>()
  if (!isLanguage(lang)) return <NotFoundPage />
  return <Outlet />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <LanguageProvider>
          <ToastProvider>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<LegacyRedirect to="/login" />} />
              <Route path="/objects" element={<LegacyRedirect to="/" />} />
              <Route path="/objects/:id" element={<LegacyObjectRedirect />} />
              <Route path="/my-tasks" element={<LegacyRedirect to="/my-tasks" />} />

              <Route path="/:lang" element={<LanguageLayout />}>
                <Route path="login" element={<LoginPage />} />
                <Route path="objects" element={<LegacyRedirect to="/" />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppShell />}>
                    <Route index element={<ObjectsPage />} />
                    <Route path="objects/:id" element={<ObjectDetailPage />} />
                    <Route path="tasks/:id" element={<TaskDetailPage />} />
                    <Route path="my-tasks" element={<MyTasksPage />} />
                  </Route>
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </ToastProvider>
        </LanguageProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}
