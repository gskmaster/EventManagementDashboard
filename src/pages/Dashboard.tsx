import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthContext';
import Layout from '../components/Layout';
import { Calendar, Users, Building, CreditCard, ClipboardCheck } from 'lucide-react';

export default function Dashboard() {
  const { profile } = useAuth();
  
  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900">
            Welcome back, {profile?.displayName || 'User'}!
          </h2>
          <p className="text-slate-500 mt-1">
            Here's an overview of the event management system.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {(profile?.role === 'admin') && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Building className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Region Management</h3>
              <p className="text-slate-500 text-sm mb-4">Manage kabupaten, kecamatan, and desa data.</p>
              <a href="/registration" className="text-blue-600 font-medium text-sm hover:text-blue-700">Go to Region Management →</a>
            </div>
          )}

          {(profile?.role === 'admin' || profile?.role === 'finance') && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Payments</h3>
              <p className="text-slate-500 text-sm mb-4">Verify and manage payment confirmations.</p>
              <a href="/payments" className="text-green-600 font-medium text-sm hover:text-green-700">Go to Payments →</a>
            </div>
          )}

          {(profile?.role === 'admin' || profile?.role === 'event_manager' || profile?.role === 'lo') && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <ClipboardCheck className="w-6 h-6 text-purple-600" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Attendance</h3>
              <p className="text-slate-500 text-sm mb-4">Track participant attendance during the event.</p>
              <a href="/attendance" className="text-purple-600 font-medium text-sm hover:text-purple-700">Go to Attendance →</a>
            </div>
          )}

          {(profile?.role === 'admin') && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">User Management</h3>
              <p className="text-slate-500 text-sm mb-4">Manage users, roles, and access permissions.</p>
              <a href="/users" className="text-indigo-600 font-medium text-sm hover:text-indigo-700">Go to User Management →</a>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}
