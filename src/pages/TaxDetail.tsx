import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  doc, getDoc, setDoc, updateDoc, addDoc,
  collection, query, where, getDocs, orderBy,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../components/AuthContext';
import Layout from '../components/Layout';
import {
  ArrowLeft, Mic, UserCheck, Handshake, Users, FileUp, ExternalLink,
  Loader2, Save, X, Receipt, CheckCircle2, XCircle, Mail, Send,
  Calendar, MapPin, Building2, User, ChevronLeft, ChevronRight, FileSpreadsheet,
  Eye, AlertCircle
} from 'lucide-react';
import PreviewModal from '../components/PreviewModal';
import RichTextEditor from '../components/RichTextEditor';
import { sendTemplateEmail, resolveTemplateText, sendBatchEmail } from '../lib/sendTemplateEmail';
import BulkEmailModal from '../components/BulkEmailModal';
import { toast } from 'react-hot-toast';
import DOMPurify from 'dompurify';

type TaxTab = 'speakers' | 'ushers' | 'liaisons' | 'peserta';
type PersonType = 'speaker' | 'usher' | 'lo' | 'participant';
type TaxCategory = 'pph21' | 'pph23' | 'ppn';

interface DesaTax {
  id: string;
  projectId: string;
  kecamatan: string;
  desa: string;
  idBillingPph23: string;
  bupotPph23: string;
  idBillingPpn: string;
  bupotPpn: string;
  updatedAt: string;
}

interface Project {
  id: string; name: string; startDate: string; endDate: string;
  venue: string; pic: string; kabupaten: string; status: string;
  noMemo?: string;
}

interface TeamPayment {
  id: string; projectId: string; personId: string;
  personType: PersonType; personName: string;
  amount: number; dpp: number; taxRate: number;
  taxAmount: number; netAmount: number;
  buktiPotong: string; kwitansi: string;
  notes: string; 
  emailStatus?: 'sent' | 'failed';
  emailError?: string;
  createdAt: string; updatedAt: string;
}

interface FlatPerson {
  id: string; fullName: string; email: string; _type: PersonType;
}

const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

export default function TaxDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [speakers, setSpeakers] = useState<any[]>([]);
  const [ushers, setUshers] = useState<any[]>([]);
  const [liaisons, setLiaisons] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [teamPayments, setTeamPayments] = useState<Record<string, TeamPayment>>({});
  const [desaTaxes, setDesaTaxes] = useState<Record<string, DesaTax>>({});

  // Tab
  const [taxCategory, setTaxCategory] = useState<TaxCategory>('pph21');
  const [activeTab, setActiveTab] = useState<TaxTab>('speakers');

  // Upload modal
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingPersonName, setEditingPersonName] = useState('');
  const [editingPersonType, setEditingPersonType] = useState<PersonType>('speaker');
  const [buktiPotongFile, setBuktiPotongFile] = useState<File | null>(null);
  const [kwitansiFile, setKwitansiFile] = useState<File | null>(null);
  const [savingUpload, setSavingUpload] = useState(false);

  // Upload modal (Desa Taxes)
  const [editingDesa, setEditingDesa] = useState<{ kecamatan: string, desa: string } | null>(null);
  const [idBillingFile, setIdBillingFile] = useState<File | null>(null);
  const [bupotDesaFile, setBupotDesaFile] = useState<File | null>(null);

  // Email modal
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailFilter, setEmailFilter] = useState<'all' | 'bukti' | 'kwitansi' | 'complete'>('all');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailSentCount, setEmailSentCount] = useState(0);

  // Email templates
  const [emailTemplates, setEmailTemplates] = useState<{ id: string; name: string; subject: string; body: string }[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [singleRecipient, setSingleRecipient] = useState<FlatPerson | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  
  // Bulk Email State
  const [showBulkEmailModal, setShowBulkEmailModal] = useState(false);
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });

  // PPN per-desa email
  const [desaEmailTarget, setDesaEmailTarget] = useState<{ kecamatan: string; desa: string } | null>(null);
  const [sendingDesaEmail, setSendingDesaEmail] = useState(false);
  const [desaEmailSent, setDesaEmailSent] = useState(false);

  // Pagination
  const [taxPage, setTaxPage] = useState(1);
  const [taxPageSize, setTaxPageSize] = useState(10);

  // Preview modal
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('Preview Dokumen');

  useEffect(() => { fetchData(); }, [projectId]);
  useEffect(() => { setSelectedEmailIds(new Set()); setTaxPage(1); }, [activeTab, taxCategory]);
  useEffect(() => { setTaxPage(1); }, [taxPageSize]);

  useEffect(() => {
    getDocs(query(collection(db, 'EmailTemplates'), orderBy('createdAt', 'desc')))
      .then(snap => {
        const templates = snap.docs.map(d => ({
          id: d.id,
          name: d.data().name,
          subject: d.data().subject,
          body: d.data().body || '',
        }));
        setEmailTemplates(templates);
      });
  }, []);

  const handleSendBatchEmail = async (selectedIds: string[], templateId: string, customBody: string) => {
    if (!project) return;
    setIsSendingBulk(true);
    setSendProgress({ current: 0, total: selectedIds.length });
    
    try {
      const template = emailTemplates.find(t => t.id === templateId);
      if (!template) throw new Error('Template not found');

      const recipientsToSend = allPersonsFlat
        .filter(p => selectedIds.includes(p.id))
        .map(p => ({
          id: `${project.id}_${p.id}`, // Use the composite ID as the firestore document ID
          projectId: project.id,
          email: p.email,
          collectionPath: 'team_payments',
          variables: {
            namaPeserta: p.fullName || '',
            namaProyek: project.name || '',
            noMemo: project.noMemo || '',
            nilaiNetto: teamPayments[p.id]?.netAmount?.toLocaleString('id-ID') || '0',
            pph: teamPayments[p.id]?.taxAmount?.toLocaleString('id-ID') || '0',
          }
        }));

      await sendBatchEmail(
        recipientsToSend,
        { subject: template.subject, body: customBody },
        {
          total: recipientsToSend.length,
          current: 0,
          onProgress: (current) => setSendProgress({ current, total: recipientsToSend.length }),
          onSuccess: (_id) => {},
          onError: (_id, _error) => {},
        }
      );

      toast.success(`Berhasil mengirim ${selectedIds.length} email`);
      setShowBulkEmailModal(false);
      fetchData(); // Refresh to show status
    } catch (error: any) {
      toast.error('Gagal mengirim email massal: ' + error.message);
    } finally {
      setIsSendingBulk(false);
    }
  };

  // Sync Subject and Body when template or recipient changes
  useEffect(() => {
    if (!selectedTemplateId) {
      setEmailSubject('');
      setEmailBody('');
      return;
    }

    const t = emailTemplates.find(x => x.id === selectedTemplateId);
    if (!t) return;

    setEmailSubject(t.subject);

    // If single recipient, resolve with variables
    if (singleRecipient && project) {
      const vars = {
        namaProyek: project.name,
        tanggalMulai: project.startDate,
        tanggalSelesai: project.endDate,
        manajerProyek: project.pic,
        namaVenue: project.venue || '',
        namaPeserta: singleRecipient.fullName,
        emailPeserta: singleRecipient.email,
      };
      const res = resolveTemplateText(t.body, vars);
      setEmailBody(res.html);
    } else {
      // For bulk, just use the raw body or simple resolve if needed
      setEmailBody(t.body);
    }
  }, [selectedTemplateId, singleRecipient, emailTemplates, project]);

  const fetchData = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const projectSnap = await getDoc(doc(db, 'projects', projectId));
      if (!projectSnap.exists()) { navigate('/tax-management'); return; }
      setProject({ id: projectSnap.id, ...projectSnap.data() } as Project);

      const [spkSnap, usherSnap, loSnap, regSnap] = await Promise.all([
        getDocs(query(collection(db, 'Speakers'), where('projectIds', 'array-contains', projectId))),
        getDocs(query(collection(db, 'ushers'), where('projectIds', 'array-contains', projectId))),
        getDocs(query(collection(db, 'liaison_officers'), where('projectIds', 'array-contains', projectId))),
        getDocs(query(collection(db, 'persons'), where('projectId', '==', projectId))),
      ]);

      let tpSnap: any = { docs: [] };
      try {
        tpSnap = await getDocs(query(collection(db, 'team_payments'), where('projectId', '==', projectId)));
      } catch (e) { console.warn('team_payments fetch failed:', e); }

      let dtSnap: any = { docs: [] };
      try {
        dtSnap = await getDocs(query(collection(db, 'desa_taxes'), where('projectId', '==', projectId)));
      } catch (e) { console.warn('desa_taxes fetch failed:', e); }

      setSpeakers(spkSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setUshers(usherSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLiaisons(loSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const tpMap: Record<string, TeamPayment> = {};
      tpSnap.docs.forEach((d: any) => {
        const data = d.data();
        tpMap[data.personId] = { id: d.id, ...data } as TeamPayment;
      });
      setTeamPayments(tpMap);

      const dtMap: Record<string, DesaTax> = {};
      dtSnap.docs.forEach((d: any) => {
        const data = d.data();
        dtMap[`${data.kecamatan}_${data.desa}`] = { id: d.id, ...data } as DesaTax;
      });
      setDesaTaxes(dtMap);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const tabPersons = useMemo(() => {
    if (activeTab === 'speakers') return speakers;
    if (activeTab === 'ushers') return ushers;
    if (activeTab === 'liaisons') return liaisons;
    return registrations;
  }, [activeTab, speakers, ushers, liaisons, registrations]);

  // All persons flat (for email)
  const allPersonsFlat: FlatPerson[] = useMemo(() => [
    ...speakers.map(p => ({ id: p.id, fullName: p.fullName || '', email: p.email || '', _type: 'speaker' as PersonType })),
    ...ushers.map(p => ({ id: p.id, fullName: p.fullName || '', email: p.email || '', _type: 'usher' as PersonType })),
    ...liaisons.map(p => ({ id: p.id, fullName: p.fullName || '', email: p.email || '', _type: 'lo' as PersonType })),
    ...registrations.map(p => ({ id: p.id, fullName: p.fullName || '', email: p.email || '', _type: 'participant' as PersonType })),
  ], [speakers, ushers, liaisons, registrations]);

  const openUploadModal = (personId: string, personType: PersonType, personName: string) => {
    setEditingPersonId(personId);
    setEditingPersonType(personType);
    setEditingPersonName(personName);
    setBuktiPotongFile(null);
    setKwitansiFile(null);
  };

  const handleSaveUpload = async () => {
    if (!editingPersonId || !projectId) return;
    setSavingUpload(true);
    try {
      const now = new Date().toISOString();
      const docId = `${projectId}_${editingPersonId}`;
      const existing = teamPayments[editingPersonId];

      let buktiPotongUrl = existing?.buktiPotong || '';
      let kwitansiUrl = existing?.kwitansi || '';

      if (buktiPotongFile) {
        const r = ref(storage, `bukti_potong/${projectId}/${docId}_${Date.now()}_${buktiPotongFile.name}`);
        buktiPotongUrl = await getDownloadURL((await uploadBytes(r, buktiPotongFile)).ref);
      }
      if (kwitansiFile) {
        const r = ref(storage, `kwitansi/${projectId}/${docId}_${Date.now()}_${kwitansiFile.name}`);
        kwitansiUrl = await getDownloadURL((await uploadBytes(r, kwitansiFile)).ref);
      }

      if (existing) {
        await updateDoc(doc(db, 'team_payments', existing.id), {
          buktiPotong: buktiPotongUrl, kwitansi: kwitansiUrl, updatedAt: now,
        });
      } else {
        await setDoc(doc(db, 'team_payments', docId), {
          projectId, personId: editingPersonId, personType: editingPersonType,
          personName: editingPersonName,
          amount: 0, dpp: 0, taxRate: 0, taxAmount: 0, netAmount: 0,
          buktiPotong: buktiPotongUrl, kwitansi: kwitansiUrl,
          notes: '', createdAt: now, updatedAt: now,
        });
      }
      await fetchData();
      setEditingPersonId(null);
    } catch (e) { console.error(e); }
    finally { setSavingUpload(false); }
  };

  const handleExportExcel = () => {
    if (!project) return;
    const rows = tabPersons.map(person => {
      const tp = teamPayments[person.id];
      return {
        Nama: person.fullName || '',
        Email: person.email || '',
        Bruto: tp?.amount ?? 0,
        'DPP (50%)': tp?.dpp ?? 0,
        'PPH 21 (PS.17)': -(tp?.taxAmount ?? 0),
        Neto: tp?.netAmount ?? 0,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tabLabel[activeTab]);
    const safeProjectName = project.name.replace(/[/\\?%*:|"<>]/g, '-');
    XLSX.writeFile(wb, `${safeProjectName} - ${tabLabel[activeTab]}.xlsx`);
  };

  const tabLabel: Record<TaxTab, string> = {
    speakers: 'Narasumber', ushers: 'Usher', liaisons: 'Liaison Officer', peserta: 'Peserta',
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        </div>
      </Layout>
    );
  }
  if (!project) return null;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto pb-12">
        <button
          onClick={() => navigate('/tax-management')}
          className="flex items-center text-slate-500 hover:text-teal-600 transition-colors mb-6 group"
        >
          <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
          Kembali ke Tax Management
        </button>

        {/* Project Header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          <div className="bg-gradient-to-br from-teal-600 to-teal-800 px-8 py-6 text-white">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold mb-3">{project.name}</h1>
                <div className="flex flex-wrap gap-x-8 gap-y-1.5 text-sm opacity-90">
                  <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{project.startDate} – {project.endDate}</span>
                  <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{project.kabupaten}</span>
                  <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{project.venue || '—'}</span>
                  <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />PIC: {project.pic}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowBulkEmailModal(true)}
                  className="bg-white text-teal-700 hover:bg-teal-50 px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-teal-900/20 flex items-center gap-2 transition-all active:scale-95"
                >
                  <Mail className="w-4 h-4" />
                  Kirim Email Massal
                </button>
                <button
                  onClick={handleExportExcel}
                  className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Export Excel
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex border-b border-slate-100">
            {([
              { key: 'speakers' as TaxTab, label: 'Narasumber', Icon: Mic },
              { key: 'ushers'   as TaxTab, label: 'Usher',      Icon: UserCheck },
              { key: 'liaisons' as TaxTab, label: 'Liaison Officer', Icon: Handshake },
              { key: 'peserta'  as TaxTab, label: 'Peserta',    Icon: Users },
            ]).map(({ key, label, Icon }) => {
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 flex flex-col items-center py-4 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === key ? 'border-teal-600 text-teal-700 bg-teal-50/30' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-4 h-4" />
                    {label}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Nama & Email</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Bruto</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">PPh 21</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Neto</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Bukti Potong</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Kwitansi</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Email Status</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tabPersons.map(person => {
                  const tp = teamPayments[person.id];
                  return (
                    <tr key={person.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 text-sm">{person.fullName}</div>
                        <div className="text-xs text-slate-500">{person.email || 'No Email'}</div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium text-slate-700 whitespace-nowrap">
                        {tp?.amount ? fmt(tp.amount) : '—'}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium text-rose-600 whitespace-nowrap">
                        {tp?.taxAmount ? fmt(tp.taxAmount) : '—'}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-bold text-teal-700 whitespace-nowrap">
                        {tp?.netAmount ? fmt(tp.netAmount) : '—'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {tp?.buktiPotong ? (
                          <button 
                            onClick={() => {
                              setPreviewUrl(tp.buktiPotong);
                              setPreviewTitle(`Bukti Potong - ${person.fullName}`);
                            }} 
                            className="text-teal-600 hover:text-teal-700 font-bold text-xs uppercase underline"
                          >
                            Lihat PDF
                          </button>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Belum ada</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {tp?.kwitansi ? (
                          <button 
                            onClick={() => {
                              setPreviewUrl(tp.kwitansi);
                              setPreviewTitle(`Kwitansi - ${person.fullName}`);
                            }} 
                            className="text-teal-600 hover:text-teal-700 font-bold text-xs uppercase underline"
                          >
                            Lihat PDF
                          </button>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Belum ada</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {tp?.emailStatus === 'sent' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-100">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Terkirim
                          </span>
                        ) : tp?.emailStatus === 'failed' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-bold uppercase tracking-wider border border-rose-100" title={tp.emailError}>
                            <AlertCircle className="w-3.5 h-3.5" /> Gagal
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openUploadModal(person.id, activeTab.slice(0,-1) as any, person.fullName)}
                          className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all"
                        >
                          <FileUp className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {editingPersonId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setEditingPersonId(null)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Upload Dokumen</h3>
              <button onClick={() => setEditingPersonId(null)} className="p-1.5 hover:bg-slate-100 rounded-full">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Penerima</label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700">{editingPersonName}</div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Bukti Potong (PDF)</label>
                  <input type="file" accept="application/pdf" onChange={e => setBuktiPotongFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Kwitansi (PDF)</label>
                  <input type="file" accept="application/pdf" onChange={e => setKwitansiFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100" />
                </div>
              </div>
              <button
                disabled={savingUpload || (!buktiPotongFile && !kwitansiFile)}
                onClick={handleSaveUpload}
                className="w-full py-3 bg-teal-600 text-white font-bold rounded-xl shadow-lg shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-40 flex items-center justify-center gap-2 transition-all mt-4"
              >
                {savingUpload ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Simpan & Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Email Modal Integration */}
      <BulkEmailModal
        isOpen={showBulkEmailModal}
        onClose={() => setShowBulkEmailModal(false)}
        title={`Kirim Bulk Email - ${tabLabel[activeTab]}`}
        recipients={tabPersons.map(p => ({
          id: p.id,
          name: p.fullName,
          email: p.email,
          hasFile: !!teamPayments[p.id]?.buktiPotong,
          hasKwitansi: !!teamPayments[p.id]?.kwitansi,
          emailStatus: teamPayments[p.id]?.emailStatus,
          variables: {
            namaPeserta: p.fullName,
            namaProyek: project.name,
          }
        }))}
        templates={emailTemplates}
        onShowPreview={() => {}}
        onSendBatch={handleSendBatchEmail}
        isSending={isSendingBulk}
        sendProgress={sendProgress}
        variables={[
          { label: 'Nama Proyek', value: '{{namaProyek}}' },
          { label: 'Nama Peserta', value: '{{namaPeserta}}' },
          { label: 'No Memo', value: '{{noMemo}}' },
          { label: 'Nilai Netto', value: '{{nilaiNetto}}' },
          { label: 'PPH', value: '{{pph}}' },
        ]}
      />

      <PreviewModal 
        url={previewUrl} 
        onClose={() => setPreviewUrl(null)} 
        title={previewTitle}
      />
    </Layout>
  );
}
