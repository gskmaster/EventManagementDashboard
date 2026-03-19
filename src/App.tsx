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
import PublicRegistration from './pages/public-form/PublicRegistration';
import PublicSpeakerRegistration from './pages/public-form/PublicSpeakerRegistration';
import PublicPaymentRegistration from './pages/public-form/PublicPaymentRegistration';
import Venues from './pages/Venues';
import Ushers from './pages/Ushers';
import LiaisonOfficers from './pages/LiaisonOfficers';
import PublicUsherRegistration from './pages/public-form/PublicUsherRegistration';
import PublicLORegistration from './pages/public-form/PublicLORegistration';
import TaxManagement from './pages/TaxManagement';
import TaxDetail from './pages/TaxDetail';
import LegalManagement from './pages/LegalManagement';
import LegalDetail from './pages/LegalDetail';
import LegalTerms from './pages/LegalTerms';
import CertificateManagement from './pages/CertificateManagement';
import CertificateDetail from './pages/CertificateDetail';

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
            <Route path="/register-usher" element={<PublicUsherRegistration />} />
            <Route path="/register-lo" element={<PublicLORegistration />} />
            <Route path="/pay-receipt/:projectId" element={<PublicPaymentRegistration />} />
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
                <ProtectedRoute allowedRoles={['admin', 'event_manager', 'tax_admin']}>
                  <ProjectDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tax-management"
              element={
                <ProtectedRoute allowedRoles={['admin', 'event_manager', 'tax_admin']}>
                  <TaxManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tax-management/:projectId"
              element={
                <ProtectedRoute allowedRoles={['admin', 'event_manager', 'tax_admin']}>
                  <TaxDetail />
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
            <Route
              path="/venues"
              element={
                <ProtectedRoute allowedRoles={['admin', 'event_manager']}>
                  <Venues />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ushers"
              element={
                <ProtectedRoute allowedRoles={['admin', 'event_manager']}>
                  <Ushers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/liaison-officers"
              element={
                <ProtectedRoute allowedRoles={['admin', 'event_manager', 'lo']}>
                  <LiaisonOfficers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/legal-management"
              element={
                <ProtectedRoute allowedRoles={['admin', 'dpo']}>
                  <LegalManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/legal-management/terms"
              element={
                <ProtectedRoute allowedRoles={['admin', 'dpo']}>
                  <LegalTerms />
                </ProtectedRoute>
              }
            />
            <Route
              path="/legal-management/:projectId"
              element={
                <ProtectedRoute allowedRoles={['admin', 'dpo']}>
                  <LegalDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/certificate-management"
              element={
                <ProtectedRoute allowedRoles={['admin', 'event_manager']}>
                  <CertificateManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/certificate-management/:projectId"
              element={
                <ProtectedRoute allowedRoles={['admin', 'event_manager']}>
                  <CertificateDetail />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
