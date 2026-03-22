import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { MapPin, CreditCard, CheckCircle2, Upload, User, Mail } from 'lucide-react';
import Select from 'react-select';
import { locations } from '../../data/locations';
import ConsentCheckbox from '../../components/ConsentCheckbox';
import RecaptchaWidget, { RECAPTCHA_ENABLED } from '../../components/RecaptchaWidget';
import { logConsent } from '../../lib/consentLogger';

export default function PublicPaymentRegistration() {
  const { projectId } = useParams();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [consentGiven, setConsentGiven] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    kecamatan: '',
    desa: '',
    transferpic: '',
    email: '',
    amount: '',
    receiptFile: null as File | null,
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!projectId) return;
      try {
        const projRef = doc(db, 'projects', projectId);
        const projSnap = await getDoc(projRef);

        if (projSnap.exists()) {
          const projData = projSnap.data();
          if (projData.status === 'On Going') {
            setProject({ id: projSnap.id, ...projData });
          } else {
            setError('Proyek ini sedang tidak menerima bukti transfer.');
          }
        } else {
          setError('Data proyek tidak ditemukan.');
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Gagal memuat data. Silakan coba lagi.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [projectId]);

  const kabupaten = project?.kabupaten || '';
  const kabupatenData = locations.find(loc => loc.kabupaten === kabupaten);
  const kecamatanOptions = kabupatenData
    ? kabupatenData.kecamatan.map(k => ({ value: k.name, label: k.name }))
    : [];

  const selectedKecamatanData = kabupatenData?.kecamatan.find(k => k.name === formData.kecamatan);
  const desaOptions = selectedKecamatanData
    ? selectedKecamatanData.desa.map(d => ({ value: d, label: d }))
    : [];

  const handleKecamatanChange = (option: any) => {
    setFormData(prev => ({ ...prev, kecamatan: option?.value || '', desa: '' }));
  };

  const handleDesaChange = (option: any) => {
    setFormData(prev => ({ ...prev, desa: option?.value || '' }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, files } = e.target;
    if (name === 'receiptFile' && files) {
      setFormData(prev => ({ ...prev, receiptFile: files[0] }));
    } else {
      setFormData(prev => ({ ...prev, [name]: e.target.value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!projectId) return;

    if (!formData.kecamatan || !formData.desa || !formData.transferpic || !formData.email || !formData.amount || !formData.receiptFile) {
      setError('Silakan lengkapi semua data dan unggah bukti transfer.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Look up institution by kabupaten + kecamatan + desa
      const instQuery = query(
        collection(db, 'institutions'),
        where('kabupaten', '==', kabupaten),
        where('kecamatan', '==', formData.kecamatan),
        where('desa', '==', formData.desa)
      );
      const instSnap = await getDocs(instQuery);
      if (instSnap.empty) {
        setError('Desa tidak ditemukan dalam sistem. Silakan hubungi panitia.');
        setSubmitting(false);
        return;
      }
      const institutionId = instSnap.docs[0].id;

      // Upload receipt to storage
      const storageRef = ref(storage, `receipts_public/${projectId}/${institutionId}_${Date.now()}`);
      const snapshot = await uploadBytes(storageRef, formData.receiptFile);
      const receiptUrl = await getDownloadURL(snapshot.ref);

      // Update project.payments JSON blob with status: 'approval'
      const projRef = doc(db, 'projects', projectId);
      const projSnap = await getDoc(projRef);
      if (projSnap.exists()) {
        const currentPayments = JSON.parse(projSnap.data().payments || '{}');
        currentPayments[institutionId] = {
          ...currentPayments[institutionId],
          status: 'approval',
          amount: formData.amount,
          transferpic: formData.transferpic,
          email: formData.email,
          kecamatan: formData.kecamatan,
          desa: formData.desa,
          receiptUrl,
          updatedAt: new Date().toISOString(),
        };
        await updateDoc(projRef, { payments: JSON.stringify(currentPayments) });
      }

      // Add submission record for admin notification
      await addDoc(collection(db, 'payment_submissions'), {
        projectId,
        institutionId,
        kabupaten,
        kecamatan: formData.kecamatan,
        desa: formData.desa,
        transferpic: formData.transferpic,
        email: formData.email,
        amount: formData.amount,
        receiptUrl,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      await logConsent({
        formType: 'payment_registration',
        userName: formData.transferpic,
        userEmail: formData.email,
        projectId,
      });

      setSuccess(true);
    } catch (err) {
      console.error('Error submitting payment:', err);
      setError('Gagal mengirim data. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Pendaftaran Tidak Tersedia</h2>
          <p className="text-slate-600 mb-6">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Berhasil Dikirim!</h2>
          <p className="text-slate-600">
            Bukti transfer untuk <strong>Desa {formData.desa}, Kec. {formData.kecamatan}</strong> di{' '}
            <strong>{project?.name}</strong> telah berhasil dikirim dan sedang menunggu verifikasi admin.
          </p>
        </div>
      </div>
    );
  }

  const selectStyles = {
    control: (base: any) => ({
      ...base,
      borderColor: '#cbd5e1',
      borderRadius: '0.5rem',
      minHeight: '42px',
      boxShadow: 'none',
      '&:hover': { borderColor: '#6366f1' },
    }),
    option: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isSelected ? '#6366f1' : state.isFocused ? '#eef2ff' : 'white',
      color: state.isSelected ? 'white' : '#1e293b',
    }),
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-indigo-600 p-6 text-white text-center">
            <img src="/logo-white.png" alt="Company Logo" className="h-16 w-auto mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Konfirmasi Pembayaran</h1>
            <h2 className="text-lg opacity-90">{project?.name}</h2>
            <div className="mt-4 inline-flex items-center px-3 py-1 bg-white/20 rounded-full text-sm">
              <MapPin className="w-4 h-4 mr-2" />
              {kabupaten}
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Kabupaten — auto-filled, non-editable */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kabupaten</label>
                <input
                  type="text"
                  value={kabupaten}
                  readOnly
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed"
                />
              </div>

              {/* Kecamatan */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Kecamatan <span className="text-red-500">*</span>
                </label>
                <Select
                  options={kecamatanOptions}
                  value={formData.kecamatan ? { value: formData.kecamatan, label: formData.kecamatan } : null}
                  onChange={handleKecamatanChange}
                  placeholder="Pilih kecamatan..."
                  styles={selectStyles}
                  isSearchable
                  noOptionsMessage={() => 'Tidak ada pilihan'}
                />
              </div>

              {/* Desa */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Desa <span className="text-red-500">*</span>
                </label>
                <Select
                  options={desaOptions}
                  value={formData.desa ? { value: formData.desa, label: formData.desa } : null}
                  onChange={handleDesaChange}
                  placeholder={formData.kecamatan ? 'Pilih desa...' : 'Pilih kecamatan terlebih dahulu'}
                  isDisabled={!formData.kecamatan}
                  styles={selectStyles}
                  isSearchable
                  noOptionsMessage={() => 'Tidak ada pilihan'}
                />
              </div>

              {/* Nama Admin / Transfer PIC */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nama Admin (PIC Transfer) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type="text"
                    name="transferpic"
                    required
                    value={formData.transferpic}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Nama lengkap penyetor"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email Desa / Admin Desa <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Alamat email aktif"
                  />
                </div>
              </div>

              {/* Nominal Transfer */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nominal Transfer <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">Rp</span>
                  <input
                    type="number"
                    name="amount"
                    required
                    min="0"
                    value={formData.amount}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Bukti Transfer */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Bukti Transfer <span className="text-red-500">*</span>
                </label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-xl hover:border-indigo-400 transition-colors">
                  <div className="space-y-1 text-center">
                    <Upload className="mx-auto h-12 w-12 text-slate-400" />
                    <div className="flex text-sm text-slate-600">
                      <label className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500">
                        <span>Pilih file</span>
                        <input
                          type="file"
                          name="receiptFile"
                          accept="image/*,.pdf"
                          capture="environment"
                          onChange={handleChange}
                          className="sr-only"
                          required
                        />
                      </label>
                      <p className="pl-1 text-slate-500">atau tarik dan lepas</p>
                    </div>
                    <p className="text-xs text-slate-500">PNG, JPG, PDF up to 5MB</p>
                    {formData.receiptFile && (
                      <p className="text-sm font-medium text-indigo-600 mt-2">{formData.receiptFile.name}</p>
                    )}
                  </div>
                </div>
              </div>

              <ConsentCheckbox checked={consentGiven} onChange={setConsentGiven} />
              <RecaptchaWidget onChange={setRecaptchaToken} />

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting || !consentGiven || (RECAPTCHA_ENABLED && !recaptchaToken)}
                  className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-200"
                >
                  {submitting ? 'Sedang mengirim...' : 'Kirim Bukti Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
