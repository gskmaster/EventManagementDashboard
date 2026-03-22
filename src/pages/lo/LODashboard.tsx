import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../components/AuthContext';
import { User, LogOut, ClipboardList, UserCheck, FileText } from 'lucide-react';
import KwitansiManagement from './KwitansiManagement';
import EditProfile from './EditProfile';
import EventReport from './EventReport';
import UsherAttendance from './UsherAttendance';

type Tab = 'kwitansi' | 'laporan' | 'attendance' | 'profile';

export default function LODashboard() {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();

  const role = profile?.role;
  const isUsher = role === 'usher';

  // Default tab: attendance for ushers, kwitansi for LO/admin
  const [activeTab, setActiveTab] = useState<Tab>(isUsher ? 'attendance' : 'kwitansi');

  const handleLogout = async () => {
    await logout();
    navigate('/lo-login');
  };

  type NavItem = { tab: Tab; label: string; shortLabel: string; icon: React.ReactNode };

  const navItems: NavItem[] = isUsher
    ? [
        {
          tab: 'attendance',
          label: 'Manajemen Absensi',
          shortLabel: 'Absensi',
          icon: <UserCheck className="w-5 h-5" />,
        },
        {
          tab: 'profile',
          label: 'Edit Profil',
          shortLabel: 'Profil',
          icon: <User className="w-5 h-5" />,
        },
      ]
    : [
        ...(role === 'lo' || role === 'admin' || !role
          ? [
              {
                tab: 'kwitansi' as Tab,
                label: 'Manajemen Kwitansi',
                shortLabel: 'Kwitansi',
                icon: <FileText className="w-5 h-5" />,
              },
            ]
          : []),
        {
          tab: 'laporan' as Tab,
          label: 'Laporan Kegiatan',
          shortLabel: 'Laporan',
          icon: <ClipboardList className="w-5 h-5" />,
        },
        {
          tab: 'profile' as Tab,
          label: 'Edit Profil',
          shortLabel: 'Profil',
          icon: <User className="w-5 h-5" />,
        },
      ];

  const activeItem = navItems.find(n => n.tab === activeTab) ?? navItems[0];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex md:w-64 flex-col bg-indigo-700 text-white fixed inset-y-0 left-0 z-20">
        {/* Brand */}
        <div className="px-6 py-5 border-b border-indigo-600/60">
          <div className="flex items-center gap-3">
            <img src="/favicon.png" alt="Eveniser" className="w-9 h-9 rounded-xl flex-shrink-0" />
            <div>
              <p className="font-bold text-sm leading-tight">Eveniser</p>
              <p className="text-xs text-indigo-300 capitalize">
                {isUsher ? 'Portal Usher' : 'Portal LO'}
              </p>
            </div>
          </div>
        </div>

        {/* User */}
        <div className="px-6 py-4 border-b border-indigo-600/60">
          <p className="text-xs text-indigo-300 mb-0.5">Selamat datang,</p>
          <p className="font-semibold text-sm leading-tight truncate">
            {profile?.displayName || user?.email}
          </p>
          <p className="text-xs text-indigo-300/80 truncate mt-0.5">{user?.email}</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ tab, label, icon }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-left ${
                activeTab === tab
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-indigo-200 hover:bg-indigo-600/60'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-indigo-600/60">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-indigo-200 hover:bg-indigo-600/60 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Keluar
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-h-screen md:ml-64">
        {/* Mobile header */}
        <header className="md:hidden bg-indigo-600 text-white px-4 py-3.5 flex items-center justify-between flex-shrink-0 shadow-md">
          <div>
            <p className="text-xs text-indigo-300">Selamat datang,</p>
            <h1 className="font-semibold text-base leading-tight">
              {profile?.displayName || user?.email}
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        {/* Mobile tab strip */}
        <div className="md:hidden bg-indigo-600 flex px-3 flex-shrink-0 overflow-x-auto">
          {navItems.map(({ tab, shortLabel }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-shrink-0 px-4 py-2 text-sm font-medium rounded-t-xl transition-colors ${
                activeTab === tab
                  ? 'bg-slate-50 text-indigo-700'
                  : 'text-indigo-200 hover:text-white'
              }`}
            >
              {shortLabel}
            </button>
          ))}
        </div>

        {/* Desktop page header */}
        <div className="hidden md:flex items-center bg-white border-b border-slate-200 px-8 py-5">
          <h1 className="text-xl font-bold text-slate-800">{activeItem.label}</h1>
        </div>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {activeTab === 'kwitansi' && <KwitansiManagement />}
          {activeTab === 'laporan' && <EventReport />}
          {activeTab === 'attendance' && <UsherAttendance />}
          {activeTab === 'profile' && <EditProfile />}
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden flex-shrink-0 bg-white border-t border-slate-200 flex fixed bottom-0 left-0 right-0 z-10">
          {navItems.map(({ tab, shortLabel, icon }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-xs font-medium transition-colors ${
                activeTab === tab ? 'text-indigo-600' : 'text-slate-400'
              }`}
            >
              {icon}
              {shortLabel}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
