import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, addDoc, deleteDoc, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthContext';
import Layout from '../components/Layout';
import Toast from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import { Building, Plus, Search, Edit2, Trash2, Map, MapPin, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { locations } from '../data/locations';

export default function Registration() {
  const { user, profile } = useAuth();
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInstModal, setShowInstModal] = useState(false);
  const [editingInstId, setEditingInstId] = useState<string | null>(null);

  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterKab, setFilterKab] = useState<{value: string, label: string} | null>(null);
  const [filterKec, setFilterKec] = useState<{value: string, label: string} | null>(null);

  const filterKabOptions = Array.from(new Set(institutions.map(i => i.kabupaten))).filter(Boolean).map(k => ({ value: k as string, label: k as string }));
  const filterKecOptions = Array.from(new Set(institutions.filter(i => filterKab ? i.kabupaten === filterKab.value : true).map(i => i.kecamatan))).filter(Boolean).map(k => ({ value: k as string, label: k as string }));

  // Pagination and Sorting State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortColumn, setSortColumn] = useState<string>('kabupaten');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Institution Form
  const [kabupaten, setKabupaten] = useState('');
  const [kecamatan, setKecamatan] = useState('');
  const [desa, setDesa] = useState('');

  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  // Form Options
  const formKabOptions = Array.from(new Set(institutions.map(i => i.kabupaten))).filter(Boolean).map(k => ({ value: k as string, label: k as string }));
  const formKecOptions = Array.from(new Set(institutions.filter(i => kabupaten ? i.kabupaten === kabupaten : true).map(i => i.kecamatan))).filter(Boolean).map(k => ({ value: k as string, label: k as string }));
  const formDesaOptions = Array.from(new Set(institutions.filter(i => kecamatan ? i.kecamatan === kecamatan : true).map(i => i.desa))).filter(Boolean).map(d => ({ value: d as string, label: d as string }));

  useEffect(() => {
    const autoInjectAndClean = async () => {
      if (!user || !profile || profile.role !== 'admin') return;
      
      try {
        // Auto-inject Pandeglang data if not done
        if (!localStorage.getItem('pandeglang_injected')) {
          const q = query(collection(db, 'institutions'), where('kabupaten', '==', 'Kabupaten Pandeglang'));
          const snapshot = await getDocs(q);
          
          if (snapshot.empty) {
            const batch = writeBatch(db);
            const pandeglang = locations.find(l => l.kabupaten === 'Kabupaten Pandeglang');
            
            if (pandeglang) {
              let count = 0;
              pandeglang.kecamatan.forEach(kec => {
                kec.desa.forEach(desaName => {
                  const newDocRef = doc(collection(db, 'institutions'));
                  batch.set(newDocRef, {
                    userId: user.uid,
                    kabupaten: pandeglang.kabupaten,
                    kecamatan: kec.name,
                    desa: desaName,
                    paymentStatus: 'confirmed',
                    createdAt: new Date().toISOString()
                  });
                  count++;
                });
              });
              await batch.commit();
              console.log(`Successfully injected ${count} regions!`);
              localStorage.setItem('pandeglang_injected', 'true');
              fetchData();
            }
          } else {
            localStorage.setItem('pandeglang_injected', 'true');
          }
        }

        // Auto-inject Lebak data if not done
        if (!localStorage.getItem('lebak_injected')) {
          const q = query(collection(db, 'institutions'), where('kabupaten', '==', 'Kabupaten Lebak'));
          const snapshot = await getDocs(q);
          
          if (snapshot.empty) {
            const batch = writeBatch(db);
            const lebak = locations.find(l => l.kabupaten === 'Kabupaten Lebak');
            
            if (lebak) {
              let count = 0;
              lebak.kecamatan.forEach(kec => {
                kec.desa.forEach(desaName => {
                  const newDocRef = doc(collection(db, 'institutions'));
                  batch.set(newDocRef, {
                    userId: user.uid,
                    kabupaten: lebak.kabupaten,
                    kecamatan: kec.name,
                    desa: desaName,
                    paymentStatus: 'confirmed',
                    createdAt: new Date().toISOString()
                  });
                  count++;
                });
              });
              await batch.commit();
              console.log(`Successfully injected ${count} Lebak regions!`);
              localStorage.setItem('lebak_injected', 'true');
              fetchData();
            }
          } else {
            localStorage.setItem('lebak_injected', 'true');
          }
        }

        // Clean duplicates
        if (!localStorage.getItem('duplicates_cleaned_v2')) {
          const snapshot = await getDocs(collection(db, 'institutions'));
          const seen = new Set();
          const duplicates: string[] = [];

          snapshot.docs.forEach(doc => {
            const data = doc.data();
            const key = `${data.kabupaten}-${data.kecamatan}-${data.desa}`.toLowerCase();
            
            if (seen.has(key)) {
              duplicates.push(doc.id);
            } else {
              seen.add(key);
            }
          });

          if (duplicates.length > 0) {
            for (let i = 0; i < duplicates.length; i += 500) {
              const batch = writeBatch(db);
              const chunk = duplicates.slice(i, i + 500);
              chunk.forEach(id => {
                batch.delete(doc(db, 'institutions', id));
              });
              await batch.commit();
            }
            console.log(`Successfully removed ${duplicates.length} duplicate regions based on full path!`);
            fetchData();
          }
          localStorage.setItem('duplicates_cleaned_v2', 'true');
        }
      } catch (error) {
        console.error("Error auto-injecting or cleaning data:", error);
      }
    };
    
    autoInjectAndClean();
  }, [user, profile]);

  useEffect(() => {
    fetchData();
  }, [user, profile]);

  const fetchData = async () => {
    if (!user || !profile) return;
    try {
      const q = query(collection(db, 'institutions'));
      
      const snapshot = await getDocs(q);
      const instData = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setInstitutions(instData);
    } catch (error) {
      console.error("Error fetching institutions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !kabupaten || !kecamatan || !desa) {
      showToast("Please fill in Kabupaten, Kecamatan, and Desa.", "error");
      return;
    }
    try {
      if (editingInstId) {
        await updateDoc(doc(db, 'institutions', editingInstId), {
          desa,
          kecamatan,
          kabupaten,
        });
        showToast("Region updated successfully!", "success");
      } else {
        await addDoc(collection(db, 'institutions'), {
          userId: user.uid,
          desa,
          kecamatan,
          kabupaten,
          paymentStatus: 'pending',
          createdAt: new Date().toISOString()
        });
        showToast("Region added successfully!", "success");
      }
      setShowInstModal(false);
      setEditingInstId(null);
      setKabupaten(''); setKecamatan(''); setDesa('');
      fetchData();
    } catch (error) {
      console.error("Error saving institution:", error);
      showToast("Failed to save region.", "error");
    }
  };

  const handleEditInstitution = (inst: any) => {
    setEditingInstId(inst.id);
    setKabupaten(inst.kabupaten || '');
    setKecamatan(inst.kecamatan || '');
    setDesa(inst.desa || '');
    setShowInstModal(true);
  };

  const handleDeleteInstitution = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Region",
      message: "Are you sure you want to delete this region? This action cannot be undone.",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'institutions', id));
          fetchData();
          showToast("Region deleted successfully!", "success");
        } catch (error) {
          console.error("Error deleting institution:", error);
          showToast("Failed to delete region.", "error");
        } finally {
          setConfirmModal(null);
        }
      }
    });
  };

  const sortedInstitutions = useMemo(() => {
    const filtered = institutions.filter(inst => {
      const matchesSearch = 
        inst.desa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inst.kecamatan?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inst.kabupaten?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesKab = filterKab ? inst.kabupaten === filterKab.value : true;
      const matchesKec = filterKec ? inst.kecamatan === filterKec.value : true;

      return matchesSearch && matchesKab && matchesKec;
    });

    return filtered.sort((a, b) => {
      const aValue = a[sortColumn] || '';
      const bValue = b[sortColumn] || '';
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [institutions, searchTerm, filterKab, filterKec, sortColumn, sortDirection]);

  const totalKabupaten = new Set(sortedInstitutions.map(i => i.kabupaten)).size;
  const totalKecamatan = new Set(sortedInstitutions.map(i => i.kecamatan)).size;
  const totalDesa = sortedInstitutions.length;

  const totalPages = Math.ceil(sortedInstitutions.length / itemsPerPage);
  const paginatedInstitutions = sortedInstitutions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterKab, filterKec]);

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
        {confirmModal && (
          <ConfirmModal
            isOpen={confirmModal.isOpen}
            title={confirmModal.title}
            message={confirmModal.message}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal(null)}
          />
        )}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Region Management</h2>
            <p className="text-slate-500 mt-1">Manage kabupaten, kecamatan, and desa data.</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => {
                setEditingInstId(null);
                setKabupaten(''); setKecamatan(''); setDesa('');
                setShowInstModal(true);
              }}
              className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Region
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search institutions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="w-full md:w-64">
            <Select
              options={filterKabOptions}
              value={filterKab}
              onChange={(val) => { setFilterKab(val); setFilterKec(null); }}
              placeholder="Filter Kabupaten"
              isClearable
              className="text-sm"
            />
          </div>
          <div className="w-full md:w-64">
            <Select
              options={filterKecOptions}
              value={filterKec}
              onChange={(val) => setFilterKec(val)}
              placeholder="Filter Kecamatan"
              isDisabled={!filterKab}
              isClearable
              className="text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Kabupaten</p>
              <h3 className="text-2xl font-bold text-slate-900">{totalKabupaten}</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg">
              <Map className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Kecamatan</p>
              <h3 className="text-2xl font-bold text-slate-900">{totalKecamatan}</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Desa</p>
              <h3 className="text-2xl font-bold text-slate-900">{totalDesa}</h3>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('kabupaten')}
                  >
                    <div className="flex items-center">
                      Kabupaten
                      {sortColumn === 'kabupaten' && (sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />)}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('kecamatan')}
                  >
                    <div className="flex items-center">
                      Kecamatan
                      {sortColumn === 'kecamatan' && (sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />)}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('desa')}
                  >
                    <div className="flex items-center">
                      Desa
                      {sortColumn === 'desa' && (sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />)}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {paginatedInstitutions.map((inst) => (
                  <tr key={inst.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {inst.kabupaten}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {inst.kecamatan}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {inst.desa}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-3">
                        <button 
                          onClick={() => handleEditInstitution(inst)}
                          className="text-slate-600 hover:text-indigo-600 flex items-center"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteInstitution(inst.id)}
                          className="text-slate-600 hover:text-red-600 flex items-center"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedInstitutions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                      No regions found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            <div className="bg-white px-4 py-3 border-t border-slate-200 flex items-center justify-between sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div className="flex items-center space-x-4">
                  <p className="text-sm text-slate-700">
                    Showing <span className="font-medium">{sortedInstitutions.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, sortedInstitutions.length)}</span> of <span className="font-medium">{sortedInstitutions.length}</span> results
                  </p>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="border-slate-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value={10}>10 per page</option>
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                  </select>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <span className="sr-only">Previous</span>
                      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <span className="relative inline-flex items-center px-4 py-2 border border-slate-300 bg-white text-sm font-medium text-slate-700">
                      Page {currentPage} of {totalPages || 1}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages || totalPages === 0}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <span className="sr-only">Next</span>
                      <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modals for Institution and Person Registration would go here. Keeping it brief for now. */}
        {showInstModal && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-4">
                {editingInstId ? 'Edit Region' : 'Add Region'}
              </h3>
              <form onSubmit={handleRegisterInstitution}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Kabupaten</label>
                    <CreatableSelect
                      isClearable
                      options={formKabOptions}
                      value={kabupaten ? { value: kabupaten, label: kabupaten } : null}
                      onChange={(newValue) => {
                        setKabupaten(newValue ? newValue.value : '');
                        if (!newValue) {
                          setKecamatan('');
                          setDesa('');
                        }
                      }}
                      placeholder="Select or type new Kabupaten"
                      className="text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Kecamatan</label>
                    <CreatableSelect
                      isClearable
                      options={formKecOptions}
                      value={kecamatan ? { value: kecamatan, label: kecamatan } : null}
                      onChange={(newValue) => {
                        setKecamatan(newValue ? newValue.value : '');
                        if (!newValue) {
                          setDesa('');
                        }
                      }}
                      placeholder="Select or type new Kecamatan"
                      className="text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Desa</label>
                    <CreatableSelect
                      isClearable
                      options={formDesaOptions}
                      value={desa ? { value: desa, label: desa } : null}
                      onChange={(newValue) => setDesa(newValue ? newValue.value : '')}
                      placeholder="Select or type new Desa"
                      className="text-sm"
                      required
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                  <button type="button" onClick={() => { setShowInstModal(false); setEditingInstId(null); }} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700">
                    {editingInstId ? 'Save Changes' : 'Register'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
