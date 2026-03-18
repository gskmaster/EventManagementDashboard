import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Registration from './pages/Registration';
import Payments from './pages/Payments';
import Attendance from './pages/Attendance';
import Projects from './pages/Projects';
import Users from './pages/Users';
import Speakers from './pages/Speakers';
import ProjectDetail from './pages/ProjectDetail';
import PublicRegistration from './pages/PublicRegistration';
import PublicSpeakerRegistration from './pages/PublicSpeakerRegistration';
import PublicPaymentRegistration from './pages/PublicPaymentRegistration';

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register/:projectId" element={<PublicRegistration />} />
            <Route path="/register-speaker/:projectId" element={<PublicSpeakerRegistration />} />
            <Route path="/pay-receipt/:projectId/:institutionId" element={<PublicPaymentRegistration />} />
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/projects" 
              element={
                <ProtectedRoute allowedRoles={['admin', 'event_manager']}>
                  <Projects />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/projects/:projectId" 
              element={
                <ProtectedRoute allowedRoles={['admin', 'event_manager']}>
                  <ProjectDetail />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/registration" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Registration />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/payments" 
              element={
                <ProtectedRoute allowedRoles={['admin', 'finance']}>
                  <Payments />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/attendance" 
              element={
                <ProtectedRoute allowedRoles={['admin', 'event_manager', 'lo']}>
                  <Attendance />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/speakers" 
              element={
                <ProtectedRoute allowedRoles={['admin', 'event_manager']}>
                  <Speakers />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/users" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Users />
                </ProtectedRoute>
              } 
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
