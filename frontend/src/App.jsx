import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ToastProvider } from './components/ui/Toast';
import Navbar from './components/layout/Navbar';
import Sidebar from './components/layout/Sidebar';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import Compute from './pages/Compute';
import Storage from './pages/Storage';
import Databases from './pages/Databases';
import Networking from './pages/Networking';
import Secrets from './pages/Secrets';
import LoadBalancer from './pages/LoadBalancer';
import Scheduler from './pages/Scheduler';
import Logs from './pages/Logs';
import DNS from './pages/DNS';
import IAM from './pages/IAM';
import AuditLog from './pages/AuditLog';

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-cloud-main">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-aws-orange border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="h-screen overflow-hidden bg-cloud-main">
      <Navbar />
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(s => !s)} />
      <main
        className="absolute top-12 bottom-0 right-0 overflow-y-auto transition-all duration-200"
        style={{ left: sidebarCollapsed ? '3rem' : '13rem' }}
      >
        <div className="p-6 min-h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedLayout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/compute" element={<Compute />} />
                <Route path="/storage" element={<Storage />} />
                <Route path="/databases" element={<Databases />} />
                <Route path="/networking" element={<Networking />} />
                <Route path="/secrets" element={<Secrets />} />
                <Route path="/loadbalancer" element={<LoadBalancer />} />
                <Route path="/scheduler" element={<Scheduler />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/dns" element={<DNS />} />
                <Route path="/iam" element={<IAM />} />
                <Route path="/audit" element={<AuditLog />} />
              </Route>
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </SocketProvider>
    </AuthProvider>
  );
}
