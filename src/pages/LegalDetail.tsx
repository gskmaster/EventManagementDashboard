import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import Layout from '../components/Layout';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ArrowLeft, Shield, Mic, UserCheck, Handshake, Users,
  FileDown, Loader2, Calendar, MapPin, Building2, User,
  CheckCircle2, ChevronLeft, ChevronRight,
} from 'lucide-react';

type LogTab = 'peserta' | 'speakers' | 'ushers' | 'liaisons';

interface AuditLog {
  id: string;
  form_type: string;
  user_name: string;
  user_email: string;
  project_id: string | null;
  policy_version: string;
  consent_given: boolean;
  user_agent: string;
  ip_address: string;
  created_at: any;
}

const FORM_TYPE_MAP: Record<LogTab, string> = {
  peserta: 'public_registration',
  speakers: 'speaker_registration',
  ushers: 'usher_registration',
  liaisons: 'lo_registration',
};

const TAB_LABEL: Record<LogTab, string> = {
  peserta: 'Peserta',
  speakers: 'Narasumber',
  ushers: 'Usher',
  liaisons: 'Liaison Officer',
};

function formatTs(ts: any): string {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return '—'; }
}

function formatTsForPDF(ts: any): string {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toISOString().replace('T', ' ').slice(0, 19);
  } catch { return '—'; }
}

export default function LegalDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState<any>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<LogTab>('peserta');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    const fetchAll = async () => {
      if (!projectId) return;
      setLoading(true);
      try {
        const projSnap = await getDoc(doc(db, 'projects', projectId));
        if (projSnap.exists()) setProject({ id: projSnap.id, ...projSnap.data() });
      } catch (e) { console.error('Error fetching project:', e); }
      try {
        const logsSnap = await getDocs(query(collection(db, 'audit_logs'), where('project_id', '==', projectId)));
        setLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog)));
      } catch (e) { console.warn('audit_logs access denied or unavailable:', e); }
      setLoading(false);
    };
    fetchAll();
  }, [projectId]);

  useEffect(() => { setPage(1); }, [activeTab]);

  const tabLogs = useMemo(
    () => logs.filter(l => l.form_type === FORM_TYPE_MAP[activeTab]),
    [logs, activeTab]
  );

  const totalPages = Math.ceil(tabLogs.length / pageSize);
  const pagedLogs = tabLogs.slice((page - 1) * pageSize, page * pageSize);

  const tabCounts = useMemo(() => {
    const counts: Record<LogTab, number> = { peserta: 0, speakers: 0, ushers: 0, liaisons: 0 };
    logs.forEach(l => {
      const tab = (Object.entries(FORM_TYPE_MAP).find(([, v]) => v === l.form_type)?.[0]) as LogTab | undefined;
      if (tab) counts[tab]++;
    });
    return counts;
  }, [logs]);

  const handleExportPDF = (tab: LogTab) => {
    if (!project) return;
    const tabLogs = logs.filter(l => l.form_type === FORM_TYPE_MAP[tab]);
    if (tabLogs.length === 0) return;

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const now = new Date().toLocaleString('id-ID');

    // Header
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('AUDIT LOG PERSETUJUAN DATA PRIBADI', 14, 16);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(80);
    pdf.text(`Proyek: ${project.name}`, 14, 23);
    pdf.text(`Kategori: ${TAB_LABEL[tab]}`, 14, 28);
    pdf.text(`Tanggal: ${project.startDate} – ${project.endDate}  |  Lokasi: ${project.kabupaten}`, 14, 33);
    pdf.text(`Dicetak: ${now}  |  Total: ${tabLogs.length} catatan`, 14, 38);
    pdf.text('Dasar Hukum: UU Perlindungan Data Pribadi (UU PDP) No. 27 Tahun 2022', 14, 43);
    pdf.setTextColor(0);

    autoTable(pdf, {
      startY: 48,
      head: [['No', 'Nama', 'Email', 'Waktu Persetujuan', 'Versi Kebijakan', 'IP Address', 'Status Consent']],
      body: tabLogs.map((log, i) => [
        i + 1,
        log.user_name || '—',
        log.user_email || '—',
        formatTsForPDF(log.created_at),
        log.policy_version || '—',
        log.ip_address || '—',
        log.consent_given ? 'DISETUJUI' : 'DITOLAK',
      ]),
      headStyles: { fillColor: [63, 63, 240], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        4: { cellWidth: 25 },
        5: { cellWidth: 28 },
        6: { cellWidth: 25, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.column.index === 6 && data.section === 'body') {
          data.cell.styles.textColor =
            data.cell.raw === 'DISETUJUI' ? [22, 163, 74] : [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left: 14, right: 14 },
    });

    // Footer on each page
    const pageCount = (pdf as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(7);
      pdf.setTextColor(150);
      pdf.text(
        `Dokumen ini adalah catatan audit resmi yang dihasilkan secara otomatis. Halaman ${i} dari ${pageCount}`,
        14,
        pdf.internal.pageSize.height - 6
      );
    }

    const safeProjectName = project.name.replace(/[/\\?%*:|"<>]/g, '-');
    pdf.save(`Audit-Log-${safeProjectName}-${TAB_LABEL[tab]}.pdf`);
  };

  const handleExportAllPDF = () => {
    if (!project || logs.length === 0) return;

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const now = new Date().toLocaleString('id-ID');
    let isFirst = true;

    (['peserta', 'speakers', 'ushers', 'liaisons'] as LogTab[]).forEach(tab => {
      const tabLogs = logs.filter(l => l.form_type === FORM_TYPE_MAP[tab]);
      if (tabLogs.length === 0) return;

      if (!isFirst) pdf.addPage();
      isFirst = false;

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0);
      pdf.text('AUDIT LOG PERSETUJUAN DATA PRIBADI', 14, 16);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(80);
      pdf.text(`Proyek: ${project.name}  |  Kategori: ${TAB_LABEL[tab]}`, 14, 23);
      pdf.text(`Tanggal: ${project.startDate} – ${project.endDate}  |  Lokasi: ${project.kabupaten}`, 14, 28);
      pdf.text(`Dicetak: ${now}  |  Total: ${tabLogs.length} catatan`, 14, 33);
      pdf.text('Dasar Hukum: UU PDP No. 27 Tahun 2022', 14, 38);
      pdf.setTextColor(0);

      autoTable(pdf, {
        startY: 43,
        head: [['No', 'Nama', 'Email', 'Waktu Persetujuan', 'Versi Kebijakan', 'IP Address', 'Status Consent']],
        body: tabLogs.map((log, i) => [
          i + 1,
          log.user_name || '—',
          log.user_email || '—',
          formatTsForPDF(log.created_at),
          log.policy_version || '—',
          log.ip_address || '—',
          log.consent_given ? 'DISETUJUI' : 'DITOLAK',
        ]),
        headStyles: { fillColor: [63, 63, 240], fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          4: { cellWidth: 25 },
          5: { cellWidth: 28 },
          6: { cellWidth: 25, halign: 'center' },
        },
        didParseCell: (data) => {
          if (data.column.index === 6 && data.section === 'body') {
            data.cell.styles.textColor =
              data.cell.raw === 'DISETUJUI' ? [22, 163, 74] : [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
        },
        margin: { left: 14, right: 14 },
      });
    });

    const pageCount = (pdf as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(7);
      pdf.setTextColor(150);
      pdf.text(
        `Dokumen audit resmi – dihasilkan otomatis. Halaman ${i} dari ${pageCount}`,
        14,
        pdf.internal.pageSize.height - 6
      );
    }

    const safeProjectName = project.name.replace(/[/\\?%*:|"<>]/g, '-');
    pdf.save(`Audit-Log-Lengkap-${safeProjectName}.pdf`);
  };

  if (loading) return (
    <Layout>
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    </Layout>
  );

  if (!project) return null;

  const TABS: { key: LogTab; label: string; Icon: any }[] = [
    { key: 'peserta',  label: 'Peserta',          Icon: Users },
    { key: 'speakers', label: 'Narasumber',        Icon: Mic },
    { key: 'ushers',   label: 'Usher',             Icon: UserCheck },
    { key: 'liaisons', label: 'Liaison Officer',   Icon: Handshake },
  ];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto pb-12">
        <button
          onClick={() => navigate('/legal-management')}
          className="flex items-center text-slate-500 hover:text-indigo-600 transition-colors mb-6 group"
        >
          <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
          Kembali ke Legal Management
        </button>

        {/* Project Header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          <div className="bg-gradient-to-br from-indigo-700 to-indigo-900 px-8 py-6 text-white">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 opacity-80" />
                  <span className="text-sm font-medium opacity-80">Audit Log Persetujuan</span>
                </div>
                <h1 className="text-xl font-bold mb-3">{project.name}</h1>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm opacity-90">
                  <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{project.startDate} – {project.endDate}</span>
                  <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{project.kabupaten}</span>
                  <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{project.venue || '—'}</span>
                  <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />PIC: {project.pic}</span>
                </div>
              </div>
              {/* Summary pills */}
              <div className="flex gap-3 flex-shrink-0">
                {TABS.map(({ key, label }) => (
                  <div key={key} className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center">
                    <p className="text-xl font-bold">{tabCounts[key]}</p>
                    <p className="text-[11px] opacity-80 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Card header */}
          <div className="px-8 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Catatan Audit</h2>
              <p className="text-sm text-slate-500">UU PDP No. 27 Tahun 2022 — bukti persetujuan pemrosesan data pribadi.</p>
            </div>
            <button
              onClick={handleExportAllPDF}
              disabled={logs.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              <FileDown className="w-4 h-4" />
              Export Semua PDF
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            {TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-1 flex flex-col items-center py-3.5 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === key
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    activeTab === key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                  }`}>{tabCounts[key]}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Tab actions row */}
          <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {tabLogs.length} catatan consent untuk {TAB_LABEL[activeTab]}
            </p>
            <button
              onClick={() => handleExportPDF(activeTab)}
              disabled={tabLogs.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileDown className="w-3.5 h-3.5" />
              Export Tab Ini
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {tabLogs.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <Shield className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">Belum ada catatan audit untuk tab ini.</p>
                <p className="text-xs mt-1 opacity-70">Catatan akan muncul setelah peserta mengisi formulir pendaftaran.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-10">No</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Waktu Persetujuan</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Versi Kebijakan</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">IP Address</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedLogs.map((log, i) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-400">{(page - 1) * pageSize + i + 1}</td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-slate-800">{log.user_name || '—'}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{log.user_email || '—'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">{formatTs(log.created_at)}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">
                          v{log.policy_version || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-500">{log.ip_address || '—'}</td>
                      <td className="px-6 py-4 text-center">
                        {log.consent_given ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Disetujui
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full">Ditolak</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
              <span>
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, tabLogs.length)} dari {tabLogs.length} catatan
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 font-medium">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
