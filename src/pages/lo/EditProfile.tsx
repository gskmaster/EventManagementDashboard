import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, where, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../components/AuthContext';
import { User, Phone, CreditCard, Building2, Loader2, Save } from 'lucide-react';

interface LOProfile {
  id: string;
  fullName: string;
  nik: string;
  email: string;
  mobilePhone: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  bankBranch?: string;
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
}

export default function EditProfile() {
  const { user, profile: authProfile } = useAuth();
  const [profile, setProfile] = useState<LOProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [form, setForm] = useState({
    fullName: '',
    mobilePhone: '',
    bankName: '',
    accountNumber: '',
    accountName: '',
    bankBranch: '',
  });

  useEffect(() => {
    if (user?.email) fetchProfile();
  }, [user]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const getCollection = () =>
    authProfile?.role === 'usher' ? 'ushers' : 'liaison_officers';

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, getCollection()),
        where('email', '==', user!.email!.toLowerCase())
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = { id: snap.docs[0].id, ...snap.docs[0].data() } as LOProfile;
        setProfile(data);
        setForm({
          fullName: data.fullName || '',
          mobilePhone: data.mobilePhone || '',
          bankName: data.bankName || '',
          accountNumber: data.accountNumber || '',
          accountName: data.accountName || '',
          bankBranch: data.bankBranch || '',
        });
      }
    } catch (err) {
      console.error(err);
      showToast('Gagal memuat profil', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, getCollection(), profile.id), {
        fullName: form.fullName,
        mobilePhone: form.mobilePhone,
        bankName: form.bankName,
        accountNumber: form.accountNumber,
        accountName: form.accountName,
        bankBranch: form.bankBranch,
        updatedAt: new Date().toISOString(),
      });
      showToast('Profil berhasil diperbarui', 'success');
    } catch (err) {
      console.error(err);
      showToast('Gagal menyimpan perubahan', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-8 max-w-2xl mx-auto">
      <p className="text-sm text-slate-500 mb-5 hidden md:block">
        Perbarui informasi pribadi dan rekening bank Anda.
      </p>

      {/* Account info (read-only) */}
      <div className="bg-indigo-50 rounded-2xl p-4 mb-5 flex items-start gap-3">
        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{profile?.fullName || '—'}</p>
          <p className="text-xs text-slate-500">{user?.email}</p>
          {profile?.nik && (
            <p className="text-xs text-slate-400 mt-0.5">NIK: {profile.nik}</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Full Name */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Nama Lengkap
          </label>
          <input
            type="text"
            value={form.fullName}
            onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            placeholder="Nama lengkap"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Nomor Telepon
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="tel"
              value={form.mobilePhone}
              onChange={e => setForm(f => ({ ...f, mobilePhone: e.target.value }))}
              className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="08xxxxxxxxxx"
            />
          </div>
          <p className="text-xs text-amber-600 mt-1">
            Perubahan nomor telepon akan mempengaruhi login berikutnya
          </p>
        </div>

        {/* Bank section */}
        <div className="pt-2">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">Informasi Rekening Bank</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nama Bank</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={form.bankName}
                  onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="contoh: BCA, Mandiri, BNI"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cabang Bank</label>
              <input
                type="text"
                value={form.bankBranch}
                onChange={e => setForm(f => ({ ...f, bankBranch: e.target.value }))}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="Nama cabang"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Nomor Rekening
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={form.accountNumber}
                onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="Nomor rekening"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Nama Pemilik Rekening
              </label>
              <input
                type="text"
                value={form.accountName}
                onChange={e => setForm(f => ({ ...f, accountName: e.target.value }))}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="Nama sesuai buku tabungan"
              />
            </div>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors mt-4"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
        </button>
      </div>

      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-xl text-white text-sm font-medium shadow-lg z-50 whitespace-nowrap ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
