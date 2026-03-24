import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Layout from '../components/Layout';
import { useAuth } from '../components/AuthContext';
import PreviewModal from '../components/PreviewModal';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  User,
  Users,
  CreditCard,
  Mic,
  Search,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  UserCheck,
  UserX,
  Handshake,
  Loader2,
  Building2,
  UsersRound,
  CheckCircle2,
  Edit2,
  Wallet,
  Save,
  Receipt,
  FileUp,
  ExternalLink,
  Award,
  Mail,
  Filter,
  Download,
  MoreHorizontal,
  FileText,
  Clock,
  AlertCircle,
  Trash2,
  Send,
  Eye,
  Settings
} from 'lucide-react';

type ModalType = 'registered' | 'payments' | 'speakers' | 'ushers' | 'liaisons';
type AssignTab = 'speakers' | 'ushers' | 'liaisons';
type PaymentTab = 'speakers' | 'ushers' | 'liaisons' | 'peserta';
type PersonType = 'speaker' | 'usher' | 'lo' | 'participant';

interface Project {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  venue: string;
  pic: string;
  kabupaten: string;
  status: string;
}

/**
 * team_payments document shape
 * ID convention: {projectId}_{personId}
 */
interface TeamPayment {
  id: string;
  projectId: string;
  personId: string;
  personType: PersonType;
  personName: string;
  amount: number;       // gross honorarium (penghasilan bruto)
  dpp: number;          // dasar pengenaan pajak = 50% × amount
  taxRate: number;      // effective rate stored for display (taxAmount / amount × 100)
  taxAmount: number;    // PPh 21 Pasal 17 applied to DPP
  netAmount: number;    // amount - taxAmount
  buktiPotong: string;  // download URL of bukti potong file (empty by default)
  kwitansi: string;     // download URL of kwitansi file (empty by default)
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ── Tax engine: PMK 168/2023 · Bukan Pegawai (Freelance) ──────────────────────

const TAX_BRACKETS = [
  { limit: 60_000_000,    rate: 0.05 },
  { limit: 250_000_000,   rate: 0.15 },
  { limit: 500_000_000,   rate: 0.25 },
  { limit: 5_000_000_000, rate: 0.30 },
  { limit: Infinity,      rate: 0.35 },
];

interface TaxBracketLine { rate: number; base: number; tax: number; }

function applyPasal17(dpp: number): { tax: number; breakdown: TaxBracketLine[] } {
  let remaining = dpp;
  let prevLimit = 0;
  let totalTax = 0;
  const breakdown: TaxBracketLine[] = [];

  for (const bracket of TAX_BRACKETS) {
    if (remaining <= 0) break;
    const bracketSize = bracket.limit === Infinity ? remaining : bracket.limit - prevLimit;
    const taxableInBracket = Math.min(remaining, bracketSize);
    const taxInBracket = Math.round(taxableInBracket * bracket.rate);
    if (taxableInBracket > 0) {
      breakdown.push({ rate: bracket.rate * 100, base: taxableInBracket, tax: taxInBracket });
      totalTax += taxInBracket;
    }
    remaining -= taxableInBracket;
    prevLimit = bracket.limit === Infinity ? prevLimit : bracket.limit;
  }

  return { tax: totalTax, breakdown };
}

function calcBukanPegawai(gross: number) {
  const dpp = Math.round(gross * 0.5);           // 50% × bruto
  const { tax, breakdown } = applyPasal17(dpp);
  const effectiveRate = gross > 0 ? (tax / gross) * 100 : 0;
  return { gross, dpp, taxAmount: tax, netAmount: gross - tax, effectiveRate, breakdown };
}

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [speakers, setSpeakers] = useState<any[]>([]);
  const [ushers, setUshers] = useState<any[]>([]);
  const [liaisons, setLiaisons] = useState<any[]>([]);
  const [allSpeakers, setAllSpeakers] = useState<any[]>([]);
  const [allUshers, setAllUshers] = useState<any[]>([]);
  const [allLOs, setAllLOs] = useState<any[]>([]);
  const [assignLoading, setAssignLoading] = useState<string | null>(null);

  // team_payments keyed by personId
  const [teamPayments, setTeamPayments] = useState<Record<string, TeamPayment>>({});

  // Summary modal
  const [activeModal, setActiveModal] = useState<ModalType | null>(null);
  const [modalSearch, setModalSearch] = useState('');
  const [modalPage, setModalPage] = useState(1);
  const [modalAttendanceFilter, setModalAttendanceFilter] = useState<'all' | 'present' | 'absent'>('all');
  const MODAL_PAGE_SIZE = 10;

  // Assign team modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTab, setAssignTab] = useState<AssignTab>('speakers');
  const [assignSearch, setAssignSearch] = useState('');
  const [assignPage, setAssignPage] = useState(1);
  const ASSIGN_PAGE_SIZE = 8;

  // Honorarium management
  const [paymentTab, setPaymentTab] = useState<PaymentTab>('speakers');
  const [editingPayment, setEditingPayment] = useState<{
    personId: string;
    personType: PersonType;
    personName: string;
  } | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '' });
  const [savingPayment, setSavingPayment] = useState(false);
  const [buktiPotongFile, setBuktiPotongFile] = useState<File | null>(null);
  const [kwitansiFile, setKwitansiFile] = useState<File | null>(null);

  // Bulk honorarium
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkAmount, setBulkAmount] = useState('');
  const [savingBulk, setSavingBulk] = useState(false);

  // Honorarium table pagination
  const [honorariumPage, setHonorariumPage] = useState(1);
  const [honorariumPageSize, setHonorariumPageSize] = useState(10);

  // Certificate stats
  const [certGenerated, setCertGenerated] = useState(0);
  const [certEmailed, setCertEmailed] = useState(0);

  // PDF Preview Modal
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('Preview Dokumen');

  useEffect(() => { fetchProjectData(); }, [projectId]);

  const fetchProjectData = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const projectRef = doc(db, 'projects', projectId);
      const projectSnap = await getDoc(projectRef);
      if (projectSnap.exists()) {
        setProject({ id: projectSnap.id, ...projectSnap.data() } as Project);
      } else {
        navigate('/projects');
        return;
      }
      const projectData = projectSnap.data() as any;

      const [
        regSnap, instSnap, spkSnap, usherSnap, loSnap,
        allSpkSnap, allUsherSnap, allLoSnap,
      ] = await Promise.all([
        getDocs(query(collection(db, 'persons'), where('projectId', '==', projectId))),
        getDocs(query(collection(db, 'institutions'), where('kabupaten', '==', projectData.kabupaten))),
        getDocs(query(collection(db, 'Speakers'), where('projectIds', 'array-contains', projectId))),
        getDocs(query(collection(db, 'ushers'), where('projectIds', 'array-contains', projectId))),
        getDocs(query(collection(db, 'liaison_officers'), where('projectIds', 'array-contains', projectId))),
        getDocs(collection(db, 'Speakers')),
        getDocs(collection(db, 'ushers')),
        getDocs(collection(db, 'liaison_officers')),
      ]);

      // team_payments fetched separately so a permissions error doesn't block all other data
      let tpSnap: any = { docs: [] };
      try {
        tpSnap = await getDocs(query(collection(db, 'team_payments'), where('projectId', '==', projectId)));
      } catch (tpErr) {
        console.warn('team_payments not accessible (check emulator rules):', tpErr);
      }

      setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const paymentsJson: Record<string, any> = JSON.parse(projectData.payments || '{}');
      const institutionMap: Record<string, any> = {};
      instSnap.docs.forEach(d => {
        const data = d.data() as any;
        institutionMap[d.id] = { name: data.name || d.id, kecamatan: data.kecamatan || '', desa: data.desa || '' };
      });
      const paidEntries = Object.entries(paymentsJson)
        .filter(([, v]) => v?.status === 'yes')
        .map(([instId, v]) => ({
          id: instId,
          institutionName: institutionMap[instId]?.name || instId,
          kecamatan: v.kecamatan || institutionMap[instId]?.kecamatan || '',
          desa: v.desa || institutionMap[instId]?.desa || '',
          amount: v.amount || 0,
          transferpic: v.transferpic || '',
        }));
      setPayments(paidEntries);
      setSpeakers(spkSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setUshers(usherSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLiaisons(loSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllSpeakers(allSpkSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllUshers(allUsherSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllLOs(allLoSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const tpMap: Record<string, TeamPayment> = {};
      tpSnap.docs.forEach(d => {
        const data = d.data() as any;
        tpMap[data.personId] = { id: d.id, ...data } as TeamPayment;
      });
      setTeamPayments(tpMap);

      // Certificate stats (non-blocking)
      try {
        const certSnap = await getDocs(
          query(collection(db, 'certificates'), where('projectId', '==', projectId))
        );
        setCertGenerated(certSnap.size);
        setCertEmailed(certSnap.docs.filter(d => d.data().emailSentAt != null).length);
      } catch {
        // certificates collection may not exist yet — silently skip
      }
    } catch (error) {
      console.error('Error fetching project data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (collectionName: string, personId: string) => {
    if (!projectId) return;
    setAssignLoading(personId);
    try {
      await updateDoc(doc(db, collectionName, personId), { projectIds: arrayUnion(projectId) });
      await fetchProjectData();
    } catch (e) { console.error(e); }
    finally { setAssignLoading(null); }
  };

  const handleUnassign = async (collectionName: string, personId: string) => {
    if (!projectId) return;
    setAssignLoading(personId);
    try {
      await updateDoc(doc(db, collectionName, personId), { projectIds: arrayRemove(projectId) });
      await fetchProjectData();
    } catch (e) { console.error(e); }
    finally { setAssignLoading(null); }
  };

  const openPaymentEdit = (personId: string, personType: PersonType, personName: string) => {
    const existing = teamPayments[personId];
    setPaymentForm({ amount: existing ? String(existing.amount) : '' });
    setBuktiPotongFile(null);
    setKwitansiFile(null);
    setEditingPayment({ personId, personType, personName });
  };

  const previewTax = useMemo(() => {
    const gross = parseFloat(paymentForm.amount) || 0;
    return calcBukanPegawai(gross);
  }, [paymentForm.amount]);

  const handleSavePayment = async () => {
    if (!editingPayment || !projectId) return;
    const isTaxAdminRole = profile?.role === 'tax_admin';
    if (!isTaxAdminRole && !paymentForm.amount) return;
    setSavingPayment(true);
    try {
      const now = new Date().toISOString();
      const docId = `${projectId}_${editingPayment.personId}`;
      const existing = teamPayments[editingPayment.personId];

      // Upload files if newly selected
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

      if (isTaxAdminRole) {
        // Tax admin: only update file URLs
        if (existing) {
          await updateDoc(doc(db, 'team_payments', existing.id), {
            buktiPotong: buktiPotongUrl,
            kwitansi: kwitansiUrl,
            updatedAt: now,
          });
        }
      } else {
        const { gross, dpp, taxAmount, netAmount, effectiveRate } = previewTax;
        const payload = {
          amount: gross,
          dpp,
          taxRate: Math.round(effectiveRate * 100) / 100,
          taxAmount,
          netAmount,
          buktiPotong: buktiPotongUrl,
          kwitansi: kwitansiUrl,
          updatedAt: now,
        };
        if (existing) {
          await updateDoc(doc(db, 'team_payments', existing.id), payload);
        } else {
          await setDoc(doc(db, 'team_payments', docId), {
            projectId,
            personId: editingPayment.personId,
            personType: editingPayment.personType,
            personName: editingPayment.personName,
            ...payload,
            notes: '',
            createdAt: now,
          });
        }
      }
      await fetchProjectData();
      setEditingPayment(null);
    } catch (e) { console.error(e); }
    finally { setSavingPayment(false); }
  };

  const handleBulkSave = async () => {
    if (!projectId || !bulkAmount || selectedPersonIds.size === 0) return;
    setSavingBulk(true);
    try {
      const now = new Date().toISOString();
      const { gross, dpp, taxAmount, netAmount, effectiveRate } = calcBukanPegawai(parseFloat(bulkAmount));
      const basePayload = {
        amount: gross,
        dpp,
        taxRate: Math.round(effectiveRate * 100) / 100,
        taxAmount,
        netAmount,
        updatedAt: now,
      };
      await Promise.all([...selectedPersonIds].map(async (personId) => {
        const person = paymentTabPersons.find(p => p.id === personId);
        if (!person) return;
        const existing = teamPayments[personId];
        const docId = `${projectId}_${personId}`;
        const buktiPotongUrl = existing?.buktiPotong || '';
        const kwitansiUrl = existing?.kwitansi || '';
        if (existing) {
          await updateDoc(doc(db, 'team_payments', existing.id), {
            ...basePayload, buktiPotong: buktiPotongUrl, kwitansi: kwitansiUrl,
          });
        } else {
          await setDoc(doc(db, 'team_payments', docId), {
            projectId, personId, personType: paymentTabPersonType(),
            personName: person.fullName,
            ...basePayload, buktiPotong: '', kwitansi: '', notes: '', createdAt: now,
          });
        }
      }));
      await fetchProjectData();
      setShowBulkModal(false);
      setSelectedPersonIds(new Set());
      setBulkAmount('');
    } catch (e) { console.error(e); }
    finally { setSavingBulk(false); }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Planning': return 'bg-blue-100 text-blue-800';
      case 'On Going': return 'bg-amber-100 text-amber-800';
      case 'Done': return 'bg-green-100 text-green-800';
      case 'Cancel': return 'bg-red-100 text-red-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  // Summary modal data
  const modalData = useMemo(() => {
    let data: any[] = [];
    if (activeModal === 'registered') {
      if (modalAttendanceFilter === 'present') data = registrations.filter(r => r.attendanceStatus === 'present');
      else if (modalAttendanceFilter === 'absent') data = registrations.filter(r => r.attendanceStatus !== 'present');
      else data = registrations;
    } else if (activeModal === 'payments') data = payments;
    else if (activeModal === 'speakers') data = speakers;
    else if (activeModal === 'ushers') data = ushers;
    else if (activeModal === 'liaisons') data = liaisons;
    const s = modalSearch.toLowerCase();
    if (!s) return data;
    return data.filter(item => {
      if (activeModal === 'payments') {
        return (item.institutionName || '').toLowerCase().includes(s) ||
               (item.kecamatan || '').toLowerCase().includes(s) ||
               (item.desa || '').toLowerCase().includes(s);
      }
      return (item.fullName || '').toLowerCase().includes(s) ||
             (item.nik || '').toLowerCase().includes(s) ||
             (item.email || '').toLowerCase().includes(s) ||
             (item.institution || '').toLowerCase().includes(s) ||
             (item.mobilePhone || '').includes(s);
    });
  }, [activeModal, modalAttendanceFilter, registrations, payments, speakers, ushers, liaisons, modalSearch]);

  useEffect(() => { setModalPage(1); }, [activeModal, modalAttendanceFilter, modalSearch]);
  useEffect(() => { setAssignSearch(''); setAssignPage(1); }, [assignTab]);
  useEffect(() => { setAssignPage(1); }, [assignSearch]);
  useEffect(() => { setSelectedPersonIds(new Set()); setHonorariumPage(1); }, [paymentTab]);
  useEffect(() => { setHonorariumPage(1); }, [honorariumPageSize]);

  const modalTotalPages = Math.ceil(modalData.length / MODAL_PAGE_SIZE);
  const modalPagedData = modalData.slice((modalPage - 1) * MODAL_PAGE_SIZE, modalPage * MODAL_PAGE_SIZE);

  const assignedSpeakerIds = new Set(speakers.map(s => s.id));
  const assignedUsherIds = new Set(ushers.map(u => u.id));
  const assignedLOIds = new Set(liaisons.map(l => l.id));

  const assignTabData = useMemo(() => {
    const s = assignSearch.toLowerCase();
    const filter = (arr: any[]) => !s ? arr : arr.filter(p =>
      (p.fullName || '').toLowerCase().includes(s) ||
      (p.email || '').toLowerCase().includes(s) ||
      (p.mobilePhone || '').includes(s)
    );
    if (assignTab === 'speakers') return filter(allSpeakers);
    if (assignTab === 'ushers') return filter(allUshers);
    return filter(allLOs);
  }, [assignTab, assignSearch, allSpeakers, allUshers, allLOs]);

  const collectionForTab = (tab: AssignTab) =>
    tab === 'speakers' ? 'Speakers' : tab === 'ushers' ? 'ushers' : 'liaison_officers';

  const isAssigned = (tab: AssignTab, id: string) => {
    if (tab === 'speakers') return assignedSpeakerIds.has(id);
    if (tab === 'ushers') return assignedUsherIds.has(id);
    return assignedLOIds.has(id);
  };

  // Honorarium tab data
  const paymentTabPersons = useMemo(() => {
    if (paymentTab === 'speakers') return speakers;
    if (paymentTab === 'ushers') return ushers;
    if (paymentTab === 'liaisons') return liaisons;
    return registrations;
  }, [paymentTab, speakers, ushers, liaisons, registrations]);

  const paymentTabPersonType = (): PersonType => {
    if (paymentTab === 'speakers') return 'speaker';
    if (paymentTab === 'ushers') return 'usher';
    if (paymentTab === 'liaisons') return 'lo';
    return 'participant';
  };

  const honorariumTotalPages = Math.ceil(paymentTabPersons.length / honorariumPageSize);
  const honorariumPagedPersons = paymentTabPersons.slice(
    (honorariumPage - 1) * honorariumPageSize,
    honorariumPage * honorariumPageSize,
  );

  const honorariumTotal = (persons: any[]) =>
    persons.reduce((acc, p) => acc + (teamPayments[p.id]?.amount || 0), 0);

  const modalTitle: Record<ModalType, string> = {
    registered: 'Peserta Terdaftar',
    payments: 'Rincian Pembayaran',
    speakers: 'Daftar Narasumber',
    ushers: 'Daftar Usher',
    liaisons: 'Daftar Liaison Officer',
  };

  const closeModal = () => { setActiveModal(null); setModalAttendanceFilter('all'); };

  const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </Layout>
    );
  }
  if (!project) return null;

  const totalEventPayments = payments.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  const allAssigned = [...speakers, ...ushers, ...liaisons];
  const totalHonorarium = allAssigned.reduce((acc, p) => acc + (teamPayments[p.id]?.netAmount || 0), 0);

  const presentCount = registrations.filter(r => r.attendanceStatus === 'present').length;
  const absentCount = registrations.filter(r => r.attendanceStatus !== 'present').length;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto pb-12">
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center text-slate-500 hover:text-indigo-600 transition-colors mb-6 group"
        >
          <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
          Kembali ke Manajemen Proyek
        </button>

        {/* ── Project Header ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 px-8 py-7 text-white">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <h1 className="text-2xl font-bold">{project.name}</h1>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${getStatusColor(project.status)}`}>
                    {project.status}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2.5 text-sm">
                  <div className="flex items-center gap-2 opacity-90">
                    <Calendar className="w-4 h-4 flex-shrink-0 opacity-70" />
                    <span>{project.startDate} – {project.endDate}</span>
                  </div>
                  <div className="flex items-center gap-2 opacity-90">
                    <MapPin className="w-4 h-4 flex-shrink-0 opacity-70" />
                    <span>{project.kabupaten}</span>
                  </div>
                  <div className="flex items-center gap-2 opacity-90">
                    <Building2 className="w-4 h-4 flex-shrink-0 opacity-70" />
                    <span>{project.venue || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 opacity-90">
                    <User className="w-4 h-4 flex-shrink-0 opacity-70" />
                    <span>PIC: {project.pic}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowAssignModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-indigo-700 font-semibold text-sm rounded-xl hover:bg-indigo-50 transition-colors shadow-sm flex-shrink-0 self-start"
              >
                <UsersRound className="w-4 h-4" />
                Assign Tim Event
              </button>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="px-8 pt-7 pb-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Ringkasan Tim & Pembayaran</h2>
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { type: 'payments' as ModalType,   color: 'emerald', Icon: CreditCard, value: fmt(totalEventPayments), label: 'Total Pembayaran' },
                { type: 'speakers' as ModalType,   color: 'blue',   Icon: Mic,       value: speakers.length,   label: 'Narasumber' },
                { type: 'ushers' as ModalType,     color: 'violet', Icon: UserCheck, value: ushers.length,     label: 'Usher' },
                { type: 'liaisons' as ModalType,   color: 'teal',   Icon: Handshake, value: liaisons.length,   label: 'Liaison Officer' },
              ].map(({ type, color, Icon, value, label }) => (
                <div
                  key={type}
                  onClick={() => { setActiveModal(type); setModalSearch(''); }}
                  className="group cursor-pointer bg-white p-5 rounded-xl border border-slate-200 hover:shadow-md transition-all relative overflow-hidden"
                >
                  <div className={`w-10 h-10 rounded-xl bg-${color}-50 flex items-center justify-center mb-3 text-${color}-600`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="text-xl font-bold text-slate-900 mb-0.5 leading-tight">{value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                  <div className={`mt-3 text-[11px] font-medium text-${color}-600 opacity-0 group-hover:opacity-100 transition-opacity`}>
                    Lihat Detail →
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Peserta Terdaftar Section */}
          <div className="px-8 pb-7">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Peserta Terdaftar</h2>
            <div className="grid grid-cols-3 gap-4">
              {([
                {
                  filter: 'all' as const,
                  color: 'indigo',
                  Icon: Users,
                  value: registrations.length,
                  label: 'Total Terdaftar',
                },
                {
                  filter: 'present' as const,
                  color: 'green',
                  Icon: UserCheck,
                  value: presentCount,
                  label: 'Check-In (Hadir)',
                },
                {
                  filter: 'absent' as const,
                  color: 'rose',
                  Icon: UserX,
                  value: absentCount,
                  label: 'Belum Check-In',
                },
              ] as { filter: 'all' | 'present' | 'absent'; color: string; Icon: React.ElementType; value: number; label: string }[]).map(({ filter, color, Icon, value, label }) => (
                <div
                  key={filter}
                  onClick={() => { setActiveModal('registered'); setModalAttendanceFilter(filter); setModalSearch(''); }}
                  className="group cursor-pointer bg-white p-5 rounded-xl border border-slate-200 hover:shadow-md transition-all relative overflow-hidden"
                >
                  <div className={`w-10 h-10 rounded-xl bg-${color}-50 flex items-center justify-center mb-3 text-${color}-600`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="text-xl font-bold text-slate-900 mb-0.5 leading-tight">{value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                  <div className={`mt-3 text-[11px] font-medium text-${color}-600 opacity-0 group-hover:opacity-100 transition-opacity`}>
                    Lihat Detail →
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Certificate Stats */}
          <div className="px-8 pb-7">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-500" />
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sertifikat</h2>
              </div>
              <button
                onClick={() => navigate(`/certificate-management/${projectId}`)}
                className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                Kelola Sertifikat <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div
                onClick={() => navigate(`/certificate-management/${projectId}`)}
                className="group cursor-pointer bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 p-5 rounded-xl hover:shadow-md hover:border-indigo-300 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mb-3 text-indigo-600">
                  <Award className="w-5 h-5" />
                </div>
                <p className="text-xl font-bold text-slate-900 mb-0.5 leading-tight">{certGenerated}</p>
                <p className="text-xs text-slate-500">Sertifikat Digenerate</p>
                <div className="mt-3 text-[11px] font-medium text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  Lihat di Certificate Management →
                </div>
              </div>
              <div
                onClick={() => navigate(`/certificate-management/${projectId}`)}
                className="group cursor-pointer bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 p-5 rounded-xl hover:shadow-md hover:border-green-300 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center mb-3 text-green-600">
                  <Mail className="w-5 h-5" />
                </div>
                <p className="text-xl font-bold text-slate-900 mb-0.5 leading-tight">{certEmailed}</p>
                <p className="text-xs text-slate-500">Dikirim via Email</p>
                <div className="mt-3 text-[11px] font-medium text-green-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  Lihat di Certificate Management →
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Honorarium Tim ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Honorarium Tim</h2>
              <p className="text-sm text-slate-500">Kelola pembayaran honorarium untuk setiap anggota tim yang ditugaskan.</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-slate-400">Total Honorarium Bersih</p>
              <p className="text-xl font-bold text-indigo-700">{fmt(totalHonorarium)}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            {([
              { key: 'speakers' as PaymentTab, label: 'Narasumber',     persons: speakers,      Icon: Mic },
              { key: 'ushers'   as PaymentTab, label: 'Usher',          persons: ushers,        Icon: UserCheck },
              { key: 'liaisons' as PaymentTab, label: 'Liaison Officer', persons: liaisons,     Icon: Handshake },
              { key: 'peserta'  as PaymentTab, label: 'Peserta',         persons: registrations, Icon: Users },
            ]).map(({ key, label, persons, Icon }) => (
              <button
                key={key}
                onClick={() => setPaymentTab(key)}
                className={`flex-1 flex flex-col items-center py-3.5 text-sm font-medium transition-colors border-b-2 ${
                  paymentTab === key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    paymentTab === key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                  }`}>{persons.length}</span>
                </div>
                {persons.length > 0 && (
                  <span className="text-xs mt-0.5 font-normal text-slate-400">
                    {fmt(honorariumTotal(persons))}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Bulk action bar */}
          {selectedPersonIds.size > 0 && (
            <div className="mx-6 my-3 flex items-center justify-between px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl">
              <span className="text-sm font-medium text-indigo-700">
                {selectedPersonIds.size} orang dipilih
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedPersonIds(new Set())}
                  className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                >
                  Batal pilih
                </button>
                <button
                  onClick={() => { setBulkAmount(''); setShowBulkModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  Set Honorarium Sama
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            {paymentTabPersons.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <Wallet className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">
                  {paymentTab === 'peserta' ? 'Belum ada peserta terdaftar' : 'Belum ada anggota tim yang ditugaskan'}
                </p>
                {paymentTab !== 'peserta' && (
                  <p className="text-xs mt-1">Gunakan tombol "Assign Tim Event" untuk menambahkan.</p>
                )}
              </div>
            ) : (
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50/50">
                  <tr>
                    {(profile?.role === 'admin' || profile?.role === 'event_manager') && (
                      <th className="pl-6 pr-2 py-3 w-8">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedPersonIds.size === paymentTabPersons.length && paymentTabPersons.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedPersonIds(new Set(paymentTabPersons.map(p => p.id)));
                            else setSelectedPersonIds(new Set());
                          }}
                        />
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Bruto</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">DPP (50%)</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">PPh 21 (Ps.17)</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Neto</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Bukti Potong</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Kwitansi</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {honorariumPagedPersons.map(person => {
                    const tp = teamPayments[person.id];
                    const isSelected = selectedPersonIds.has(person.id);
                    return (
                      <tr key={person.id} className={`transition-colors ${isSelected ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}`}>
                        {(profile?.role === 'admin' || profile?.role === 'event_manager') && (
                          <td className="pl-6 pr-2 py-4 w-8">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              checked={isSelected}
                              onChange={(e) => {
                                const next = new Set(selectedPersonIds);
                                if (e.target.checked) next.add(person.id);
                                else next.delete(person.id);
                                setSelectedPersonIds(next);
                              }}
                            />
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {(person.fullName || '?').charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{person.fullName}</p>
                              <p className="text-xs text-slate-400">{person.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-slate-700">
                          {tp ? fmt(tp.amount) : <span className="text-slate-300 italic text-xs">Belum diisi</span>}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-slate-500">
                          {tp ? fmt(tp.dpp ?? Math.round(tp.amount * 0.5)) : <span className="text-slate-300 italic text-xs">—</span>}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-red-500">
                          {tp ? (
                            <span title={`Tarif efektif: ${tp.taxRate?.toFixed(2)}%`}>
                              - {fmt(tp.taxAmount)}
                            </span>
                          ) : <span className="text-slate-300 italic text-xs">—</span>}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-bold text-slate-900">
                          {tp ? fmt(tp.netAmount) : <span className="text-slate-300 italic text-xs font-normal">—</span>}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {tp ? (
                            tp.buktiPotong ? (
                              <button 
                                onClick={() => {
                                  setPreviewUrl(tp.buktiPotong);
                                  setPreviewTitle(`Bukti Potong - ${person.fullName}`);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-full transition-colors"
                              >
                                <Eye className="w-3 h-3" /> Lihat
                              </button>
                            ) : (
                              <span className="text-[11px] text-amber-600 font-medium">Belum ada</span>
                            )
                          ) : (
                            <span className="text-slate-300 text-xs italic">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {tp ? (
                            tp.kwitansi ? (
                              <button 
                                onClick={() => {
                                  setPreviewUrl(tp.kwitansi);
                                  setPreviewTitle(`Kwitansi - ${person.fullName}`);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-full transition-colors"
                              >
                                <Eye className="w-3 h-3" /> Lihat
                              </button>
                            ) : (
                              <span className="text-[11px] text-amber-600 font-medium">Belum ada</span>
                            )
                          ) : (
                            <span className="text-slate-300 text-xs italic">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {(profile?.role === 'admin' || profile?.role === 'event_manager') && (
                              <button
                                onClick={() => openPaymentEdit(person.id, paymentTabPersonType(), person.fullName)}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                              >
                                <Edit2 className="w-3 h-3" />
                                {tp ? 'Edit' : 'Isi'}
                              </button>
                            )}
                            {tp && profile?.role === 'tax_admin' && (
                              <button
                                onClick={() => openPaymentEdit(person.id, paymentTabPersonType(), person.fullName)}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                              >
                                <FileUp className="w-3 h-3" />
                                Upload
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                  <tr>
                    {(profile?.role === 'admin' || profile?.role === 'event_manager') && <td className="pl-6 pr-2 py-3 w-8" />}
                    <td className="px-6 py-3 text-sm font-bold text-slate-700">Subtotal</td>
                    <td className="px-6 py-3 text-right text-sm font-bold text-slate-700">
                      {fmt(paymentTabPersons.reduce((a, p) => a + (teamPayments[p.id]?.amount || 0), 0))}
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-semibold text-slate-500">
                      {fmt(paymentTabPersons.reduce((a, p) => {
                        const tp = teamPayments[p.id];
                        return a + (tp ? (tp.dpp ?? Math.round(tp.amount * 0.5)) : 0);
                      }, 0))}
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-bold text-red-500">
                      - {fmt(paymentTabPersons.reduce((a, p) => a + (teamPayments[p.id]?.taxAmount || 0), 0))}
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-bold text-indigo-700">
                      {fmt(paymentTabPersons.reduce((a, p) => a + (teamPayments[p.id]?.netAmount || 0), 0))}
                    </td>
                    <td className="px-6 py-3 text-center text-xs text-slate-500">
                      {paymentTabPersons.filter(p => teamPayments[p.id]?.buktiPotong).length}/{paymentTabPersons.length} bukti
                    </td>
                    <td className="px-6 py-3 text-center text-xs text-slate-500">
                      {paymentTabPersons.filter(p => teamPayments[p.id]?.kwitansi).length}/{paymentTabPersons.length} kwitansi
                    </td>
                    <td className="px-6 py-3" />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Honorarium table pagination */}
          {paymentTabPersons.length > 0 && (
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span>Tampilkan</span>
                <select
                  value={honorariumPageSize}
                  onChange={(e) => setHonorariumPageSize(Number(e.target.value))}
                  className="border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {[10, 25, 50, 100].map(n => (
                    <option key={n} value={n}>{n} per halaman</option>
                  ))}
                </select>
                <span>
                  · {paymentTabPersons.length === 0 ? 0 : (honorariumPage - 1) * honorariumPageSize + 1}
                  –{Math.min(honorariumPage * honorariumPageSize, paymentTabPersons.length)} dari{' '}
                  <span className="font-medium text-slate-700">{paymentTabPersons.length}</span> data
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHonorariumPage(1)}
                  disabled={honorariumPage === 1}
                  className="p-1 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Halaman pertama"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setHonorariumPage(p => Math.max(p - 1, 1))}
                  disabled={honorariumPage === 1}
                  className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
                >
                  ‹ Prev
                </button>
                <span className="font-medium text-slate-600 px-1">
                  {honorariumPage} / {Math.max(honorariumTotalPages, 1)}
                </span>
                <button
                  onClick={() => setHonorariumPage(p => Math.min(p + 1, honorariumTotalPages))}
                  disabled={honorariumPage >= honorariumTotalPages}
                  className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
                >
                  Next ›
                </button>
                <button
                  onClick={() => setHonorariumPage(honorariumTotalPages)}
                  disabled={honorariumPage >= honorariumTotalPages}
                  className="p-1 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Halaman terakhir"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Summary Detail Modal ───────────────────────────────────── */}
      {activeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {activeModal === 'registered'
                    ? (modalAttendanceFilter === 'present' ? 'Peserta Check-In (Hadir)'
                      : modalAttendanceFilter === 'absent' ? 'Peserta Belum Check-In'
                      : 'Semua Peserta Terdaftar')
                    : modalTitle[activeModal]}
                </h3>
                <p className="text-sm text-slate-500">{project.name}</p>
              </div>
              <div className="flex items-center gap-2">
                {(activeModal === 'speakers' || activeModal === 'ushers' || activeModal === 'liaisons') && (
                  <button
                    onClick={() => {
                      const tabMap: Record<string, AssignTab> = { speakers: 'speakers', ushers: 'ushers', liaisons: 'liaisons' };
                      setAssignTab(tabMap[activeModal]);
                      setAssignSearch('');
                      setAssignPage(1);
                      closeModal();
                      setShowAssignModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                  >
                    <UsersRound className="w-4 h-4" />
                    Tugaskan Tim
                  </button>
                )}
                <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <XCircle className="w-6 h-6 text-slate-400" />
                </button>
              </div>
            </div>
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Cari dalam daftar..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50/50 sticky top-0 z-10">
                  <tr>
                    {activeModal === 'registered' && (<>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">NIK</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Posisi</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    </>)}
                    {activeModal === 'payments' && (<>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Jumlah</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Kecamatan</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Desa</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    </>)}
                    {activeModal === 'speakers' && (<>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Institusi</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Keahlian</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                    </>)}
                    {(activeModal === 'ushers' || activeModal === 'liaisons') && (<>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">NIK</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">No. HP</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                    </>)}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {modalPagedData.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      {activeModal === 'registered' && (<>
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{item.fullName}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{item.nik}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{item.posisi}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            item.attendanceStatus === 'present' ? 'bg-green-100 text-green-700' :
                            item.attendanceStatus === 'registered' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                          }`}>{item.attendanceStatus}</span>
                        </td>
                      </>)}
                      {activeModal === 'payments' && (<>
                        <td className="px-6 py-4 text-sm font-bold text-slate-900">{fmt(Number(item.amount) || 0)}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{item.kecamatan || '—'}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{item.desa || '—'}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-green-100 text-green-700">Lunas</span>
                        </td>
                      </>)}
                      {activeModal === 'speakers' && (<>
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{item.fullName}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{item.institution || '—'}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{item.expertise?.join(', ') || '—'}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{item.email}</td>
                      </>)}
                      {(activeModal === 'ushers' || activeModal === 'liaisons') && (<>
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{item.fullName}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{item.nik}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{item.mobilePhone}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{item.email}</td>
                      </>)}
                    </tr>
                  ))}
                  {modalData.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center text-slate-400">
                          <Search className="w-8 h-8 mb-2 opacity-50" />
                          <p className="text-sm">Tidak ada data ditemukan.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex justify-between items-center">
              <span>
                Menampilkan{' '}
                <span className="font-medium text-slate-700">
                  {modalData.length === 0 ? 0 : (modalPage - 1) * MODAL_PAGE_SIZE + 1}
                </span>
                {' '}–{' '}
                <span className="font-medium text-slate-700">
                  {Math.min(modalPage * MODAL_PAGE_SIZE, modalData.length)}
                </span>
                {' '}dari <span className="font-medium text-slate-700">{modalData.length}</span> data
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setModalPage(p => Math.max(p - 1, 1))} disabled={modalPage === 1}
                  className="p-1 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-medium text-slate-600">{modalPage} / {Math.max(modalTotalPages, 1)}</span>
                <button onClick={() => setModalPage(p => Math.min(p + 1, modalTotalPages))} disabled={modalPage >= modalTotalPages}
                  className="p-1 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Team Modal ─────────────────────────────────────── */}
      {showAssignModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowAssignModal(false)} />
          <div className="relative bg-white w-full max-w-2xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Assign Tim Event</h3>
                <p className="text-sm text-slate-500">{project.name}</p>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <XCircle className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            <div className="flex border-b border-slate-100">
              {([
                { key: 'speakers' as AssignTab, label: 'Narasumber', count: speakers.length, icon: <Mic className="w-3.5 h-3.5" /> },
                { key: 'ushers'   as AssignTab, label: 'Usher',      count: ushers.length,   icon: <UserCheck className="w-3.5 h-3.5" /> },
                { key: 'liaisons' as AssignTab, label: 'Liaison Officer', count: liaisons.length, icon: <Handshake className="w-3.5 h-3.5" /> },
              ]).map(tab => (
                <button key={tab.key} onClick={() => setAssignTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors border-b-2 ${
                    assignTab === tab.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}>
                  {tab.icon} {tab.label}
                  <span className={`ml-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                    assignTab === tab.key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                  }`}>{tab.count}</span>
                </button>
              ))}
            </div>
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input type="text" placeholder="Cari nama, email, atau no. HP..."
                  value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm bg-white" />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {assignTabData.length} data · {
                  assignTab === 'speakers' ? speakers.length : assignTab === 'ushers' ? ushers.length : liaisons.length
                } sudah ditugaskan
              </p>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {assignTabData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Search className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm font-medium">Tidak ada data ditemukan</p>
                </div>
              ) : assignTabData.slice((assignPage - 1) * ASSIGN_PAGE_SIZE, assignPage * ASSIGN_PAGE_SIZE).map(person => {
                const assigned = isAssigned(assignTab, person.id);
                const colName = collectionForTab(assignTab);
                const isLoading = assignLoading === person.id;
                return (
                  <div key={person.id} className={`flex items-center gap-3 px-6 py-3.5 transition-colors ${assigned ? 'bg-indigo-50/30' : 'hover:bg-slate-50'}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      assigned ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {(person.fullName || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800 truncate">{person.fullName}</p>
                        {assigned && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-slate-400 truncate">
                        {person.email}{person.mobilePhone ? ` · ${person.mobilePhone}` : ''}
                        {person.institution ? ` · ${person.institution}` : ''}
                      </p>
                    </div>
                    {assigned ? (
                      <button onClick={() => handleUnassign(colName, person.id)} disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40 flex-shrink-0">
                        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                        Hapus
                      </button>
                    ) : (
                      <button onClick={() => handleAssign(colName, person.id)} disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-40 flex-shrink-0">
                        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        Tambah
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Pagination */}
            {assignTabData.length > ASSIGN_PAGE_SIZE && (
              <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
                <span>
                  {(assignPage - 1) * ASSIGN_PAGE_SIZE + 1}–{Math.min(assignPage * ASSIGN_PAGE_SIZE, assignTabData.length)} dari {assignTabData.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAssignPage(p => Math.max(p - 1, 1))}
                    disabled={assignPage === 1}
                    className="p-1 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-medium text-slate-600">{assignPage} / {Math.ceil(assignTabData.length / ASSIGN_PAGE_SIZE)}</span>
                  <button
                    onClick={() => setAssignPage(p => Math.min(p + 1, Math.ceil(assignTabData.length / ASSIGN_PAGE_SIZE)))}
                    disabled={assignPage >= Math.ceil(assignTabData.length / ASSIGN_PAGE_SIZE)}
                    className="p-1 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bulk Honorarium Modal ─────────────────────────────────── */}
      {showBulkModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowBulkModal(false)} />
          <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Set Honorarium Sama</h3>
                <p className="text-sm text-slate-500">{selectedPersonIds.size} orang dipilih</p>
              </div>
              <button onClick={() => setShowBulkModal(false)} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                <Receipt className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Nominal yang sama akan diterapkan untuk semua {selectedPersonIds.size} orang yang dipilih. Data yang sudah ada akan diperbarui.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Honorarium Bruto (Rp) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={bulkAmount ? Number(bulkAmount).toLocaleString('id-ID') : ''}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setBulkAmount(raw);
                  }}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  placeholder="Contoh: 2.000.000"
                  autoFocus
                />
              </div>
              {bulkAmount && parseFloat(bulkAmount) > 0 && (() => {
                const preview = calcBukanPegawai(parseFloat(bulkAmount));
                return (
                  <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">DPP (50%)</span>
                      <span className="font-medium">{fmt(preview.dpp)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">PPh 21</span>
                      <span className="font-medium text-red-600">- {fmt(preview.taxAmount)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
                      <span className="text-slate-700">Neto (per orang)</span>
                      <span className="text-indigo-700">{fmt(preview.netAmount)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400 pt-0.5">
                      <span>Total neto ({selectedPersonIds.size} orang)</span>
                      <span className="font-medium text-slate-600">{fmt(preview.netAmount * selectedPersonIds.size)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="px-6 pb-6 pt-2 flex gap-3">
              <button onClick={() => setShowBulkModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                Batal
              </button>
              <button
                onClick={handleBulkSave}
                disabled={savingBulk || !bulkAmount || parseFloat(bulkAmount) <= 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Terapkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Edit Modal ────────────────────────────────────── */}
      {editingPayment && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setEditingPayment(null)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Input Honorarium</h3>
                <p className="text-sm text-slate-500">{editingPayment.personName}</p>
              </div>
              <button onClick={() => setEditingPayment(null)} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Dasar hukum notice — hidden for tax_admin */}
              {profile?.role !== 'tax_admin' && (
                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <Receipt className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 leading-relaxed">
                    Perhitungan PPh 21 mengacu pada <strong>PMK 168/2023 & PP 58/2023</strong> — kategori Bukan Pegawai (Freelance/Tenaga Ahli).<br />
                    DPP = 50% × Bruto · Tarif progresif Pasal 17 diterapkan atas DPP.
                  </p>
                </div>
              )}

              {/* Amount input — read-only for tax_admin */}
              {profile?.role !== 'tax_admin' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Honorarium Bruto (Rp) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={paymentForm.amount ? Number(paymentForm.amount).toLocaleString('id-ID') : ''}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setPaymentForm({ amount: raw });
                    }}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    placeholder="Contoh: 2.000.000"
                    autoFocus
                  />
                </div>
              )}

              {/* Live tax breakdown */}
              {previewTax.gross > 0 && (
                <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Rincian Perhitungan PPh 21</p>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Penghasilan Bruto</span>
                      <span className="font-semibold text-slate-800">{fmt(previewTax.gross)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">DPP <span className="text-slate-400">(50% × Bruto)</span></span>
                      <span className="font-semibold text-slate-800">{fmt(previewTax.dpp)}</span>
                    </div>

                    {/* Progressive bracket breakdown */}
                    {previewTax.breakdown.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-200 space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tarif Progresif Pasal 17 atas DPP</p>
                        {previewTax.breakdown.map((line, i) => (
                          <div key={i} className="flex justify-between text-xs text-slate-500">
                            <span>Lapisan {i + 1}: {line.rate}% × {fmt(line.base)}</span>
                            <span className="font-medium text-red-500">- {fmt(line.tax)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                      <span className="text-slate-600">
                        Total PPh 21
                        <span className="ml-1 text-[10px] text-slate-400">
                          (efektif {previewTax.effectiveRate.toFixed(2)}% dari bruto)
                        </span>
                      </span>
                      <span className="font-bold text-red-600">- {fmt(previewTax.taxAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold pt-1 border-t-2 border-slate-300 mt-1">
                      <span className="text-slate-800">Honorarium Bersih (Take-home)</span>
                      <span className="text-indigo-700">{fmt(previewTax.netAmount)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* File uploads */}
            {(() => {
              const existingTP = editingPayment ? teamPayments[editingPayment.personId] : null;
              return (
                <div className="px-6 pb-2">
                  <div className="pt-4 border-t border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Dokumen</p>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Bukti Potong */}
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Bukti Potong</label>
                        {existingTP?.buktiPotong && !buktiPotongFile && (
                          <button 
                            onClick={() => {
                              setPreviewUrl(existingTP.buktiPotong);
                              setPreviewTitle(`Bukti Potong - ${editingPayment.personName}`);
                            }}
                            className="flex items-center gap-1 text-[11px] text-teal-600 hover:underline mb-1.5"
                          >
                            <Eye className="w-3 h-3" /> Lihat file saat ini
                          </button>
                        )}
                        <label className="flex items-center gap-2 w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600 cursor-pointer transition-colors">
                          <FileUp className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{buktiPotongFile ? buktiPotongFile.name : 'Pilih file...'}</span>
                          <input type="file" className="sr-only" accept="image/*,application/pdf"
                            onChange={(e) => setBuktiPotongFile(e.target.files?.[0] || null)} />
                        </label>
                        {buktiPotongFile && (
                          <button onClick={() => setBuktiPotongFile(null)} className="mt-1 text-[11px] text-red-500 hover:underline">Hapus pilihan</button>
                        )}
                      </div>
                      {/* Kwitansi */}
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Kwitansi</label>
                        {existingTP?.kwitansi && !kwitansiFile && (
                          <button 
                            onClick={() => {
                              setPreviewUrl(existingTP.kwitansi);
                              setPreviewTitle(`Kwitansi - ${editingPayment.personName}`);
                            }}
                            className="flex items-center gap-1 text-[11px] text-teal-600 hover:underline mb-1.5"
                          >
                            <Eye className="w-3 h-3" /> Lihat file saat ini
                          </button>
                        )}
                        <label className="flex items-center gap-2 w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600 cursor-pointer transition-colors">
                          <FileUp className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{kwitansiFile ? kwitansiFile.name : 'Pilih file...'}</span>
                          <input type="file" className="sr-only" accept="image/*,application/pdf"
                            onChange={(e) => setKwitansiFile(e.target.files?.[0] || null)} />
                        </label>
                        {kwitansiFile && (
                          <button onClick={() => setKwitansiFile(null)} className="mt-1 text-[11px] text-red-500 hover:underline">Hapus pilihan</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="px-6 pb-6 pt-4 flex gap-3">
              <button onClick={() => setEditingPayment(null)}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                Batal
              </button>
              <button
                onClick={handleSavePayment}
                disabled={savingPayment || (profile?.role !== 'tax_admin' && !paymentForm.amount)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PDF Preview Modal ────────────────────────────────────── */}
      <PreviewModal 
        url={previewUrl} 
        onClose={() => setPreviewUrl(null)} 
        title={previewTitle} 
      />
    </Layout>
  );
}
