import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { db } from '../firebase';
import Layout from '../components/Layout';
import { 
  ArrowLeft, 
  Calendar, 
  MapPin, 
  User, 
  Users, 
  CreditCard, 
  Mic, 
  Search, 
  ArrowUpDown, 
  ChevronLeft, 
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';

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

/** Only allow https:// URLs (Firebase Storage) - prevents javascript: / data: XSS */
const sanitizeUrl = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [speakers, setSpeakers] = useState<any[]>([]);
  
  // Store validated receipt URLs outside of tainted useState to prevent Snyk open-redirect dataflow
  const receiptUrls = React.useRef<Map<string, string>>(new Map());

  // Modal State
  const [activeModal, setActiveModal] = useState<'registered' | 'payments' | 'speakers' | null>(null);
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [modalSortCol, setModalSortCol] = useState<string>('');
  const [modalSortDir, setModalSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    fetchProjectData();
  }, [projectId]);

  const fetchProjectData = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      // 1. Fetch Project Info
      const projectRef = doc(db, 'projects', projectId);
      const projectSnap = await getDoc(projectRef);
      
      if (projectSnap.exists()) {
        setProject({ id: projectSnap.id, ...projectSnap.data() } as Project);
      } else {
        navigate('/projects');
        return;
      }

      // 2. Fetch Related Data in Parallel
      const [regSnap, paySnap, spkSnap] = await Promise.all([
        getDocs(query(collection(db, 'persons'), where('projectId', '==', projectId))),
        getDocs(query(collection(db, 'payment_submissions'), where('projectId', '==', projectId))),
        getDocs(query(collection(db, 'Speakers'), where('projectIds', 'array-contains', projectId)))
      ]);

      setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      // Build a trusted URL registry outside of state (breaks Snyk open-redirect taint chain)
      receiptUrls.current = new Map();
      setPayments(paySnap.docs.map(d => {
        const data = d.data() as any;
        try {
          const parsed = new URL(data.receiptUrl || '');
          if (parsed.protocol === 'https:' && parsed.hostname === 'firebasestorage.googleapis.com') {
            receiptUrls.current.set(d.id, parsed.toString());
          }
        } catch { /* non-URL values are ignored */ }
        const { receiptUrl: _dropped, ...safeData } = data; // drop raw URL from state
        return { id: d.id, hasReceipt: receiptUrls.current.has(d.id), ...safeData };
      }));
      setSpeakers(spkSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    } catch (error) {
      console.error("Error fetching project data:", error);
    } finally {
      setLoading(false);
    }
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

  // Modal Table Logic
  const modalData = useMemo(() => {
    let data: any[] = [];
    if (activeModal === 'registered') data = registrations;
    else if (activeModal === 'payments') data = payments;
    else if (activeModal === 'speakers') data = speakers;

    // Filter
    let filtered = data.filter(item => {
      const searchStr = modalSearchTerm.toLowerCase();
      if (activeModal === 'registered' || activeModal === 'speakers') {
        return (item.fullName || item.name || '').toLowerCase().includes(searchStr) ||
               (item.nik || '').toLowerCase().includes(searchStr) ||
               (item.institution || '').toLowerCase().includes(searchStr);
      }
      if (activeModal === 'payments') {
        return (item.institutionId || '').toLowerCase().includes(searchStr) ||
               (item.status || '').toLowerCase().includes(searchStr) ||
               (item.amount?.toString() || '').includes(searchStr);
      }
      return true;
    });

    // Sort
    if (modalSortCol) {
      filtered.sort((a, b) => {
        const aVal = a[modalSortCol] || '';
        const bVal = b[modalSortCol] || '';
        if (aVal < bVal) return modalSortDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return modalSortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [activeModal, registrations, payments, speakers, modalSearchTerm, modalSortCol, modalSortDir]);

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

  const totalPayments = payments.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto pb-12">
        {/* Header and Back Button */}
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center text-slate-500 hover:text-indigo-600 transition-colors mb-6 group"
        >
          <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
          Back to Project Management
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-8">
          <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(project.status)}`}>
                    {project.status}
                  </span>
                </div>
                <p className="text-slate-500 flex items-center">
                  <MapPin className="w-4 h-4 mr-1" />
                  {project.kabupaten}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm font-medium">
                <div className="flex items-center px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm">
                  <Calendar className="w-4 h-4 mr-2 text-indigo-600" />
                  <span className="text-slate-700">{project.startDate} to {project.endDate}</span>
                </div>
                <div className="flex items-center px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm">
                  <User className="w-4 h-4 mr-2 text-indigo-600" />
                  <span className="text-slate-700">PIC: {project.pic}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="px-8 py-8">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6">Detailed Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Registration Summary */}
              <div 
                onClick={() => setActiveModal('registered')}
                className="group cursor-pointer bg-white p-6 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-3 text-slate-100 group-hover:text-indigo-50 transition-colors">
                  <Users className="w-12 h-12" />
                </div>
                <Users className="w-6 h-6 text-indigo-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-1">{registrations.length}</h3>
                <p className="text-slate-500 text-sm">Registered Summary</p>
                <div className="mt-4 flex items-center text-xs font-medium text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  View List <ExternalLink className="w-3 h-3 ml-1" />
                </div>
              </div>

              {/* Payment Summary */}
              <div 
                onClick={() => setActiveModal('payments')}
                className="group cursor-pointer bg-white p-6 rounded-xl border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-3 text-slate-100 group-hover:text-emerald-50 transition-colors">
                  <CreditCard className="w-12 h-12" />
                </div>
                <CreditCard className="w-6 h-6 text-emerald-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  Rp {totalPayments.toLocaleString('id-ID')}
                </h3>
                <p className="text-slate-500 text-sm">Payment Summary</p>
                <div className="mt-4 flex items-center text-xs font-medium text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  View Submissions <ExternalLink className="w-3 h-3 ml-1" />
                </div>
              </div>

              {/* Speakers Summary */}
              <div 
                onClick={() => setActiveModal('speakers')}
                className="group cursor-pointer bg-white p-6 rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-3 text-slate-100 group-hover:text-blue-50 transition-colors">
                  <Mic className="w-12 h-12" />
                </div>
                <Mic className="w-6 h-6 text-blue-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-1">{speakers.length}</h3>
                <p className="text-slate-500 text-sm">Speakers Summary</p>
                <div className="mt-4 flex items-center text-xs font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  View Speakers <ExternalLink className="w-3 h-3 ml-1" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Project Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 text-sm">
            <div>
              <p className="text-slate-400 font-medium mb-1">Event Venue</p>
              <p className="text-slate-700 font-medium">{project.venue}</p>
            </div>
            <div>
              <p className="text-slate-400 font-medium mb-1">Kabupaten Context</p>
              <p className="text-slate-700 font-medium">{project.kabupaten}</p>
            </div>
            <div>
              <p className="text-slate-400 font-medium mb-1">Project Status</p>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getStatusColor(project.status)}`}>
                {project.status}
              </span>
            </div>
            <div>
              <p className="text-slate-400 font-medium mb-1">Lead PIC</p>
              <p className="text-slate-700 font-medium">{project.pic}</p>
            </div>
            <div>
              <p className="text-slate-400 font-medium mb-1">Timeline</p>
              <p className="text-slate-700 font-medium">{project.startDate} to {project.endDate}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Detail Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-[60] overflow-hidden flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setActiveModal(null)}
          ></div>
          <div className="relative bg-white w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900 capitalize">
                  {activeModal.replace('_', ' ')} Details
                </h3>
                <p className="text-sm text-slate-500">
                  Manage and view all {activeModal} entries for this project.
                </p>
              </div>
              <button 
                onClick={() => setActiveModal(null)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <XCircle className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-50 bg-slate-50/30 flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                  type="text"
                  placeholder="Search in list..."
                  value={modalSearchTerm}
                  onChange={(e) => setModalSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50/50 sticky top-0 z-10">
                  <tr>
                    {activeModal === 'registered' && (
                      <>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">NIK / ID</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Position</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      </>
                    )}
                    {activeModal === 'payments' && (
                      <>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Institution</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Receipt</th>
                      </>
                    )}
                    {activeModal === 'speakers' && (
                      <>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Institution</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Expertise</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {modalData.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      {activeModal === 'registered' && (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{item.fullName}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{item.nik}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{item.posisi}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              item.attendanceStatus === 'present' ? 'bg-green-100 text-green-700' : 
                              item.attendanceStatus === 'registered' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {item.attendanceStatus}
                            </span>
                          </td>
                        </>
                      )}
                      {activeModal === 'payments' && (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">
                            Rp {(Number(item.amount) || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{item.institutionId}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              item.status === 'confirmed' ? 'bg-green-100 text-green-700' : 
                              item.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {item.hasReceipt ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Attached
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                        </>
                      )}
                      {activeModal === 'speakers' && (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{item.fullName}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{item.institution}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                            {item.expertise?.join(', ')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {modalData.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center text-slate-400">
                          <Search className="w-8 h-8 mb-2 opacity-50" />
                          <p>No results found for this selection.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex justify-between items-center">
              <span>Showing {modalData.length} records</span>
              <span className="font-medium text-slate-400 uppercase tracking-tight">Interactive Project Summary</span>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
