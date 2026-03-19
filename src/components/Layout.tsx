import React, { useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';
import { Calendar, Users, LogOut, CreditCard, ClipboardCheck, Map, Menu, X, UserPlus, Building2, Lock, UserCheck, Handshake, Receipt, Shield, Award } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, profile, logout } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Change Password State
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [cpCurrentPassword, setCpCurrentPassword] = useState('');
  const [cpNewPassword, setCpNewPassword] = useState('');
  const [cpConfirmPassword, setCpConfirmPassword] = useState('');
  const [cpError, setCpError] = useState('');
  const [cpLoading, setCpLoading] = useState(false);
  const [cpSuccess, setCpSuccess] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setCpError('');
    if (cpNewPassword !== cpConfirmPassword) {
      setCpError('New passwords do not match.');
      return;
    }
    if (cpNewPassword.length < 6) {
      setCpError('Password must be at least 6 characters.');
      return;
    }
    if (!user?.email) return;
    setCpLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, cpCurrentPassword);
      await reauthenticateWithCredential(auth.currentUser!, credential);
      await updatePassword(auth.currentUser!, cpNewPassword);
      setCpSuccess(true);
      setCpCurrentPassword('');
      setCpNewPassword('');
      setCpConfirmPassword('');
    } catch (err: any) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setCpError('Current password is incorrect.');
      } else {
        setCpError(err.message || 'Failed to change password.');
      }
    } finally {
      setCpLoading(false);
    }
  };

  const openChangePassword = () => {
    setCpCurrentPassword('');
    setCpNewPassword('');
    setCpConfirmPassword('');
    setCpError('');
    setCpSuccess(false);
    setShowChangePasswordModal(true);
  };

  const isActive = (path: string) => location.pathname === path;

  const NavItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => (
    <Link 
      to={to} 
      onClick={() => setIsMobileMenuOpen(false)}
      className={`flex items-center px-3 py-2.5 rounded-lg font-medium transition-colors ${
        isActive(to) 
          ? 'bg-indigo-50 text-indigo-700' 
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <Icon className={`w-5 h-5 mr-3 ${isActive(to) ? 'text-indigo-700' : 'text-slate-400'}`} />
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center mr-3">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900">Event Portal</span>
          </div>
          <button 
            className="lg:hidden text-slate-500 hover:text-slate-700"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          <NavItem to="/" icon={Calendar} label="Dashboard" />
          
          {(profile?.role === 'admin' || profile?.role === 'event_manager') && (
            <NavItem to="/projects" icon={ClipboardCheck} label="Projects" />
          )}

          {(profile?.role === 'admin' || profile?.role === 'event_manager') && (
            <NavItem to="/speakers" icon={Users} label="Speakers" />
          )}

          {(profile?.role === 'admin') && (
            <NavItem to="/registration" icon={Map} label="Region Management" />
          )}

          {(profile?.role === 'admin' || profile?.role === 'event_manager') && (
            <NavItem to="/venues" icon={Building2} label="Venues" />
          )}
          
          {(profile?.role === 'admin' || profile?.role === 'finance') && (
            <NavItem to="/payments" icon={CreditCard} label="Payments" />
          )}

          {(profile?.role === 'admin' || profile?.role === 'event_manager' || profile?.role === 'lo') && (
            <NavItem to="/attendance" icon={Users} label="Attendance" />
          )}

          {(profile?.role === 'admin' || profile?.role === 'event_manager') && (
            <NavItem to="/ushers" icon={UserCheck} label="Ushers" />
          )}

          {(profile?.role === 'admin' || profile?.role === 'event_manager' || profile?.role === 'lo') && (
            <NavItem to="/liaison-officers" icon={Handshake} label="Liaison Officers" />
          )}

          {(profile?.role === 'admin' || profile?.role === 'event_manager' || profile?.role === 'tax_admin') && (
            <NavItem to="/tax-management" icon={Receipt} label="Tax Management" />
          )}

          {(profile?.role === 'admin' || profile?.role === 'event_manager') && (
            <NavItem to="/certificate-management" icon={Award} label="Certificate Management" />
          )}

          {(profile?.role === 'admin' || profile?.role === 'dpo') && (
            <NavItem to="/legal-management" icon={Shield} label="Legal Management" />
          )}

          {(profile?.role === 'admin') && (
            <NavItem to="/users" icon={UserPlus} label="User Management" />
          )}
        </div>

        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center mb-4 px-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold mr-3">
              {profile?.displayName?.charAt(0) || profile?.email?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {profile?.displayName || 'User'}
              </p>
              <p className="text-xs text-slate-500 truncate capitalize">
                {profile?.role.replace('_', ' ')}
              </p>
            </div>
          </div>
          <button
            onClick={openChangePassword}
            className="w-full flex items-center px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors mb-1"
          >
            <Lock className="w-4 h-4 mr-2 text-slate-400" />
            Change Password
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </button>
        </div>
      </div>

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowChangePasswordModal(false)} />
          <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Change Password</h3>
            <p className="text-sm text-slate-500 mb-4">Update your account password.</p>

            {cpSuccess ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Lock className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-sm font-medium text-green-700 mb-4">Password changed successfully!</p>
                <button
                  onClick={() => setShowChangePasswordModal(false)}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                {cpError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                    {cpError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
                  <input
                    type="password"
                    required
                    value={cpCurrentPassword}
                    onChange={(e) => setCpCurrentPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                  <input
                    type="password"
                    required
                    value={cpNewPassword}
                    onChange={(e) => setCpNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    value={cpConfirmPassword}
                    onChange={(e) => setCpConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowChangePasswordModal(false)}
                    disabled={cpLoading}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={cpLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center"
                  >
                    {cpLoading ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Saving...</>
                    ) : 'Save Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-4 sm:px-8">
          <button 
            className="lg:hidden text-slate-500 hover:text-slate-700 mr-4"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-semibold text-slate-800 capitalize truncate">
            {location.pathname === '/' ? 'Dashboard' : location.pathname.substring(1)}
          </h1>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
