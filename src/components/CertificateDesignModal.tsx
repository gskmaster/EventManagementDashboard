import React, { useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { X, Loader2, Palette } from 'lucide-react';

// ─── Design schema ────────────────────────────────────────────────────────────
export interface CertDesign {
  orgName: string;
  title: string;
  subtitle: string;
  primaryColor: string;
  bgColor: string;
  givenToText: string;
  participationText: string;
  signatureTitle: string;
}

export const DEFAULT_CERT_DESIGN: CertDesign = {
  orgName: '',
  title: 'SERTIFIKAT KEHADIRAN',
  subtitle: 'Certificate of Attendance',
  primaryColor: '#4F46E5',
  bgColor: '#F8F9FF',
  givenToText: 'Diberikan kepada:',
  participationText: 'Telah hadir dan berpartisipasi dalam kegiatan:',
  signatureTitle: 'Penanggungjawab Kegiatan',
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  projectId: string;
  project: any;
  initialDesign: CertDesign;
  onSave: (design: CertDesign) => void;
  onClose: () => void;
}

// ─── Live preview component ───────────────────────────────────────────────────
function CertPreview({ design, project }: { design: CertDesign; project: any }) {
  return (
    <div
      style={{
        aspectRatio: '297 / 210',
        backgroundColor: design.bgColor,
        border: `3px solid ${design.primaryColor}`,
        outline: `1px solid ${design.primaryColor}40`,
        outlineOffset: '3px',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '4px',
        fontFamily: 'sans-serif',
        width: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          backgroundColor: design.primaryColor,
          height: '16%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.05em' }}>{design.title}</div>
        {design.subtitle && (
          <div style={{ color: '#fff', opacity: 0.8, fontSize: '0.58em', marginTop: '1px' }}>{design.subtitle}</div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '3% 8%', textAlign: 'center' }}>
        {design.orgName && (
          <div style={{ fontSize: '0.5em', color: design.primaryColor, fontWeight: 600, marginBottom: '2%' }}>
            {design.orgName}
          </div>
        )}
        <div style={{ fontSize: '0.52em', color: '#94A3B8', marginBottom: '1.5%' }}>{design.givenToText}</div>
        <div style={{ fontSize: '1.15em', fontWeight: 'bold', color: '#1E1B4B', letterSpacing: '0.03em' }}>
          NAMA PESERTA
        </div>
        <div
          style={{
            borderBottom: `1.5px solid ${design.primaryColor}`,
            width: '55%',
            margin: '1.5% auto 3% auto',
          }}
        />
        <div style={{ fontSize: '0.48em', color: '#71717A', marginBottom: '1.5%' }}>{design.participationText}</div>
        <div style={{ fontSize: '0.75em', fontWeight: 'bold', color: '#1E1B4B' }}>
          {project?.name || 'NAMA KEGIATAN'}
        </div>
        <div style={{ fontSize: '0.44em', color: '#94A3B8', marginTop: '0.8%' }}>
          {project ? `${project.startDate} – ${project.endDate} · ${project.kabupaten}` : 'Tanggal · Lokasi'}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: '5%',
          left: '6%',
          right: '6%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          fontSize: '0.42em',
          color: '#64748B',
          borderTop: '0.5px solid #CBD5E1',
          paddingTop: '2%',
        }}
      >
        <div>{project?.kabupaten || 'Lokasi'}, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        <div style={{ textAlign: 'center' }}>
          {design.orgName && <div style={{ fontWeight: 600 }}>{design.orgName}</div>}
          <div style={{ marginTop: '2px' }}>{design.signatureTitle}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────
function Field({
  label, children, hint,
}: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export default function CertificateDesignModal({ projectId, project, initialDesign, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<CertDesign>(initialDesign);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof CertDesign) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft(d => ({ ...d, [key]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'certificate_designs', projectId), {
        ...draft,
        projectId,
        updatedAt: serverTimestamp(),
      });
      onSave(draft);
      onClose();
    } catch (e) {
      console.error('Error saving design:', e);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl my-8">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-bold text-slate-900">Desain Sertifikat</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body: form + preview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">

          {/* Left: form */}
          <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[70vh]">
            <p className="text-xs text-slate-500">Kustomisasi tampilan sertifikat. Perubahan langsung terlihat di preview.</p>

            <Field label="Nama Organisasi / Penyelenggara" hint="Ditampilkan di header dan area tanda tangan">
              <input type="text" value={draft.orgName} onChange={set('orgName')} className={inputCls}
                placeholder="Contoh: PT. Karya Bersama / Dinas Koperasi" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Judul Utama">
                <input type="text" value={draft.title} onChange={set('title')} className={inputCls}
                  placeholder="SERTIFIKAT KEHADIRAN" />
              </Field>
              <Field label="Subjudul">
                <input type="text" value={draft.subtitle} onChange={set('subtitle')} className={inputCls}
                  placeholder="Certificate of Attendance" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Warna Utama (Header & Border)">
                <div className="flex items-center gap-2">
                  <input type="color" value={draft.primaryColor} onChange={set('primaryColor')}
                    className="h-9 w-14 rounded-lg border border-slate-300 cursor-pointer p-0.5" />
                  <input type="text" value={draft.primaryColor} onChange={set('primaryColor')}
                    className={`${inputCls} font-mono`} placeholder="#4F46E5" maxLength={7} />
                </div>
              </Field>
              <Field label="Warna Latar Belakang">
                <div className="flex items-center gap-2">
                  <input type="color" value={draft.bgColor} onChange={set('bgColor')}
                    className="h-9 w-14 rounded-lg border border-slate-300 cursor-pointer p-0.5" />
                  <input type="text" value={draft.bgColor} onChange={set('bgColor')}
                    className={`${inputCls} font-mono`} placeholder="#F8F9FF" maxLength={7} />
                </div>
              </Field>
            </div>

            <Field label="Teks 'Diberikan Kepada'">
              <input type="text" value={draft.givenToText} onChange={set('givenToText')} className={inputCls}
                placeholder="Diberikan kepada:" />
            </Field>

            <Field label="Teks Partisipasi">
              <textarea value={draft.participationText} onChange={set('participationText')}
                rows={2} className={`${inputCls} resize-none`}
                placeholder="Telah hadir dan berpartisipasi dalam kegiatan:" />
            </Field>

            <Field label="Jabatan Penandatangan" hint="Muncul di bawah nama PIC proyek">
              <input type="text" value={draft.signatureTitle} onChange={set('signatureTitle')} className={inputCls}
                placeholder="Penanggungjawab Kegiatan" />
            </Field>
          </div>

          {/* Right: preview */}
          <div className="px-6 py-5 bg-slate-50 flex flex-col gap-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Preview (Live)</p>
            <CertPreview design={draft} project={project} />
            <p className="text-[11px] text-slate-400 text-center">
              Preview bersifat perkiraan — posisi font aktual di PDF mungkin sedikit berbeda.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Simpan Desain
          </button>
        </div>
      </div>
    </div>
  );
}
