import React, { useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';
import { Users, LogOut, CreditCard, ClipboardCheck, Map, Menu, X, UserPlus, Building2, Lock, UserCheck, Handshake, Receipt, Shield, Award, Mic2, LayoutDashboard, Mail } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, profile, logout } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);

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
      setCpError('Kata sandi baru tidak cocok.');
      return;
    }
    if (cpNewPassword.length < 6) {
      setCpError('Kata sandi minimal 6 karakter.');
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
        setCpError('Kata sandi saat ini tidak benar.');
      } else {
        setCpError(err.message || 'Gagal mengganti kata sandi.');
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
      className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        isActive(to)
          ? 'bg-indigo-50 text-indigo-700'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <Icon className={`w-4 h-4 mr-2.5 flex-shrink-0 ${isActive(to) ? 'text-indigo-600' : 'text-slate-400'}`} />
      {label}
    </Link>
  );

  const NavGroup = ({ label }: { label: string }) => (
    <p className="px-3 pt-4 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
      {label}
    </p>
  );

  const isAdmin = profile?.role === 'admin';
  const isEventManager = profile?.role === 'event_manager';
  const isFinance = profile?.role === 'finance';
  const isLO = profile?.role === 'lo';
  const isTaxAdmin = profile?.role === 'tax_admin';
  const isDPO = profile?.role === 'dpo';

  const pageLabels: Record<string, string> = {
    '/': 'Dashboard',
    '/projects': 'Proyek',
    '/speakers': 'Narasumber',
    '/venues': 'Venue',
    '/attendance': 'Absensi',
    '/ushers': 'Usher',
    '/liaison-officers': 'Liaison Officer',
    '/payments': 'Pembayaran',
    '/tax-management': 'Manajemen Pajak',
    '/registration': 'Manajemen Wilayah',
    '/legal-management': 'Manajemen Legal',
    '/users': 'Manajemen Pengguna',
    '/certificate-management': 'Manajemen Sertifikat',
    '/email-templates': 'Template Email',
  };

  const currentPageLabel = pageLabels[location.pathname] || location.pathname.substring(1);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-60 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Brand */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200">
          <Link to="/" className="flex items-center gap-2.5" onClick={() => setIsMobileMenuOpen(false)}>
            <img src="/favicon.png" alt="Eveniser" className="w-7 h-7 rounded-lg" />
            <span className="text-base font-bold text-slate-900">Eveniser</span>
          </Link>
          <button
            className="lg:hidden text-slate-400 hover:text-slate-600"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 py-3 px-3 overflow-y-auto">
          <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />

          {/* Acara */}
          {(isAdmin || isEventManager || isLO) && (
            <>
              <NavGroup label="Acara" />
              {(isAdmin || isEventManager) && (
                <NavItem to="/projects" icon={ClipboardCheck} label="Proyek" />
              )}
              {(isAdmin || isEventManager) && (
                <NavItem to="/speakers" icon={Mic2} label="Narasumber" />
              )}
              {(isAdmin || isEventManager) && (
                <NavItem to="/venues" icon={Building2} label="Venue" />
              )}
              {(isAdmin || isEventManager || isLO) && (
                <NavItem to="/attendance" icon={Users} label="Absensi" />
              )}
              {(isAdmin || isEventManager) && (
                <NavItem to="/liaison-officers" icon={Handshake} label="Liaison Officer" />
              )}
              {(isAdmin || isEventManager) && (
                <NavItem to="/ushers" icon={UserCheck} label="Usher" />
              )}
              {(isAdmin || isEventManager) && (
                <NavItem to="/certificate-management" icon={Award} label="Sertifikat" />
              )}
            </>
          )}

          {/* Keuangan & Legal */}
          {(isAdmin || isFinance || isTaxAdmin) && (
            <>
              <NavGroup label="Keuangan & Legal" />
              {(isAdmin || isFinance) && (
                <NavItem to="/payments" icon={CreditCard} label="Pembayaran" />
              )}
              {(isAdmin || isEventManager || isTaxAdmin) && (
                <NavItem to="/tax-management" icon={Receipt} label="Manajemen Pajak" />
              )}
            </>
          )}

          {/* Utilitas */}
          {(isAdmin || isDPO) && (
            <>
              <NavGroup label="Utilitas" />
              {isAdmin && (
                <NavItem to="/registration" icon={Map} label="Manajemen Wilayah" />
              )}
              {(isAdmin || isDPO) && (
                <NavItem to="/legal-management" icon={Shield} label="Manajemen Legal" />
              )}
              {isAdmin && (
                <NavItem to="/users" icon={UserPlus} label="Manajemen Pengguna" />
              )}
              {isAdmin && (
                <NavItem to="/email-templates" icon={Mail} label="Template Email" />
              )}
            </>
          )}
        </div>
      </div>

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowChangePasswordModal(false)} />
          <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Ganti Kata Sandi</h3>
            <p className="text-sm text-slate-500 mb-4">Perbarui kata sandi akun Anda.</p>

            {cpSuccess ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Lock className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-sm font-medium text-green-700 mb-4">Kata sandi berhasil diubah!</p>
                <button
                  onClick={() => setShowChangePasswordModal(false)}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
                >
                  Selesai
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kata Sandi Saat Ini</label>
                  <input
                    type="password"
                    required
                    value={cpCurrentPassword}
                    onChange={(e) => setCpCurrentPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kata Sandi Baru</label>
                  <input
                    type="password"
                    required
                    value={cpNewPassword}
                    onChange={(e) => setCpNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Konfirmasi Kata Sandi Baru</label>
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
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={cpLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center"
                  >
                    {cpLoading ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Menyimpan...</>
                    ) : 'Simpan Kata Sandi'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="lg:ml-60 flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 h-14 bg-white border-b border-slate-200 flex items-center px-4 sm:px-8">
          <button
            className="lg:hidden text-slate-500 hover:text-slate-700 mr-4"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold text-slate-800 truncate flex-1">
            {currentPageLabel}
          </h1>

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
              className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                {(profile?.displayName || profile?.email || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-semibold text-slate-900 leading-none mb-0.5">
                  {profile?.displayName || 'Pengguna'}
                </p>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider leading-none">
                  {profile?.role?.replace('_', ' ')}
                </p>
              </div>
              <Menu className={`w-4 h-4 text-slate-400 transition-transform ${isProfileDropdownOpen ? 'rotate-90' : ''}`} />
            </button>

            {isProfileDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsProfileDropdownOpen(false)} 
                />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 transform origin-top-right transition-all animate-in fade-in zoom-in duration-200">
                  <div className="px-4 py-3 border-b border-slate-100 sm:hidden">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {profile?.displayName || 'Pengguna'}
                    </p>
                    <p className="text-xs text-slate-500 truncate capitalize">
                      {profile?.role?.replace('_', ' ')}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                        openChangePassword();
                        setIsProfileDropdownOpen(false);
                    }}
                    className="w-full flex items-center px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Lock className="w-4 h-4 mr-3 text-slate-400" />
                    Ganti Kata Sandi
                  </button>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    onClick={logout}
                    className="w-full flex items-center px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4 mr-3" />
                    Keluar
                  </button>
                </div>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
