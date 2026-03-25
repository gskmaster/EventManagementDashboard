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
  where,
  orderBy,
  Timestamp,
  getDoc
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'firebase/storage';
import Layout from '../components/Layout';
import { 
  Search, 
  Plus, 
  Filter, 
  Download, 
  MoreVertical, 
  Mail, 
  Phone, 
  Building2, 
  Award, 
  FileText,
  X,
  Loader2,
  Trash2,
  Edit2,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  User
} from 'lucide-react';
// Removed date-fns import to use native Intl instead

interface Speaker {
  id: string;
  nik: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  institution: string;
  expertise: string[];
  ktpUrl: string;
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
  bankName?: string;
  bankAccount?: string;
  bankBranch?: string;
  accountName?: string;
}

interface Project {
  id: string;
  name: string;
  status: string;
}

export default function Speakers() {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState<Speaker | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ktpPopupUrl, setKtpPopupUrl] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    nik: '',
    fullName: '',
    email: '',
    phoneNumber: '',
    institution: '',
    expertise: [] as string[],
    projectIds: [] as string[],
    bankName: '',
    bankAccount: '',
    bankBranch: '',
    accountName: '',
  });
  const [ktpFile, setKtpFile] = useState<File | null>(null);
  const [expertiseInput, setExpertiseInput] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const speakersQuery = query(collection(db, 'Speakers'), orderBy('createdAt', 'desc'));
      const speakersSnap = await getDocs(speakersQuery);
      const speakersList = speakersSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Speaker[];
      setSpeakers(speakersList);

      const projectsSnap = await getDocs(collection(db, 'projects'));
      const projectsList = projectsSnap.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        status: doc.data().status || 'Planning'
      }));
      setProjects(projectsList);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (speaker?: Speaker) => {
    if (speaker) {
      setEditingSpeaker(speaker);
      setFormData({
        nik: speaker.nik,
        fullName: speaker.fullName,
        email: speaker.email,
        phoneNumber: speaker.phoneNumber,
        institution: speaker.institution || '',
        expertise: speaker.expertise || [],
        projectIds: speaker.projectIds || [],
        bankName: speaker.bankName || '',
        bankAccount: speaker.bankAccount || '',
        bankBranch: speaker.bankBranch || '',
        accountName: speaker.accountName || '',
      });
    } else {
      setEditingSpeaker(null);
      setFormData({
        nik: '',
        fullName: '',
        email: '',
        phoneNumber: '',
        institution: '',
        expertise: [],
        projectIds: [],
        bankName: '',
        bankAccount: '',
        bankBranch: '',
        accountName: '',
      });
    }
    setKtpFile(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSpeaker(null);
  };

  const handleAddExpertise = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && expertiseInput.trim()) {
      e.preventDefault();
      if (!formData.expertise.includes(expertiseInput.trim())) {
        setFormData({
          ...formData,
          expertise: [...formData.expertise, expertiseInput.trim()]
        });
      }
      setExpertiseInput('');
    }
  };

  const removeExpertise = (tag: string) => {
    setFormData({
      ...formData,
      expertise: formData.expertise.filter(t => t !== tag)
    });
  };

  const handleProjectToggle = (projectId: string) => {
    const updatedProjects = formData.projectIds.includes(projectId)
      ? formData.projectIds.filter(id => id !== projectId)
      : [...formData.projectIds, projectId];
    setFormData({ ...formData, projectIds: updatedProjects });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      let ktpUrl = editingSpeaker?.ktpUrl || '';

      if (ktpFile) {
        const storageRef = ref(storage, `ktp/${Date.now()}_${ktpFile.name}`);
        const uploadResult = await uploadBytes(storageRef, ktpFile);
        ktpUrl = await getDownloadURL(uploadResult.ref);
      }

      const now = new Date().toISOString();
      const speakerData = {
        ...formData,
        ktpUrl,
        updatedAt: now,
      };

      if (editingSpeaker) {
        await updateDoc(doc(db, 'Speakers', editingSpeaker.id), speakerData);
      } else {
        await addDoc(collection(db, 'Speakers'), {
          ...speakerData,
          createdAt: now,
          createdBy: auth.currentUser?.email || '',
        });
      }

      handleCloseModal();
      fetchData();
    } catch (error) {
      console.error('Error saving speaker:', error);
      alert('Gagal menyimpan narasumber. Silakan periksa konsol untuk detail.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus narasumber ini? Tindakan ini tidak dapat dibatalkan.')) {
      try {
        await deleteDoc(doc(db, 'Speakers', id));
        fetchData();
      } catch (error) {
        console.error('Error deleting speaker:', error);
      }
    }
  };

  const filteredSpeakers = speakers.filter(s =>
    s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.nik.includes(searchTerm)
  );

  const handleExport = () => {
    const rows = filteredSpeakers.map((s, i) => ({
      'No.': i + 1,
      'Nama Lengkap': s.fullName,
      'NIK': s.nik,
      'Email': s.email,
      'No. Telepon': s.phoneNumber,
      'Institusi': s.institution || '',
      'Keahlian': (s.expertise || []).join(', '),
      'Nama Bank': s.bankName || '',
      'No. Rekening': s.bankAccount || '',
      'Cabang Bank': s.bankBranch || '',
      'Nama Pemilik Rekening': s.accountName || '',
      'Jumlah Proyek': s.projectIds?.length || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Narasumber');
    XLSX.writeFile(wb, `narasumber_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Manajemen Narasumber</h1>
          <p className="text-slate-500">Kelola narasumber acara, keahlian, dan penugasan proyek.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleExport} className="flex items-center px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium">
            <Download className="w-4 h-4 mr-2" />
            Ekspor
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium"
          >
            <Plus className="w-4 h-4 mr-2" />
            Tambah Narasumber
          </button>
        </div>
      </div>

      {/* Registration Link */}
      <div className="mb-8 bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex items-center mb-3">
          <ExternalLink className="w-5 h-5 text-indigo-600 mr-2" />
          <h2 className="text-sm font-bold text-indigo-900">Tautan Pendaftaran Narasumber</h2>
        </div>
        <div className="flex items-center justify-between text-[11px] text-indigo-600 font-mono bg-white px-3 py-2 rounded-lg border border-indigo-100 shadow-sm overflow-hidden">
          <span className="truncate mr-2">{window.location.origin}/register-speaker</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/register-speaker`);
              alert('Tautan disalin ke clipboard!');
            }}
            className="flex-shrink-0 hover:text-indigo-800 font-bold underline"
          >
            Copy
          </button>
        </div>
      </div>

        {/* Filters/Search Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama, email, atau NIK..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </button>
            <button onClick={handleExport} className="inline-flex items-center px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium">
              <Download className="w-4 h-4 mr-2" />
              Ekspor
            </button>
          </div>
        </div>

        {/* Speakers List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
              <p className="text-slate-500 text-sm">Memuat narasumber...</p>
            </div>
          ) : filteredSpeakers.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-medium text-slate-900">Tidak ada narasumber ditemukan</h3>
              <p className="text-slate-500 mt-1 max-w-sm mx-auto">
                {searchTerm ? (
                  <span>Tidak ada hasil untuk pencarian saat ini.</span>
                ) : (
                  "Mulai dengan menambahkan narasumber pertama Anda."
                )}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Informasi Narasumber</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Kontak & Institusi</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Keahlian</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Proyek</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 italic">
                  {filteredSpeakers.map((speaker) => (
                    <tr key={speaker.id} className="hover:bg-slate-50/50 transition-colors not-italic">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center mr-3 text-indigo-700 font-bold">
                            {speaker.fullName.charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{speaker.fullName}</div>
                            <div className="text-xs text-slate-500 mt-1 flex items-center">
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded mr-2 font-mono">{speaker.nik}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-600 flex flex-col gap-1.5">
                          <div className="flex items-center">
                            <Mail className="w-3.5 h-3.5 mr-2 text-slate-400" />
                            {speaker.email}
                          </div>
                          <div className="flex items-center">
                            <Phone className="w-3.5 h-3.5 mr-2 text-slate-400" />
                            {speaker.phoneNumber}
                          </div>
                          <div className="flex items-center italic text-indigo-600 font-medium">
                            <Building2 className="w-3.5 h-3.5 mr-2 text-indigo-400" />
                            {speaker.institution || 'Tidak ada institusi'}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                          {speaker.expertise.length > 0 ? speaker.expertise.map((tag, idx) => (
                            <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 uppercase tracking-tight">
                              {tag}
                            </span>
                          )) : (
                            <span className="text-xs text-slate-400 italic">Belum ada keahlian</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-600">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-xs">
                            {speaker.projectIds?.length || 0} Proyek
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end space-x-2">
                          {speaker.ktpUrl && (
                            <button
                              onClick={() => setKtpPopupUrl(speaker.ktpUrl)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="View KTP"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenModal(speaker)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(speaker.id)}
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

      {/* Speaker Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto px-4 py-8">
          <div className="fixed inset-0 bg-slate-900/60 transition-opacity" onClick={handleCloseModal} />
          
          <div className="relative mx-auto max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-xl font-bold text-slate-900">
                {editingSpeaker ? 'Edit Narasumber' : 'Daftarkan Narasumber Baru'}
              </h2>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors text-right">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Personal Info */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center">
                    <User className="w-3 h-3 mr-2" /> Informasi Pribadi
                  </h3>
                  
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">NIK*</label>
                    <input
                      required
                      type="text"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      value={formData.nik}
                      onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nama Lengkap*</label>
                    <input
                      required
                      type="text"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-semibold"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Alamat Email*</label>
                    <input
                      required
                      type="email"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nomor Telepon*</label>
                    <input
                      required
                      type="text"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    />
                  </div>
                </div>

                {/* Professional Info */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center">
                    <Award className="w-3 h-3 mr-2" /> Detail Profesional
                  </h3>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Institusi</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm italic font-medium text-indigo-700"
                      value={formData.institution}
                      onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Keahlian (Tekan Enter)</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      value={expertiseInput}
                      onChange={(e) => setExpertiseInput(e.target.value)}
                      onKeyDown={handleAddExpertise}
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {formData.expertise.map((tag, idx) => (
                        <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 uppercase">
                          {tag}
                          <button 
                            type="button" 
                            onClick={() => removeExpertise(tag)}
                            className="ml-1 hover:text-indigo-900"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Unggah KTP (PDF/Gambar)</label>
                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-200 border-dashed rounded-xl hover:border-indigo-400 transition-colors group cursor-pointer relative">
                      <div className="space-y-1 text-center">
                        <FileText className="mx-auto h-12 w-12 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                        <div className="flex text-sm text-slate-600">
                          <label className="relative cursor-pointer rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none">
                            <span>{ktpFile ? ktpFile.name : 'Unggah KTP'}</span>
                            <input
                              type="file"
                              className="sr-only"
                              accept="image/*,application/pdf"
                              onChange={(e) => setKtpFile(e.target.files?.[0] || null)}
                            />
                          </label>
                        </div>
                        <p className="text-xs text-slate-500">PNG, JPG, PDF hingga 5MB</p>
                      </div>
                    </div>
                    {editingSpeaker?.ktpUrl && !ktpFile && (
                      <p className="text-xs text-emerald-600 mt-2 flex items-center">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> File KTP sudah tersimpan
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Bank Info */}
              <div className="space-y-4 pt-4 border-t border-slate-100 text-left">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center">
                  <Award className="w-3 h-3 mr-2" /> Informasi Rekening Bank
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nama Bank</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm uppercase"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      placeholder="contoh: BCA, Mandiri"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nomor Rekening</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      value={formData.bankAccount}
                      onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                      placeholder="Nomor Rekening"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cabang Bank</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      value={formData.bankBranch}
                      onChange={(e) => setFormData({ ...formData, bankBranch: e.target.value })}
                      placeholder="Nama Cabang"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nama Pemilik Rekening</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-semibold"
                      value={formData.accountName}
                      onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                      placeholder="Sesuai buku tabungan"
                    />
                  </div>
                </div>
              </div>

              {/* Project Assignment */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center">
                   Penugasan Proyek (Perencanaan & Berjalan)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2">
                  {projects
                    .filter(p => p.status === 'Planning' || p.status === 'On Going')
                    .map((project) => (
                    <div 
                      key={project.id}
                      onClick={() => handleProjectToggle(project.id)}
                      className={`flex items-center p-3 rounded-xl border transition-all cursor-pointer ${
                        formData.projectIds.includes(project.id)
                          ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center mr-3 transition-colors ${
                        formData.projectIds.includes(project.id) ? 'bg-indigo-600' : 'border border-slate-300'
                      }`}>
                        {formData.projectIds.includes(project.id) && <CheckCircle2 className="w-3" />}
                      </div>
                      <span className={`text-sm font-medium ${
                        formData.projectIds.includes(project.id) ? 'text-indigo-900' : 'text-slate-600'
                      }`}>
                        {project.name}
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                          project.status === 'Planning' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {project.status}
                        </span>
                      </span>
                    </div>
                  ))}
                  {projects.filter(p => p.status === 'Planning' || p.status === 'On Going').length === 0 && (
                    <div className="col-span-2 text-center py-4 text-slate-400 text-sm italic">
                      Tidak ada proyek aktif
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-6 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium transition-all text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-semibold shadow-md disabled:bg-indigo-400 text-sm"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin text-right" />
                      Menyimpan...
                    </>
                  ) : editingSpeaker ? 'Perbarui Narasumber' : 'Daftarkan Narasumber'}
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
                <FileText className="w-4 h-4 text-indigo-600" /> Dokumen KTP
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
