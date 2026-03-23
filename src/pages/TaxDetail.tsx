import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  doc, getDoc, setDoc, updateDoc, addDoc,
  collection, query, where, getDocs, orderBy,
} from 'firebase/firestore';
import { sendTemplateEmail } from '../lib/sendTemplateEmail';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../components/AuthContext';
import Layout from '../components/Layout';
import {
  ArrowLeft, Mic, UserCheck, Handshake, Users, FileUp, ExternalLink,
  Loader2, Save, X, Receipt, CheckCircle2, XCircle, Mail, Send,
  Calendar, MapPin, Building2, User, ChevronLeft, ChevronRight, FileSpreadsheet,
} from 'lucide-react';
import PreviewModal from '../components/PreviewModal';

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
}

interface TeamPayment {
  id: string; projectId: string; personId: string;
  personType: PersonType; personName: string;
  amount: number; dpp: number; taxRate: number;
  taxAmount: number; netAmount: number;
  buktiPotong: string; kwitansi: string;
  notes: string; createdAt: string; updatedAt: string;
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
  const [emailTemplates, setEmailTemplates] = useState<{ id: string; name: string; subject: string }[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // PPN per-desa email
  const [desaEmailTarget, setDesaEmailTarget] = useState<{ kecamatan: string; desa: string } | null>(null);
  const [sendingDesaEmail, setSendingDesaEmail] = useState(false);
  const [desaEmailSent, setDesaEmailSent] = useState(false);

  // Pagination
  const [taxPage, setTaxPage] = useState(1);
  const [taxPageSize, setTaxPageSize] = useState(10);

  // Preview modal
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, [projectId]);
  useEffect(() => { setSelectedEmailIds(new Set()); setTaxPage(1); }, [activeTab, taxCategory]);
  useEffect(() => { setTaxPage(1); }, [taxPageSize]);
  useEffect(() => {
    getDocs(query(collection(db, 'EmailTemplates'), orderBy('createdAt', 'desc')))
      .then(snap => setEmailTemplates(snap.docs.map(d => ({ id: d.id, name: d.data().name, subject: d.data().subject }))));
  }, []);

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

  const tabPersonType = (): PersonType => {
    if (activeTab === 'speakers') return 'speaker';
    if (activeTab === 'ushers') return 'usher';
    if (activeTab === 'liaisons') return 'lo';
    return 'participant';
  };

  const uniqueDesaList = useMemo(() => {
    const list: { kecamatan: string, desa: string }[] = [];
    const seen = new Set<string>();
    registrations.forEach(r => {
      if (r.kecamatan && r.desa) {
        const key = `${r.kecamatan}_${r.desa}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ kecamatan: r.kecamatan, desa: r.desa });
        }
      }
    });
    return list.sort((a,b) => a.kecamatan.localeCompare(b.kecamatan) || a.desa.localeCompare(b.desa));
  }, [registrations]);

  const totalItems = taxCategory === 'pph21' ? tabPersons.length : uniqueDesaList.length;
  const totalPages = Math.ceil(totalItems / taxPageSize);
  const pagedPersons = tabPersons.slice((taxPage - 1) * taxPageSize, taxPage * taxPageSize);
  const pagedDesaList = uniqueDesaList.slice((taxPage - 1) * taxPageSize, taxPage * taxPageSize);

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

  const openDesaUploadModal = (kecamatan: string, desa: string) => {
    setEditingDesa({ kecamatan, desa });
    setIdBillingFile(null);
    setBupotDesaFile(null);
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

  const handleSaveDesaUpload = async () => {
    if (!editingDesa || !projectId) return;
    setSavingUpload(true);
    try {
      const { kecamatan, desa } = editingDesa;
      const now = new Date().toISOString();
      const existing = desaTaxes[`${kecamatan}_${desa}`];

      let idBillingUrl = taxCategory === 'pph23' ? (existing?.idBillingPph23 || '') : (existing?.idBillingPpn || '');
      let bupotUrl = taxCategory === 'pph23' ? (existing?.bupotPph23 || '') : (existing?.bupotPpn || '');

      const prefix = `${projectId}_${kecamatan}_${desa}`.replace(/[\/\s]/g, '_');

      if (idBillingFile) {
        const r = ref(storage, `id_billing/${projectId}/${taxCategory}_${prefix}_${Date.now()}_${idBillingFile.name}`);
        idBillingUrl = await getDownloadURL((await uploadBytes(r, idBillingFile)).ref);
      }
      if (bupotDesaFile) {
        const r = ref(storage, `bupot_desa/${projectId}/${taxCategory}_${prefix}_${Date.now()}_${bupotDesaFile.name}`);
        bupotUrl = await getDownloadURL((await uploadBytes(r, bupotDesaFile)).ref);
      }

      if (existing) {
        const updateData: any = { updatedAt: now };
        if (taxCategory === 'pph23') {
          updateData.idBillingPph23 = idBillingUrl;
          updateData.bupotPph23 = bupotUrl;
        } else {
          updateData.idBillingPpn = idBillingUrl;
          updateData.bupotPpn = bupotUrl;
        }
        await updateDoc(doc(db, 'desa_taxes', existing.id), updateData);
      } else {
        const newData: any = {
          projectId, kecamatan, desa,
          idBillingPph23: taxCategory === 'pph23' ? idBillingUrl : '',
          bupotPph23: taxCategory === 'pph23' ? bupotUrl : '',
          idBillingPpn: taxCategory === 'ppn' ? idBillingUrl : '',
          bupotPpn: taxCategory === 'ppn' ? bupotUrl : '',
          createdAt: now, updatedAt: now,
        };
        await addDoc(collection(db, 'desa_taxes'), newData);
      }
      await fetchData();
      setEditingDesa(null);
    } catch (e) { console.error(e); }
    finally { setSavingUpload(false); }
  };

  const openEmailModal = () => {
    if (!project) return;
    // Pre-select PPH 21 template if exists
    const pph21Template = emailTemplates.find(t => t.name.toLowerCase().includes('pph 21') || t.name.toLowerCase().includes('pph21'));
    const preSelected = pph21Template?.id ?? emailTemplates[0]?.id ?? '';
    setSelectedTemplateId(preSelected);
    setEmailSubject(pph21Template?.subject ?? `Bukti Potong PPh 21 – ${project.name}`);
    setEmailFilter('all');
    setEmailSent(false);
    setEmailSentCount(0);
    setShowEmailModal(true);
  };

  const emailCandidates = useMemo(() => {
    const candidates = [...selectedEmailIds].map(id => allPersonsFlat.find(p => p.id === id)).filter(Boolean) as FlatPerson[];
    if (emailFilter === 'all') return candidates;
    return candidates.filter(p => {
      const tp = teamPayments[p.id];
      if (emailFilter === 'bukti') return !!tp?.buktiPotong;
      if (emailFilter === 'kwitansi') return !!tp?.kwitansi;
      if (emailFilter === 'complete') return !!tp?.buktiPotong && !!tp?.kwitansi;
      return true;
    });
  }, [selectedEmailIds, allPersonsFlat, teamPayments, emailFilter]);

  const handleSendEmail = async () => {
    if (!projectId || !project || emailCandidates.length === 0) return;
    setSendingEmail(true);
    let sent = 0;
    try {
      const vars = {
        namaProyek: project.name,
        tanggalMulai: project.startDate,
        tanggalSelesai: project.endDate,
        manajerProyek: project.pic,
        namaVenue: project.venue || '',
      };
      const recipients = emailCandidates.filter(p => p.email);
      for (const person of recipients) {
        const tp = teamPayments[person.id];
        const attachments: { filename: string; path: string }[] = [];
        if (tp?.buktiPotong) attachments.push({ filename: `BuktiPotong_PPH21_${person.fullName}.pdf`, path: tp.buktiPotong });
        if (tp?.kwitansi) attachments.push({ filename: `Kwitansi_${person.fullName}.pdf`, path: tp.kwitansi });
        await sendTemplateEmail({
          templateId: selectedTemplateId,
          to: person.email,
          variables: { ...vars, namaPeserta: person.fullName, emailPeserta: person.email },
          attachments,
        });
        sent++;
      }
      setEmailSentCount(sent);
      setEmailSent(true);
    } catch (e) { console.error(e); }
    finally { setSendingEmail(false); }
  };

  const openDesaEmailModal = (kecamatan: string, desa: string) => {
    setDesaEmailTarget({ kecamatan, desa });
    setDesaEmailSent(false);
  };

  const handleSendDesaEmail = async () => {
    if (!project || !desaEmailTarget) return;
    const { kecamatan, desa } = desaEmailTarget;
    const dt = desaTaxes[`${kecamatan}_${desa}`];
    const bupotUrl = taxCategory === 'ppn' ? dt?.bupotPpn : dt?.bupotPph23;
    if (!bupotUrl) return;

    // Find PPN template
    const ppnTemplate = emailTemplates.find(t => t.name.toLowerCase().includes('ppn') || t.name.toLowerCase().includes('pph 23'));
    if (!ppnTemplate) {
      alert('Template PPN/PPH 23 tidak ditemukan di Email Templates.');
      return;
    }

    setSendingDesaEmail(true);
    try {
      const vars = {
        namaProyek: project.name,
        tanggalMulai: project.startDate,
        tanggalSelesai: project.endDate,
        manajerProyek: project.pic,
        namaVenue: project.venue || '',
      };
      // Recipients = persons registered from this desa
      const desaPersons = registrations.filter(r => r.kecamatan === kecamatan && r.desa === desa && r.email);
      for (const person of desaPersons) {
        await sendTemplateEmail({
          templateId: ppnTemplate.id,
          to: person.email,
          variables: { ...vars, namaPeserta: person.fullName, emailPeserta: person.email },
          attachments: [{ filename: `Bupot_${taxCategory.toUpperCase()}_${kecamatan}_${desa}.pdf`, path: bupotUrl }],
        });
      }
      setDesaEmailSent(true);
    } catch (e) { console.error(e); }
    finally { setSendingDesaEmail(false); }
  };

  const tabLabel: Record<TaxTab, string> = {
    speakers: 'Narasumber', ushers: 'Usher', liaisons: 'Liaison Officer', peserta: 'Peserta',
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

  const typeLabel: Record<PersonType, string> = {
    speaker: 'Narasumber', usher: 'Usher', lo: 'Liaison Officer', participant: 'Peserta',
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      </Layout>
    );
  }
  if (!project) return null;

  const existingTP = editingPersonId ? teamPayments[editingPersonId] : null;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto pb-12">
        <button
          onClick={() => navigate('/tax-management')}
          className="flex items-center text-slate-500 hover:text-indigo-600 transition-colors mb-6 group"
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
              {/* Summary pills */}
              <div className="flex gap-3 flex-shrink-0">
                {[
                  { label: 'Bukti Potong', count: Object.values(teamPayments).filter(tp => tp.buktiPotong).length, total: [...speakers,...ushers,...liaisons,...registrations].length, color: 'bg-white/20' },
                  { label: 'Kwitansi', count: Object.values(teamPayments).filter(tp => tp.kwitansi).length, total: [...speakers,...ushers,...liaisons,...registrations].length, color: 'bg-white/20' },
                ].map(pill => (
                  <div key={pill.label} className={`${pill.color} backdrop-blur-sm rounded-xl px-4 py-3 text-center`}>
                    <p className="text-xl font-bold">{pill.count}<span className="text-sm font-normal opacity-70">/{pill.total}</span></p>
                    <p className="text-xs opacity-80 mt-0.5">{pill.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Dokumen Pajak</h2>
              <p className="text-sm text-slate-500">Upload bukti potong dan kwitansi untuk setiap anggota tim.</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleExportExcel}
                disabled={taxCategory !== 'pph21' || tabPersons.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Export Excel
              </button>
              {selectedEmailIds.size > 0 && taxCategory === 'pph21' && (
                <button
                  onClick={openEmailModal}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  Kirim Email ({selectedEmailIds.size})
                </button>
              )}
            </div>
          </div>

          {/* Top-Level Category Tabs */}
          <div className="flex border-b border-slate-100 bg-slate-50/50 p-2 gap-2">
            {[
              { key: 'pph21' as TaxCategory, label: 'PPh 21' },
              { key: 'pph23' as TaxCategory, label: 'PPh 23' },
              { key: 'ppn'   as TaxCategory, label: 'PPN' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTaxCategory(key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  taxCategory === key ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {taxCategory === 'pph21' ? (
            <>
              {/* Tabs */}
              <div className="flex border-b border-slate-100">
            {([
              { key: 'speakers' as TaxTab, label: 'Narasumber', persons: speakers, Icon: Mic },
              { key: 'ushers'   as TaxTab, label: 'Usher',      persons: ushers,   Icon: UserCheck },
              { key: 'liaisons' as TaxTab, label: 'Liaison Officer', persons: liaisons, Icon: Handshake },
              { key: 'peserta'  as TaxTab, label: 'Peserta',    persons: registrations, Icon: Users },
            ]).map(({ key, label, persons, Icon }) => {
              const uploaded = persons.filter(p => teamPayments[p.id]?.buktiPotong && teamPayments[p.id]?.kwitansi).length;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 flex flex-col items-center py-3.5 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === key ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      activeTab === key ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'
                    }`}>{persons.length}</span>
                  </div>
                  {persons.length > 0 && (
                    <span className="text-[11px] mt-0.5 font-normal text-slate-400">
                      {uploaded}/{persons.length} lengkap
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {tabPersons.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <Users className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">Tidak ada data</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50/50">
                  <tr>
                    <th className="pl-6 pr-2 py-3 w-8">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        checked={selectedEmailIds.size === tabPersons.length && tabPersons.length > 0}
                        onChange={e => {
                          if (e.target.checked) setSelectedEmailIds(new Set(tabPersons.map(p => p.id)));
                          else setSelectedEmailIds(new Set());
                        }}
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Bruto</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">DPP (50%)</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-teal-600 uppercase tracking-wider leading-tight">PPH 21<br/>(PS.17)</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Neto</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Bukti Potong</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Kwitansi</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedPersons.map(person => {
                    const tp = teamPayments[person.id];
                    const isSelected = selectedEmailIds.has(person.id);
                    return (
                      <tr key={person.id} className={`transition-colors ${isSelected ? 'bg-teal-50/30' : 'hover:bg-slate-50'}`}>
                        <td className="pl-6 pr-2 py-4 w-8">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                            checked={isSelected}
                            onChange={e => {
                              const next = new Set(selectedEmailIds);
                              if (e.target.checked) next.add(person.id);
                              else next.delete(person.id);
                              setSelectedEmailIds(next);
                            }}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {(person.fullName || '?').charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{person.fullName}</p>
                              <p className="text-xs text-slate-400">{person.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-slate-700">
                          {tp?.amount ? fmt(tp.amount) : <span className="text-slate-300 italic text-xs">—</span>}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-slate-700">
                          {tp?.dpp ? fmt(tp.dpp) : <span className="text-slate-300 italic text-xs">—</span>}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-red-600">
                          {tp?.taxAmount ? `- ${fmt(tp.taxAmount)}` : <span className="text-slate-300 italic text-xs font-normal">—</span>}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-bold text-slate-900">
                          {tp?.netAmount ? fmt(tp.netAmount) : <span className="text-slate-300 italic text-xs font-normal">—</span>}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {tp?.buktiPotong ? (
                            <button onClick={() => setPreviewUrl(tp.buktiPotong)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-full transition-colors">
                              <ExternalLink className="w-3 h-3" /> Lihat
                            </button>
                          ) : (
                            <span className="text-[11px] text-amber-600 font-medium">Belum ada</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {tp?.kwitansi ? (
                            <button onClick={() => setPreviewUrl(tp.kwitansi)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-full transition-colors">
                              <ExternalLink className="w-3 h-3" /> Lihat
                            </button>
                          ) : (
                            <span className="text-[11px] text-amber-600 font-medium">Belum ada</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => openUploadModal(person.id, tabPersonType(), person.fullName)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors ml-auto"
                          >
                            <FileUp className="w-3 h-3" />
                            Upload
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                  <tr>
                    <td className="pl-6 pr-2 py-3 w-8" />
                    <td className="px-6 py-3 text-sm font-bold text-slate-700">Subtotal</td>
                    <td className="px-6 py-3 text-right text-sm font-bold text-slate-700">
                      {fmt(tabPersons.reduce((a, p) => a + (teamPayments[p.id]?.amount || 0), 0))}
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-bold text-slate-700">
                      {fmt(tabPersons.reduce((a, p) => a + (teamPayments[p.id]?.dpp || 0), 0))}
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-bold text-red-600">
                      - {fmt(tabPersons.reduce((a, p) => a + (teamPayments[p.id]?.taxAmount || 0), 0))}
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-bold text-teal-700">
                      {fmt(tabPersons.reduce((a, p) => a + (teamPayments[p.id]?.netAmount || 0), 0))}
                    </td>
                    <td className="px-6 py-3 text-center text-xs text-slate-500">
                      {tabPersons.filter(p => teamPayments[p.id]?.buktiPotong).length}/{tabPersons.length} bukti
                    </td>
                    <td className="px-6 py-3 text-center text-xs text-slate-500">
                      {tabPersons.filter(p => teamPayments[p.id]?.kwitansi).length}/{tabPersons.length} kwitansi
                    </td>
                    <td className="px-6 py-3" />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
            </>
          ) : (
            <>
              {/* PPH 23 / PPN Table */}
              <div className="overflow-x-auto">
                {pagedDesaList.length === 0 ? (
                  <div className="flex flex-col items-center py-16 text-slate-400">
                    <MapPin className="w-10 h-10 mb-3 opacity-40" />
                    <p className="text-sm font-medium">Tidak ada data desa</p>
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50/50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Kecamatan</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Desa</th>
                        <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">ID Billing File</th>
                        <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          {taxCategory === 'pph23' ? 'Bupot PPh 23' : 'Bupot PPN'}
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedDesaList.map(desa => {
                        const dt = desaTaxes[`${desa.kecamatan}_${desa.desa}`];
                        const idBilling = taxCategory === 'pph23' ? dt?.idBillingPph23 : dt?.idBillingPpn;
                        const bupot = taxCategory === 'pph23' ? dt?.bupotPph23 : dt?.bupotPpn;
                        return (
                          <tr key={`${desa.kecamatan}_${desa.desa}`} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 text-sm font-medium text-slate-800">{desa.kecamatan}</td>
                            <td className="px-6 py-4 text-sm text-slate-700">{desa.desa}</td>
                            <td className="px-6 py-4 text-center">
                              {idBilling ? (
                                <button onClick={() => setPreviewUrl(idBilling)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-full transition-colors">
                                  <ExternalLink className="w-3 h-3" /> Lihat
                                </button>
                              ) : (
                                <span className="text-[11px] text-amber-600 font-medium">Belum ada</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              {bupot ? (
                                <button onClick={() => setPreviewUrl(bupot)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-full transition-colors">
                                  <ExternalLink className="w-3 h-3" /> Lihat
                                </button>
                              ) : (
                                <span className="text-[11px] text-amber-600 font-medium">Belum ada</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {bupot && (
                                  <button
                                    onClick={() => openDesaEmailModal(desa.kecamatan, desa.desa)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                                  >
                                    <Mail className="w-3 h-3" />
                                    Kirim
                                  </button>
                                )}
                                <button
                                  onClick={() => openDesaUploadModal(desa.kecamatan, desa.desa)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                                >
                                  <FileUp className="w-3 h-3" />
                                  Upload
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* Pagination */}
          {totalItems > 0 && (
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span>Tampilkan</span>
                <select
                  value={taxPageSize}
                  onChange={e => setTaxPageSize(Number(e.target.value))}
                  className="border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700 bg-white focus:ring-2 focus:ring-teal-500"
                >
                  {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} per halaman</option>)}
                </select>
                <span>
                  · {totalItems === 0 ? 0 : (taxPage - 1) * taxPageSize + 1}
                  –{Math.min(taxPage * taxPageSize, totalItems)} dari{' '}
                  <span className="font-medium text-slate-700">{totalItems}</span> data
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setTaxPage(1)} disabled={taxPage === 1}
                  className="p-1 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <button onClick={() => setTaxPage(p => Math.max(p - 1, 1))} disabled={taxPage === 1}
                  className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs">
                  ‹ Prev
                </button>
                <span className="font-medium text-slate-600 px-1">{taxPage} / {Math.max(totalPages, 1)}</span>
                <button onClick={() => setTaxPage(p => Math.min(p + 1, totalPages))} disabled={taxPage >= totalPages}
                  className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs">
                  Next ›
                </button>
                <button onClick={() => setTaxPage(totalPages)} disabled={taxPage >= totalPages}
                  className="p-1 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Upload Modal ──────────────────────────────────────────── */}
      {editingPersonId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setEditingPersonId(null)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Upload Dokumen</h3>
                <p className="text-sm text-slate-500">{editingPersonName}</p>
              </div>
              <button onClick={() => setEditingPersonId(null)} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                {/* Bukti Potong */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Bukti Potong</label>
                  {existingTP?.buktiPotong && !buktiPotongFile && (
                    <button onClick={() => setPreviewUrl(existingTP.buktiPotong)}
                      className="flex items-center gap-1 text-[11px] text-teal-600 hover:underline mb-1.5 focus:outline-none">
                      <ExternalLink className="w-3 h-3" /> Lihat file saat ini
                    </button>
                  )}
                  <label className="flex items-center gap-2 w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-teal-400 hover:text-teal-600 cursor-pointer transition-colors">
                    <FileUp className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{buktiPotongFile ? buktiPotongFile.name : 'Pilih file...'}</span>
                    <input type="file" className="sr-only" accept="image/*,application/pdf"
                      onChange={e => setBuktiPotongFile(e.target.files?.[0] || null)} />
                  </label>
                  {buktiPotongFile && (
                    <button onClick={() => setBuktiPotongFile(null)} className="mt-1 text-[11px] text-red-500 hover:underline">Hapus pilihan</button>
                  )}
                </div>
                {/* Kwitansi */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Kwitansi</label>
                  {existingTP?.kwitansi && !kwitansiFile && (
                    <button onClick={() => setPreviewUrl(existingTP.kwitansi)}
                      className="flex items-center gap-1 text-[11px] text-teal-600 hover:underline mb-1.5 focus:outline-none">
                      <ExternalLink className="w-3 h-3" /> Lihat file saat ini
                    </button>
                  )}
                  <label className="flex items-center gap-2 w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-teal-400 hover:text-teal-600 cursor-pointer transition-colors">
                    <FileUp className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{kwitansiFile ? kwitansiFile.name : 'Pilih file...'}</span>
                    <input type="file" className="sr-only" accept="image/*,application/pdf"
                      onChange={e => setKwitansiFile(e.target.files?.[0] || null)} />
                  </label>
                  {kwitansiFile && (
                    <button onClick={() => setKwitansiFile(null)} className="mt-1 text-[11px] text-red-500 hover:underline">Hapus pilihan</button>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 pt-2 flex gap-3">
              <button onClick={() => setEditingPersonId(null)}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                Batal
              </button>
              <button
                onClick={handleSaveUpload}
                disabled={savingUpload || (!buktiPotongFile && !kwitansiFile)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingUpload ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Desa Upload Modal ─────────────────────────────────────── */}
      {editingDesa && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setEditingDesa(null)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Upload Dokumen {taxCategory === 'pph23' ? 'PPh 23' : 'PPN'}</h3>
                <p className="text-sm text-slate-500">Kec. {editingDesa.kecamatan}, Desa {editingDesa.desa}</p>
              </div>
              <button onClick={() => setEditingDesa(null)} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                {/* ID Billing */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">ID Billing File</label>
                  {desaTaxes[`${editingDesa.kecamatan}_${editingDesa.desa}`] && 
                   (taxCategory === 'pph23' ? desaTaxes[`${editingDesa.kecamatan}_${editingDesa.desa}`].idBillingPph23 : desaTaxes[`${editingDesa.kecamatan}_${editingDesa.desa}`].idBillingPpn) && !idBillingFile && (
                    <button onClick={() => setPreviewUrl(taxCategory === 'pph23' ? desaTaxes[`${editingDesa.kecamatan}_${editingDesa.desa}`].idBillingPph23 : desaTaxes[`${editingDesa.kecamatan}_${editingDesa.desa}`].idBillingPpn)}
                      className="flex items-center gap-1 text-[11px] text-teal-600 hover:underline mb-1.5 focus:outline-none">
                      <ExternalLink className="w-3 h-3" /> Lihat file saat ini
                    </button>
                  )}
                  <label className="flex items-center gap-2 w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-teal-400 hover:text-teal-600 cursor-pointer transition-colors">
                    <FileUp className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{idBillingFile ? idBillingFile.name : 'Pilih file...'}</span>
                    <input type="file" className="sr-only" accept="image/*,application/pdf"
                      onChange={e => setIdBillingFile(e.target.files?.[0] || null)} />
                  </label>
                  {idBillingFile && (
                    <button onClick={() => setIdBillingFile(null)} className="mt-1 text-[11px] text-red-500 hover:underline">Hapus pilihan</button>
                  )}
                </div>
                {/* Bupot */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">{taxCategory === 'pph23' ? 'Bupot PPh 23' : 'Bupot PPN'}</label>
                  {desaTaxes[`${editingDesa.kecamatan}_${editingDesa.desa}`] && 
                   (taxCategory === 'pph23' ? desaTaxes[`${editingDesa.kecamatan}_${editingDesa.desa}`].bupotPph23 : desaTaxes[`${editingDesa.kecamatan}_${editingDesa.desa}`].bupotPpn) && !bupotDesaFile && (
                    <button onClick={() => setPreviewUrl(taxCategory === 'pph23' ? desaTaxes[`${editingDesa.kecamatan}_${editingDesa.desa}`].bupotPph23 : desaTaxes[`${editingDesa.kecamatan}_${editingDesa.desa}`].bupotPpn)}
                      className="flex items-center gap-1 text-[11px] text-teal-600 hover:underline mb-1.5 focus:outline-none">
                      <ExternalLink className="w-3 h-3" /> Lihat file saat ini
                    </button>
                  )}
                  <label className="flex items-center gap-2 w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-teal-400 hover:text-teal-600 cursor-pointer transition-colors">
                    <FileUp className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{bupotDesaFile ? bupotDesaFile.name : 'Pilih file...'}</span>
                    <input type="file" className="sr-only" accept="image/*,application/pdf"
                      onChange={e => setBupotDesaFile(e.target.files?.[0] || null)} />
                  </label>
                  {bupotDesaFile && (
                    <button onClick={() => setBupotDesaFile(null)} className="mt-1 text-[11px] text-red-500 hover:underline">Hapus pilihan</button>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 pt-2 flex gap-3">
              <button onClick={() => setEditingDesa(null)}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                Batal
              </button>
              <button
                onClick={handleSaveDesaUpload}
                disabled={savingUpload || (!idBillingFile && !bupotDesaFile)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingUpload ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Email Modal ───────────────────────────────────────────── */}
      {showEmailModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowEmailModal(false)} />
          <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Kirim Notifikasi Email</h3>
                <p className="text-sm text-slate-500">{project?.name}</p>
              </div>
              <button onClick={() => setShowEmailModal(false)} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {emailSent ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-teal-600" />
                </div>
                <h4 className="text-lg font-bold text-slate-900 mb-2">Notifikasi Terkirim!</h4>
                <p className="text-sm text-slate-500 mb-1">
                  {emailSentCount} email berhasil dikirim dengan lampiran dokumen pajak.
                </p>
                <p className="text-xs text-slate-400">Email diterima langsung oleh masing-masing penerima.</p>
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="mt-6 px-6 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors"
                >
                  Tutup
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {/* Filter */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Filter Penerima</p>
                    <div className="flex flex-wrap gap-2">
                      {([
                        { value: 'all', label: 'Semua yang dipilih' },
                        { value: 'bukti', label: 'Sudah ada bukti potong' },
                        { value: 'kwitansi', label: 'Sudah ada kwitansi' },
                        { value: 'complete', label: 'Dokumen lengkap' },
                      ] as { value: typeof emailFilter; label: string }[]).map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setEmailFilter(opt.value)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                            emailFilter === opt.value
                              ? 'bg-teal-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Recipients preview */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Penerima ({emailCandidates.filter(p => p.email).length} email valid)
                    </p>
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-36 overflow-y-auto">
                      {emailCandidates.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4">Tidak ada penerima sesuai filter</p>
                      ) : emailCandidates.map(p => (
                        <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                          <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                            {p.fullName.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-800 truncate">{p.fullName}</p>
                            <p className="text-[11px] text-slate-400 truncate">{p.email || <em>Tidak ada email</em>}</p>
                          </div>
                          <span className="text-[10px] text-slate-400 flex-shrink-0">{typeLabel[p._type]}</span>
                          {!p.email && <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Template picker */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Template Email</label>
                    {emailTemplates.length === 0 ? (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Belum ada template. Buat template di modul <strong>Template Email</strong>.
                      </p>
                    ) : (
                      <select
                        value={selectedTemplateId}
                        onChange={e => {
                          setSelectedTemplateId(e.target.value);
                          const t = emailTemplates.find(x => x.id === e.target.value);
                          if (t) setEmailSubject(t.subject);
                        }}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                      >
                        <option value="">— Pilih template —</option>
                        {emailTemplates.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Subjek Email</label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={e => setEmailSubject(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                    />
                  </div>

                  <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                    <Receipt className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700 leading-relaxed">
                      Email dikirim langsung per penerima dengan lampiran <strong>Bukti Potong</strong> dan <strong>Kwitansi</strong> masing-masing. Variabel seperti <code>{'{{namaPeserta}}'}</code> diisi otomatis.
                    </p>
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
                  <button onClick={() => setShowEmailModal(false)}
                    className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                    Batal
                  </button>
                  <button
                    onClick={handleSendEmail}
                    disabled={sendingEmail || emailCandidates.filter(p => p.email).length === 0 || !emailSubject.trim() || !selectedTemplateId}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {sendingEmail ? 'Mengirim...' : 'Kirim Email'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* ── PPN/PPH23 Desa Email Modal ─────────────────────────── */}
      {desaEmailTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDesaEmailTarget(null)} />
          <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Kirim Bupot {taxCategory === 'ppn' ? 'PPN' : 'PPH 23'}</h3>
                <p className="text-sm text-slate-500">Kec. {desaEmailTarget.kecamatan}, Desa {desaEmailTarget.desa}</p>
              </div>
              <button onClick={() => setDesaEmailTarget(null)} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {desaEmailSent ? (
              <div className="flex flex-col items-center py-10 px-6 text-center">
                <div className="w-14 h-14 bg-teal-100 rounded-full flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-7 h-7 text-teal-600" />
                </div>
                <h4 className="font-bold text-slate-900 mb-1">Email Terkirim!</h4>
                <p className="text-sm text-slate-500 mb-4">
                  Bupot {taxCategory === 'ppn' ? 'PPN' : 'PPH 23'} telah dikirim ke peserta dari desa {desaEmailTarget.desa}.
                </p>
                <button onClick={() => setDesaEmailTarget(null)}
                  className="px-5 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
                  Tutup
                </button>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                {(() => {
                  const desaPersons = registrations.filter(
                    r => r.kecamatan === desaEmailTarget.kecamatan && r.desa === desaEmailTarget.desa && r.email
                  );
                  return (
                    <>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
                        Dokumen akan dikirim ke <strong>{desaPersons.length} peserta</strong> dari desa ini yang memiliki email.
                      </div>
                      {emailTemplates.length === 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                          Template {taxCategory === 'ppn' ? 'PPN' : 'PPH 23'} belum dibuat. Buat di modul Template Email.
                        </div>
                      )}
                      {desaPersons.length === 0 && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                          Tidak ada peserta dari desa ini yang memiliki alamat email.
                        </div>
                      )}
                      <div className="flex gap-3 pt-2">
                        <button onClick={() => setDesaEmailTarget(null)}
                          className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                          Batal
                        </button>
                        <button
                          onClick={handleSendDesaEmail}
                          disabled={sendingDesaEmail || desaPersons.length === 0 || emailTemplates.length === 0}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {sendingDesaEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          {sendingDesaEmail ? 'Mengirim...' : 'Kirim Email'}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
      {/* ── Preview Modal ────────────────────────────────────────── */}
      <PreviewModal 
        url={previewUrl} 
        onClose={() => setPreviewUrl(null)} 
      />
    </Layout>
  );
}
