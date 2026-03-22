import React from 'react';
import { useAuth } from '../components/AuthContext';
import Layout from '../components/Layout';
import { Link } from 'react-router-dom';
import {
  ClipboardCheck, Mic2, Building2, Users, Handshake, UserCheck, Award,
  CreditCard, Receipt, Map, Shield, UserPlus, LayoutDashboard, Mail,
} from 'lucide-react';

interface NavCard {
  to: string;
  icon: React.ElementType;
  color: string;
  iconColor: string;
  linkColor: string;
  label: string;
  description: string;
}

export default function Dashboard() {
  const { profile } = useAuth();

  const isAdmin = profile?.role === 'admin';
  const isEventManager = profile?.role === 'event_manager';
  const isFinance = profile?.role === 'finance';
  const isLO = profile?.role === 'lo';
  const isTaxAdmin = profile?.role === 'tax_admin';
  const isDPO = profile?.role === 'dpo';

  const sections: { label: string; items: (NavCard & { visible: boolean })[] }[] = [
    {
      label: 'Acara',
      items: [
        {
          to: '/projects',
          icon: ClipboardCheck,
          color: 'bg-indigo-100',
          iconColor: 'text-indigo-600',
          linkColor: 'text-indigo-600 hover:text-indigo-700',
          label: 'Proyek',
          description: 'Kelola proyek acara, jadwal, dan status.',
          visible: isAdmin || isEventManager,
        },
        {
          to: '/speakers',
          icon: Mic2,
          color: 'bg-violet-100',
          iconColor: 'text-violet-600',
          linkColor: 'text-violet-600 hover:text-violet-700',
          label: 'Narasumber',
          description: 'Kelola narasumber acara dan penugasan proyek.',
          visible: isAdmin || isEventManager,
        },
        {
          to: '/venues',
          icon: Building2,
          color: 'bg-sky-100',
          iconColor: 'text-sky-600',
          linkColor: 'text-sky-600 hover:text-sky-700',
          label: 'Venue',
          description: 'Kelola venue acara, kontak, dan brosur.',
          visible: isAdmin || isEventManager,
        },
        {
          to: '/attendance',
          icon: Users,
          color: 'bg-purple-100',
          iconColor: 'text-purple-600',
          linkColor: 'text-purple-600 hover:text-purple-700',
          label: 'Absensi',
          description: 'Pantau kehadiran peserta selama acara.',
          visible: isAdmin || isEventManager || isLO,
        },
        {
          to: '/liaison-officers',
          icon: Handshake,
          color: 'bg-teal-100',
          iconColor: 'text-teal-600',
          linkColor: 'text-teal-600 hover:text-teal-700',
          label: 'Liaison Officer',
          description: 'Kelola liaison officer dan penugasan proyek.',
          visible: isAdmin || isEventManager,
        },
        {
          to: '/ushers',
          icon: UserCheck,
          color: 'bg-cyan-100',
          iconColor: 'text-cyan-600',
          linkColor: 'text-cyan-600 hover:text-cyan-700',
          label: 'Usher',
          description: 'Kelola usher acara dan penugasan proyek.',
          visible: isAdmin || isEventManager,
        },
        {
          to: '/certificate-management',
          icon: Award,
          color: 'bg-amber-100',
          iconColor: 'text-amber-600',
          linkColor: 'text-amber-600 hover:text-amber-700',
          label: 'Sertifikat',
          description: 'Buat dan kelola sertifikat kehadiran peserta.',
          visible: isAdmin || isEventManager,
        },
      ],
    },
    {
      label: 'Keuangan & Legal',
      items: [
        {
          to: '/payments',
          icon: CreditCard,
          color: 'bg-green-100',
          iconColor: 'text-green-600',
          linkColor: 'text-green-600 hover:text-green-700',
          label: 'Pembayaran',
          description: 'Verifikasi dan kelola konfirmasi pembayaran.',
          visible: isAdmin || isFinance,
        },
        {
          to: '/tax-management',
          icon: Receipt,
          color: 'bg-orange-100',
          iconColor: 'text-orange-600',
          linkColor: 'text-orange-600 hover:text-orange-700',
          label: 'Manajemen Pajak',
          description: 'Kelola pajak honorarium usher, LO, dan narasumber.',
          visible: isAdmin || isEventManager || isTaxAdmin,
        },
      ],
    },
    {
      label: 'Utilitas',
      items: [
        {
          to: '/registration',
          icon: Map,
          color: 'bg-blue-100',
          iconColor: 'text-blue-600',
          linkColor: 'text-blue-600 hover:text-blue-700',
          label: 'Manajemen Wilayah',
          description: 'Kelola data kabupaten, kecamatan, dan desa.',
          visible: isAdmin,
        },
        {
          to: '/legal-management',
          icon: Shield,
          color: 'bg-rose-100',
          iconColor: 'text-rose-600',
          linkColor: 'text-rose-600 hover:text-rose-700',
          label: 'Manajemen Legal',
          description: 'Kelola syarat & ketentuan dan log persetujuan.',
          visible: isAdmin || isDPO,
        },
        {
          to: '/users',
          icon: UserPlus,
          color: 'bg-indigo-100',
          iconColor: 'text-indigo-600',
          linkColor: 'text-indigo-600 hover:text-indigo-700',
          label: 'Manajemen Pengguna',
          description: 'Kelola pengguna, peran, dan hak akses.',
          visible: isAdmin,
        },
        {
          to: '/email-templates',
          icon: Mail,
          color: 'bg-sky-100',
          iconColor: 'text-sky-600',
          linkColor: 'text-sky-600 hover:text-sky-700',
          label: 'Template Email',
          description: 'Kelola template email dinamis untuk proyek acara.',
          visible: isAdmin,
        },
      ],
    },
  ];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900">
            Selamat datang kembali, {profile?.displayName || 'Pengguna'}!
          </h2>
          <p className="text-slate-500 mt-1">
            Berikut ringkasan sistem manajemen acara.
          </p>
        </div>

        {sections.map((section) => {
          const visibleItems = section.items.filter(item => item.visible);
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.label} className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {section.label}
                </h3>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all group"
                  >
                    <div className="mb-4">
                      <div className={`w-11 h-11 ${item.color} rounded-xl flex items-center justify-center`}>
                        <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                      </div>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mb-1">{item.label}</h3>
                    <p className="text-slate-500 text-sm mb-4 leading-relaxed">{item.description}</p>
                    <span className={`text-sm font-medium ${item.linkColor}`}>
                      Buka {item.label} →
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
