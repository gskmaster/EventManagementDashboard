import React, { useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { Calendar, Users, LogOut, CreditCard, ClipboardCheck, Map, Menu, X, UserPlus } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { profile, logout } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

          {(profile?.role === 'admin') && (
            <NavItem to="/registration" icon={Map} label="Region Management" />
          )}
          
          {(profile?.role === 'admin' || profile?.role === 'finance') && (
            <NavItem to="/payments" icon={CreditCard} label="Payments" />
          )}

          {(profile?.role === 'admin' || profile?.role === 'event_manager' || profile?.role === 'lo') && (
            <NavItem to="/attendance" icon={Users} label="Attendance" />
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
            onClick={logout}
            className="w-full flex items-center px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </button>
        </div>
      </div>

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
