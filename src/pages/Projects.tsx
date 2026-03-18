import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, doc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthContext';
import Layout from '../components/Layout';
import Toast from '../components/Toast';
import { Plus, Search, Edit2, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Eye } from 'lucide-react';
import { locations } from '../data/locations';
import Select from 'react-select';
import { useNavigate } from 'react-router-dom';

export default function Projects() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
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
  const [sortColumn, setSortColumn] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Bulk Selection State
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string>('');

  // Inline Edit State
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditStatus, setInlineEditStatus] = useState<string>('');

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

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.name || !newProject.startDate || !newProject.endDate || !newProject.venue || !newProject.pic || !newProject.kabupaten) {
      showToast("Please fill all fields.", "error");
      return;
    }
    try {
      await addDoc(collection(db, 'projects'), {
        ...newProject,
        payments: "{}",
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

  const sortedAndFilteredProjects = useMemo(() => {
    let filtered = projects.filter(proj => {
      const matchesSearch = 
        proj.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        proj.kabupaten?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        proj.pic?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });

    return filtered.sort((a, b) => {
      let aValue = a[sortColumn] || '';
      let bValue = b[sortColumn] || '';

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [projects, searchTerm, sortColumn, sortDirection]);

  const totalPages = Math.ceil(sortedAndFilteredProjects.length / itemsPerPage);
  const paginatedProjects = sortedAndFilteredProjects.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedRows(new Set(paginatedProjects.map(p => p.id)));
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
    if (selectedRows.size === 0 || !bulkStatus) return;
    try {
      const updatePromises = Array.from(selectedRows).map(id => {
        const projRef = doc(db, 'projects', id);
        return updateDoc(projRef, { status: bulkStatus });
      });
      await Promise.all(updatePromises);
      
      showToast("Bulk update successful.", "success");
      setShowBulkModal(false);
      setSelectedRows(new Set());
      setBulkStatus('');
      fetchProjects();
    } catch (error) {
      console.error("Error in bulk update:", error);
      showToast("Failed to bulk update.", "error");
    }
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleInlineEditSave = async (projId: string) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const projRef = doc(db, 'projects', projId);
      await updateDoc(projRef, { status: inlineEditStatus });
      showToast("Status updated.", "success");
      fetchProjects();
    } catch (error) {
      console.error("Error updating status:", error);
      showToast("Failed to update status.", "error");
    } finally {
      setInlineEditId(null);
      setIsSaving(false);
    }
  };

  const statusOptions = ['Planning', 'On Going', 'Done', 'Cancel'];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Planning': return 'bg-blue-100 text-blue-800';
      case 'On Going': return 'bg-amber-100 text-amber-800';
      case 'Done': return 'bg-green-100 text-green-800';
      case 'Cancel': return 'bg-red-100 text-red-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

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
        
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Project Management</h2>
            <p className="text-slate-500 mt-1">Manage event projects, timelines, and statuses.</p>
          </div>
          <button
            onClick={() => setShowProjectModal(true)}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Project
          </button>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search projects by name, PIC, or kabupaten..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
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
              Bulk Update Status
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={paginatedProjects.length > 0 && selectedRows.size === paginatedProjects.length}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('name')}
                  >
                    Project Name <SortIcon column="name" />
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('kabupaten')}
                  >
                    Kabupaten <SortIcon column="kabupaten" />
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('startDate')}
                  >
                    Dates <SortIcon column="startDate" />
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('pic')}
                  >
                    PIC <SortIcon column="pic" />
                  </th>
                  <th 
                    className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('status')}
                  >
                    Status <SortIcon column="status" />
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {paginatedProjects.map((proj) => (
                  <tr key={proj.id} className={selectedRows.has(proj.id) ? 'bg-indigo-50/50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={selectedRows.has(proj.id)}
                        onChange={() => handleSelectRow(proj.id)}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-900">{proj.name}</div>
                      <div className="text-xs text-slate-500">{proj.venue}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{proj.kabupaten}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {proj.startDate} to {proj.endDate}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{proj.pic}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {inlineEditId === proj.id ? (
                        <select
                          autoFocus
                          value={inlineEditStatus}
                          onChange={(e) => setInlineEditStatus(e.target.value)}
                          onBlur={() => handleInlineEditSave(proj.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleInlineEditSave(proj.id);
                            if (e.key === 'Escape') setInlineEditId(null);
                          }}
                          className="w-32 px-2 py-1 border border-indigo-500 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm"
                        >
                          {statusOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <div 
                          className="cursor-pointer hover:bg-slate-100 px-2 py-1 rounded border border-transparent hover:border-slate-300 transition-colors inline-block"
                          onClick={() => {
                            setInlineEditId(proj.id);
                            setInlineEditStatus(proj.status || 'Planning');
                          }}
                          title="Click to edit status"
                        >
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(proj.status || 'Planning')}`}>
                            {proj.status || 'Planning'}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => navigate(`/projects/${proj.id}`)}
                        className="text-slate-400 hover:text-indigo-600 transition-colors"
                        title="View Project Details"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {paginatedProjects.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                      No projects found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="text-sm text-slate-500">
                  Showing <span className="font-medium text-slate-900">{((currentPage - 1) * itemsPerPage) + 1}</span> to <span className="font-medium text-slate-900">{Math.min(currentPage * itemsPerPage, sortedAndFilteredProjects.length)}</span> of <span className="font-medium text-slate-900">{sortedAndFilteredProjects.length}</span> results
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
                    <Select
                      options={locations.map(loc => ({ value: loc.kabupaten, label: loc.kabupaten }))}
                      value={newProject.kabupaten ? { value: newProject.kabupaten, label: newProject.kabupaten } : null}
                      onChange={(selected) => setNewProject({...newProject, kabupaten: selected?.value || ''})}
                      placeholder="Select Kabupaten"
                      isClearable
                      required
                      menuPlacement="auto"
                      menuPosition="fixed"
                      className="react-select-container"
                      classNamePrefix="react-select"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                    <select
                      required
                      value={newProject.status}
                      onChange={(e) => setNewProject({...newProject, status: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      {statusOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
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
                <h3 className="text-lg font-bold text-slate-900 mb-4">Bulk Update Status ({selectedRows.size} selected)</h3>
                
                <form onSubmit={handleBulkUpdate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">New Status</label>
                    <select
                      required
                      value={bulkStatus}
                      onChange={(e) => setBulkStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">Select Status</option>
                      {statusOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
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
      </div>
    </Layout>
  );
}
