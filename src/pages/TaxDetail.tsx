import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  doc, getDoc, setDoc, updateDoc, addDoc,
  collection, query, where, getDocs,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../components/AuthContext';
import Layout from '../components/Layout';
import {
  ArrowLeft, Mic, UserCheck, Handshake, Users, FileUp, ExternalLink,
  Loader2, Save, X, Receipt, CheckCircle2, XCircle, Mail, Send,
  Calendar, MapPin, Building2, User, ChevronLeft, ChevronRight, FileSpreadsheet,
} from 'lucide-react';

type TaxTab = 'speakers' | 'ushers' | 'liaisons' | 'peserta';
type PersonType = 'speaker' | 'usher' | 'lo' | 'participant';

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

  // Tab
  const [activeTab, setActiveTab] = useState<TaxTab>('speakers');

  // Upload modal
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingPersonName, setEditingPersonName] = useState('');
  const [editingPersonType, setEditingPersonType] = useState<PersonType>('speaker');
  const [buktiPotongFile, setBuktiPotongFile] = useState<File | null>(null);
  const [kwitansiFile, setKwitansiFile] = useState<File | null>(null);
  const [savingUpload, setSavingUpload] = useState(false);

  // Email modal
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailFilter, setEmailFilter] = useState<'all' | 'bukti' | 'kwitansi' | 'complete'>('all');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Pagination
  const [taxPage, setTaxPage] = useState(1);
  const [taxPageSize, setTaxPageSize] = useState(10);

  useEffect(() => { fetchData(); }, [projectId]);
  useEffect(() => { setSelectedEmailIds(new Set()); setTaxPage(1); }, [activeTab]);
  useEffect(() => { setTaxPage(1); }, [taxPageSize]);

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

  const totalPages = Math.ceil(tabPersons.length / taxPageSize);
  const pagedPersons = tabPersons.slice((taxPage - 1) * taxPageSize, taxPage * taxPageSize);

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

  const openEmailModal = () => {
    if (!project) return;
    setEmailSubject(`Bukti Potong PPh 21 – ${project.name}`);
    setEmailMessage(
      `Yth. Bapak/Ibu,\n\nTerima kasih atas partisipasi Anda dalam kegiatan ${project.name}.\n\nBerikut kami sampaikan pemberitahuan bahwa dokumen Bukti Potong PPh 21 dan Kwitansi honorarium Anda telah tersedia di sistem kami.\n\nSilakan hubungi panitia apabila ada pertanyaan.\n\nHormat kami,\nTim Penyelenggara`
    );
    setEmailFilter('all');
    setEmailSent(false);
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
    try {
      const recipients = emailCandidates
        .filter(p => p.email)
        .map(p => ({ personId: p.id, personName: p.fullName, email: p.email, personType: p._type }));

      await addDoc(collection(db, 'email_notifications'), {
        projectId,
        projectName: project.name,
        subject: emailSubject,
        message: emailMessage,
        recipients,
        status: 'pending',
        createdAt: new Date().toISOString(),
        createdBy: profile?.uid || '',
        createdByEmail: profile?.email || '',
      });
      setEmailSent(true);
    } catch (e) { console.error(e); }
    finally { setSendingEmail(false); }
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
                disabled={tabPersons.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Export Excel
              </button>
              {selectedEmailIds.size > 0 && (
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
                            <a href={tp.buktiPotong} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-full transition-colors">
                              <ExternalLink className="w-3 h-3" /> Lihat
                            </a>
                          ) : (
                            <span className="text-[11px] text-amber-600 font-medium">Belum ada</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {tp?.kwitansi ? (
                            <a href={tp.kwitansi} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-full transition-colors">
                              <ExternalLink className="w-3 h-3" /> Lihat
                            </a>
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

          {/* Pagination */}
          {tabPersons.length > 0 && (
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
                  · {tabPersons.length === 0 ? 0 : (taxPage - 1) * taxPageSize + 1}
                  –{Math.min(taxPage * taxPageSize, tabPersons.length)} dari{' '}
                  <span className="font-medium text-slate-700">{tabPersons.length}</span> data
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
                    <a href={existingTP.buktiPotong} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-[11px] text-teal-600 hover:underline mb-1.5">
                      <ExternalLink className="w-3 h-3" /> Lihat file saat ini
                    </a>
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
                    <a href={existingTP.kwitansi} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-[11px] text-teal-600 hover:underline mb-1.5">
                      <ExternalLink className="w-3 h-3" /> Lihat file saat ini
                    </a>
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
                  {emailCandidates.filter(p => p.email).length} email dijadwalkan untuk dikirim.
                </p>
                <p className="text-xs text-slate-400">Email akan diproses oleh sistem dalam beberapa menit.</p>
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

                  {/* Body */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Isi Pesan</label>
                    <textarea
                      value={emailMessage}
                      onChange={e => setEmailMessage(e.target.value)}
                      rows={6}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm resize-none"
                    />
                  </div>

                  <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                    <Receipt className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700 leading-relaxed">
                      Email akan disimpan ke antrian dan diproses oleh sistem. Pastikan alamat email penerima sudah benar sebelum mengirim.
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
                    disabled={sendingEmail || emailCandidates.filter(p => p.email).length === 0 || !emailSubject.trim()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Kirim Notifikasi
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
