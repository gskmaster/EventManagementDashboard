import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  collection,
  query,
  getDocs,
  doc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../components/AuthContext';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Loader2,
  X,
  Calendar,
  MapPin,
  UserCheck,
  UserX,
  Clock,
  Users,
  QrCode,
  Edit2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import jsQR from 'jsqr';

interface Project {
  id: string;
  name: string;
  status: string;
  kabupaten: string;
  venue?: string;
  startDate?: string;
  endDate?: string;
}

interface Person {
  id: string;
  fullName: string;
  nik: string;
  mobilePhone: string;
  email?: string;
  kecamatan?: string;
  desa?: string;
  posisi?: string;
  posisiLainnya?: string;
  attendanceStatus: string;
}

type AttendanceFilter = 'all' | 'registered' | 'present' | 'absent';

export default function UsherAttendance() {
  const { user, profile } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [persons, setPersons] = useState<Person[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<AttendanceFilter>('all');
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingPersons, setLoadingPersons] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // QR Scanner state
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrStatus, setQrStatus] = useState<'scanning' | 'found' | 'notfound' | 'error'>('scanning');
  const [qrFoundPerson, setQrFoundPerson] = useState<Person | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanLoopRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Edit modal state
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', nik: '', mobilePhone: '', email: '', posisi: '', posisiLainnya: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (user?.email) fetchProjects();
  }, [user, profile]);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const role = profile?.role;
      if (role === 'admin' || role === 'event_manager') {
        const snap = await getDocs(collection(db, 'projects'));
        setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
      } else {
        const usherSnap = await getDocs(
          query(collection(db, 'ushers'), where('email', '==', user!.email!.toLowerCase()))
        );
        if (usherSnap.empty) { setProjects([]); return; }
        const projectIds: string[] = usherSnap.docs[0].data().projectIds || [];
        if (!projectIds.length) { setProjects([]); return; }
        const results: Project[] = [];
        for (let i = 0; i < projectIds.length; i += 30) {
          const chunk = projectIds.slice(i, i + 30);
          const q = query(collection(db, 'projects'), where('__name__', 'in', chunk));
          const snap = await getDocs(q);
          snap.docs.forEach(d => results.push({ id: d.id, ...d.data() } as Project));
        }
        setProjects(results);
      }
    } catch (err) {
      console.error(err);
      showToast('Gagal memuat daftar proyek', 'error');
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleSelectProject = async (project: Project) => {
    setSelectedProject(project);
    setSearchTerm('');
    setFilterStatus('all');
    setPersons([]);
    setLoadingPersons(true);
    try {
      await fetchPersons(project);
    } finally {
      setLoadingPersons(false);
    }
  };

  const fetchPersons = async (project: Project) => {
    try {
      const instSnap = await getDocs(
        query(collection(db, 'institutions'), where('kabupaten', '==', project.kabupaten))
      );
      const institutions = instSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      let allPersons: Person[] = [];
      if (institutions.length > 0) {
        const instIds = institutions.map((i: any) => i.id);
        for (let i = 0; i < instIds.length; i += 10) {
          const chunk = instIds.slice(i, i + 10);
          const personSnap = await getDocs(
            query(collection(db, 'persons'), where('institutionId', 'in', chunk))
          );
          personSnap.docs.forEach(d => {
            const data = d.data() as any;
            const inst = institutions.find((ins: any) => ins.id === data.institutionId);
            allPersons.push({ id: d.id, ...data, kecamatan: inst?.kecamatan || '', desa: inst?.desa || '' } as Person);
          });
        }
      }
      const directSnap = await getDocs(
        query(collection(db, 'persons'), where('projectId', '==', project.id))
      );
      directSnap.docs.forEach(d => {
        if (!allPersons.find(p => p.id === d.id)) {
          allPersons.push({ id: d.id, ...d.data() } as Person);
        }
      });
      setPersons(allPersons);
    } catch (err) {
      console.error(err);
      showToast('Gagal memuat daftar peserta', 'error');
    }
  };

  const updateAttendance = async (personId: string, status: 'registered' | 'present' | 'absent') => {
    setUpdatingId(personId);
    try {
      await updateDoc(doc(db, 'persons', personId), { attendanceStatus: status });
      setPersons(prev => prev.map(p => (p.id === personId ? { ...p, attendanceStatus: status } : p)));
      const label = status === 'present' ? 'Check-in berhasil' : status === 'absent' ? 'Ditandai absen' : 'Status direset';
      showToast(label, 'success');
    } catch (err) {
      console.error(err);
      showToast('Gagal memperbarui status', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  // ── QR Scanner ────────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const openQrScanner = async () => {
    setQrStatus('scanning');
    setQrFoundPerson(null);
    setShowQrScanner(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      scanLoopRef.current = requestAnimationFrame(scanFrame);
    } catch {
      setQrStatus('error');
    }
  };

  const closeQrScanner = () => {
    stopCamera();
    setShowQrScanner(false);
    setQrStatus('scanning');
    setQrFoundPerson(null);
  };

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      scanLoopRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code?.data) {
      handleQrDecoded(code.data);
    } else {
      scanLoopRef.current = requestAnimationFrame(scanFrame);
    }
  }, [persons]);

  const handleQrDecoded = async (personId: string) => {
    stopCamera();
    const person = persons.find(p => p.id === personId);
    if (!person) {
      setQrStatus('notfound');
      return;
    }
    setQrFoundPerson(person);
    if (person.attendanceStatus === 'present') {
      setQrStatus('found');
      return;
    }
    try {
      await updateDoc(doc(db, 'persons', personId), { attendanceStatus: 'present' });
      setPersons(prev => prev.map(p => p.id === personId ? { ...p, attendanceStatus: 'present' } : p));
      setQrFoundPerson({ ...person, attendanceStatus: 'present' });
      setQrStatus('found');
    } catch {
      setQrStatus('error');
    }
  };

  const rescan = () => {
    setQrStatus('scanning');
    setQrFoundPerson(null);
    openQrScanner();
  };

  // ── Edit participant ──────────────────────────────────────────────────────

  const openEdit = (person: Person) => {
    setEditingPerson(person);
    setEditForm({
      fullName: person.fullName || '',
      nik: person.nik || '',
      mobilePhone: person.mobilePhone || '',
      email: person.email || '',
      posisi: person.posisi || '',
      posisiLainnya: person.posisiLainnya || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPerson) return;
    setSavingEdit(true);
    try {
      const updates: Partial<Person> = {
        fullName: editForm.fullName.trim(),
        nik: editForm.nik.trim(),
        mobilePhone: editForm.mobilePhone.trim(),
        email: editForm.email.trim(),
        posisi: editForm.posisi.trim(),
        posisiLainnya: editForm.posisiLainnya.trim(),
      };
      await updateDoc(doc(db, 'persons', editingPerson.id), updates as any);
      setPersons(prev => prev.map(p => p.id === editingPerson.id ? { ...p, ...updates } : p));
      showToast('Data peserta diperbarui', 'success');
      setEditingPerson(null);
    } catch (err) {
      console.error(err);
      showToast('Gagal menyimpan perubahan', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const filteredPersons = useMemo(() => {
    return persons.filter(p => {
      const matchesSearch =
        p.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.nik?.includes(searchTerm) ||
        p.mobilePhone?.includes(searchTerm) ||
        p.email?.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
      if (filterStatus === 'all') return true;
      return (p.attendanceStatus || 'registered') === filterStatus;
    });
  }, [persons, searchTerm, filterStatus]);

  const counts = useMemo(() => ({
    all: persons.length,
    registered: persons.filter(p => (p.attendanceStatus || 'registered') === 'registered').length,
    present: persons.filter(p => p.attendanceStatus === 'present').length,
    absent: persons.filter(p => p.attendanceStatus === 'absent').length,
  }), [persons]);

  // ── Project list ──────────────────────────────────────────────────────────

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
        <p className="text-sm text-slate-500 mb-6">Pilih proyek untuk mengelola absensi peserta.</p>
        {projects.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-14 h-14 text-slate-200 mx-auto mb-3" />
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
                    <h3 className="font-semibold text-slate-800 text-sm leading-tight">{project.name}</h3>
                    {project.venue && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        {project.venue}, {project.kabupaten}
                      </div>
                    )}
                    {project.startDate && (
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-400">
                        <Calendar className="w-3 h-3 flex-shrink-0" />
                        {project.startDate}{project.endDate && ` – ${project.endDate}`}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                </div>
                <span className={`inline-block mt-3 text-xs px-2.5 py-1 rounded-full font-medium self-start ${
                  project.status === 'On Going' ? 'bg-green-100 text-green-700'
                  : project.status === 'Done' ? 'bg-slate-100 text-slate-600'
                  : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {project.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Participant list ──────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="bg-white border-b border-slate-100 px-4 md:px-8 pt-3 pb-3">
        <button
          onClick={() => { setSelectedProject(null); setPersons([]); }}
          className="flex items-center gap-1 text-indigo-600 text-sm font-medium mb-2"
        >
          <ChevronLeft className="w-4 h-4" /> Kembali ke daftar proyek
        </button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h2 className="font-semibold text-slate-800 text-base">{selectedProject.name}</h2>
            {persons.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-medium border border-green-100">{counts.present} hadir</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-100">{counts.registered} terdaftar</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-600 font-medium border border-red-100">{counts.absent} absen</span>
                <span className="text-xs text-slate-400">dari {counts.all} peserta</span>
              </div>
            )}
          </div>
          {/* QR Scan button */}
          <button
            onClick={openQrScanner}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm active:scale-95"
          >
            <QrCode className="w-4 h-4" />
            Scan QR
          </button>
        </div>
      </div>

      {/* Search + Filter */}
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
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {([
            { key: 'all', label: 'Semua', count: counts.all, active: 'bg-indigo-600 text-white border-indigo-600' },
            { key: 'registered', label: 'Terdaftar', count: counts.registered, active: 'bg-blue-600 text-white border-blue-600' },
            { key: 'present', label: 'Hadir', count: counts.present, active: 'bg-green-600 text-white border-green-600' },
            { key: 'absent', label: 'Absen', count: counts.absent, active: 'bg-red-500 text-white border-red-500' },
          ] as { key: AttendanceFilter; label: string; count: number; active: string }[]).map(({ key, label, count, active }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                filterStatus === key ? active : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loadingPersons ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-600 animate-spin" /></div>
        ) : filteredPersons.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-500 text-sm">
              {searchTerm || filterStatus !== 'all' ? 'Tidak ada peserta yang cocok dengan filter' : 'Belum ada peserta untuk proyek ini'}
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
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nama Peserta</th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">NIK</th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">No. HP</th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Kecamatan / Desa</th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                      <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredPersons.map(person => {
                      const status = person.attendanceStatus || 'registered';
                      const isUpdating = updatingId === person.id;
                      return (
                        <tr key={person.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-4 font-medium text-slate-800">{person.fullName}</td>
                          <td className="px-5 py-4 text-slate-500 font-mono text-xs">{person.nik}</td>
                          <td className="px-5 py-4 text-slate-500">{person.mobilePhone}</td>
                          <td className="px-5 py-4 text-slate-500">{person.kecamatan || '—'}{person.desa ? ` / ${person.desa}` : ''}</td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                              status === 'present' ? 'bg-green-100 text-green-700'
                              : status === 'absent' ? 'bg-red-100 text-red-700'
                              : 'bg-blue-100 text-blue-700'
                            }`}>
                              {status === 'present' ? 'Hadir' : status === 'absent' ? 'Absen' : 'Terdaftar'}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => openEdit(person)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Edit data peserta"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {status !== 'present' && (
                                <button onClick={() => updateAttendance(person.id, 'present')} disabled={isUpdating}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                                  {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                                  Hadir
                                </button>
                              )}
                              {status !== 'absent' && (
                                <button onClick={() => updateAttendance(person.id, 'absent')} disabled={isUpdating}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors">
                                  <UserX className="w-3.5 h-3.5" />Absen
                                </button>
                              )}
                              {status !== 'registered' && (
                                <button onClick={() => updateAttendance(person.id, 'registered')} disabled={isUpdating}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                                  <Clock className="w-3.5 h-3.5" />Reset
                                </button>
                              )}
                            </div>
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
                const status = person.attendanceStatus || 'registered';
                const isUpdating = updatingId === person.id;
                return (
                  <div key={person.id} className={`bg-white rounded-2xl p-4 shadow-sm border transition-colors ${
                    status === 'present' ? 'border-green-100' : status === 'absent' ? 'border-red-100' : 'border-slate-100'
                  }`}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-800 text-sm truncate">{person.fullName}</h3>
                        <p className="text-xs text-slate-500 mt-0.5 font-mono">NIK: {person.nik}</p>
                        <p className="text-xs text-slate-400">{person.mobilePhone}</p>
                        {(person.kecamatan || person.desa) && (
                          <p className="text-xs text-slate-400 mt-0.5">{[person.kecamatan, person.desa].filter(Boolean).join(' / ')}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold ${
                          status === 'present' ? 'bg-green-100 text-green-700'
                          : status === 'absent' ? 'bg-red-100 text-red-700'
                          : 'bg-blue-100 text-blue-700'
                        }`}>
                          {status === 'present' ? 'Hadir' : status === 'absent' ? 'Absen' : 'Terdaftar'}
                        </span>
                        <button onClick={() => openEdit(person)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {status !== 'present' && (
                        <button onClick={() => updateAttendance(person.id, 'present')} disabled={isUpdating}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                          {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}Hadir
                        </button>
                      )}
                      {status !== 'absent' && (
                        <button onClick={() => updateAttendance(person.id, 'absent')} disabled={isUpdating}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors">
                          <UserX className="w-4 h-4" />Absen
                        </button>
                      )}
                      {status !== 'registered' && (
                        <button onClick={() => updateAttendance(person.id, 'registered')} disabled={isUpdating}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                          <Clock className="w-4 h-4" />Reset
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── QR Scanner Modal ─────────────────────────────────────────────── */}
      {showQrScanner && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          {/* Header */}
          <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-4 bg-gradient-to-b from-black/70 to-transparent">
            <p className="text-white font-bold text-sm uppercase tracking-wider">Scan QR Peserta</p>
            <button onClick={closeQrScanner} className="p-2 bg-white/10 backdrop-blur-md rounded-full text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Camera / result */}
          <div className="flex-1 relative flex items-center justify-center">
            {qrStatus === 'scanning' && (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                {/* Viewfinder overlay */}
                <div className="relative z-10 w-64 h-64">
                  <div className="absolute inset-0 rounded-2xl border-2 border-white/40" />
                  <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-white rounded-tl-2xl" />
                  <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-white rounded-tr-2xl" />
                  <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-white rounded-bl-2xl" />
                  <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-white rounded-br-2xl" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-0.5 bg-indigo-400/70 animate-pulse" />
                  </div>
                </div>
                <p className="absolute bottom-24 left-1/2 -translate-x-1/2 text-white/70 text-xs text-center whitespace-nowrap">
                  Arahkan kamera ke QR code peserta
                </p>
              </>
            )}

            {qrStatus === 'found' && qrFoundPerson && (
              <div className="z-10 bg-white rounded-3xl p-8 mx-6 text-center shadow-2xl max-w-sm w-full">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-1">Check-in Berhasil!</h3>
                <p className="text-2xl font-bold text-indigo-700 mt-3 mb-1">{qrFoundPerson.fullName}</p>
                <p className="text-sm text-slate-500 font-mono">{qrFoundPerson.nik}</p>
                {qrFoundPerson.kecamatan && (
                  <p className="text-xs text-slate-400 mt-1">{qrFoundPerson.kecamatan}{qrFoundPerson.desa ? ` / ${qrFoundPerson.desa}` : ''}</p>
                )}
                <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-sm font-semibold">
                  <UserCheck className="w-4 h-4" /> Hadir
                </div>
                <button
                  onClick={rescan}
                  className="mt-6 w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors"
                >
                  Scan Berikutnya
                </button>
              </div>
            )}

            {qrStatus === 'notfound' && (
              <div className="z-10 bg-white rounded-3xl p-8 mx-6 text-center shadow-2xl max-w-sm w-full">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-amber-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Peserta Tidak Ditemukan</h3>
                <p className="text-sm text-slate-500">QR code tidak cocok dengan peserta di proyek ini.</p>
                <button onClick={rescan} className="mt-6 w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors">
                  Coba Lagi
                </button>
              </div>
            )}

            {qrStatus === 'error' && (
              <div className="z-10 bg-white rounded-3xl p-8 mx-6 text-center shadow-2xl max-w-sm w-full">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Gagal Mengakses Kamera</h3>
                <p className="text-sm text-slate-500">Pastikan izin kamera diberikan dan coba lagi.</p>
                <button onClick={closeQrScanner} className="mt-6 w-full py-3 bg-slate-600 text-white rounded-xl font-semibold text-sm">
                  Tutup
                </button>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {/* ── Edit Participant Modal ───────────────────────────────────────── */}
      {editingPerson && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-slate-900/70" onClick={() => setEditingPerson(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-base font-bold text-slate-900">Edit Data Peserta</h2>
                <p className="text-xs text-slate-500 mt-0.5">{editingPerson.kecamatan}{editingPerson.desa ? ` / ${editingPerson.desa}` : ''}</p>
              </div>
              <button onClick={() => setEditingPerson(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nama Lengkap *</label>
                  <input required type="text" value={editForm.fullName}
                    onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">NIK *</label>
                  <input required type="text" value={editForm.nik}
                    onChange={e => setEditForm(f => ({ ...f, nik: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">No. HP *</label>
                    <input required type="tel" value={editForm.mobilePhone}
                      onChange={e => setEditForm(f => ({ ...f, mobilePhone: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
                    <input type="email" value={editForm.email}
                      onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Posisi</label>
                  <input type="text" value={editForm.posisi}
                    onChange={e => setEditForm(f => ({ ...f, posisi: e.target.value }))}
                    placeholder="contoh: Kepala Desa"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditingPerson(null)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors">
                  Batal
                </button>
                <button type="submit" disabled={savingEdit}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-xl text-white text-sm font-medium shadow-lg z-50 whitespace-nowrap ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
