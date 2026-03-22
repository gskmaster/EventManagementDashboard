import React, { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { User, CheckCircle2, FileText, X, Award, Loader2 } from 'lucide-react';
import ConsentCheckbox from '../../components/ConsentCheckbox';
import RecaptchaWidget, { RECAPTCHA_ENABLED } from '../../components/RecaptchaWidget';
import { logConsent } from '../../lib/consentLogger';

export default function PublicSpeakerRegistration() {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [consentGiven, setConsentGiven] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    nik: '',
    fullName: '',
    email: '',
    phoneNumber: '',
    institution: '',
    expertise: [] as string[],
    bankName: '',
    bankAccount: '',
    bankBranch: '',
    accountName: '',
  });
  const [ktpFile, setKtpFile] = useState<File | null>(null);
  const [expertiseInput, setExpertiseInput] = useState('');

  const handleAddExpertise = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && expertiseInput.trim()) {
      e.preventDefault();
      if (!formData.expertise.includes(expertiseInput.trim())) {
        setFormData({ ...formData, expertise: [...formData.expertise, expertiseInput.trim()] });
      }
      setExpertiseInput('');
    }
  };

  const removeExpertise = (tag: string) => {
    setFormData({ ...formData, expertise: formData.expertise.filter(t => t !== tag) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!ktpFile) {
      setError('Silakan unggah file KTP Anda.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const storageRef = ref(storage, `ktp/${Date.now()}_${ktpFile.name}`);
      const uploadResult = await uploadBytes(storageRef, ktpFile);
      const ktpUrl = await getDownloadURL(uploadResult.ref);

      const now = new Date().toISOString();
      await addDoc(collection(db, 'Speakers'), {
        ...formData,
        ktpUrl,
        projectIds: [],
        createdAt: now,
        updatedAt: now,
      });

      await logConsent({
        formType: 'speaker_registration',
        userName: formData.fullName,
        userEmail: formData.email,
        projectId: '',
      });

      setSuccess(true);
    } catch (err) {
      console.error('Error submitting registration:', err);
      setError('Gagal mengirim pendaftaran. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Pendaftaran Berhasil!</h2>
          <p className="text-slate-600">
            Terima kasih telah mendaftar sebagai Narasumber. Tim kami akan segera meninjau informasi Anda.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="bg-indigo-600 p-6 text-white rounded-t-2xl">
            <div className="flex flex-col items-center text-center">
              <img src="/logo-white.png" alt="Logo" className="h-16 w-auto mb-4" onError={e => (e.currentTarget.style.display = 'none')} />
              <User className="w-10 h-10 mb-3 opacity-80" />
              <h1 className="text-2xl font-bold mb-1">Pendaftaran Narasumber</h1>
              <p className="text-sm opacity-80">Isi formulir berikut untuk mendaftar sebagai narasumber</p>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  NIK <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.nik}
                  onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Nomor Induk Kependudukan"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nama Lengkap <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Nama Lengkap Sesuai KTP"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Alamat Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="alamat@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nomor Handphone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="08123456789"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Institusi / Organisasi
                </label>
                <input
                  type="text"
                  value={formData.institution}
                  onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Nama Institusi Asal"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Keahlian (Tekan Enter untuk menambah)
                </label>
                <input
                  type="text"
                  value={expertiseInput}
                  onChange={(e) => setExpertiseInput(e.target.value)}
                  onKeyDown={handleAddExpertise}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Contoh: Pertanian, Manajemen, IT"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {formData.expertise.map((tag, idx) => (
                    <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 uppercase">
                      {tag}
                      <button type="button" onClick={() => removeExpertise(tag)} className="ml-1 hover:text-indigo-900">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center">
                  <Award className="w-4 h-4 mr-2 text-indigo-600" />
                  Informasi Rekening Bank
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nama Bank <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="BCA, Mandiri, BNI"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nomor Rekening <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.bankAccount}
                      onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Nomor Rekening Anda"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cabang Bank</label>
                    <input
                      type="text"
                      value={formData.bankBranch}
                      onChange={(e) => setFormData({ ...formData, bankBranch: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Nama Cabang"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nama Pemilik Rekening <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.accountName}
                      onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Nama Sesuai Buku Tabungan"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Unggah Foto/Scan KTP <span className="text-red-500">*</span>
                </label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-xl hover:border-indigo-400 transition-colors group cursor-pointer">
                  <div className="space-y-1 text-center">
                    <FileText className="mx-auto h-10 w-10 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                    <label className="relative cursor-pointer rounded-md font-medium text-indigo-600 hover:text-indigo-500 text-sm">
                      <span>{ktpFile ? ktpFile.name : 'Pilih file KTP'}</span>
                      <input
                        type="file"
                        className="sr-only"
                        accept="image/*,application/pdf"
                        capture="environment"
                        onChange={(e) => setKtpFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    <p className="text-xs text-slate-500">PNG, JPG, PDF hingga 5MB</p>
                  </div>
                </div>
              </div>

              <ConsentCheckbox checked={consentGiven} onChange={setConsentGiven} />
              <RecaptchaWidget onChange={setRecaptchaToken} />

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting || !consentGiven || (RECAPTCHA_ENABLED && !recaptchaToken)}
                  className="w-full flex items-center justify-center px-4 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                >
                  {submitting ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Mengirim...</>
                  ) : 'Daftar Sebagai Narasumber'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
