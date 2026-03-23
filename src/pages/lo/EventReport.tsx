import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  getDocs,
  addDoc,
  where,
  orderBy,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { useAuth } from '../../components/AuthContext';
import RichTextEditor from '../../components/RichTextEditor';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Camera,
  X,
  Loader2,
  FileText,
  Calendar,
  ImageIcon,
  User,
  Clock,
  ExternalLink,
} from 'lucide-react';
import PreviewModal from '../../components/PreviewModal';

type View = 'projects' | 'list' | 'create' | 'detail';

interface Project {
  id: string;
  name: string;
  status: string;
  kabupaten: string;
}

interface Report {
  id: string;
  projectId: string;
  date: string;
  description: string;
  photoUrls: string[];
  authorEmail: string;
  authorName: string;
  createdAt: string;
}

interface FormState {
  date: string;
  description: string;
  photos: File[];
  photoPreviewUrls: string[];
}

export default function EventReport() {
  const { user, profile } = useAuth();

  const [view, setView] = useState<View>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingReports, setLoadingReports] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    date: new Date().toISOString().split('T')[0],
    description: '',
    photos: [],
    photoPreviewUrls: [],
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    if (user?.email) fetchProjects();
  }, [user, profile]);

  // ── Data fetching ──

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const role = profile?.role;

      if (role === 'admin' || role === 'event_manager') {
        const snap = await getDocs(collection(db, 'projects'));
        setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
        return;
      }

      // LO or Usher: find assigned project IDs
      let projectIds: string[] = [];
      const emailLower = user!.email!.toLowerCase();

      const loSnap = await getDocs(
        query(collection(db, 'liaison_officers'), where('email', '==', emailLower))
      );
      if (!loSnap.empty) {
        projectIds = loSnap.docs[0].data().projectIds || [];
      } else {
        const usherSnap = await getDocs(
          query(collection(db, 'ushers'), where('email', '==', emailLower))
        );
        if (!usherSnap.empty) {
          projectIds = usherSnap.docs[0].data().projectIds || [];
        }
      }

      if (!projectIds.length) {
        setProjects([]);
        return;
      }

      const results: Project[] = [];
      for (let i = 0; i < projectIds.length; i += 30) {
        const chunk = projectIds.slice(i, i + 30);
        const snap = await getDocs(
          query(collection(db, 'projects'), where('__name__', 'in', chunk))
        );
        snap.docs.forEach(d => results.push({ id: d.id, ...d.data() } as Project));
      }
      setProjects(results);
    } catch (err) {
      console.error(err);
      showToast('Gagal memuat daftar proyek', 'error');
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchReports = async (project: Project) => {
    setLoadingReports(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'event_reports'),
          where('projectId', '==', project.id),
          orderBy('date', 'desc')
        )
      );
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as Report)));
    } catch (err) {
      console.error(err);
      showToast('Gagal memuat laporan', 'error');
    } finally {
      setLoadingReports(false);
    }
  };

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setView('list');
    fetchReports(project);
  };

  // ── Form helpers ──

  const handlePhotoAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = '';

    const previews = files.map(f => URL.createObjectURL(f));
    setForm(prev => ({
      ...prev,
      photos: [...prev.photos, ...files],
      photoPreviewUrls: [...prev.photoPreviewUrls, ...previews],
    }));
  };

  const removePhoto = (idx: number) => {
    URL.revokeObjectURL(form.photoPreviewUrls[idx]);
    setForm(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== idx),
      photoPreviewUrls: prev.photoPreviewUrls.filter((_, i) => i !== idx),
    }));
  };

  const resetForm = () => {
    form.photoPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    setForm({
      date: new Date().toISOString().split('T')[0],
      description: '',
      photos: [],
      photoPreviewUrls: [],
    });
    setEditorKey(k => k + 1);
  };

  const handleSubmit = async () => {
    const descText = form.description.replace(/<[^>]+>/g, '').trim();
    if (!descText) {
      showToast('Deskripsi laporan tidak boleh kosong', 'error');
      return;
    }
    if (!selectedProject || !user) return;

    setSubmitting(true);
    try {
      const timestamp = Date.now();
      const photoUrls: string[] = [];

      for (let i = 0; i < form.photos.length; i++) {
        const file = form.photos[i];
        const ext = file.name.split('.').pop() || 'jpg';
        const storageRef = ref(
          storage,
          `event_report_photos/${selectedProject.id}/${timestamp}_${i}.${ext}`
        );
        await uploadBytes(storageRef, file);
        photoUrls.push(await getDownloadURL(storageRef));
      }

      const now = new Date().toISOString();
      const docRef = await addDoc(collection(db, 'event_reports'), {
        projectId: selectedProject.id,
        date: form.date,
        description: form.description,
        photoUrls,
        authorEmail: user.email || '',
        authorName: profile?.displayName || user.email || '',
        createdAt: now,
        updatedAt: now,
      });

      const newReport: Report = {
        id: docRef.id,
        projectId: selectedProject.id,
        date: form.date,
        description: form.description,
        photoUrls,
        authorEmail: user.email || '',
        authorName: profile?.displayName || user.email || '',
        createdAt: now,
      };

      setReports(prev => [newReport, ...prev]);
      resetForm();
      setView('list');
      showToast('Laporan berhasil dibuat', 'success');
    } catch (err) {
      console.error(err);
      showToast('Gagal membuat laporan', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const stripHtml = (html: string) =>
    html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

  // ── Toast ──
  const ToastEl = toast && (
    <div
      className={`fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-xl text-white text-sm font-medium shadow-lg z-50 whitespace-nowrap ${
        toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
      }`}
    >
      {toast.message}
    </div>
  );

  // ══════════════════════════════════════════
  // VIEW: Project selection
  // ══════════════════════════════════════════
  if (view === 'projects') {
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
          Pilih proyek untuk membuat atau melihat laporan kegiatan.
        </p>

        {projects.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="w-14 h-14 text-slate-200 mx-auto mb-3" />
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
        {ToastEl}
      </div>
    );
  }

  // ══════════════════════════════════════════
  // VIEW: Report list
  // ══════════════════════════════════════════
  if (view === 'list') {
    return (
      <div className="flex flex-col h-full">
        {/* Sub-header */}
        <div className="bg-white border-b border-slate-100 px-4 md:px-8 py-3">
          <button
            onClick={() => { setSelectedProject(null); setReports([]); setView('projects'); }}
            className="flex items-center gap-1 text-indigo-600 text-sm font-medium mb-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Kembali ke daftar proyek
          </button>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-800 text-base">{selectedProject?.name}</h2>
              <p className="text-xs text-slate-500">{reports.length} laporan</p>
            </div>
            <button
              onClick={() => setView('create')}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Buat Laporan</span>
              <span className="sm:hidden">Buat</span>
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loadingReports ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-20">
              <FileText className="w-14 h-14 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 text-sm font-medium">Belum ada laporan</p>
              <p className="text-slate-400 text-xs mt-1">Tap "Buat Laporan" untuk mulai mencatat</p>
            </div>
          ) : (
            <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-4">
              {reports.map(report => (
                <button
                  key={report.id}
                  onClick={() => { setSelectedReport(report); setView('detail'); }}
                  className="w-full bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-slate-100 text-left hover:border-indigo-200 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                        <span className="text-sm font-semibold text-slate-800">
                          {formatDate(report.date)}
                        </span>
                      </div>

                      <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                        {stripHtml(report.description) || '—'}
                      </p>

                      <div className="flex items-center gap-4 mt-3">
                        {report.photoUrls?.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <ImageIcon className="w-3.5 h-3.5" />
                            {report.photoUrls.length} foto
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <User className="w-3.5 h-3.5" />
                          {report.authorName}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0 mt-0.5" />
                  </div>

                  {/* Photo strip preview */}
                  {report.photoUrls?.length > 0 && (
                    <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                      {report.photoUrls.slice(0, 5).map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt={`foto ${i + 1}`}
                          className="w-16 h-16 md:w-20 md:h-20 rounded-xl object-cover flex-shrink-0"
                        />
                      ))}
                      {report.photoUrls.length > 5 && (
                        <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs text-slate-500 font-medium">
                            +{report.photoUrls.length - 5}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mobile FAB */}
        <button
          onClick={() => setView('create')}
          className="md:hidden fixed bottom-24 right-5 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg flex items-center justify-center z-10 transition-colors"
        >
          <Plus className="w-6 h-6" />
        </button>

        {ToastEl}
      </div>
    );
  }

  // ══════════════════════════════════════════
  // VIEW: Create report form
  // ══════════════════════════════════════════
  if (view === 'create') {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-4 md:px-8 py-3 flex items-center justify-between flex-shrink-0">
          <button
            onClick={() => { resetForm(); setView('list'); }}
            className="flex items-center gap-1 text-indigo-600 text-sm font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            Batal
          </button>
          <h2 className="font-semibold text-slate-800 text-sm">Buat Laporan Baru</h2>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
            {/* Date */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1.5 text-slate-400" />
                Tanggal
              </label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full sm:w-auto px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>

            {/* Description (WYSIWYG) */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Deskripsi Laporan
              </label>
              <RichTextEditor
                key={editorKey}
                value={form.description}
                onChange={html => setForm(f => ({ ...f, description: html }))}
                minHeight="200px"
              />
            </div>

            {/* Photo upload */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                <ImageIcon className="w-4 h-4 inline mr-1.5 text-slate-400" />
                Foto Dokumentasi
              </label>

              {/* Photo grid */}
              {form.photoPreviewUrls.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-3">
                  {form.photoPreviewUrls.map((url, idx) => (
                    <div key={idx} className="relative aspect-square">
                      <img
                        src={url}
                        alt={`preview ${idx + 1}`}
                        className="w-full h-full object-cover rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add photo buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-slate-300 hover:border-indigo-400 text-slate-600 hover:text-indigo-600 rounded-xl text-sm font-medium transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  Tambah Foto
                </button>
                <span className="text-xs text-slate-400 self-center">
                  {form.photos.length > 0 ? `${form.photos.length} foto dipilih` : 'Foto, kamera, atau PDF'}
                </span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={handlePhotoAdd}
              />
            </div>
          </div>
        </div>

        {ToastEl}
      </div>
    );
  }

  // ══════════════════════════════════════════
  // VIEW: Report detail
  // ══════════════════════════════════════════
  if (view === 'detail' && selectedReport) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-4 md:px-8 py-3 flex-shrink-0">
          <button
            onClick={() => { setSelectedReport(null); setView('list'); }}
            className="flex items-center gap-1 text-indigo-600 text-sm font-medium mb-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Kembali ke daftar laporan
          </button>
          <h2 className="font-semibold text-slate-800 text-base">Detail Laporan</h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
            {/* Meta */}
            <div className="bg-indigo-50 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-indigo-500" />
                <span className="font-semibold text-slate-800">{formatDate(selectedReport.date)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <User className="w-4 h-4" />
                <span>{selectedReport.authorName}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  Dibuat{' '}
                  {new Date(selectedReport.createdAt).toLocaleString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>

            {/* Description */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Deskripsi Laporan</h3>
              <div
                className="
                  prose prose-sm max-w-none text-slate-700 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm
                  [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-4 [&_h2]:mb-2
                  [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1
                  [&_p]:mb-2 [&_p]:leading-relaxed
                  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2
                  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2
                  [&_li]:mb-0.5
                  [&_strong]:font-semibold
                "
                dangerouslySetInnerHTML={{ __html: selectedReport.description }}
              />
            </div>

            {/* Photos */}
            {selectedReport.photoUrls?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  Foto Dokumentasi ({selectedReport.photoUrls.length})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {selectedReport.photoUrls.map((url, idx) => (
                    <button
                      key={idx}
                      onClick={() => setPreviewUrl(url)}
                      className="block aspect-square rounded-2xl overflow-hidden border border-slate-100 hover:opacity-90 transition-opacity text-left outline-none"
                    >
                      <img
                        src={url}
                        alt={`foto ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {ToastEl}

        <PreviewModal 
          url={previewUrl} 
          onClose={() => setPreviewUrl(null)} 
          title="Preview Foto Kegiatan"
        />
      </div>
    );
  }

  return null;
}
