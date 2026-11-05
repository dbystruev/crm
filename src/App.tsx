import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { AppShell } from './components/AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ToastProvider } from './components/Toast'
import { LoginPage } from './pages/Login'
import { MyTasksPage } from './pages/MyTasks'
import { ObjectDetailPage } from './pages/ObjectDetail'
import { ObjectsPage } from './pages/Objects'
import { NotFoundPage } from './pages/NotFound'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route index element={<ObjectsPage />} />
                <Route path="objects" element={<Navigate to="/" replace />} />
                <Route path="objects/:id" element={<ObjectDetailPage />} />
                <Route path="my-tasks" element={<MyTasksPage />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
