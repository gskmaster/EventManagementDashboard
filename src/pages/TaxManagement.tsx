import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import Layout from '../components/Layout';
import {
  Calendar, MapPin, User, Building2, ChevronRight, ChevronLeft,
  Search, FileText, Loader2,
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  venue: string;
  pic: string;
  kabupaten: string;
  status: string;
}

export default function TaxManagement() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  useEffect(() => {
    const fetchProjects = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'projects'));
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Project));
        setProjects(all.filter(p => p.status === 'On Going' || p.status === 'Done'));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchProjects();
  }, []);

  const filtered = projects.filter(p =>
    (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.kabupaten || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.pic || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusColor = (status: string) => {
    if (status === 'On Going') return 'bg-amber-100 text-amber-800';
    if (status === 'Done') return 'bg-green-100 text-green-800';
    return 'bg-slate-100 text-slate-800';
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto pb-12">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Tax Management</h1>
          <p className="text-slate-500 text-sm mt-1">Kelola dokumen pajak honorarium untuk setiap proyek.</p>
        </div>

        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Cari proyek, lokasi, atau PIC..."
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-slate-400">
            <FileText className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">Tidak ada proyek ditemukan</p>
            <p className="text-xs mt-1">Hanya proyek berstatus On Going dan Done yang ditampilkan.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              {paginated.map(project => (
              <div
                key={project.id}
                onClick={() => navigate(`/tax-management/${project.id}`)}
                className="bg-white rounded-xl border border-slate-200 px-6 py-5 hover:shadow-md hover:border-indigo-300 cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base font-bold text-slate-900 truncate">{project.name}</h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex-shrink-0 ${getStatusColor(project.status)}`}>
                        {project.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />{project.startDate} – {project.endDate}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />{project.kabupaten}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" />{project.venue || '—'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />PIC: {project.pic}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 flex-shrink-0 transition-colors" />
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white px-6 py-4 rounded-xl border border-slate-200 mt-6 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Halaman {currentPage} dari {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="p-2 hover:bg-slate-50 rounded-lg border border-slate-200 disabled:opacity-30 transition-all group"
                >
                  <ChevronLeft className="w-5 h-5 text-slate-600 group-hover:text-indigo-600" />
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="p-2 hover:bg-slate-50 rounded-lg border border-slate-200 disabled:opacity-30 transition-all group"
                >
                  <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-indigo-600" />
                </button>
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </Layout>
  );
}
