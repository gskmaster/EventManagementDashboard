import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { db, auth, firebaseConfig } from '../firebase';
import { useAuth } from '../components/AuthContext';
import Layout from '../components/Layout';
import Toast from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import Select from 'react-select';
import { Plus, Search, Edit2, Trash2, KeyRound, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

const DEFAULT_PASSWORD = 'Password1234!';

export default function Users() {
  const { user, profile } = useAuth();
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    phone: '',
    role: 'lo',
    password: '',
    confirmPassword: ''
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Delete State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Table State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<{ value: string, label: string } | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('displayName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  useEffect(() => {
    fetchUsers();
  }, [user, profile]);

  const fetchUsers = async () => {
    if (!user || !profile) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'users'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setUsersList(data);
    } catch (error) {
      console.error("Error fetching users:", error);
      showToast("Failed to fetch users.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({ displayName: '', email: '', phone: '', role: 'lo', password: '', confirmPassword: '' });
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (userData: any) => {
    setIsEditing(true);
    setEditingId(userData.id);
    setFormData({
      displayName: userData.displayName || '',
      email: userData.email || '',
      phone: userData.phone || '',
      role: userData.role || 'lo',
      password: '',
      confirmPassword: ''
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    
    if (!formData.displayName || !formData.email || !formData.phone || !formData.role) {
      setFormError("Harap isi semua kolom yang wajib diisi.");
      return;
    }

    if (!isEditing) {
      if (!formData.password || !formData.confirmPassword) {
        setFormError("Kata sandi wajib diisi untuk pengguna baru.");
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setFormError("Kata sandi tidak cocok.");
        return;
      }
      if (formData.password.length < 6) {
        setFormError("Kata sandi minimal 6 karakter.");
        return;
      }
    }

    try {
      if (isEditing && editingId) {
        const userRef = doc(db, 'users', editingId);
        await updateDoc(userRef, {
          displayName: formData.displayName,
          phone: formData.phone,
          role: formData.role,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.email || ''
        });
        showToast("Pengguna berhasil diperbarui.", "success");
      } else {
        // Create new user in Auth and Firestore
        const secondaryApp = initializeApp(firebaseConfig, "Secondary");
        const secondaryAuth = getAuth(secondaryApp);
        
        try {
          const res = await createUserWithEmailAndPassword(secondaryAuth, formData.email, formData.password);
          try {
            await setDoc(doc(db, 'users', res.user.uid), {
              uid: res.user.uid,
              email: formData.email,
              displayName: formData.displayName,
              phone: formData.phone,
              role: formData.role,
              createdAt: new Date().toISOString(),
              createdBy: user?.email || ''
            });
            showToast("Pengguna berhasil dibuat.", "success");
          } catch (firestoreError: any) {
            console.error("Firestore Error:", firestoreError);
            setFormError("User created in Auth but failed to save profile.");
            return;
          }
        } catch (authError: any) {
          console.error("Auth Error:", authError);
          if (authError.code === 'auth/email-already-in-use') {
            setFormError("Email is already in use.");
          } else {
            setFormError(authError.message || "Failed to create user.");
          }
          return;
        } finally {
          await secondaryAuth.signOut();
        }
      }
      setShowModal(false);
      fetchUsers();
    } catch (error: any) {
      console.error("Error saving user:", error);
      setFormError(error.message || "Failed to save user.");
    }
  };

  const handleDeleteClick = (id: string) => {
    setDeletingId(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteDoc(doc(db, 'users', deletingId));
      showToast("Pengguna berhasil dihapus.", "success");
      fetchUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      showToast("Gagal menghapus pengguna.", "error");
    } finally {
      setShowDeleteModal(false);
      setDeletingId(null);
    }
  };

  const handleResetPassword = async (target: any) => {
    try {
      if (import.meta.env.DEV) {
        // Auth emulator: update password directly via REST (no admin token required)
        const res = await fetch(
          `http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=test-key`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ localId: target.id, password: DEFAULT_PASSWORD }),
          }
        );
        if (!res.ok) throw new Error('Emulator reset failed');
        showToast(`Password reset to default for ${target.displayName}.`, 'success');
      } else {
        // Production: send a reset email (Admin SDK needed to set specific password)
        await sendPasswordResetEmail(auth, target.email);
        showToast(`Password reset email sent to ${target.email}.`, 'success');
      }
    } catch (error) {
      console.error('Reset password error:', error);
      showToast('Gagal mereset kata sandi.', 'error');
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

  const sortedAndFilteredUsers = useMemo(() => {
    let filtered = usersList.filter(u => {
      const matchesSearch = 
        u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.phone?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesRole = filterRole ? u.role === filterRole.value : true;

      return matchesSearch && matchesRole;
    });

    return filtered.sort((a, b) => {
      let aValue = a[sortColumn] || '';
      let bValue = b[sortColumn] || '';
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [usersList, searchTerm, filterRole, sortColumn, sortDirection]);

  const totalPages = Math.ceil(sortedAndFilteredUsers.length / itemsPerPage);
  const paginatedUsers = sortedAndFilteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const roleOptions = [
    { value: 'admin', label: 'Admin' },
    { value: 'finance', label: 'Finance' },
    { value: 'event_manager', label: 'Event Manager' },
    { value: 'lo', label: 'LO' },
    { value: 'tax_admin', label: 'Tax Admin' },
    { value: 'dpo', label: 'Data Protection Officer' },
  ];

  const getRoleLabel = (role: string) => {
    const option = roleOptions.find(o => o.value === role);
    return option ? option.label : role;
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
            <h2 className="text-2xl font-bold text-slate-900">Manajemen Pengguna</h2>
            <p className="text-slate-500 mt-1">Kelola pengguna, peran, dan hak akses.</p>
          </div>
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm"
          >
            <Plus className="w-5 h-5 mr-2" />
            Pengguna Baru
          </button>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Cari nama, email, atau telepon..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="w-full md:w-64">
            <Select
              options={roleOptions}
              value={filterRole}
              onChange={(val) => { setFilterRole(val); setCurrentPage(1); }}
              placeholder="Filter Peran"
              isClearable
              className="text-sm"
            />
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
                    onClick={() => handleSort('displayName')}
                  >
                    Nama Lengkap <SortIcon column="displayName" />
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('email')}
                  >
                    Email <SortIcon column="email" />
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('phone')}
                  >
                    Telepon <SortIcon column="phone" />
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort('role')}
                  >
                    Peran <SortIcon column="role" />
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {paginatedUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{u.displayName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{u.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{u.phone || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        u.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                        u.role === 'finance' ? 'bg-green-100 text-green-800' :
                        u.role === 'event_manager' ? 'bg-blue-100 text-blue-800' :
                        u.role === 'lo' ? 'bg-amber-100 text-amber-800' :
                        u.role === 'tax_admin' ? 'bg-rose-100 text-rose-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {getRoleLabel(u.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      <div className="flex items-center justify-center space-x-3">
                        <button
                          onClick={() => handleOpenEditModal(u)}
                          className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 p-1.5 rounded-md transition-colors"
                          title="Edit User"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={async () => {
                            if (window.confirm(`Reset password for "${u.displayName}" to the default password "${DEFAULT_PASSWORD}"?\n\nThe user will need to change it after logging in.`)) {
                              await handleResetPassword(u);
                            }
                          }}
                          className="text-amber-600 hover:text-amber-900 bg-amber-50 p-1.5 rounded-md transition-colors"
                          title="Reset Password to Default"
                          disabled={u.id === user?.uid}
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(u.id)}
                          className="text-red-600 hover:text-red-900 bg-red-50 p-1.5 rounded-md transition-colors"
                          title="Delete User"
                          disabled={u.id === user?.uid}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      Tidak ada pengguna yang sesuai dengan filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="text-sm text-slate-500">
                  Menampilkan <span className="font-medium text-slate-900">{((currentPage - 1) * itemsPerPage) + 1}</span> hingga <span className="font-medium text-slate-900">{Math.min(currentPage * itemsPerPage, sortedAndFilteredUsers.length)}</span> dari <span className="font-medium text-slate-900">{sortedAndFilteredUsers.length}</span> hasil
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

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
              <div className="fixed inset-0 transition-opacity bg-slate-900/75" onClick={() => setShowModal(false)}></div>
              <div className="relative inline-block w-full max-w-md p-6 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl">
                <h3 className="text-lg font-bold text-slate-900 mb-4">
                  {isEditing ? 'Edit Pengguna' : 'Buat Pengguna Baru'}
                </h3>
                {formError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                    {formError}
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                    <input
                      type="text"
                      required
                      value={formData.displayName}
                      onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                    <input
                      type="email"
                      required
                      disabled={isEditing}
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                    {isEditing && <p className="text-xs text-slate-500 mt-1">Email tidak dapat diubah setelah dibuat.</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Telepon *</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Peran *</label>
                    <select
                      required
                      value={formData.role}
                      onChange={(e) => setFormData({...formData, role: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      {roleOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  {!isEditing && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Kata Sandi *</label>
                        <input
                          type="password"
                          required={!isEditing}
                          value={formData.password}
                          onChange={(e) => setFormData({...formData, password: e.target.value})}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Konfirmasi Kata Sandi *</label>
                        <input
                          type="password"
                          required={!isEditing}
                          value={formData.confirmPassword}
                          onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                    </>
                  )}
                  <div className="mt-6 flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                    >
                      {isEditing ? 'Simpan Perubahan' : 'Buat Pengguna'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={showDeleteModal}
          title="Hapus Pengguna"
          message="Apakah Anda yakin ingin menghapus pengguna ini? Tindakan ini tidak dapat dibatalkan."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => {
            setShowDeleteModal(false);
            setDeletingId(null);
          }}
        />

      </div>
    </Layout>
  );
}
