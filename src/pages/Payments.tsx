import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, getDocs, doc, updateDoc, addDoc, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../components/AuthContext';
import Layout from '../components/Layout';
import Toast from '../components/Toast';
import Select from 'react-select';
import { Plus, ArrowLeft, Calendar, MapPin, User, Check, X, Search, Building, CreditCard, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Upload, Copy, ExternalLink, Bell, Mail, FileText, ScanLine, Download } from 'lucide-react';
import { locations } from '../data/locations';
import * as XLSX from 'xlsx';

export default function Payments() {
  const { user, profile } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  // New Project Form State
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    startDate: '',
    endDate: '',
    venue: '',
    pic: '',
    kabupaten: '',
    status: 'Planning'
  });

  // Table State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterKec, setFilterKec] = useState<{ value: string, label: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState<{ value: string, label: string } | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('desa');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingInst, setEditingInst] = useState<any | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editReceiptFile, setEditReceiptFile] = useState<File | null>(null);
  const [editReceiptUrl, setEditReceiptUrl] = useState('');
  const [editTransferPic, setEditTransferPic] = useState('');
  const [editStatus, setEditStatus] = useState<'yes' | 'no' | 'approval'>('no');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [receiptPopupUrl, setReceiptPopupUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk Selection State
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkStatus, setBulkStatus] = useState<'yes' | 'no' | 'approval' | ''>('');
  
  // Inline Edit State
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditAmount, setInlineEditAmount] = useState('');

  // OCR State
  const [ocrLoadingIds, setOcrLoadingIds] = useState<Set<string>>(new Set());

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const handleOcr = async (instId: string, npwpUrl: string) => {
    setOcrLoadingIds(prev => new Set([...prev, instId]));
    try {
      const fn = httpsCallable(functions, 'extractNpwp');
      const result = await fn({ imageUrl: npwpUrl, projectId: selectedProject!.id, institutionId: instId }) as any;
      const npwpNumber = result.data?.npwpNumber;
      if (npwpNumber) {
        setSelectedProject((prev: any) => {
          const payments = JSON.parse(prev.payments || '{}');
          payments[instId] = { ...payments[instId], npwpNumber };
          return { ...prev, payments: JSON.stringify(payments) };
        });
        showToast(`NPWP berhasil diekstrak: ${npwpNumber}`, 'success');
      } else {
        showToast('NPWP tidak terdeteksi pada file ini.', 'error');
      }
    } catch (err) {
      console.error('OCR error:', err);
      showToast('Gagal melakukan OCR. Coba lagi.', 'error');
    } finally {
      setOcrLoadingIds(prev => { const s = new Set(prev); s.delete(instId); return s; });
    }
  };

  const handleBulkOcr = async () => {
    const targets = [...selectedRows].filter(instId => {
      const details = getPaymentDetails(instId);
      return details.npwpUrl && !details.npwpNumber;
    });
    if (targets.length === 0) {
      showToast('Tidak ada baris terpilih dengan file NPWP yang belum diekstrak.', 'error');
      return;
    }
    showToast(`Mengekstrak NPWP untuk ${targets.length} baris...`, 'success');
    await Promise.all(targets.map(instId => {
      const details = getPaymentDetails(instId);
      return handleOcr(instId, details.npwpUrl);
    }));
  };

  const handleExportExcel = () => {
    const payments = JSON.parse(selectedProject?.payments || '{}');
    const exportData = selectedRows.size > 0
      ? sortedAndFilteredInstitutions.filter(inst => selectedRows.has(inst.id))
      : sortedAndFilteredInstitutions;

    const rows = exportData.map(inst => {
      const details = payments[inst.id] || {};
      return {
        'Kabupaten': inst.kabupaten || '',
        'Kecamatan': inst.kecamatan || '',
        'Desa': inst.desa || '',
        'Transfer Amount': details.amount ? Number(details.amount) : '',
        'Payment Status': details.status === 'yes' ? 'Lunas' : details.status === 'approval' ? 'Menunggu Approval' : 'Belum Bayar',
        'Transfer PIC': details.transferpic || '',
        'Email': details.email || '',
        'No. NPWP': details.npwpNumber || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pembayaran');
    const filename = `pembayaran_${selectedProject?.name || 'export'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  useEffect(() => {
    fetchProjects();
    fetchSubmissions();
  }, [user, profile]);

  const fetchSubmissions = async () => {
    try {
      const q = query(collection(db, 'payment_submissions'), where('status', '==', 'pending'));
      const snapshot = await getDocs(q);
      const subData = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setSubmissions(subData);
    } catch (error) {
      console.error("Error fetching submissions:", error);
    }
  };

  const fetchProjects = async () => {
    if (!user || !profile) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'projects'));
      const snapshot = await getDocs(q);
      const projData = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setProjects(projData);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInstitutionsForProject = async (project: any) => {
    setLoading(true);
    try {
      const q = query(collection(db, 'institutions'), where('kabupaten', '==', project.kabupaten));
      const snapshot = await getDocs(q);
      const instData = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setInstitutions(instData);
      setSelectedProject(project);
    } catch (error) {
      console.error("Error fetching institutions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.name || !newProject.startDate || !newProject.endDate || !newProject.venue || !newProject.pic || !newProject.kabupaten) {
      showToast("Please fill all fields.", "error");
      return;
    }
    try {
      await addDoc(collection(db, 'projects'), {
        ...newProject,
        payments: "{}", // Initialize empty payments map
        createdAt: new Date().toISOString()
      });
      showToast("Project created successfully!", "success");
      setShowProjectModal(false);
      setNewProject({ name: '', startDate: '', endDate: '', venue: '', pic: '', kabupaten: '', status: 'Planning' });
      fetchProjects();
    } catch (error) {
      console.error("Error creating project:", error);
      showToast("Failed to create project.", "error");
    }
  };

  const togglePaymentStatus = async (instId: string) => {
    if (!selectedProject) return;
    try {
      const currentPayments = JSON.parse(selectedProject.payments || "{}");
      const currentData = currentPayments[instId] || {};
      const currentStatus = currentData.status || 'no';
      const newStatus = currentStatus === 'yes' ? 'no' : 'yes';
      
      const updatedPayments = { ...currentPayments, [instId]: { ...currentData, status: newStatus } };
      const paymentsString = JSON.stringify(updatedPayments);

      const projRef = doc(db, 'projects', selectedProject.id);
      await updateDoc(projRef, { payments: paymentsString });
      
      setSelectedProject({ ...selectedProject, payments: paymentsString });
      showToast("Payment status updated.", "success");
    } catch (error) {
      console.error("Error updating payment status:", error);
      showToast("Failed to update payment status.", "error");
    }
  };

  const getPaymentStatus = (instId: string) => {
    if (!selectedProject) return 'no';
    const payments = JSON.parse(selectedProject.payments || "{}");
    return payments[instId]?.status || 'no';
  };

  const getPaymentDetails = (instId: string) => {
    if (!selectedProject) return {};
    const payments = JSON.parse(selectedProject.payments || "{}");
    return payments[instId] || {};
  };

  const handleEditClick = (inst: any) => {
    const details = getPaymentDetails(inst.id);
    setEditingInst(inst);
    setEditAmount(details.amount || '');
    setEditNotes(details.notes || '');
    setEditReceiptUrl(details.receiptUrl || '');
    setEditTransferPic(details.transferpic || '');
    setEditStatus((details.status as 'yes' | 'no' | 'approval') || 'no');
    setEditReceiptFile(null);
    setShowEditModal(true);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedRows(new Set(paginatedInstitutions.map(i => i.id)));
    } else {
      setSelectedRows(new Set());
    }
  };

  const handleSelectRow = (id: string) => {
    const newSet = new Set(selectedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedRows(newSet);
  };

  const handleBulkUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || selectedRows.size === 0) return;
    try {
      const currentPayments = JSON.parse(selectedProject.payments || "{}");
      const updatedPayments = { ...currentPayments };
      
      selectedRows.forEach(id => {
        const currentData = updatedPayments[id] || {};
        updatedPayments[id] = { 
          ...currentData, 
          status: bulkStatus || currentData.status || 'no', 
          amount: bulkAmount || currentData.amount 
        };
      });
      
      const paymentsString = JSON.stringify(updatedPayments);
      const projRef = doc(db, 'projects', selectedProject.id);
      await updateDoc(projRef, { payments: paymentsString });
      
      setSelectedProject({ ...selectedProject, payments: paymentsString });
      showToast("Bulk update successful.", "success");
      setShowBulkModal(false);
      setSelectedRows(new Set());
      setBulkAmount('');
      setBulkStatus('');
    } catch (error) {
      console.error("Error in bulk update:", error);
      showToast("Failed to bulk update.", "error");
    }
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleInlineEditSave = async (instId: string) => {
    if (!selectedProject || isSaving) return;
    setIsSaving(true);
    try {
      const currentPayments = JSON.parse(selectedProject.payments || "{}");
      const currentData = currentPayments[instId] || {};
      
      if (currentData.amount === inlineEditAmount) {
        setInlineEditId(null);
        setIsSaving(false);
        return;
      }
      
      const updatedPayments = { 
        ...currentPayments, 
        [instId]: { ...currentData, amount: inlineEditAmount } 
      };
      const paymentsString = JSON.stringify(updatedPayments);

      const projRef = doc(db, 'projects', selectedProject.id);
      await updateDoc(projRef, { payments: paymentsString });
      
      setSelectedProject({ ...selectedProject, payments: paymentsString });
      showToast("Amount updated.", "success");
    } catch (error) {
      console.error("Error updating amount:", error);
      showToast("Failed to update amount.", "error");
    } finally {
      setInlineEditId(null);
      setIsSaving(false);
    }
  };

  const handleSavePaymentDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !editingInst) return;

    setUploadingReceipt(true);
    try {
      let finalReceiptUrl = editReceiptUrl;

      if (editReceiptFile) {
        const storageRef = ref(storage, `receipts/${selectedProject.id}/${editingInst.id}_${Date.now()}`);
        const snapshot = await uploadBytes(storageRef, editReceiptFile);
        finalReceiptUrl = await getDownloadURL(snapshot.ref);
      }

      const currentPayments = JSON.parse(selectedProject.payments || "{}");
      const currentData = currentPayments[editingInst.id] || {};
      
      const updatedPayments = { 
        ...currentPayments, 
        [editingInst.id]: {
          ...currentData,
          amount: editAmount,
          transferpic: editTransferPic,
          notes: editNotes,
          receiptUrl: finalReceiptUrl,
          status: editStatus,
          kecamatan: editingInst.kecamatan || currentData.kecamatan || '',
          desa: editingInst.desa || currentData.desa || '',
        }
      };
      const paymentsString = JSON.stringify(updatedPayments);

      const projRef = doc(db, 'projects', selectedProject.id);
      await updateDoc(projRef, { payments: paymentsString });
      
      setSelectedProject({ ...selectedProject, payments: paymentsString });

      // Clear any pending submissions for this institution
      const pendingSubmissions = submissions.filter(s => s.institutionId === editingInst.id);
      for (const sub of pendingSubmissions) {
        await updateDoc(doc(db, 'payment_submissions', sub.id), { status: 'approved' });
      }
      fetchSubmissions();

      showToast("Payment details saved.", "success");
      setShowEditModal(false);
    } catch (error) {
      console.error("Error saving payment details:", error);
      showToast("Failed to save payment details.", "error");
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleStatusChange = async (instId: string, newStatus: string) => {
    if (!selectedProject) return;
    try {
      const currentPayments = JSON.parse(selectedProject.payments || '{}');
      const currentData = currentPayments[instId] || {};
      const updatedPayments = { ...currentPayments, [instId]: { ...currentData, status: newStatus } };
      const paymentsString = JSON.stringify(updatedPayments);
      const projRef = doc(db, 'projects', selectedProject.id);
      await updateDoc(projRef, { payments: paymentsString });
      setSelectedProject({ ...selectedProject, payments: paymentsString });
      showToast('Payment status updated.', 'success');
    } catch (error) {
      console.error('Error updating payment status:', error);
      showToast('Failed to update payment status.', 'error');
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-4 h-4 ml-1 inline-block text-slate-400" />;
    return sortDirection === 'asc' ? 
      <ArrowUp className="w-4 h-4 ml-1 inline-block text-indigo-600" /> : 
      <ArrowDown className="w-4 h-4 ml-1 inline-block text-indigo-600" />;
  };

  const sortedAndFilteredInstitutions = useMemo(() => {
    let filtered = institutions.filter(inst => {
      const matchesSearch = 
        inst.desa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inst.kecamatan?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesKec = filterKec ? inst.kecamatan === filterKec.value : true;
      const status = getPaymentStatus(inst.id);
      const matchesStatus = filterStatus ? status === filterStatus.value : true;

      return matchesSearch && matchesKec && matchesStatus;
    });

    return filtered.sort((a, b) => {
      let aValue = a[sortColumn] || '';
      let bValue = b[sortColumn] || '';
      
      if (sortColumn === 'status') {
        aValue = getPaymentStatus(a.id);
        bValue = getPaymentStatus(b.id);
      } else if (sortColumn === 'amount') {
        aValue = Number(getPaymentDetails(a.id).amount) || 0;
        bValue = Number(getPaymentDetails(b.id).amount) || 0;
      } else if (sortColumn === 'transferpic') {
        aValue = getPaymentDetails(a.id).transferpic || '';
        bValue = getPaymentDetails(b.id).transferpic || '';
      } else if (sortColumn === 'email') {
        aValue = getPaymentDetails(a.id).email || '';
        bValue = getPaymentDetails(b.id).email || '';
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [institutions, searchTerm, filterKec, filterStatus, sortColumn, sortDirection, selectedProject]);

  const totalPages = Math.ceil(sortedAndFilteredInstitutions.length / itemsPerPage);
  const paginatedInstitutions = sortedAndFilteredInstitutions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const filterKecOptions = useMemo(() => {
    return Array.from(new Set(institutions.map(i => i.kecamatan))).filter(Boolean).map(k => ({ value: k as string, label: k as string }));
  }, [institutions]);

  const statusOptions = [
    { value: 'yes', label: 'Paid (Yes)' },
    { value: 'approval', label: 'Approval' },
    { value: 'no', label: 'Unpaid (No)' },
  ];

  const totalKecamatan = new Set(institutions.map(i => i.kecamatan)).size;
  const totalDesa = institutions.length;
  const totalPaid = institutions.filter(i => getPaymentStatus(i.id) === 'yes').length;
  const totalApproval = institutions.filter(i => getPaymentStatus(i.id) === 'approval').length;
  const totalUnpaid = totalDesa - totalPaid - totalApproval;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
        
        {!selectedProject ? (
          <>
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Payment Projects</h2>
                <p className="text-slate-500 mt-1">Manage payment projects and track statuses.</p>
              </div>
              <button
                onClick={() => setShowProjectModal(true)}
                className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm"
              >
                <Plus className="w-5 h-5 mr-2" />
                New Project
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                  <div 
                    key={project.id} 
                    onClick={() => fetchInstitutionsForProject(project)}
                    className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative"
                  >
                    <div className="absolute top-4 right-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        project.status === 'Planning' ? 'bg-blue-100 text-blue-800' :
                        project.status === 'On Going' ? 'bg-amber-100 text-amber-800' :
                        project.status === 'Done' ? 'bg-green-100 text-green-800' :
                        project.status === 'Cancel' ? 'bg-red-100 text-red-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {project.status || 'Planning'}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2 pr-20">{project.name}</h3>
                    <div className="space-y-2 text-sm text-slate-600">
                      <div className="flex items-center"><MapPin className="w-4 h-4 mr-2" /> {project.kabupaten}</div>
                      <div className="flex items-center"><Calendar className="w-4 h-4 mr-2" /> {project.startDate} to {project.endDate}</div>
                      <div className="flex items-center"><User className="w-4 h-4 mr-2" /> PIC: {project.pic}</div>
                    </div>
                  </div>
                ))}
                {projects.length === 0 && (
                  <div className="col-span-full text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200">
                    No projects found. Create one to get started.
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-8">
              <button 
                onClick={() => setSelectedProject(null)}
                className="flex items-center text-indigo-600 hover:text-indigo-800 mb-4 font-medium"
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to Projects
              </button>
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">{selectedProject.name}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600 mb-4">
                  <div><span className="font-semibold">Venue:</span> {selectedProject.venue}</div>
                  <div><span className="font-semibold">Kabupaten:</span> {selectedProject.kabupaten}</div>
                  <div><span className="font-semibold">Dates:</span> {selectedProject.startDate} to {selectedProject.endDate}</div>
                  <div><span className="font-semibold">PIC:</span> {selectedProject.pic}</div>
                </div>
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Participant Self-Registration Link</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 font-mono truncate select-all">
                      {`${window.location.origin}/pay-receipt/${selectedProject.id}`}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/pay-receipt/${selectedProject.id}`);
                        showToast("Registration link copied to clipboard!", "success");
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
                    >
                      <Copy className="w-4 h-4" />
                      Copy Link
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
                  <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Total Kecamatan</p>
                    <h3 className="text-2xl font-bold text-slate-900">{totalKecamatan}</h3>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
                  <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
                    <Building className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Total Desa</p>
                    <h3 className="text-2xl font-bold text-slate-900">{totalDesa}</h3>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
                  <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Progress Payment</p>
                    <div className="flex items-baseline space-x-2 flex-wrap gap-y-1">
                      <h3 className="text-2xl font-bold text-green-600">{totalPaid}</h3>
                      <span className="text-xs text-slate-500">paid</span>
                      <span className="text-slate-300">/</span>
                      <h3 className="text-2xl font-bold text-amber-500">{totalApproval}</h3>
                      <span className="text-xs text-slate-500">approval</span>
                      <span className="text-slate-300">/</span>
                      <h3 className="text-2xl font-bold text-red-500">{totalUnpaid}</h3>
                      <span className="text-xs text-slate-500">unpaid</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6 flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search desa or kecamatan..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div className="w-full md:w-64">
                  <Select
                    options={filterKecOptions}
                    value={filterKec}
                    onChange={(val) => { setFilterKec(val); setCurrentPage(1); }}
                    placeholder="Filter Kecamatan"
                    isClearable
                    className="text-sm"
                  />
                </div>
                <div className="w-full md:w-64">
                  <Select
                    options={statusOptions}
                    value={filterStatus}
                    onChange={(val) => { setFilterStatus(val); setCurrentPage(1); }}
                    placeholder="Filter Status"
                    isClearable
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="text-sm text-slate-500">
                {selectedRows.size > 0 ? `${selectedRows.size} baris dipilih` : `${sortedAndFilteredInstitutions.length} baris`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                  title={selectedRows.size > 0 ? 'Export baris terpilih ke Excel' : 'Export semua baris ke Excel'}
                >
                  <Download className="w-4 h-4" />
                  Export Excel {selectedRows.size > 0 ? `(${selectedRows.size})` : '(Semua)'}
                </button>
                {selectedRows.size > 0 && (
                  <>
                    <button
                      onClick={handleBulkOcr}
                      className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
                    >
                      <ScanLine className="w-4 h-4" />
                      Ekstrak NPWP
                    </button>
                    <button
                      onClick={() => setShowBulkModal(true)}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      Bulk Update
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={paginatedInstitutions.length > 0 && selectedRows.size === paginatedInstitutions.length}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('kabupaten')}
                    >
                      Kabupaten <SortIcon column="kabupaten" />
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('kecamatan')}
                    >
                      Kecamatan <SortIcon column="kecamatan" />
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('desa')}
                    >
                      Desa <SortIcon column="desa" />
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('amount')}
                    >
                      Transfer Amount <SortIcon column="amount" />
                    </th>
                    <th 
                      className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('status')}
                    >
                      Payment Status <SortIcon column="status" />
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('transferpic')}
                    >
                      Transfer PIC <SortIcon column="transferpic" />
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('email')}
                    >
                      Email <SortIcon column="email" />
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">NPWP File</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">No. NPWP</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {paginatedInstitutions.map((inst) => {
                    const status = getPaymentStatus(inst.id);
                    const details = getPaymentDetails(inst.id);
                    return (
                      <tr key={inst.id} className={selectedRows.has(inst.id) ? 'bg-indigo-50/50' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={selectedRows.has(inst.id)}
                            onChange={() => handleSelectRow(inst.id)}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{inst.kabupaten}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{inst.kecamatan}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                          <div className="flex items-center">
                            {inst.desa}
                            {submissions.some(s => s.institutionId === inst.id) && (
                              <Bell className="w-3 h-3 ml-2 text-amber-500 animate-bounce" />
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                          {inlineEditId === inst.id ? (
                            <input
                              type="number"
                              autoFocus
                              value={inlineEditAmount}
                              onChange={(e) => setInlineEditAmount(e.target.value)}
                              onBlur={() => handleInlineEditSave(inst.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleInlineEditSave(inst.id);
                                if (e.key === 'Escape') setInlineEditId(null);
                              }}
                              className="w-24 px-2 py-1 border border-indigo-500 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          ) : (
                            <div 
                              className="cursor-pointer hover:bg-slate-100 px-2 py-1 rounded border border-transparent hover:border-slate-300 transition-colors inline-block min-w-[60px]"
                              onClick={() => {
                                setInlineEditId(inst.id);
                                setInlineEditAmount(details.amount || '');
                              }}
                              title="Click to edit amount"
                            >
                              {details.amount ? `Rp ${Number(details.amount).toLocaleString('id-ID')}` : '-'}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <select
                            value={status}
                            onChange={(e) => handleStatusChange(inst.id, e.target.value)}
                            className={`text-xs font-semibold rounded-full px-2 py-1 border-0 cursor-pointer focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                              status === 'yes' ? 'bg-green-100 text-green-800' :
                              status === 'approval' ? 'bg-amber-100 text-amber-800' :
                              'bg-red-100 text-red-800'
                            }`}
                          >
                            <option value="yes">Yes</option>
                            <option value="approval">Approval</option>
                            <option value="no">No</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {details.transferpic || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {details.email || '-'}
                        </td>
                        {/* NPWP File */}
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {details.npwpUrl ? (
                            <button
                              onClick={() => setReceiptPopupUrl(details.npwpUrl)}
                              className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 p-1.5 rounded-md transition-colors"
                              title="Lihat File NPWP"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          ) : (
                            <span className="text-slate-300 text-xs">-</span>
                          )}
                        </td>
                        {/* No. NPWP */}
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-2">
                            {details.npwpNumber ? (
                              <span className="font-mono text-slate-700">{details.npwpNumber}</span>
                            ) : (
                              <span className="text-slate-400 text-xs">Belum ada</span>
                            )}
                            {details.npwpUrl && (
                              <button
                                onClick={() => handleOcr(inst.id, details.npwpUrl)}
                                disabled={ocrLoadingIds.has(inst.id)}
                                className="text-teal-600 hover:text-teal-900 bg-teal-50 p-1 rounded-md transition-colors disabled:opacity-50"
                                title="Ekstrak NPWP via OCR"
                              >
                                {ocrLoadingIds.has(inst.id) ? (
                                  <div className="w-3.5 h-3.5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <ScanLine className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                          <div className="flex items-center justify-center space-x-2">
                            {details.email && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const subject = encodeURIComponent("Konfirmasi Pembayaran Transfer - " + (selectedProject?.name || ''));
                                  const body = encodeURIComponent(
                                    `Halo ${details.transferpic || 'Bapak/Ibu'},\n\n` +
                                    `Kami dari panitia ${selectedProject?.name || ''} ingin mengonfirmasi mengenai pembayaran transfer Anda dari Desa ${inst.desa}, Kecamatan ${inst.kecamatan}.\n\n` +
                                    `[Isi pesan Anda di sini]\n\n` +
                                    `Terima kasih.`
                                  );
                                  window.location.href = `mailto:${details.email}?subject=${subject}&body=${body}`;
                                }}
                                className="text-blue-600 hover:text-blue-900 bg-blue-50 p-1.5 rounded-md transition-colors"
                                title="Kirim Email"
                              >
                                <Mail className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleEditClick(inst)}
                              className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 p-1.5 rounded-md transition-colors"
                              title="Edit Payment Details"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paginatedInstitutions.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-6 py-8 text-center text-slate-500">
                        No areas found matching your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
                  <div className="text-sm text-slate-500">
                    Showing <span className="font-medium text-slate-900">{((currentPage - 1) * itemsPerPage) + 1}</span> to <span className="font-medium text-slate-900">{Math.min(currentPage * itemsPerPage, sortedAndFilteredInstitutions.length)}</span> of <span className="font-medium text-slate-900">{sortedAndFilteredInstitutions.length}</span> results
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Create Project Modal */}
        {showProjectModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
              <div className="fixed inset-0 transition-opacity bg-slate-900/75" onClick={() => setShowProjectModal(false)}></div>
              <div className="relative inline-block w-full max-w-md p-6 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Create New Project</h3>
                <form onSubmit={handleCreateProject} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Project Name</label>
                    <input
                      type="text"
                      required
                      value={newProject.name}
                      onChange={(e) => setNewProject({...newProject, name: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                      <input
                        type="date"
                        required
                        value={newProject.startDate}
                        onChange={(e) => setNewProject({...newProject, startDate: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                      <input
                        type="date"
                        required
                        value={newProject.endDate}
                        onChange={(e) => setNewProject({...newProject, endDate: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Event Venue</label>
                    <input
                      type="text"
                      required
                      value={newProject.venue}
                      onChange={(e) => setNewProject({...newProject, venue: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Project PIC (Name)</label>
                    <input
                      type="text"
                      required
                      value={newProject.pic}
                      onChange={(e) => setNewProject({...newProject, pic: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Kabupaten</label>
                    <select
                      required
                      value={newProject.kabupaten}
                      onChange={(e) => setNewProject({...newProject, kabupaten: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">Select Kabupaten</option>
                      {locations.map((loc) => (
                        <option key={loc.kabupaten} value={loc.kabupaten}>{loc.kabupaten}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                    <select
                      required
                      value={newProject.status}
                      onChange={(e) => setNewProject({...newProject, status: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="Planning">Planning</option>
                      <option value="On Going">On Going</option>
                      <option value="Done">Done</option>
                      <option value="Cancel">Cancel</option>
                    </select>
                  </div>
                  <div className="mt-6 flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowProjectModal(false)}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                    >
                      Create Project
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
        {/* Bulk Update Modal */}
        {showBulkModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
              <div className="fixed inset-0 transition-opacity bg-slate-900/75" onClick={() => setShowBulkModal(false)}></div>
              <div className="relative inline-block w-full max-w-md p-6 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Bulk Update ({selectedRows.size} selected)</h3>
                
                <form onSubmit={handleBulkUpdate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                    <select
                      value={bulkStatus}
                      onChange={(e) => setBulkStatus(e.target.value as any)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">No Change</option>
                      <option value="yes">Paid (Yes)</option>
                      <option value="approval">Approval</option>
                      <option value="no">Unpaid (No)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
                    <input
                      type="number"
                      value={bulkAmount}
                      onChange={(e) => setBulkAmount(e.target.value)}
                      placeholder="Leave empty for no change"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  
                  <div className="mt-6 flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowBulkModal(false)}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center"
                    >
                      Apply Bulk Update
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Edit Payment Modal */}
        {showEditModal && editingInst && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
              <div className="fixed inset-0 transition-opacity bg-slate-900/75" onClick={() => setShowEditModal(false)}></div>
              <div className="relative inline-block w-full max-w-md p-6 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Edit Payment Details</h3>
                <p className="text-sm text-slate-500 mb-4">Desa {editingInst.desa}, {editingInst.kecamatan}</p>
                
                <form onSubmit={handleSavePaymentDetails} className="space-y-4">
                  {submissions.filter(s => s.institutionId === editingInst.id).map(sub => (
                    <div key={sub.id} className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="text-sm font-bold text-amber-800 flex items-center">
                          <Bell className="w-4 h-4 mr-2" /> Pending Submission
                        </h4>
                        <span className="text-xs text-amber-600">{new Date(sub.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="space-y-1 text-sm text-amber-900">
                        <div><span className="font-semibold">PIC:</span> {sub.transferpic}</div>
                        <div><span className="font-semibold">Amount:</span> Rp {Number(sub.amount).toLocaleString('id-ID')}</div>
                        {sub.receiptUrl && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => setReceiptPopupUrl(sub.receiptUrl)}
                              className="w-full group relative overflow-hidden rounded-lg border border-amber-200 hover:border-indigo-400 transition-colors"
                            >
                              {sub.receiptUrl.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i) ? (
                                <img
                                  src={sub.receiptUrl}
                                  alt="Receipt"
                                  className="w-full h-24 object-cover group-hover:opacity-80 transition-opacity"
                                />
                              ) : (
                                <div className="w-full h-24 bg-amber-100 flex flex-col items-center justify-center gap-1 group-hover:bg-amber-200 transition-colors">
                                  <ExternalLink className="w-5 h-5 text-amber-600" />
                                  <span className="text-xs text-amber-700 font-medium">View Receipt</span>
                                </div>
                              )}
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                                <span className="text-white text-xs font-bold bg-black/50 px-2 py-1 rounded">Klik untuk perbesar</span>
                              </div>
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditAmount(sub.amount.toString());
                          setEditTransferPic(sub.transferpic);
                          setEditReceiptUrl(sub.receiptUrl);
                          showToast("Submission data applied. Click Save to confirm.", "success");
                        }}
                        className="w-full mt-3 py-1.5 bg-amber-200 text-amber-800 rounded-lg text-xs font-bold hover:bg-amber-300 transition-colors"
                      >
                        Use This Data
                      </button>
                    </div>
                  ))}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
                    <input
                      type="number"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Transfer PIC</label>
                    <input
                      type="text"
                      value={editTransferPic}
                      onChange={(e) => setEditTransferPic(e.target.value)}
                      placeholder="Name of person who transferred"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                    <input
                      type="text"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Enter notes"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status Pembayaran</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: 'yes',      label: 'Lunas',    color: 'bg-emerald-50 border-emerald-300 text-emerald-700 ring-emerald-400' },
                        { value: 'approval', label: 'Approval', color: 'bg-amber-50 border-amber-300 text-amber-700 ring-amber-400' },
                        { value: 'no',       label: 'Belum',    color: 'bg-slate-50 border-slate-300 text-slate-600 ring-slate-400' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setEditStatus(opt.value)}
                          className={`py-2 rounded-lg border text-sm font-semibold transition-all ${opt.color} ${
                            editStatus === opt.value ? 'ring-2 shadow-sm' : 'opacity-50 hover:opacity-80'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Transfer Receipt</label>
                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-lg">
                      <div className="space-y-1 text-center">
                        {editReceiptFile ? (
                          <div className="text-sm text-slate-600">
                            Selected file: <span className="font-medium">{editReceiptFile.name}</span>
                          </div>
                        ) : editReceiptUrl ? (
                          <div className="mb-3">
                            <button
                              type="button"
                              onClick={() => setReceiptPopupUrl(editReceiptUrl)}
                              className="group relative overflow-hidden rounded-lg border border-slate-200 hover:border-indigo-400 transition-colors w-full"
                            >
                              {editReceiptUrl.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i) ? (
                                <img src={editReceiptUrl} alt="Receipt Preview" className="mx-auto h-32 object-contain rounded-md group-hover:opacity-80 transition-opacity" />
                              ) : (
                                <div className="h-20 bg-slate-50 flex flex-col items-center justify-center gap-1 group-hover:bg-slate-100 transition-colors">
                                  <Upload className="w-6 h-6 text-slate-400" />
                                  <span className="text-xs text-slate-500 font-medium">PDF — klik untuk lihat</span>
                                </div>
                              )}
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                                <span className="text-white text-xs font-bold bg-black/50 px-2 py-1 rounded">Klik untuk perbesar</span>
                              </div>
                            </button>
                          </div>
                        ) : (
                          <Upload className="mx-auto h-12 w-12 text-slate-400" />
                        )}
                        <div className="flex text-sm text-slate-600 justify-center">
                          <label
                            htmlFor="file-upload"
                            className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
                          >
                            <span>{editReceiptUrl || editReceiptFile ? 'Change file' : 'Upload a file'}</span>
                            <input
                              id="file-upload"
                              name="file-upload"
                              type="file"
                              accept="image/*,.pdf"
                              className="sr-only"
                              ref={fileInputRef}
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  setEditReceiptFile(e.target.files[0]);
                                }
                              }}
                            />
                          </label>
                        </div>
                        <p className="text-xs text-slate-500">PNG, JPG, PDF up to 5MB</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowEditModal(false)}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                      disabled={uploadingReceipt}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={uploadingReceipt}
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center"
                    >
                      {uploadingReceipt ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Saving...
                        </>
                      ) : (
                        'Save Details'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Receipt Popup */}
      {receiptPopupUrl && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-slate-900/80" onClick={() => setReceiptPopupUrl(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden max-w-2xl w-full">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-indigo-600" /> Bukti Transfer
              </h2>
              <button onClick={() => setReceiptPopupUrl(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              {receiptPopupUrl.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i) ? (
                <img src={receiptPopupUrl} alt="Receipt" className="w-full rounded-lg object-contain max-h-[70vh]" />
              ) : (
                <iframe src={receiptPopupUrl} className="w-full h-[70vh] rounded-lg" title="Receipt Document" />
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
