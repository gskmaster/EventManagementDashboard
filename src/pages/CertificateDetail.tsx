import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, getDoc, collection, query, where, getDocs,
  setDoc, updateDoc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import Layout from '../components/Layout';
import CertificateDesignModal, {
  CertDesign, DEFAULT_CERT_DESIGN,
} from '../components/CertificateDesignModal';
import BulkEmailModal from '../components/BulkEmailModal';
import { sendBatchEmail } from '../lib/sendTemplateEmail';
import jsPDF from 'jspdf';
import {
  ArrowLeft, Award, Download, Mail, Loader2,
  CheckCircle2, Search, Calendar, MapPin, Building2, Palette,
  CheckSquare, Square, Send,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Person {
  id: string;
  fullName: string;
  email: string;
  kabupaten: string;
  kecamatan: string;
  desa: string;
  posisi: string;
  posisiLainnya?: string;
  attendanceStatus: string;
  projectId: string;
  nik?: string;
}

interface CertRecord {
  personId: string;
  projectId: string;
  url: string;
  generatedAt: any;
  emailSentAt: any;
  emailStatus?: 'sent' | 'failed' | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

// ─── Certificate PDF Generator ────────────────────────────────────────────────
function buildCertificatePDF(person: Person, project: any, design: CertDesign): Blob {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297, H = 210;

  const [pr, pg, pb] = hexToRgb(design.primaryColor);
  const [br, bg, bb] = hexToRgb(design.bgColor);

  // Background
  pdf.setFillColor(br, bg, bb);
  pdf.rect(0, 0, W, H, 'F');

  // Outer border
  pdf.setDrawColor(pr, pg, pb);
  pdf.setLineWidth(2.5);
  pdf.rect(8, 8, W - 16, H - 16, 'S');

  // Inner border
  pdf.setDrawColor(pr, pg, pb);
  pdf.setGState(pdf.GState({ opacity: 0.3 }));
  pdf.setLineWidth(0.8);
  pdf.rect(12, 12, W - 24, H - 24, 'S');
  pdf.setGState(pdf.GState({ opacity: 1 }));

  // Header strip
  pdf.setFillColor(pr, pg, pb);
  pdf.rect(8, 8, W - 16, 28, 'F');

  // Header title
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text(design.title, W / 2, 20, { align: 'center' });

  if (design.subtitle) {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(design.subtitle, W / 2, 29, { align: 'center' });
  }

  // Org name (below header)
  if (design.orgName) {
    pdf.setTextColor(pr, pg, pb);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text(design.orgName.toUpperCase(), W / 2, 45, { align: 'center' });
  }

  // "Diberikan kepada:"
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  const givenY = design.orgName ? 53 : 50;
  pdf.text(design.givenToText, W / 2, givenY, { align: 'center' });

  // Participant name
  pdf.setTextColor(30, 27, 75);
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  const nameY = givenY + 17;
  const nameText = person.fullName.toUpperCase();
  pdf.text(nameText, W / 2, nameY, { align: 'center' });

  // Underline
  const nameWidth = pdf.getTextWidth(nameText);
  pdf.setDrawColor(pr, pg, pb);
  pdf.setLineWidth(0.6);
  pdf.line(W / 2 - nameWidth / 2, nameY + 3, W / 2 + nameWidth / 2, nameY + 3);

  // Posisi badge
  const posisiLabel = person.posisi === 'Lainnya' ? (person.posisiLainnya || '') : (person.posisi || '');
  if (posisiLabel) {
    pdf.setTextColor(pr, pg, pb);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`[ ${posisiLabel} ]`, W / 2, nameY + 11, { align: 'center' });
  }

  // Participation text
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  const partY = nameY + (posisiLabel ? 21 : 14);
  const partLines = pdf.splitTextToSize(design.participationText, 200);
  pdf.text(partLines, W / 2, partY, { align: 'center' });

  // Event name
  pdf.setTextColor(30, 27, 75);
  pdf.setFontSize(15);
  pdf.setFont('helvetica', 'bold');
  const eventY = partY + partLines.length * 5 + 8;
  const eventLines = pdf.splitTextToSize(project.name, 220);
  pdf.text(eventLines, W / 2, eventY, { align: 'center' });

  // Event details
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  const detailY = eventY + eventLines.length * 6 + 5;
  pdf.text(
    `${project.startDate} – ${project.endDate}  |  ${project.kabupaten}`,
    W / 2, detailY, { align: 'center' }
  );

  // Divider
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.4);
  pdf.line(30, 155, W - 30, 155);

  // Left: date
  const today = new Date().toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  pdf.setFontSize(9);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`${project.kabupaten}, ${today}`, W * 0.25, 168, { align: 'center' });

  // Right: signature
  pdf.text('Mengetahui,', W * 0.75, 162, { align: 'center' });
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 27, 75);
  pdf.text(design.orgName || project.pic || 'Panitia', W * 0.75, 180, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(8);
  pdf.text(`(${design.signatureTitle})`, W * 0.75, 186, { align: 'center' });

  // Footer watermark
  pdf.setFontSize(7);
  pdf.setTextColor(203, 213, 225);
  pdf.text(`Digenerate oleh Event Portal · ${new Date().toISOString()}`, W / 2, H - 5, { align: 'center' });

  return pdf.output('blob');
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CertificateDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<any>(null);
  const [persons, setPersons] = useState<Person[]>([]);
  const [certs, setCerts] = useState<Record<string, CertRecord>>({});
  const [design, setDesign] = useState<CertDesign>(DEFAULT_CERT_DESIGN);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Per-row loading
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [emailing, setEmailing] = useState<Set<string>>(new Set());
  const [emailSuccess, setEmailSuccess] = useState<Set<string>>(new Set());

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOp, setBulkOp] = useState<{ action: string; current: number; total: number } | null>(null);

  // Design modal
  const [designModalOpen, setDesignModalOpen] = useState(false);

  // Bulk email modal
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });

  // ── Fetch all data ──────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [projSnap, personsSnap, certsSnap, designSnap] = await Promise.all([
        getDoc(doc(db, 'projects', projectId)),
        getDocs(query(
          collection(db, 'persons'),
          where('projectId', '==', projectId),
          where('attendanceStatus', '==', 'present')
        )),
        getDocs(query(collection(db, 'certificates'), where('projectId', '==', projectId))),
        getDoc(doc(db, 'certificate_designs', projectId)),
      ]);

      if (projSnap.exists()) setProject({ id: projSnap.id, ...projSnap.data() });
      setPersons(personsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Person)));

      const certMap: Record<string, CertRecord> = {};
      certsSnap.docs.forEach(d => { const data = d.data() as CertRecord; certMap[data.personId] = data; });
      setCerts(certMap);

      // Fetch email templates
      const tmplSnap = await getDocs(collection(db, 'EmailTemplates'));
      setTemplates(tmplSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      if (designSnap.exists()) {
        const d = designSnap.data();
        setDesign({ ...DEFAULT_CERT_DESIGN, ...d } as CertDesign);
      }
    } catch (e) {
      console.error('Error fetching data:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Selection helpers ───────────────────────────────────────────────────────
  const filtered = persons.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.fullName?.toLowerCase().includes(q) ||
      p.kabupaten?.toLowerCase().includes(q) ||
      p.kecamatan?.toLowerCase().includes(q) ||
      p.desa?.toLowerCase().includes(q) ||
      p.posisi?.toLowerCase().includes(q)
    );
  });

  const allSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(prev => { const s = new Set(prev); filtered.forEach(p => s.delete(p.id)); return s; });
    } else {
      setSelectedIds(prev => { const s = new Set(prev); filtered.forEach(p => s.add(p.id)); return s; });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  // ── Generate single certificate ─────────────────────────────────────────────
  const handleGenerate = async (person: Person, silent = false) => {
    if (!project || !projectId) return;
    setGenerating(prev => new Set(prev).add(person.id));
    try {
      const blob = buildCertificatePDF(person, project, design);
      const storageRef = ref(storage, `certificates/${projectId}/${person.id}.pdf`);
      const uploadResult = await uploadBytes(storageRef, blob, { contentType: 'application/pdf' });
      const url = await getDownloadURL(uploadResult.ref);

      const certDocId = `${projectId}_${person.id}`;
      await setDoc(doc(db, 'certificates', certDocId), {
        personId: person.id, projectId,
        personName: person.fullName, personEmail: person.email,
        url, generatedAt: serverTimestamp(),
        emailSentAt: certs[person.id]?.emailSentAt ?? null,
      });

      setCerts(prev => ({
        ...prev,
        [person.id]: { personId: person.id, projectId: projectId!, url, generatedAt: new Date(), emailSentAt: prev[person.id]?.emailSentAt ?? null },
      }));

      if (!silent) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Sertifikat_${person.fullName.replace(/\s+/g, '_')}_${project.name.replace(/\s+/g, '_')}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch (e) {
      console.error('Error generating certificate:', e);
    } finally {
      setGenerating(prev => { const s = new Set(prev); s.delete(person.id); return s; });
    }
  };

  // ── Send single email ───────────────────────────────────────────────────────
  const handleSendEmail = async (person: Person, silent = false) => {
    if (!project || !projectId) return;
    const cert = certs[person.id];
    if (!cert?.url || !person.email) return;
    setEmailing(prev => new Set(prev).add(person.id));
    try {
      await addDoc(collection(db, 'mail'), {
        to: person.email,
        message: {
          subject: `Sertifikat Kehadiran – ${project.name}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
              <h2 style="color:#4F46E5;">Sertifikat Kehadiran</h2>
              <p>Yth. <strong>${person.fullName}</strong>,</p>
              <p>Terima kasih telah berpartisipasi dalam kegiatan <strong>${project.name}</strong>
              yang diselenggarakan pada ${project.startDate} – ${project.endDate} di ${project.kabupaten}.</p>
              <p>Silakan unduh sertifikat kehadiran Anda melalui tautan berikut:</p>
              <p><a href="${cert.url}" style="display:inline-block;padding:10px 20px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">Unduh Sertifikat</a></p>
              <p style="color:#64748B;font-size:12px;margin-top:24px;">Email ini dikirim otomatis oleh sistem Event Portal.</p>
            </div>`,
          attachments: [{ filename: `Sertifikat_${person.fullName.replace(/\s+/g, '_')}.pdf`, path: cert.url }],
        },
      });
      await updateDoc(doc(db, 'certificates', `${projectId}_${person.id}`), { emailSentAt: serverTimestamp() });
      setCerts(prev => ({ ...prev, [person.id]: { ...prev[person.id], emailSentAt: new Date() } }));
      if (!silent) {
        setEmailSuccess(prev => new Set(prev).add(person.id));
        setTimeout(() => setEmailSuccess(prev => { const s = new Set(prev); s.delete(person.id); return s; }), 3000);
      }
    } catch (e) {
      console.error('Error sending email:', e);
    } finally {
      setEmailing(prev => { const s = new Set(prev); s.delete(person.id); return s; });
    }
  };

  // ── Bulk generate ───────────────────────────────────────────────────────────
  const handleBulkGenerate = async () => {
    const ids = [...selectedIds].filter(id => filtered.some(p => p.id === id));
    setBulkOp({ action: 'generate', current: 0, total: ids.length });
    for (let i = 0; i < ids.length; i++) {
      const person = persons.find(p => p.id === ids[i]);
      if (person) await handleGenerate(person, true); // silent: no individual download
      setBulkOp({ action: 'generate', current: i + 1, total: ids.length });
    }
    setBulkOp(null);
    setSelectedIds(new Set());
  };

  // ── Bulk send email ─────────────────────────────────────────────────────────
  const handleBulkSendEmail = async () => {
    const ids = [...selectedIds].filter(id => {
      const p = persons.find(x => x.id === id);
      return p && certs[id]?.url && p.email;
    });
    if (ids.length === 0) { alert('Tidak ada peserta terpilih yang memiliki sertifikat dan email.'); return; }
    setBulkOp({ action: 'email', current: 0, total: ids.length });
    for (let i = 0; i < ids.length; i++) {
      const person = persons.find(p => p.id === ids[i]);
      if (person) await handleSendEmail(person, true);
      setBulkOp({ action: 'email', current: i + 1, total: ids.length });
    }
    setBulkOp(null);
    setSelectedIds(new Set());
  };

  // ── Bulk send email via modal ───────────────────────────────────────────────
  const handleSendBatchEmail = async (selectedIds: string[], templateId: string, emailBody: string) => {
    if (!project || !projectId) return;
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    const recipients = selectedIds
      .map(id => persons.find(p => p.id === id))
      .filter((p): p is Person => !!p && !!certs[p.id]?.url && !!p.email)
      .map(p => ({
        id: `${projectId}_${p.id}`,
        email: p.email,
        collectionPath: 'certificates',
        projectId,
        variables: {
          namaPeserta: p.fullName,
          emailPeserta: p.email,
          namaProyek: project.name,
          tanggalMulai: project.startDate,
          tanggalSelesai: project.endDate,
          namaVenue: project.kabupaten,
          linkSertifikat: certs[p.id]?.url || '',
        },
      }));

    if (recipients.length === 0) return;

    setIsSending(true);
    setSendProgress({ current: 0, total: recipients.length });

    await sendBatchEmail(
      recipients,
      { subject: template.subject, body: emailBody },
      {
        total: recipients.length,
        current: 0,
        onProgress: (n) => setSendProgress({ current: n, total: recipients.length }),
        onSuccess: (id) => {
          const personId = id.replace(`${projectId}_`, '');
          setCerts(prev => ({
            ...prev,
            [personId]: { ...prev[personId], emailStatus: 'sent', emailSentAt: new Date() },
          }));
        },
        onError: (id) => {
          const personId = id.replace(`${projectId}_`, '');
          setCerts(prev => ({
            ...prev,
            [personId]: { ...prev[personId], emailStatus: 'failed' },
          }));
        },
      },
      'emailStatus'
    );

    setIsSending(false);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const formatTs = (ts: any) => {
    if (!ts) return null;
    try { const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return null; }
  };

  const getPosisi = (p: Person) => p.posisi === 'Lainnya' ? (p.posisiLainnya || '—') : (p.posisi || '—');

  const selectedInFiltered = filtered.filter(p => selectedIds.has(p.id)).length;
  const selectedWithCert = [...selectedIds].filter(id => certs[id]?.url && persons.find(p => p.id === id)?.email).length;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-7xl mx-auto">

        {/* Back */}
        <button onClick={() => navigate('/certificate-management')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />Kembali ke Certificate Management
        </button>

        {/* Project header */}
        {project && (
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 text-white mb-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="w-5 h-5 opacity-80" />
                  <span className="text-sm font-medium opacity-80">Certificate Management</span>
                </div>
                <h2 className="text-2xl font-bold mb-3">{project.name}</h2>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm opacity-90">
                  <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{project.startDate} – {project.endDate}</span>
                  <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{project.kabupaten}</span>
                  {project.venue && <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4" />{project.venue}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-3 flex-shrink-0">
                <div className="text-right">
                  <div className="text-3xl font-bold">{persons.length}</div>
                  <div className="text-sm opacity-80">Peserta Hadir</div>
                </div>
                <button onClick={() => setBulkEmailOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 text-sm font-semibold rounded-lg hover:bg-indigo-50 transition-colors shadow-sm">
                  <Send className="w-4 h-4" />
                  Kirim Email Massal
                </button>
                <button onClick={() => setDesignModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold rounded-lg transition-colors backdrop-blur-sm">
                  <Palette className="w-4 h-4" />
                  Edit Desain Sertifikat
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk progress bar */}
        {bulkOp && (
          <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3 flex items-center gap-4">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-indigo-800">
                {bulkOp.action === 'generate' ? 'Generating sertifikat...' : 'Mengirim email...'}
                <span className="ml-2 font-normal text-indigo-600">{bulkOp.current}/{bulkOp.total}</span>
              </p>
              <div className="mt-1.5 h-1.5 bg-indigo-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 transition-all duration-300"
                  style={{ width: `${(bulkOp.current / bulkOp.total) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Table card */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">

          {/* Toolbar */}
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cari nama, kabupaten, kecamatan, desa..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
            </div>

            {/* Bulk action bar */}
            {selectedInFiltered > 0 && (
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-lg">
                  {selectedInFiltered} dipilih
                </span>
                <button onClick={handleBulkGenerate} disabled={!!bulkOp}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  <Download className="w-3.5 h-3.5" />Generate Semua
                </button>
                <button onClick={handleBulkSendEmail} disabled={!!bulkOp || selectedWithCert === 0}
                  title={selectedWithCert === 0 ? 'Generate sertifikat terlebih dahulu' : undefined}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40 transition-colors">
                  <Mail className="w-3.5 h-3.5" />Kirim Email ({selectedWithCert})
                </button>
                <button onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-slate-500 hover:text-slate-700 underline transition-colors">
                  Batal
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Award className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{persons.length === 0 ? 'Belum ada peserta yang check-in.' : 'Tidak ada hasil pencarian.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {/* Select-all checkbox */}
                    <th className="px-4 py-3 w-10">
                      <button onClick={toggleSelectAll}
                        className="text-slate-400 hover:text-indigo-600 transition-colors">
                        {allSelected
                          ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                          : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-10">No</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nama Lengkap</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Kabupaten</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Kecamatan</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Desa</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Posisi</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sertifikat</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email Status</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((person, idx) => {
                    const cert = certs[person.id];
                    const isGenerating = generating.has(person.id);
                    const isEmailing = emailing.has(person.id);
                    const emailSent = emailSuccess.has(person.id);
                    const isSelected = selectedIds.has(person.id);

                    return (
                      <tr key={person.id}
                        className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-indigo-50/50' : ''}`}>
                        <td className="px-4 py-3">
                          <button onClick={() => toggleSelect(person.id)}
                            className="text-slate-400 hover:text-indigo-600 transition-colors">
                            {isSelected
                              ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                              : <Square className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{person.fullName}</td>
                        <td className="px-4 py-3 text-slate-600">{person.kabupaten || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{person.kecamatan || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{person.desa || '—'}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">{getPosisi(person)}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{person.email || '—'}</td>
                        <td className="px-4 py-3">
                          {cert?.url ? (
                            <a href={cert.url} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />Lihat PDF
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">Belum digenerate</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {cert?.emailStatus === 'sent' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-bold uppercase tracking-wider border border-emerald-100">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Terkirim
                            </span>
                          ) : cert?.emailStatus === 'failed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-600 rounded-full text-[9px] font-bold uppercase tracking-wider border border-rose-100">
                              Gagal
                            </span>
                          ) : cert?.emailSentAt ? (
                            <span className="text-[10px] text-slate-400">{formatTs(cert.emailSentAt)}</span>
                          ) : (
                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-center">
                            <button onClick={() => handleGenerate(person)} disabled={isGenerating || !!bulkOp}
                              title="Generate & Download"
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                              {cert?.url ? 'Regen' : 'Generate'}
                            </button>
                            <button onClick={() => handleSendEmail(person)}
                              disabled={isEmailing || !cert?.url || !person.email || !!bulkOp}
                              title={!cert?.url ? 'Generate dulu' : !person.email ? 'Tidak ada email' : 'Kirim email'}
                              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg disabled:cursor-not-allowed transition-colors ${
                                emailSent ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40'
                              }`}>
                              {isEmailing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : emailSent ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                              {emailSent ? 'Terkirim' : 'Email'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Design modal */}
      {designModalOpen && project && (
        <CertificateDesignModal
          projectId={projectId!}
          project={project}
          initialDesign={design}
          onSave={d => setDesign(d)}
          onClose={() => setDesignModalOpen(false)}
        />
      )}

      {/* Bulk email modal */}
      <BulkEmailModal
        isOpen={bulkEmailOpen}
        onClose={() => setBulkEmailOpen(false)}
        mode="certificate"
        title="Kirim Email Sertifikat Massal"
        recipients={persons.map(p => ({
          id: p.id,
          name: p.fullName,
          email: p.email,
          hasFile: !!certs[p.id]?.url,
          emailStatus: certs[p.id]?.emailStatus ?? null,
          variables: {},
        }))}
        templates={templates}
        onShowPreview={() => {}}
        onSendBatch={handleSendBatchEmail}
        isSending={isSending}
        sendProgress={sendProgress}
        variables={[
          { label: 'Nama Peserta', value: '{{namaPeserta}}' },
          { label: 'Email Peserta', value: '{{emailPeserta}}' },
          { label: 'Nama Proyek', value: '{{namaProyek}}' },
          { label: 'Tanggal Mulai', value: '{{tanggalMulai}}' },
          { label: 'Tanggal Selesai', value: '{{tanggalSelesai}}' },
          { label: 'Lokasi', value: '{{namaVenue}}' },
          { label: 'Link Sertifikat', value: '{{linkSertifikat}}' },
        ]}
      />
    </Layout>
  );
}
