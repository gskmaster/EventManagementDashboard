import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, writeBatch, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import Layout from '../components/Layout';
import RichTextEditor from '../components/RichTextEditor';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Pencil, Trash2, CheckCircle2,
  FileText, Loader2, X, AlertTriangle, Shield,
} from 'lucide-react';

// ─── Default T&C HTML (UU PDP No. 27 Tahun 2022) ────────────────────────────
const DEFAULT_TERMS_HTML = `
<h2>SYARAT DAN KETENTUAN PERSETUJUAN DATA PRIBADI</h2>
<p>Dengan melanjutkan proses pendaftaran atau memberikan centang pada kotak persetujuan, Anda ("Subjek Data") menyatakan telah membaca dan memberikan persetujuan eksplisit kepada <strong>[Nama Platform/Perusahaan Anda]</strong> ("Pengendali Data") untuk hal-hal berikut:</p>
<h3>1. Dasar Pemrosesan Data</h3>
<p>Kami mengumpulkan dan memproses data pribadi Anda berdasarkan:</p>
<ul>
<li><strong>Persetujuan:</strong> Izin sadar yang Anda berikan melalui platform ini.</li>
<li><strong>Kewajiban Kontrak:</strong> Untuk menyediakan layanan yang Anda minta.</li>
<li><strong>Kewajiban Hukum:</strong> Untuk mematuhi peraturan perundang-undangan di Indonesia.</li>
</ul>
<h3>2. Tujuan Penggunaan Data</h3>
<p>Anda setuju bahwa data pribadi Anda (termasuk Nama, Email, Telepon, dan <strong>[Sebutkan data lain]</strong>) akan digunakan untuk:</p>
<ul>
<li>Verifikasi identitas dan keamanan akun.</li>
<li>Pemrosesan transaksi dan layanan dukungan pelanggan.</li>
<li><strong>[Opsional]</strong> Pengiriman informasi pemasaran/promosi (Anda dapat membatalkan ini kapan saja).</li>
</ul>
<h3>3. Jangka Waktu Penyimpanan (Retensi)</h3>
<p>Kami akan menyimpan data pribadi Anda selama:</p>
<ul>
<li>Akun Anda aktif dan digunakan.</li>
<li>Paling singkat <strong>5 (lima) tahun</strong> setelah akun ditutup, atau sesuai dengan ketentuan peraturan perundang-undangan yang berlaku di Indonesia (seperti UU ITE atau peraturan sektoral).</li>
</ul>
<h3>4. Hak-Hak Anda sebagai Subjek Data (Sesuai UU PDP)</h3>
<p>Anda memiliki hak penuh untuk:</p>
<ul>
<li><strong>Mengakses &amp; Memperbaiki:</strong> Meminta akses atau perbaikan data yang tidak akurat.</li>
<li><strong>Menarik Persetujuan:</strong> Menarik kembali izin pemrosesan data (hal ini dapat menyebabkan penghentian layanan tertentu).</li>
<li><strong>Penghapusan (Right to be Forgotten):</strong> Meminta penghapusan data jika sudah tidak relevan atau akun ditutup.</li>
<li><strong>Portabilitas:</strong> Meminta salinan data pribadi Anda dalam format elektronik yang umum digunakan.</li>
</ul>
<h3>5. Pengungkapan kepada Pihak Ketiga</h3>
<p>Kami tidak akan menjual data Anda. Kami hanya akan membagikan data Anda kepada mitra pihak ketiga (seperti penyedia cloud, logistik, atau pembayaran) yang telah terikat perjanjian pelindungan data pribadi yang setara dengan standar kami dan UU PDP.</p>
<h3>6. Bukti Persetujuan Digital</h3>
<p>Anda memahami bahwa sistem kami merekam <strong>Alamat IP, Timestamp, dan Versi Kebijakan</strong> saat Anda memberikan persetujuan ini sebagai bukti hukum yang sah (Audit Log) jika terjadi perselisihan di masa depan.</p>
`.trim();

// ─── Types ───────────────────────────────────────────────────────────────────
interface TermDoc {
  id: string;
  title: string;
  version: string;
  effectiveDate: string;
  content: string;
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
}

interface FormState {
  title: string;
  version: string;
  effectiveDate: string;
  content: string;
}

const EMPTY_FORM: FormState = {
  title: 'Syarat dan Ketentuan Persetujuan Data Pribadi',
  version: '1.0',
  effectiveDate: new Date().toISOString().slice(0, 10),
  content: DEFAULT_TERMS_HTML,
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function LegalTerms() {
  const navigate = useNavigate();

  const [terms, setTerms] = useState<TermDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TermDoc | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editorKey, setEditorKey] = useState(0); // increment to remount editor

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<TermDoc | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Preview
  const [previewTarget, setPreviewTarget] = useState<TermDoc | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchTerms = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'terms_and_conditions'), orderBy('createdAt', 'desc'))
      );
      setTerms(snap.docs.map(d => ({ id: d.id, ...d.data() } as TermDoc)));
    } catch (e) {
      console.error('Error fetching terms:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTerms(); }, []);

  // ── Open create / edit ─────────────────────────────────────────────────────
  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
    setEditorKey(k => k + 1);
    setModalOpen(true);
  };

  const openEdit = (t: TermDoc) => {
    setForm({ title: t.title, version: t.version, effectiveDate: t.effectiveDate, content: t.content });
    setEditing(t);
    setEditorKey(k => k + 1);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.title.trim() || !form.version.trim() || !form.effectiveDate) return;
    setSaving(true);
    try {
      const now = serverTimestamp();
      if (editing) {
        await updateDoc(doc(db, 'terms_and_conditions', editing.id), {
          title: form.title,
          version: form.version,
          effectiveDate: form.effectiveDate,
          content: form.content,
          updatedAt: now,
        });
      } else {
        // First document auto-activates
        await addDoc(collection(db, 'terms_and_conditions'), {
          ...form,
          isActive: terms.length === 0,
          createdAt: now,
          updatedAt: now,
        });
      }
      await fetchTerms();
      closeModal();
    } catch (e) {
      console.error('Error saving term:', e);
    } finally {
      setSaving(false);
    }
  };

  // ── Set Active ─────────────────────────────────────────────────────────────
  const handleSetActive = async (id: string) => {
    try {
      const batch = writeBatch(db);
      terms.forEach(t => {
        batch.update(doc(db, 'terms_and_conditions', t.id), { isActive: t.id === id });
      });
      await batch.commit();
      setTerms(terms.map(t => ({ ...t, isActive: t.id === id })));
    } catch (e) {
      console.error('Error setting active:', e);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'terms_and_conditions', deleteTarget.id));
      setTerms(prev => prev.filter(t => t.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      console.error('Error deleting term:', e);
    } finally {
      setDeleting(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatDate = (ts: any) => {
    if (!ts) return '—';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return '—'; }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <button
              onClick={() => navigate('/legal-management')}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 mb-2 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Kembali ke Legal Management
            </button>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-6 h-6 text-indigo-600" />
              <h2 className="text-2xl font-bold text-slate-900">Syarat &amp; Ketentuan</h2>
            </div>
            <p className="text-slate-500 text-sm">
              Kelola versi kebijakan privasi &amp; persetujuan data (UU PDP No. 27 Tahun 2022).
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Tambah Versi Baru
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : terms.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-slate-400">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Belum ada syarat &amp; ketentuan.</p>
            <p className="text-sm mt-1">Klik "Tambah Versi Baru" untuk membuat yang pertama.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {terms.map(t => (
              <div
                key={t.id}
                className={`bg-white rounded-xl border px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4 transition-all ${
                  t.isActive ? 'border-indigo-300 shadow-sm' : 'border-slate-200'
                }`}
              >
                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  t.isActive ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
                }`}>
                  <Shield className="w-5 h-5" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="font-semibold text-slate-900 truncate">{t.title}</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex-shrink-0">
                      v{t.version}
                    </span>
                    {t.isActive && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1 flex-shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        Aktif
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Berlaku: {t.effectiveDate} &nbsp;·&nbsp; Dibuat: {formatDate(t.createdAt)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setPreviewTarget(t)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                  >
                    Lihat
                  </button>
                  {!t.isActive && (
                    <button
                      onClick={() => handleSetActive(t.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-green-400 hover:text-green-700 transition-colors"
                    >
                      Set Aktif
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(t)}
                    className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(t)}
                    disabled={t.isActive}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title={t.isActive ? 'Tidak dapat menghapus versi aktif' : 'Hapus'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ───────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-8">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                {editing ? 'Edit Syarat &amp; Ketentuan' : 'Tambah Versi Baru'}
              </h3>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Form */}
            <div className="px-6 py-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Versi <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.version}
                    onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Contoh: 1.0, 1.1, 2.0"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Tanggal Berlaku <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.effectiveDate}
                    onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Judul <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Judul dokumen"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Isi Dokumen <span className="text-red-500">*</span>
                </label>
                <RichTextEditor
                  key={editorKey}
                  value={form.content}
                  onChange={html => setForm(f => ({ ...f, content: html }))}
                  minHeight="420px"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim() || !form.version.trim() || !form.effectiveDate}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editing ? 'Simpan Perubahan' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview Modal ─────────────────────────────────────────────────────── */}
      {previewTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{previewTarget.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  v{previewTarget.version} &nbsp;·&nbsp; Berlaku: {previewTarget.effectiveDate}
                </p>
              </div>
              <button onClick={() => setPreviewTarget(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div
              className="
                px-8 py-6 text-sm text-slate-800 leading-relaxed overflow-auto max-h-[70vh]
                [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-4 [&_h2]:mb-2
                [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-800 [&_h3]:mt-3 [&_h3]:mb-1
                [&_p]:mb-2
                [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2
                [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2
                [&_li]:mb-0.5
                [&_strong]:font-semibold
              "
              dangerouslySetInnerHTML={{ __html: previewTarget.content }}
            />
          </div>
        </div>
      )}

      {/* ── Delete Confirm ────────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900 mb-1">Hapus Syarat &amp; Ketentuan?</h4>
                <p className="text-sm text-slate-600">
                  Versi <strong>v{deleteTarget.version}</strong> ("{deleteTarget.title}") akan dihapus permanen.
                  Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
