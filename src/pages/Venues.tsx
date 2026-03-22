import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../components/AuthContext';
import Layout from '../components/Layout';
import Toast from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import VenueAutocomplete, { VenuePlaceData } from '../components/VenueAutocomplete';
import {
  Building2, Plus, Search, Edit2, Trash2, MapPin, ChevronUp, ChevronDown,
  ChevronLeft, ChevronRight, Phone, Mail, FileText, ExternalLink, Upload, X, Globe, Instagram
} from 'lucide-react';
import Select from 'react-select';
import { locations } from '../data/locations';

const EMPTY_FORM = {
  name: '',
  address: '',
  addressLat: 0,
  addressLng: 0,
  addressPlaceId: '',
  picName: '',
  picEmail: '',
  picPhone: '',
  website: '',
  instagram: '',
  brochureUrl: '',
  kabupaten: '',
};

export default function Venues() {
  const { user, profile } = useAuth();
  const [venues, setVenues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [brochureFile, setBrochureFile] = useState<File | null>(null);
  const brochureInputRef = useRef<HTMLInputElement>(null);
  
  // Email Modal State
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailVenue, setEmailVenue] = useState<any>(null);
  const [emailForm, setEmailForm] = useState({ subject: '', message: '' });
  const [sendingEmail, setSendingEmail] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterKab, setFilterKab] = useState<{ value: string; label: string } | null>(null);
  const [sortColumn, setSortColumn] = useState('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => setToast({ message, type });

  useEffect(() => { fetchVenues(); }, [user, profile]);

  const fetchVenues = async () => {
    if (!user || !profile) return;
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'venues'));
      setVenues(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setBrochureFile(null);
    setShowModal(true);
  };

  const handleOpenEdit = (venue: any) => {
    setEditingId(venue.id);
    setForm({
      name: venue.name || '',
      address: venue.address || '',
      addressLat: venue.addressLat || 0,
      addressLng: venue.addressLng || 0,
      addressPlaceId: venue.addressPlaceId || '',
      picName: venue.picName || '',
      picEmail: venue.picEmail || '',
      picPhone: venue.picPhone || '',
      website: venue.website || '',
      instagram: venue.instagram || '',
      brochureUrl: venue.brochureUrl || '',
      kabupaten: venue.kabupaten || '',
    });
    setBrochureFile(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.kabupaten || !form.picName) {
      showToast('Harap isi semua kolom yang wajib.', 'error');
      return;
    }
    setSaving(true);
    try {
      let brochureUrl = form.brochureUrl;
      if (brochureFile) {
        const storageRef = ref(storage, `venue-brochures/${Date.now()}_${brochureFile.name}`);
        const uploadResult = await uploadBytes(storageRef, brochureFile);
        brochureUrl = await getDownloadURL(uploadResult.ref);
      }

      const payload = { ...form, brochureUrl };

      if (editingId) {
        await updateDoc(doc(db, 'venues', editingId), { ...payload, updatedAt: new Date().toISOString() });
        showToast('Venue berhasil diperbarui!', 'success');
      } else {
        await addDoc(collection(db, 'venues'), { ...payload, createdAt: new Date().toISOString(), createdBy: user?.email || '' });
        showToast('Venue berhasil ditambahkan!', 'success');
      }
      setShowModal(false);
      fetchVenues();
    } catch (err) {
      console.error(err);
      showToast('Gagal menyimpan venue.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Venue',
      message: `Apakah Anda yakin ingin menghapus "${name}"? Tindakan ini tidak dapat dibatalkan.`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'venues', id));
          showToast('Venue berhasil dihapus.', 'success');
          fetchVenues();
        } catch {
          showToast('Gagal menghapus venue.', 'error');
        } finally {
          setConfirmModal(null);
        }
      },
    });
  };

  const handleOpenEmail = (venue: any) => {
    setEmailVenue(venue);
    setEmailForm({
      subject: `Regarding ${venue.name}`,
      message: `Dear ${venue.picName},\n\n`
    });
    setShowEmailModal(true);
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailForm.subject || !emailForm.message) {
      showToast('Subjek dan pesan wajib diisi.', 'error');
      return;
    }
    setSendingEmail(true);
    try {
      await addDoc(collection(db, 'mail'), {
        to: emailVenue.picEmail,
        message: {
          subject: emailForm.subject,
          text: emailForm.message,
        }
      });
      showToast('Email berhasil diantrekan untuk dikirim!', 'success');
      setShowEmailModal(false);
    } catch (err) {
      console.error(err);
      showToast('Gagal mengirim email.', 'error');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSort = (col: string) => {
    if (sortColumn === col) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(col); setSortDirection('asc'); }
  };

  const kabOptions = useMemo(
    () => Array.from(new Set(venues.map(v => v.kabupaten).filter(Boolean))).map(k => ({ value: k as string, label: k as string })),
    [venues]
  );

  const filtered = useMemo(() => {
    return venues
      .filter(v => {
        const matchSearch = [v.name, v.address, v.picName, v.picEmail].some(
          f => f?.toLowerCase().includes(searchTerm.toLowerCase())
        );
        const matchKab = filterKab ? v.kabupaten === filterKab.value : true;
        return matchSearch && matchKab;
      })
      .sort((a, b) => {
        const av = a[sortColumn] || '', bv = b[sortColumn] || '';
        if (av < bv) return sortDirection === 'asc' ? -1 : 1;
        if (av > bv) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
  }, [venues, searchTerm, filterKab, sortColumn, sortDirection]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterKab]);

  const SortIcon = ({ col }: { col: string }) =>
    sortColumn === col
      ? (sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 ml-1 inline" /> : <ChevronDown className="w-4 h-4 ml-1 inline" />)
      : null;

  const kabSelectOptions = locations.map(l => ({ value: l.kabupaten, label: l.kabupaten }));

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        {confirmModal && (
          <ConfirmModal
            isOpen={confirmModal.isOpen}
            title={confirmModal.title}
            message={confirmModal.message}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal(null)}
          />
        )}

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Manajemen Venue</h2>
            <p className="text-slate-500 mt-1">Kelola venue acara, kontak, dan brosur.</p>
          </div>
          <button
            onClick={handleOpenAdd}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm"
          >
            <Plus className="w-5 h-5 mr-2" />
            Tambah Venue
          </button>
        </div>

        {/* Search & Filter */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Cari nama, alamat, atau PIC..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="w-full md:w-64">
            <Select
              options={kabOptions}
              value={filterKab}
              onChange={val => setFilterKab(val)}
              placeholder="Filter Kabupaten"
              isClearable
              className="text-sm"
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Venue</p>
              <h3 className="text-2xl font-bold text-slate-900">{venues.length}</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Kabupaten Tercakup</p>
              <h3 className="text-2xl font-bold text-slate-900">{new Set(venues.map(v => v.kabupaten).filter(Boolean)).size}</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Dengan Brosur</p>
              <h3 className="text-2xl font-bold text-slate-900">{venues.filter(v => v.brochureUrl).length}</h3>
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('name')}>
                    Nama Venue <SortIcon col="name" />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('kabupaten')}>
                    Kabupaten <SortIcon col="kabupaten" />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('picName')}>
                    PIC <SortIcon col="picName" />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Kontak
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Brosur
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {paginated.map(venue => (
                  <tr key={venue.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-slate-900">{venue.name}</div>
                      <div className="text-xs text-slate-500 max-w-xs truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        {venue.address}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{venue.kabupaten}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{venue.picName}</td>
                    <td className="px-6 py-4">
                      {venue.picEmail && (
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Mail className="w-3 h-3" />{venue.picEmail}
                        </div>
                      )}
                      {venue.picPhone && (
                        <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                          <Phone className="w-3 h-3" />{venue.picPhone}
                        </div>
                      )}
                      {venue.website && (
                        <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                          <Globe className="w-3 h-3" />
                          <a href={venue.website} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 truncate max-w-[120px]">{venue.website.replace(/^https?:\/\//, '')}</a>
                        </div>
                      )}
                      {venue.instagram && (
                        <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                          <Instagram className="w-3 h-3" />{venue.instagram}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {venue.brochureUrl
                        ? <a href={venue.brochureUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-xs font-medium">
                            <ExternalLink className="w-3.5 h-3.5" /> Lihat
                          </a>
                        : <span className="text-xs text-slate-400">—</span>
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-3">
                        {venue.picEmail && (
                          <button onClick={() => handleOpenEmail(venue)} className="text-slate-400 hover:text-blue-600 transition-colors" title="Kirim Email">
                            <Mail className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => handleOpenEdit(venue)} className="text-slate-400 hover:text-indigo-600 transition-colors" title="Edit Venue">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(venue.id, venue.name)} className="text-slate-400 hover:text-red-600 transition-colors" title="Hapus Venue">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                      Tidak ada venue ditemukan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="bg-white px-4 py-3 border-t border-slate-200 flex items-center justify-between sm:px-6">
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div className="flex items-center space-x-4">
                  <p className="text-sm text-slate-700">
                    Menampilkan <span className="font-medium">{filtered.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span> hingga{' '}
                    <span className="font-medium">{Math.min(currentPage * itemsPerPage, filtered.length)}</span> dari{' '}
                    <span className="font-medium">{filtered.length}</span> hasil
                  </p>
                  <select
                    value={itemsPerPage}
                    onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                    className="border-slate-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value={10}>10 per halaman</option>
                    <option value={25}>25 per halaman</option>
                    <option value={50}>50 per halaman</option>
                  </select>
                </div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-slate-300 bg-white text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="relative inline-flex items-center px-4 py-2 border border-slate-300 bg-white text-sm text-slate-700">
                    Halaman {currentPage} dari {totalPages || 1}
                  </span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-slate-300 bg-white text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}

        {/* Add / Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-8">
              <div className="flex items-center justify-between p-6 border-b border-slate-200">
                <h3 className="text-lg font-bold text-slate-900">{editingId ? 'Edit Venue' : 'Tambah Venue Baru'}</h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Venue Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nama Venue <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="e.g. Ballroom Hotel Pandeglang"
                  />
                </div>

                {/* Venue Address (Google Maps) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Alamat Venue</label>
                  <VenueAutocomplete
                    value={form.address}
                    placeId={form.addressPlaceId}
                    onChange={val => setForm({ ...form, address: val })}
                    onPlaceSelect={(place: VenuePlaceData) => setForm({
                      ...form,
                      address: place.address,
                      addressLat: place.lat,
                      addressLng: place.lng,
                      addressPlaceId: place.placeId,
                    })}
                  />
                </div>

                {/* Kabupaten */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kabupaten <span className="text-red-500">*</span></label>
                  <Select
                    options={kabSelectOptions}
                    value={form.kabupaten ? { value: form.kabupaten, label: form.kabupaten } : null}
                    onChange={sel => setForm({ ...form, kabupaten: sel?.value || '' })}
                    placeholder="Pilih Kabupaten"
                    isClearable
                    menuPosition="fixed"
                    className="text-sm"
                  />
                </div>

                {/* PIC Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nama PIC <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={form.picName}
                    onChange={e => setForm({ ...form, picName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Nama contact person"
                  />
                </div>

                {/* Email & Phone */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={form.picEmail}
                      onChange={e => setForm({ ...form, picEmail: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="venue@email.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Telepon</label>
                    <input
                      type="tel"
                      value={form.picPhone}
                      onChange={e => setForm({ ...form, picPhone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="+62..."
                    />
                  </div>
                </div>

                {/* Website & Instagram */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Website</label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="url"
                        value={form.website}
                        onChange={e => setForm({ ...form, website: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Instagram</label>
                    <div className="relative">
                      <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={form.instagram}
                        onChange={e => setForm({ ...form, instagram: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="@handle"
                      />
                    </div>
                  </div>
                </div>

                {/* Brochure Upload */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Brosur Venue</label>
                  {form.brochureUrl && !brochureFile && (
                    <div className="flex items-center gap-2 mb-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                      <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                      <a href={form.brochureUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline truncate flex-1">
                        Lihat brosur saat ini
                      </a>
                      <button type="button" onClick={() => setForm({ ...form, brochureUrl: '' })} className="text-slate-400 hover:text-red-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <div
                    className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors"
                    onClick={() => brochureInputRef.current?.click()}
                  >
                    <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                    {brochureFile
                      ? <p className="text-sm text-indigo-600 font-medium">{brochureFile.name}</p>
                      : <p className="text-sm text-slate-500">Klik untuk mengunggah PDF atau gambar</p>
                    }
                  </div>
                  <input
                    ref={brochureInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={e => setBrochureFile(e.target.files?.[0] || null)}
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-2">
                  <button type="button" onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
                    Batal
                  </button>
                  <button type="submit" disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2">
                    {saving && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                    {editingId ? 'Simpan Perubahan' : 'Tambah Venue'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Email PIC Modal */}
        {showEmailModal && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
              <div className="flex items-center justify-between p-6 border-b border-slate-200">
                <h3 className="text-lg font-bold text-slate-900">Email ke PIC</h3>
                <button onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSendEmail} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kepada</label>
                  <input
                    type="text"
                    disabled
                    value={`${emailVenue?.picName} (${emailVenue?.picEmail})`}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Subjek</label>
                  <input
                    type="text"
                    required
                    value={emailForm.subject}
                    onChange={e => setEmailForm({ ...emailForm, subject: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Subjek email"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pesan</label>
                  <textarea
                    required
                    rows={6}
                    value={emailForm.message}
                    onChange={e => setEmailForm({ ...emailForm, message: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Tulis pesan Anda di sini..."
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-2">
                  <button type="button" onClick={() => setShowEmailModal(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
                    Batal
                  </button>
                  <button type="submit" disabled={sendingEmail}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2">
                    {sendingEmail && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                    Kirim Email
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
