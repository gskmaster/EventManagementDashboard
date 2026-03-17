import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, doc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthContext';
import Layout from '../components/Layout';
import Toast from '../components/Toast';
import Select from 'react-select';
import { locations } from '../data/locations';
import { ArrowLeft, Calendar, MapPin, User, Check, X, Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, UserCheck, UserX, Clock } from 'lucide-react';

export default function Attendance() {
  const { user, profile } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [persons, setPersons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  // Table State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<{ value: string, label: string } | null>(null);
  const [filterKecamatan, setFilterKecamatan] = useState<{ value: string, label: string } | null>(null);
  const [filterDesa, setFilterDesa] = useState<{ value: string, label: string } | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('fullName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Bulk Selection State
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<'registered' | 'present' | 'absent' | ''>('');

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  useEffect(() => {
    fetchProjects();
  }, [user, profile]);

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

  const fetchPersonsForProject = async (project: any) => {
    setLoading(true);
    try {
      const instQ = query(collection(db, 'institutions'), where('kabupaten', '==', project.kabupaten));
      const instSnap = await getDocs(instQ);
      const institutions = instSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      
      let allPersons: any[] = [];
      
      if (institutions.length > 0) {
        const instIds = institutions.map(i => i.id);
        const chunks = [];
        for (let i = 0; i < instIds.length; i += 10) {
          chunks.push(instIds.slice(i, i + 10));
        }
        
        for (const chunk of chunks) {
          const personQ = query(collection(db, 'persons'), where('institutionId', 'in', chunk));
          const personSnap = await getDocs(personQ);
          const personData = personSnap.docs.map(doc => {
            const data = doc.data() as any;
            const inst = institutions.find(i => i.id === data.institutionId);
            return { 
              id: doc.id, 
              ...data,
              desa: inst?.desa || '',
              kecamatan: inst?.kecamatan || '',
              kabupaten: inst?.kabupaten || ''
            };
          });
          allPersons = [...allPersons, ...personData];
        }
      }

      // Fetch persons linked directly via projectId
      const directPersonQ = query(collection(db, 'persons'), where('projectId', '==', project.id));
      const directPersonSnap = await getDocs(directPersonQ);
      const directPersonData = directPersonSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      
      // Merge and deduplicate just in case
      const mergedPersons = [...allPersons];
      for (const dp of directPersonData) {
        if (!mergedPersons.find(p => p.id === dp.id)) {
          mergedPersons.push(dp);
        }
      }
      
      setPersons(mergedPersons);
      setSelectedProject(project);
      setCurrentPage(1);
      setSearchTerm('');
      setFilterStatus(null);
      setFilterKecamatan(null);
      setFilterDesa(null);
      setSelectedRows(new Set());
    } catch (error) {
      console.error("Error fetching persons:", error);
      showToast("Failed to fetch participants.", "error");
    } finally {
      setLoading(false);
    }
  };

  const updateAttendance = async (id: string, status: 'registered' | 'present' | 'absent') => {
    try {
      const personRef = doc(db, 'persons', id);
      await updateDoc(personRef, { attendanceStatus: status });
      
      // Update local state
      setPersons(persons.map(p => p.id === id ? { ...p, attendanceStatus: status } : p));
      showToast(`Attendance marked as ${status}.`, "success");
    } catch (error) {
      console.error("Error updating attendance:", error);
      showToast("Failed to update attendance.", "error");
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedRows(new Set(paginatedPersons.map(p => p.id)));
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
    if (!selectedProject || selectedRows.size === 0 || !bulkStatus) return;
    try {
      // In a real app with many rows, use a batched write.
      // For now, we'll update them sequentially or Promise.all
      const updatePromises = Array.from(selectedRows).map(id => {
        const personRef = doc(db, 'persons', id);
        return updateDoc(personRef, { attendanceStatus: bulkStatus });
      });
      
      await Promise.all(updatePromises);
      
      // Update local state
      setPersons(persons.map(p => selectedRows.has(p.id) ? { ...p, attendanceStatus: bulkStatus } : p));
      
      showToast(`Successfully updated ${selectedRows.size} participants.`, "success");
      setShowBulkModal(false);
      setSelectedRows(new Set());
      setBulkStatus('');
    } catch (error) {
      console.error("Error updating bulk attendance:", error);
      showToast("Failed to update attendance.", "error");
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
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? 
      <ArrowUp className="w-4 h-4 ml-1 inline-block text-indigo-600" /> : 
      <ArrowDown className="w-4 h-4 ml-1 inline-block text-indigo-600" />;
  };

  const sortedAndFilteredPersons = useMemo(() => {
    let filtered = persons.filter(person => {
      const matchesSearch = 
        person.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        person.nik?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        person.email?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = filterStatus ? person.attendanceStatus === filterStatus.value : true;
      const matchesKecamatan = filterKecamatan ? person.kecamatan === filterKecamatan.value : true;
      const matchesDesa = filterDesa ? person.desa === filterDesa.value : true;

      return matchesSearch && matchesStatus && matchesKecamatan && matchesDesa;
    });

    return filtered.sort((a, b) => {
      let aValue = a[sortColumn] || '';
      let bValue = b[sortColumn] || '';

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [persons, searchTerm, filterStatus, filterKecamatan, filterDesa, sortColumn, sortDirection]);

  const totalPages = Math.ceil(sortedAndFilteredPersons.length / itemsPerPage);
  const paginatedPersons = sortedAndFilteredPersons.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const statusOptions = [
    { value: 'registered', label: 'Registered' },
    { value: 'present', label: 'Present' },
    { value: 'absent', label: 'Absent' }
  ];

  const totalParticipants = sortedAndFilteredPersons.length;
  const totalRegistered = sortedAndFilteredPersons.filter(p => p.attendanceStatus === 'registered').length;
  const totalPresent = sortedAndFilteredPersons.filter(p => p.attendanceStatus === 'present').length;
  const totalAbsent = sortedAndFilteredPersons.filter(p => p.attendanceStatus === 'absent').length;

  const onGoingProjects = projects.filter(p => p.status === 'On Going');

  const selectedKabupatenData = selectedProject ? locations.find(loc => loc.kabupaten === selectedProject.kabupaten) : null;
  const kecamatanOptions = selectedKabupatenData 
    ? selectedKabupatenData.kecamatan.map(kec => ({ value: kec.name, label: kec.name })) 
    : [];

  const selectedKecamatanData = selectedKabupatenData?.kecamatan.find(kec => kec.name === filterKecamatan?.value);
  const desaOptions = selectedKecamatanData 
    ? selectedKecamatanData.desa.map(d => ({ value: d, label: d })) 
    : [];

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
                <h2 className="text-2xl font-bold text-slate-900">Event Reporting (Attendance)</h2>
                <p className="text-slate-500 mt-1">Select an ongoing project to manage participant check-ins.</p>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {onGoingProjects.length === 0 ? (
                  <div className="col-span-full text-center py-12 bg-white rounded-xl border border-slate-200">
                    <p className="text-slate-500">No ongoing projects found.</p>
                  </div>
                ) : (
                  onGoingProjects.map((project) => (
                    <div 
                      key={project.id} 
                      onClick={() => fetchPersonsForProject(project)}
                      className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative"
                    >
                      <div className="absolute top-4 right-4">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                          {project.status}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 mb-2 pr-20">{project.name}</h3>
                      <div className="space-y-2 text-sm text-slate-600">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-slate-400" />
                          {project.startDate} to {project.endDate}
                        </div>
                        <div className="flex items-center">
                          <MapPin className="w-4 h-4 mr-2 text-slate-400" />
                          {project.venue}, {project.kabupaten}
                        </div>
                        <div className="flex items-center">
                          <User className="w-4 h-4 mr-2 text-slate-400" />
                          PIC: {project.pic}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-6">
              <button 
                onClick={() => setSelectedProject(null)}
                className="flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Projects
              </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-8">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">{selectedProject.name}</h2>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-600 mb-4">
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-1 text-slate-400" />
                      {selectedProject.startDate} to {selectedProject.endDate}
                    </div>
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 mr-1 text-slate-400" />
                      {selectedProject.venue}, {selectedProject.kabupaten}
                    </div>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 inline-flex items-center">
                    <span className="text-sm font-medium text-indigo-800 mr-2">Registration URL:</span>
                    <a 
                      href={`${window.location.origin}/register/${selectedProject.id}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline break-all"
                    >
                      {`${window.location.origin}/register/${selectedProject.id}`}
                    </a>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="text-center px-4 py-2 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="text-2xl font-bold text-slate-900">{totalParticipants}</div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total</div>
                  </div>
                  <div className="text-center px-4 py-2 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="text-2xl font-bold text-blue-700">{totalRegistered}</div>
                    <div className="text-xs font-medium text-blue-600 uppercase tracking-wider">Registered</div>
                  </div>
                  <div className="text-center px-4 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
                    <div className="text-2xl font-bold text-emerald-700">{totalPresent}</div>
                    <div className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Present</div>
                  </div>
                  <div className="text-center px-4 py-2 bg-rose-50 rounded-lg border border-rose-100">
                    <div className="text-2xl font-bold text-rose-700">{totalAbsent}</div>
                    <div className="text-xs font-medium text-rose-600 uppercase tracking-wider">Absent</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search by name, NIK, or email..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div className="w-full md:w-48">
                  <Select
                    options={kecamatanOptions}
                    value={filterKecamatan}
                    onChange={(val) => { setFilterKecamatan(val); setFilterDesa(null); setCurrentPage(1); }}
                    placeholder="Filter Kecamatan"
                    isClearable
                    className="text-sm"
                  />
                </div>
                <div className="w-full md:w-48">
                  <Select
                    options={desaOptions}
                    value={filterDesa}
                    onChange={(val) => { setFilterDesa(val); setCurrentPage(1); }}
                    placeholder="Filter Desa"
                    isClearable
                    isDisabled={!filterKecamatan}
                    className="text-sm"
                  />
                </div>
                <div className="w-full md:w-48">
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

            {selectedRows.size > 0 && (
              <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 mb-6 flex items-center justify-between">
                <span className="text-indigo-700 font-medium">
                  {selectedRows.size} row(s) selected
                </span>
                <button
                  onClick={() => setShowBulkModal(true)}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Bulk Update
                </button>
              </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={paginatedPersons.length > 0 && selectedRows.size === paginatedPersons.length}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('fullName')}
                    >
                      Participant <SortIcon column="fullName" />
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('mobilePhone')}
                    >
                      Contact <SortIcon column="mobilePhone" />
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
                      onClick={() => handleSort('posisi')}
                    >
                      Posisi <SortIcon column="posisi" />
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort('attendanceStatus')}
                    >
                      Status <SortIcon column="attendanceStatus" />
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {paginatedPersons.map((person) => (
                    <tr key={person.id} className={selectedRows.has(person.id) ? 'bg-indigo-50/50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input 
                          type="checkbox" 
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedRows.has(person.id)}
                          onChange={() => handleSelectRow(person.id)}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-slate-900">{person.fullName}</div>
                        <div className="text-sm text-slate-500">NIK: {person.nik}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-900">{person.mobilePhone}</div>
                        <div className="text-sm text-slate-500">{person.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-900">{person.kecamatan || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-900">{person.desa || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-900">{person.posisi === 'Lainnya' ? person.posisiLainnya : person.posisi || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          person.attendanceStatus === 'present' ? 'bg-green-100 text-green-800' : 
                          person.attendanceStatus === 'absent' ? 'bg-red-100 text-red-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {person.attendanceStatus ? person.attendanceStatus.charAt(0).toUpperCase() + person.attendanceStatus.slice(1) : 'Registered'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          {person.attendanceStatus !== 'present' && (
                            <button 
                              onClick={() => updateAttendance(person.id, 'present')}
                              className="text-green-600 hover:text-green-900 flex items-center"
                            >
                              <UserCheck className="w-5 h-5 mr-1" /> Check In
                            </button>
                          )}
                          {person.attendanceStatus !== 'absent' && (
                            <button 
                              onClick={() => updateAttendance(person.id, 'absent')}
                              className="text-red-600 hover:text-red-900 flex items-center"
                            >
                              <UserX className="w-5 h-5 mr-1" /> Mark Absent
                            </button>
                          )}
                          {person.attendanceStatus !== 'registered' && (
                            <button 
                              onClick={() => updateAttendance(person.id, 'registered')}
                              className="text-blue-600 hover:text-blue-900 flex items-center"
                            >
                              <Clock className="w-5 h-5 mr-1" /> Mark Registered
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedPersons.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                        No participants found matching your criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="bg-white px-4 py-3 border-t border-slate-200 flex items-center justify-between sm:px-6">
                  <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-slate-700">
                        Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, sortedAndFilteredPersons.length)}</span> of <span className="font-medium">{sortedAndFilteredPersons.length}</span> results
                      </p>
                    </div>
                    <div>
                      <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">Previous</span>
                          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                        </button>
                        {[...Array(totalPages)].map((_, i) => (
                          <button
                            key={i + 1}
                            onClick={() => setCurrentPage(i + 1)}
                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                              currentPage === i + 1
                                ? 'z-10 bg-indigo-50 border-indigo-500 text-indigo-600'
                                : 'bg-white border-slate-300 text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            {i + 1}
                          </button>
                        ))}
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">Next</span>
                          <ChevronRight className="h-5 w-5" aria-hidden="true" />
                        </button>
                      </nav>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Bulk Update Modal */}
        {showBulkModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
              <div className="fixed inset-0 transition-opacity bg-slate-900/75" onClick={() => setShowBulkModal(false)}></div>
              <div className="relative inline-block w-full max-w-md p-6 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-slate-900">
                    Bulk Update Attendance
                  </h3>
                  <button onClick={() => setShowBulkModal(false)} className="text-slate-400 hover:text-slate-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <form onSubmit={handleBulkUpdate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Attendance Status</label>
                    <select
                      required
                      value={bulkStatus}
                      onChange={(e) => setBulkStatus(e.target.value as any)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">Select status...</option>
                      <option value="registered">Registered</option>
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                    </select>
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
                      disabled={!bulkStatus}
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Update {selectedRows.size} Participants
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
