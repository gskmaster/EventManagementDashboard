import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  getDocs,
  where,
  addDoc,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { useAuth } from '../../components/AuthContext';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Upload,
  Check,
  Camera,
  Loader2,
  X,
  FileCheck,
  ExternalLink,
} from 'lucide-react';
import PreviewModal from '../../components/PreviewModal';

interface LiaisonOfficer {
  id: string;
  fullName: string;
  email: string;
  mobilePhone: string;
  projectIds: string[];
}

interface Project {
  id: string;
  name: string;
  status: string;
  kabupaten: string;
}

interface Person {
  id: string;
  fullName: string;
  nik: string;
  mobilePhone: string;
  attendanceStatus: string;
}

interface KwitansiUpload {
  id: string;
  personId: string;
  kwitansiUrl: string;
}

export default function KwitansiManagement() {
  const { user } = useAuth();

  const [loProfile, setLoProfile] = useState<LiaisonOfficer | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [persons, setPersons] = useState<Person[]>([]);
  const [kwitansiMap, setKwitansiMap] = useState<Record<string, KwitansiUpload>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingPersons, setLoadingPersons] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'uploaded' | 'missing'>('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPersonIdRef = useRef<string | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (user?.email) fetchLOProfile();
  }, [user]);

  const fetchLOProfile = async () => {
    setLoadingProjects(true);
    try {
      const q = query(
        collection(db, 'liaison_officers'),
        where('email', '==', user!.email!.toLowerCase())
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setLoadingProjects(false);
        return;
      }
      const loDoc = snap.docs[0];
      const lo = { id: loDoc.id, ...loDoc.data() } as LiaisonOfficer;
      setLoProfile(lo);
      await fetchProjects(lo.projectIds || []);
    } catch (err) {
      console.error(err);
      showToast('Gagal memuat data profil', 'error');
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchProjects = async (projectIds: string[]) => {
    if (!projectIds.length) return;
    try {
      const results: Project[] = [];
      const chunks: string[][] = [];
      for (let i = 0; i < projectIds.length; i += 30) {
        chunks.push(projectIds.slice(i, i + 30));
      }
      for (const chunk of chunks) {
        const q = query(collection(db, 'projects'), where('__name__', 'in', chunk));
        const snap = await getDocs(q);
        snap.docs.forEach(d => results.push({ id: d.id, ...d.data() } as Project));
      }
      setProjects(results);
    } catch (err) {
      console.error(err);
      showToast('Gagal memuat daftar proyek', 'error');
    }
  };

  const handleSelectProject = async (project: Project) => {
    setSelectedProject(project);
    setSearchTerm('');
    setFilterStatus('all');
    setPersons([]);
    setKwitansiMap({});
    setLoadingPersons(true);
    try {
      await fetchPersonsAndKwitansi(project);
    } finally {
      setLoadingPersons(false);
    }
  };

  const fetchPersonsAndKwitansi = async (project: Project) => {
    const personQ = query(
      collection(db, 'persons'),
      where('projectId', '==', project.id),
      where('attendanceStatus', '==', 'present')
    );
    const personSnap = await getDocs(personQ);
    const personData = personSnap.docs.map(d => ({ id: d.id, ...d.data() } as Person));
    setPersons(personData);

    const kwQ = query(
      collection(db, 'kwitansi_uploads'),
      where('projectId', '==', project.id)
    );
    const kwSnap = await getDocs(kwQ);
    const kwMap: Record<string, KwitansiUpload> = {};
    kwSnap.docs.forEach(d => {
      const data = d.data() as any;
      kwMap[data.personId] = {
        id: d.id,
        personId: data.personId,
        kwitansiUrl: data.kwitansiUrl,
      };
    });
    setKwitansiMap(kwMap);
  };

  const handleUploadClick = (personId: string) => {
    pendingPersonIdRef.current = personId;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const personId = pendingPersonIdRef.current;
    if (!file || !personId || !selectedProject || !user) return;

    pendingPersonIdRef.current = null;
    e.target.value = '';
    setUploadingId(personId);

    try {
      const timestamp = Date.now();
      const ext = file.name.split('.').pop() || 'jpg';
      const storageRef = ref(
        storage,
        `kwitansi/${selectedProject.id}/${personId}_${timestamp}.${ext}`
      );
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      const now = new Date().toISOString();
      const existing = kwitansiMap[personId];

      if (existing) {
        await updateDoc(doc(db, 'kwitansi_uploads', existing.id), {
          kwitansiUrl: downloadUrl,
          updatedAt: now,
        });
        setKwitansiMap(prev => ({
          ...prev,
          [personId]: { ...existing, kwitansiUrl: downloadUrl },
        }));
      } else {
        const person = persons.find(p => p.id === personId);
        const docRef = await addDoc(collection(db, 'kwitansi_uploads'), {
          projectId: selectedProject.id,
          personId,
          personName: person?.fullName || '',
          loEmail: user.email,
          loId: loProfile?.id || '',
          kwitansiUrl: downloadUrl,
          createdAt: now,
          updatedAt: now,
        });
        setKwitansiMap(prev => ({
          ...prev,
          [personId]: { id: docRef.id, personId, kwitansiUrl: downloadUrl },
        }));
      }

      showToast('Kwitansi berhasil diunggah', 'success');
    } catch (err) {
      console.error(err);
      showToast('Gagal mengunggah kwitansi', 'error');
    } finally {
      setUploadingId(null);
    }
  };

  const uploadedCount = Object.keys(kwitansiMap).length;
  const missingCount = persons.length - uploadedCount;

  const filteredPersons = persons.filter(p => {
    const matchesSearch =
      p.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.nik?.includes(searchTerm) ||
      p.mobilePhone?.includes(searchTerm);
    if (!matchesSearch) return false;
    if (filterStatus === 'uploaded') return !!kwitansiMap[p.id];
    if (filterStatus === 'missing') return !kwitansiMap[p.id];
    return true;
  });

  // ── Project list view ──
  if (!selectedProject) {
    if (loadingProjects) {
      return (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      );
    }

    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <p className="text-sm text-slate-500 mb-6">
          Pilih proyek untuk melihat peserta yang sudah check-in dan mengunggah kwitansi.
        </p>

        {projects.length === 0 ? (
          <div className="text-center py-20">
            <FileCheck className="w-14 h-14 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">Belum ada proyek yang ditugaskan</p>
            <p className="text-slate-400 text-xs mt-1">Hubungi admin untuk penugasan proyek</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => (
              <button
                key={project.id}
                onClick={() => handleSelectProject(project)}
                className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col text-left hover:border-indigo-200 hover:shadow-md transition-all active:scale-95"
              >
                <div className="flex items-start justify-between gap-2 flex-1">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800 text-sm leading-tight">
                      {project.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">{project.kabupaten}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                </div>
                <span
                  className={`inline-block mt-3 text-xs px-2.5 py-1 rounded-full font-medium self-start ${
                    project.status === 'On Going'
                      ? 'bg-green-100 text-green-700'
                      : project.status === 'Done'
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {project.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Participant list view ──
  return (
    <div className="flex flex-col h-full">
      {/* Project sub-header */}
      <div className="bg-white border-b border-slate-100 px-4 md:px-8 pt-3 pb-3">
        <button
          onClick={() => {
            setSelectedProject(null);
            setPersons([]);
            setKwitansiMap({});
          }}
          className="flex items-center gap-1 text-indigo-600 text-sm font-medium mb-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Kembali ke daftar proyek
        </button>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h2 className="font-semibold text-slate-800 text-base">{selectedProject.name}</h2>
          {persons.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-medium border border-green-100">
                {uploadedCount} sudah
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-600 font-medium border border-red-100">
                {missingCount} belum
              </span>
              <span className="text-xs text-slate-400">dari {persons.length} peserta</span>
            </div>
          )}
        </div>
      </div>

      {/* Search + Filter bar */}
      <div className="px-4 md:px-8 py-3 bg-slate-50/80 border-b border-slate-100 space-y-2.5">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Cari nama, NIK, atau nomor HP..."
            className="w-full pl-9 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {(['all', 'uploaded', 'missing'] as const).map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                filterStatus === status
                  ? status === 'uploaded'
                    ? 'bg-green-600 text-white border-green-600'
                    : status === 'missing'
                    ? 'bg-red-500 text-white border-red-500'
                    : 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {status === 'all' && `Semua (${persons.length})`}
              {status === 'uploaded' && `Sudah (${uploadedCount})`}
              {status === 'missing' && `Belum (${missingCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loadingPersons ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
          </div>
        ) : filteredPersons.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-500 text-sm">
              {searchTerm || filterStatus !== 'all'
                ? 'Tidak ada peserta yang cocok dengan filter'
                : 'Belum ada peserta yang check-in'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block px-8 py-4">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Nama Peserta
                      </th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        NIK
                      </th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        No. HP
                      </th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Status Kwitansi
                      </th>
                      <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredPersons.map(person => {
                      const kwitansi = kwitansiMap[person.id];
                      const isUploading = uploadingId === person.id;
                      return (
                        <tr key={person.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-4 font-medium text-slate-800">{person.fullName}</td>
                          <td className="px-5 py-4 text-slate-500">{person.nik}</td>
                          <td className="px-5 py-4 text-slate-500">{person.mobilePhone}</td>
                          <td className="px-5 py-4">
                            {kwitansi ? (
                              <button
                                onClick={() => setPreviewUrl(kwitansi.kwitansiUrl)}
                                className="inline-flex items-center gap-1.5 text-green-600 font-medium text-xs hover:underline"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Sudah diunggah
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-slate-400 text-xs">
                                Belum ada kwitansi
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              onClick={() => handleUploadClick(person.id)}
                              disabled={isUploading}
                              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                                kwitansi
                                  ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
                              } disabled:opacity-50`}
                            >
                              {isUploading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : kwitansi ? (
                                <>
                                  <Upload className="w-3.5 h-3.5" />
                                  Ganti
                                </>
                              ) : (
                                <>
                                  <Camera className="w-3.5 h-3.5" />
                                  Upload
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden p-4 space-y-3">
              {filteredPersons.map(person => {
                const kwitansi = kwitansiMap[person.id];
                const isUploading = uploadingId === person.id;
                return (
                  <div
                    key={person.id}
                    className={`bg-white rounded-2xl p-4 shadow-sm border transition-colors ${
                      kwitansi ? 'border-green-100' : 'border-slate-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-800 text-sm truncate">
                          {person.fullName}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">NIK: {person.nik}</p>
                        <p className="text-xs text-slate-400">{person.mobilePhone}</p>
                        {kwitansi && (
                          <button
                            onClick={() => setPreviewUrl(kwitansi.kwitansiUrl)}
                            className="inline-flex items-center gap-1 mt-1.5 text-xs text-green-600 font-medium"
                          >
                            <Check className="w-3 h-3" />
                            Kwitansi diunggah
                            <ExternalLink className="w-3 h-3 ml-0.5" />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => handleUploadClick(person.id)}
                        disabled={isUploading}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex-shrink-0 ${
                          kwitansi
                            ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        } disabled:opacity-50`}
                      >
                        {isUploading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : kwitansi ? (
                          <>
                            <Upload className="w-4 h-4" />
                            Ganti
                          </>
                        ) : (
                          <>
                            <Camera className="w-4 h-4" />
                            Upload
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Preview Modal */}
      <PreviewModal 
        url={previewUrl} 
        onClose={() => setPreviewUrl(null)} 
        title="Preview Kwitansi"
      />

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-xl text-white text-sm font-medium shadow-lg z-50 whitespace-nowrap ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
