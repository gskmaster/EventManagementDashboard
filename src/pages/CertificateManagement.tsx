import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { Award, Search, Calendar, MapPin, User, ChevronRight, Loader2 } from 'lucide-react';

export default function CertificateManagement() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetch = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'projects'), where('status', 'in', ['On Going', 'Done']))
        );
        setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetch();
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm) return projects;
    const q = searchTerm.toLowerCase();
    return projects.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.kabupaten?.toLowerCase().includes(q) ||
      p.pic?.toLowerCase().includes(q)
    );
  }, [projects, searchTerm]);

  const getStatusColor = (s: string) =>
    s === 'On Going' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800';

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Award className="w-6 h-6 text-indigo-600" />
              <h2 className="text-2xl font-bold text-slate-900">Certificate Management</h2>
            </div>
            <p className="text-slate-500">Generate dan kirim sertifikat kehadiran peserta per proyek.</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Cari proyek berdasarkan nama, PIC, atau kabupaten..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-slate-400">
            <Award className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Tidak ada proyek ditemukan.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(proj => (
              <button
                key={proj.id}
                onClick={() => navigate(`/certificate-management/${proj.id}`)}
                className="w-full bg-white rounded-xl border border-slate-200 px-6 py-5 flex items-center gap-4 hover:border-indigo-300 hover:shadow-sm transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-slate-900 truncate">{proj.name}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${getStatusColor(proj.status)}`}>
                      {proj.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{proj.startDate} – {proj.endDate}</span>
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{proj.kabupaten}</span>
                    <span className="flex items-center gap-1"><User className="w-3 h-3" />PIC: {proj.pic}</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
