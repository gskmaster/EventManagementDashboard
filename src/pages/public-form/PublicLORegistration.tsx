import React, { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions, getFunctionUrl } from '../../firebase';
import { CheckCircle2, FileText, Loader2, Handshake } from 'lucide-react';
import KTPScanButton from '../../components/KTPScanButton';
import NPWPScanButton from '../../components/NPWPScanButton';
import ConsentCheckbox from '../../components/ConsentCheckbox';
import RecaptchaWidget, { RECAPTCHA_ENABLED } from '../../components/RecaptchaWidget';
import { logConsent } from '../../lib/consentLogger';

export default function PublicLORegistration() {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    fullName: '',
    nik: '',
    mobilePhone: '',
    email: '',
    bankName: '',
    accountNumber: '',
    accountName: '',
    bankBranch: '',
    ktpUrl: '', // Now populated by scan
    npwpUrl: '',
    npwpNumber: '',
  });
  const [consentGiven, setConsentGiven] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

  const NIK_REGEX = /^\d{16}$/;
  const PHONE_REGEX = /^(62|0)8[1-9][0-9]{7,10}$/;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    if (!NIK_REGEX.test(formData.nik)) {
      setError('NIK harus terdiri dari 16 digit angka.');
      setSubmitting(false);
      return;
    }
    if (!PHONE_REGEX.test(formData.mobilePhone)) {
      setError('Nomor HP tidak valid. Gunakan format: 08xx atau 628xx.');
      setSubmitting(false);
      return;
    }

    try {
      // Securely check for uniqueness via Cloud Function (onRequest)
      const checkUrl = getFunctionUrl('checkUniqueUser');
      const checkRes = await fetch(checkUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionName: 'liaison_officers',
          email: formData.email.trim(),
          mobilePhone: formData.mobilePhone.trim(),
        }),
      });

      if (!checkRes.ok) {
        throw new Error(`Uniqueness check failed with status ${checkRes.status}`);
      }

      const checkResult = await checkRes.json();
      const { isUnique, type } = checkResult.data;
      if (!isUnique) {
        if (type === 'email') {
          setError('Email ini sudah terdaftar. Silakan gunakan alamat email lain.');
        } else {
          setError('Nomor handphone ini sudah terdaftar. Silakan gunakan nomor telepon lain.');
        }
        setSubmitting(false);
        return;
      }

      if (!formData.ktpUrl) {
        setError('Silakan scan atau unggah KTP Anda terlebih dahulu.');
        setSubmitting(false);
        return;
      }

      // Foto KTP is now handled by the scan button
      const ktpUrl = formData.ktpUrl;

      const now = new Date().toISOString();
      await addDoc(collection(db, 'liaison_officers'), {
        ...formData,
        ktpUrl,
        projectIds: [],
        createdAt: now,
        updatedAt: now,
      });
      await logConsent({
        formType: 'lo_registration',
        userName: formData.fullName,
        userEmail: formData.email,
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
            Terima kasih, <strong>{formData.fullName}</strong>! Data Anda telah kami terima. Tim kami akan segera menghubungi Anda untuk informasi lebih lanjut.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="bg-teal-600 p-6 text-white rounded-t-2xl">
            <div className="flex flex-col items-center text-center">
              <img src="/logo-white.png" alt="Company Logo" className="h-16 w-auto mb-4" />
              <div className="flex items-center mb-2">
                <Handshake className="w-7 h-7 mr-3 opacity-90" />
                <h1 className="text-2xl font-bold">Pendaftaran Liaison Officer</h1>
              </div>
              <p className="text-sm opacity-80 mt-1">
                Isi formulir di bawah ini untuk mendaftar sebagai Liaison Officer. Semua kolom bertanda <span className="text-red-300 font-bold">*</span> wajib diisi.
              </p>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Data Diri */}
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-3">Data Diri</h3>
                <KTPScanButton
                  accentColor="teal"
                  onExtracted={({ nik, fullName, ktpUrl }) =>
                    setFormData(prev => ({ ...prev, nik, fullName, ktpUrl }))
                  }
                />
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nama Lengkap <span className="text-red-500">*</span>
                    </label>
                    <input type="text" required
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="Nama lengkap sesuai KTP"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      NIK (Nomor Induk Kependudukan) <span className="text-red-500">*</span>
                    </label>
                    <input type="text" required inputMode="numeric" maxLength={16} minLength={16}
                      value={formData.nik}
                      onChange={(e) => setFormData({ ...formData, nik: e.target.value.replace(/\D/g, '').slice(0, 16) })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="16 digit nomor KTP"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">File NPWP</label>
                    <NPWPScanButton
                      accentColor="teal"
                      fileName={formData.fullName}
                      onExtracted={({ npwpUrl, npwpNumber }) =>
                        setFormData(prev => ({ ...prev, npwpUrl, npwpNumber }))
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nomor NPWP
                    </label>
                    <input type="text"
                      value={formData.npwpNumber}
                      onChange={(e) => setFormData({ ...formData, npwpNumber: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="Terisi otomatis atau isi manual (opsional)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nomor Handphone <span className="text-red-500">*</span>
                    </label>
                    <input type="text" required inputMode="numeric"
                      value={formData.mobilePhone}
                      onChange={(e) => setFormData({ ...formData, mobilePhone: e.target.value.replace(/\D/g, '') })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="Contoh: 08123456789"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Alamat Email <span className="text-red-500">*</span>
                    </label>
                    <input type="email" required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="alamat@email.com"
                    />
                  </div>
                </div>
              </div>


              {/* Informasi Rekening Bank */}
              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 mb-1">Informasi Rekening Bank</h3>
                <p className="text-xs text-slate-500 mb-4">Digunakan untuk keperluan pembayaran honorarium.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nama Bank</label>
                    <input type="text"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="Contoh: BCA, Mandiri, BRI"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nomor Rekening</label>
                    <input type="text"
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="Nomor rekening"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nama Pemilik Rekening</label>
                    <input type="text"
                      value={formData.accountName}
                      onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="Sesuai buku tabungan"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cabang Bank</label>
                    <input type="text"
                      value={formData.bankBranch}
                      onChange={(e) => setFormData({ ...formData, bankBranch: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="Nama cabang"
                    />
                  </div>
                </div>
              </div>

              <ConsentCheckbox checked={consentGiven} onChange={setConsentGiven} />
              <RecaptchaWidget onChange={setRecaptchaToken} />

              <div className="pt-4">
                <button type="submit" disabled={submitting || !consentGiven || (RECAPTCHA_ENABLED && !recaptchaToken)}
                  className="w-full flex items-center justify-center px-4 py-3 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                >
                  {submitting ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Mengirim Data...</>
                  ) : 'Daftar Sebagai Liaison Officer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
