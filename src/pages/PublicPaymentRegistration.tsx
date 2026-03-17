import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { Calendar, MapPin, CreditCard, CheckCircle2, Upload, User } from 'lucide-react';

export default function PublicPaymentRegistration() {
  const { projectId, institutionId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [institution, setInstitution] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  const [formData, setFormData] = useState({
    transferpic: '',
    amount: '',
    receiptFile: null as File | null,
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!projectId || !institutionId) return;
      try {
        const projRef = doc(db, 'projects', projectId);
        const projSnap = await getDoc(projRef);
        
        const instRef = doc(db, 'institutions', institutionId);
        const instSnap = await getDoc(instRef);

        if (projSnap.exists() && instSnap.exists()) {
          const projData = projSnap.data();
          if (projData.status === 'On Going') {
            setProject({ id: projSnap.id, ...projData });
            setInstitution({ id: instSnap.id, ...instSnap.data() });
          } else {
            setError('Proyek ini sedang tidak menerima bukti transfer.');
          }
        } else {
          setError('Data proyek atau desa tidak ditemukan.');
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        setError('Gagal memuat data. Silakan coba lagi.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [projectId, institutionId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, files } = e.target;
    if (name === 'receiptFile' && files) {
      setFormData(prev => ({ ...prev, receiptFile: files[0] }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !institutionId) return;
    
    if (!formData.transferpic || !formData.amount || !formData.receiptFile) {
      setError('Silakan lengkapi semua data dan unggah bukti transfer.');
      return;
    }
    
    setSubmitting(true);
    setError('');

    try {
      // 1. Upload receipt to storage
      const storageRef = ref(storage, `receipts_public/${projectId}/${institutionId}_${Date.now()}`);
      const snapshot = await uploadBytes(storageRef, formData.receiptFile);
      const receiptUrl = await getDownloadURL(snapshot.ref);

      // 2. Add submission to Firestore
      const submission = {
        projectId,
        institutionId,
        transferpic: formData.transferpic,
        amount: formData.amount,
        receiptUrl,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'payment_submissions'), submission);
      setSuccess(true);
    } catch (err) {
      console.error("Error submitting payment:", err);
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
          <p className="text-slate-600 mb-6">
            Bukti transfer untuk <strong>Desa {institution?.desa}</strong> di <strong>{project?.name}</strong> telah berhasil dikirim dan sedang menunggu verifikasi admin.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Kirim Bukti Lain
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-indigo-600 p-6 text-white text-center">
            <h1 className="text-2xl font-bold mb-2">Konfirmasi Pembayaran</h1>
            <h2 className="text-lg opacity-90">{project?.name}</h2>
            <div className="mt-4 inline-flex items-center px-3 py-1 bg-white/20 rounded-full text-sm">
              <MapPin className="w-4 h-4 mr-2" />
              Desa {institution?.desa}, Kec. {institution?.kecamatan}
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Penyetor / PIC Transfer <span className="text-red-500">*</span>
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

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Jumlah Transfer (Rp) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">Rp</span>
                  <input
                    type="number"
                    name="amount"
                    required
                    value={formData.amount}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Unggah Bukti Transfer <span className="text-red-500">*</span>
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
                          onChange={handleChange}
                          className="sr-only"
                          required
                        />
                      </label>
                      <p className="pl-1 text-slate-500">atau tarik dan lepas</p>
                    </div>
                    <p className="text-xs text-slate-500">
                      PNG, JPG, PDF up to 5MB
                    </p>
                    {formData.receiptFile && (
                      <p className="text-sm font-medium text-indigo-600 mt-2">
                        {formData.receiptFile.name}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting}
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
