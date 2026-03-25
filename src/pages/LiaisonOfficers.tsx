import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { db, storage, auth } from '../firebase';
import {
  collection,
  query,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  orderBy,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Layout from '../components/Layout';
import {
  Search,
  Plus,
  Download,
  FileText,
  X,
  Loader2,
  Trash2,
  Edit2,
  CheckCircle2,
  ExternalLink,
  User,
  Mail,
  Phone,
} from 'lucide-react';

interface LiaisonOfficer {
  id: string;
  fullName: string;
  nik: string;
  mobilePhone: string;
  email: string;
  ktpUrl?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  bankBranch?: string;
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
  status: string;
}

const emptyForm = {
  fullName: '',
  nik: '',
  mobilePhone: '',
  email: '',
  bankName: '',
  accountNumber: '',
  accountName: '',
  bankBranch: '',
  projectIds: [] as string[],
};

export default function LiaisonOfficers() {
  const [officers, setOfficers] = useState<LiaisonOfficer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState<LiaisonOfficer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ ...emptyForm });
  const [ktpFile, setKtpFile] = useState<File | null>(null);
  const [ktpPopupUrl, setKtpPopupUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const loSnap = await getDocs(query(collection(db, 'liaison_officers'), orderBy('createdAt', 'desc')));
      setOfficers(loSnap.docs.map(d => ({ id: d.id, ...d.data() })) as LiaisonOfficer[]);

      const projectsSnap = await getDocs(collection(db, 'projects'));
      setProjects(projectsSnap.docs.map(d => ({
        id: d.id,
        name: (d.data() as any).name,
        status: (d.data() as any).status || 'Planning',
      })));
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (officer?: LiaisonOfficer) => {
    if (officer) {
      setEditingOfficer(officer);
      setFormData({
        fullName: officer.fullName,
        nik: officer.nik,
        mobilePhone: officer.mobilePhone,
        email: officer.email,
        bankName: officer.bankName || '',
        accountNumber: officer.accountNumber || '',
        accountName: officer.accountName || '',
        bankBranch: officer.bankBranch || '',
        projectIds: officer.projectIds || [],
      });
    } else {
      setEditingOfficer(null);
      setFormData({ ...emptyForm });
    }
    setKtpFile(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingOfficer(null);
  };

  const handleProjectToggle = (projectId: string) => {
    const updated = formData.projectIds.includes(projectId)
      ? formData.projectIds.filter(id => id !== projectId)
      : [...formData.projectIds, projectId];
    setFormData({ ...formData, projectIds: updated });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      let ktpUrl = editingOfficer?.ktpUrl || '';

      if (ktpFile) {
        const storageRef = ref(storage, `ktp_lo/${Date.now()}_${ktpFile.name}`);
        const uploadResult = await uploadBytes(storageRef, ktpFile);
        ktpUrl = await getDownloadURL(uploadResult.ref);
      }

      const now = new Date().toISOString();
      const data = { ...formData, ktpUrl, updatedAt: now };

      if (editingOfficer) {
        await updateDoc(doc(db, 'liaison_officers', editingOfficer.id), data);
      } else {
        await addDoc(collection(db, 'liaison_officers'), { ...data, createdAt: now, createdBy: auth.currentUser?.email || '' });
      }

      handleCloseModal();
      fetchData();
    } catch (error) {
      console.error('Error saving liaison officer:', error);
      alert('Gagal menyimpan liaison officer. Silakan periksa konsol untuk detail.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus liaison officer ini? Tindakan ini tidak dapat dibatalkan.')) {
      try {
        await deleteDoc(doc(db, 'liaison_officers', id));
        fetchData();
      } catch (error) {
        console.error('Error deleting liaison officer:', error);
      }
    }
  };

  const filtered = officers.filter(o =>
    o.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.nik.includes(searchTerm)
  );

  const handleExport = () => {
    const rows = filtered.map((o, i) => ({
      'No.': i + 1,
      'Nama Lengkap': o.fullName,
      'NIK': o.nik,
      'Email': o.email,
      'No. HP': o.mobilePhone,
      'Nama Bank': o.bankName || '',
      'No. Rekening': o.accountNumber || '',
      'Nama Pemilik Rekening': o.accountName || '',
      'Cabang Bank': o.bankBranch || '',
      'Jumlah Proyek': o.projectIds?.length || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Liaison Officer');
    XLSX.writeFile(wb, `liaison_officer_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Manajemen Liaison Officer</h1>
            <p className="text-slate-500">Kelola liaison officer dan penugasan proyek.</p>
          </div>
          <button onClick={handleExport} className="flex items-center px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium">
            <Download className="w-4 h-4 mr-2" />
            Ekspor
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors shadow-sm font-medium"
          >
            <Plus className="w-4 h-4 mr-2" />
            Tambah LO
          </button>
        </div>

        {/* Registration Link */}
        <div className="mb-2 bg-teal-50 border border-teal-100 rounded-xl p-4">
          <div className="flex items-center mb-2">
            <ExternalLink className="w-5 h-5 text-teal-600 mr-2" />
            <h2 className="text-sm font-bold text-teal-900">Link Pendaftaran Liaison Officer</h2>
          </div>
          <p className="text-xs text-slate-500 mb-3">Bagikan link berikut agar calon Liaison Officer dapat mendaftarkan diri secara mandiri.</p>
          <div className="bg-white flex items-center justify-between text-[11px] text-teal-600 font-mono px-3 py-2 rounded-lg border border-teal-200 overflow-hidden">
            <span className="truncate mr-2">{window.location.origin}/register-lo</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/register-lo`);
                alert('Link berhasil disalin!');
              }}
              className="flex-shrink-0 hover:text-teal-800 font-bold underline"
            >
              Salin
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama, email, atau NIK..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-teal-600 animate-spin mb-4" />
              <p className="text-slate-500 text-sm">Memuat liaison officer...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-medium text-slate-900">Tidak ada liaison officer ditemukan</h3>
              <p className="text-slate-500 mt-1">
                {searchTerm ? 'Tidak ada hasil untuk pencarian Anda.' : 'Mulai dengan menambahkan liaison officer pertama Anda.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Liaison Officer</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Kontak</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Bank</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Proyek Berlangsung</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(officer => (
                    <tr key={officer.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center mr-3 text-teal-700 font-bold">
                            {officer.fullName.charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{officer.fullName}</div>
                            <div className="text-xs text-slate-500 mt-0.5 font-mono">{officer.nik}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-600 flex flex-col gap-1">
                          <div className="flex items-center"><Mail className="w-3.5 h-3.5 mr-2 text-slate-400" />{officer.email}</div>
                          <div className="flex items-center"><Phone className="w-3.5 h-3.5 mr-2 text-slate-400" />{officer.mobilePhone}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {officer.bankName ? (
                          <div>
                            <div className="font-medium uppercase">{officer.bankName}</div>
                            <div className="text-xs text-slate-500">{officer.accountNumber}</div>
                          </div>
                        ) : <span className="text-slate-400 italic text-xs">Not provided</span>}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 font-bold text-xs">
                          {officer.projectIds?.length || 0} Proyek
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end space-x-2">
                          {officer.ktpUrl && (
                            <button
                              onClick={() => setKtpPopupUrl(officer.ktpUrl)}
                              className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                              title="View KTP"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenModal(officer)}
                            className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(officer.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto px-4 py-8">
          <div className="fixed inset-0 bg-slate-900/60 transition-opacity" onClick={handleCloseModal} />
          <div className="relative mx-auto max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-xl font-bold text-slate-900">
                {editingOfficer ? 'Edit Liaison Officer' : 'Daftarkan Liaison Officer Baru'}
              </h2>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Personal Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center">
                    <User className="w-3 h-3 mr-2" /> Informasi Pribadi
                  </h3>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nama Lengkap*</label>
                    <input required type="text"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-semibold"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">NIK*</label>
                    <input required type="text"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-mono"
                      value={formData.nik}
                      onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nomor HP*</label>
                    <input required type="tel"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                      value={formData.mobilePhone}
                      onChange={(e) => setFormData({ ...formData, mobilePhone: e.target.value })}
                      placeholder="contoh: 08123456789"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email*</label>
                    <input required type="email"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>

                {/* KTP Upload */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center">
                    <FileText className="w-3 h-3 mr-2" /> Dokumen KTP
                  </h3>
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-200 border-dashed rounded-xl hover:border-teal-400 transition-colors group cursor-pointer">
                    <div className="space-y-1 text-center">
                      <FileText className="mx-auto h-12 w-12 text-slate-400 group-hover:text-teal-500 transition-colors" />
                      <div className="flex text-sm text-slate-600">
                        <label className="relative cursor-pointer rounded-md font-medium text-teal-600 hover:text-teal-500">
                          <span>{ktpFile ? ktpFile.name : 'Unggah KTP'}</span>
                          <input type="file" className="sr-only" accept="image/*,application/pdf"
                            onChange={(e) => setKtpFile(e.target.files?.[0] || null)} />
                        </label>
                      </div>
                      <p className="text-xs text-slate-500">PNG, JPG, PDF hingga 5MB</p>
                    </div>
                  </div>
                  {editingOfficer?.ktpUrl && !ktpFile && (
                    <p className="text-xs text-emerald-600 flex items-center">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> File KTP sudah tersimpan
                    </p>
                  )}
                </div>
              </div>

              {/* Bank Info */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Informasi Rekening Bank</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nama Bank</label>
                    <input type="text"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm uppercase"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      placeholder="contoh: BCA, Mandiri"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nomor Rekening</label>
                    <input type="text"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nama Pemilik Rekening</label>
                    <input type="text"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-semibold"
                      value={formData.accountName}
                      onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                      placeholder="Sesuai buku tabungan"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cabang Bank</label>
                    <input type="text"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                      value={formData.bankBranch}
                      onChange={(e) => setFormData({ ...formData, bankBranch: e.target.value })}
                      placeholder="Nama Cabang"
                    />
                  </div>
                </div>
              </div>

              {/* Project Assignment */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Penugasan Proyek (Perencanaan & Berjalan)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2">
                  {projects.filter(p => p.status === 'Planning' || p.status === 'On Going').map(project => (
                    <div
                      key={project.id}
                      onClick={() => handleProjectToggle(project.id)}
                      className={`flex items-center p-3 rounded-xl border transition-all cursor-pointer ${
                        formData.projectIds.includes(project.id)
                          ? 'bg-teal-50 border-teal-200 ring-1 ring-teal-200'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center mr-3 transition-colors ${
                        formData.projectIds.includes(project.id) ? 'bg-teal-600' : 'border border-slate-300'
                      }`}>
                        {formData.projectIds.includes(project.id) && <CheckCircle2 className="w-3 text-white" />}
                      </div>
                      <span className={`text-sm font-medium ${formData.projectIds.includes(project.id) ? 'text-teal-900' : 'text-slate-600'}`}>
                        {project.name}
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                          project.status === 'Planning' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                        }`}>{project.status}</span>
                      </span>
                    </div>
                  ))}
                  {projects.filter(p => p.status === 'Planning' || p.status === 'On Going').length === 0 && (
                    <div className="col-span-2 text-center py-4 text-slate-400 text-sm italic">Tidak ada proyek aktif</div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={handleCloseModal}
                  className="px-6 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium text-sm">
                  Batal
                </button>
                <button type="submit" disabled={submitting}
                  className="inline-flex items-center px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-semibold shadow-md disabled:bg-teal-400 text-sm">
                  {submitting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</>) : editingOfficer ? 'Perbarui LO' : 'Daftarkan LO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* KTP Popup */}
      {ktpPopupUrl && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-slate-900/70" onClick={() => setKtpPopupUrl(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden max-w-2xl w-full">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" /> Dokumen KTP
              </h2>
              <button onClick={() => setKtpPopupUrl(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              {ktpPopupUrl.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i) ? (
                <img src={ktpPopupUrl} alt="KTP" className="w-full rounded-lg object-contain max-h-[70vh]" />
              ) : (
                <iframe src={ktpPopupUrl} className="w-full h-[70vh] rounded-lg" title="KTP Document" />
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
