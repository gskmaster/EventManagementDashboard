import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import QRCode from 'qrcode';
import { Calendar, MapPin, User, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import Select from 'react-select';
import { locations } from '../../data/locations';
import KTPScanButton from '../../components/KTPScanButton';
import ConsentCheckbox from '../../components/ConsentCheckbox';
import RecaptchaWidget, { RECAPTCHA_ENABLED } from '../../components/RecaptchaWidget';
import { logConsent } from '../../lib/consentLogger';

export default function PublicRegistration() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [consentGiven, setConsentGiven] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [ktpFile, setKtpFile] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    nik: '',
    fullName: '',
    mobilePhone: '',
    email: '',
    kabupaten: '',
    kecamatan: '',
    desa: '',
    posisi: '',
    posisiLainnya: ''
  });

  useEffect(() => {
    const fetchProject = async () => {
      if (!projectId) return;
      try {
        const docRef = doc(db, 'projects', projectId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.status === 'On Going') {
            setProject({ id: docSnap.id, ...data });
            setFormData(prev => ({ ...prev, kabupaten: data.kabupaten || '' }));
          } else {
            setError('Proyek ini sedang tidak membuka pendaftaran.');
          }
        } else {
          setError('Proyek tidak ditemukan.');
        }
      } catch (err) {
        console.error("Error fetching project:", err);
        setError('Gagal memuat detail proyek.');
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [projectId]);

  const NIK_REGEX = /^\d{16}$/;
  const PHONE_REGEX = /^(62|0)8[1-9][0-9]{7,10}$/;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'nik') {
      setFormData({ ...formData, nik: value.replace(/\D/g, '').slice(0, 16) });
    } else if (name === 'mobilePhone') {
      setFormData({ ...formData, mobilePhone: value.replace(/\D/g, '') });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;

    if (!NIK_REGEX.test(formData.nik)) {
      setError('NIK harus terdiri dari 16 digit angka.');
      return;
    }
    if (!PHONE_REGEX.test(formData.mobilePhone)) {
      setError('Nomor HP tidak valid. Gunakan format: 08xx atau 628xx.');
      return;
    }

    if (!formData.kecamatan || !formData.desa) {
      setError('Silakan pilih Kecamatan dan Desa.');
      return;
    }

    if (!formData.posisi) {
      setError('Silakan pilih Posisi.');
      return;
    }

    if (formData.posisi === 'Lainnya' && !formData.posisiLainnya) {
      setError('Silakan sebutkan Posisi Anda.');
      return;
    }
    
    if (!ktpFile) {
      setError('Silakan upload foto KTP Anda.');
      setSubmitting(false);
      return;
    }
    
    setSubmitting(true);
    setError('');

    try {
      // Upload KTP File
      let ktpUrl = '';
      if (ktpFile) {
        const storageRef = ref(storage, `ktp_registrants/${Date.now()}_${ktpFile.name}`);
        const uploadResult = await uploadBytes(storageRef, ktpFile);
        ktpUrl = await getDownloadURL(uploadResult.ref);
      }

      const newPerson = {
        ...formData,
        ktpUrl,
        projectId,
        attendanceStatus: 'registered',
        createdAt: new Date().toISOString()
      };

      const personRef = await addDoc(collection(db, 'persons'), newPerson);

      // Generate QR code and upload to Storage
      let qrCodeUrl = '';
      try {
        const qrDataUrl = await QRCode.toDataURL(personRef.id, { width: 300, margin: 2 });
        const qrRes = await fetch(qrDataUrl);
        const qrBlob = await qrRes.blob();
        const qrRef = ref(storage, `qrcodes/${personRef.id}.png`);
        const qrUpload = await uploadBytes(qrRef, qrBlob);
        qrCodeUrl = await getDownloadURL(qrUpload.ref);
        await updateDoc(personRef, { qrCodeUrl });
      } catch (qrErr) {
        console.error('Error generating QR code:', qrErr);
      }

      await logConsent({
        formType: 'public_registration',
        userName: formData.fullName,
        userEmail: formData.email,
        projectId,
      });

      // Trigger confirmation email with QR code
      if (formData.email) {
        try {
          const qrSection = qrCodeUrl
            ? `<div style="text-align:center;margin:24px 0;">
                <p style="font-weight:600;margin-bottom:8px;">QR Code Kehadiran Anda:</p>
                <img src="${qrCodeUrl}" alt="QR Code" style="width:180px;height:180px;border:1px solid #e2e8f0;border-radius:8px;" />
                <p style="font-size:12px;color:#64748b;margin-top:8px;">Tunjukkan QR code ini saat check-in di lokasi acara.</p>
              </div>`
            : '';

          const mailPayload: Record<string, unknown> = {
            to: formData.email,
            message: {
              subject: `Pendaftaran Berhasil: ${project.name}`,
              html: `
                <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:8px;">
                  <h1 style="color:#4f46e5;margin-bottom:24px;">Konfirmasi Pendaftaran</h1>
                  <p>Halo <strong>${formData.fullName}</strong>,</p>
                  <p>Terima kasih telah mendaftar untuk acara <strong>${project.name}</strong>.</p>
                  <div style="background-color:#f8fafc;padding:16px;border-radius:8px;margin:24px 0;">
                    <h3 style="margin-top:0;">Detail Acara:</h3>
                    <p style="margin-bottom:8px;"><strong>📅 Tanggal:</strong> ${project.startDate} – ${project.endDate}</p>
                    <p style="margin-bottom:8px;"><strong>📍 Lokasi:</strong> ${project.venue}, ${project.kabupaten}</p>
                  </div>
                  ${qrSection}
                  <p>Silakan simpan email ini sebagai bukti pendaftaran Anda.</p>
                  <p style="margin-top:32px;font-size:14px;color:#64748b;">Sampai jumpa di lokasi!</p>
                  <hr style="border:0;border-top:1px solid #e2e8f0;margin:32px 0;">
                  <p style="font-size:12px;color:#94a3b8;text-align:center;">Email ini dikirim otomatis oleh Event Management System.</p>
                </div>
              `,
              ...(qrCodeUrl ? { attachments: [{ filename: 'qr-code-hadir.png', path: qrCodeUrl }] } : {}),
            }
          };

          await addDoc(collection(db, 'mail'), mailPayload);
        } catch (mailErr) {
          console.error('Error triggering confirmation email:', mailErr);
        }
      }

      setSuccess(true);
    } catch (err) {
      console.error("Error submitting registration:", err);
      setError('Gagal mengirim pendaftaran. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedKabupatenData = locations.find(loc => loc.kabupaten === formData.kabupaten);
  const kecamatanOptions = selectedKabupatenData 
    ? selectedKabupatenData.kecamatan.map(kec => ({ value: kec.name, label: kec.name })) 
    : [];

  const selectedKecamatanData = selectedKabupatenData?.kecamatan.find(kec => kec.name === formData.kecamatan);
  const desaOptions = selectedKecamatanData 
    ? selectedKecamatanData.desa.map(d => ({ value: d, label: d })) 
    : [];

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
            <User className="w-8 h-8" />
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
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Pendaftaran Berhasil!</h2>
          <p className="text-slate-600 mb-6">
            Terima kasih telah mendaftar untuk <strong>{project?.name}</strong>. Status kehadiran Anda sekarang telah terdaftar.
          </p>
          <button
            onClick={() => setSuccess(false)}
            className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Daftarkan Peserta Lain
          </button>
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
              <img src="/logo-white.png" alt="Company Logo" className="h-16 w-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">Pendaftaran Acara</h1>
              <h2 className="text-lg opacity-90">{project?.name}</h2>
              
              <div className="mt-4 space-y-2 text-sm opacity-80">
                <div className="flex items-center">
                  <Calendar className="w-4 h-4 mr-2" />
                  {project?.startDate} sampai {project?.endDate}
                </div>
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-2" />
                  {project?.venue}, {project?.kabupaten}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <KTPScanButton
                accentColor="indigo"
                onExtracted={({ nik, fullName }) =>
                  setFormData(prev => ({ ...prev, nik, fullName }))
                }
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  NIK <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="nik"
                  required
                  inputMode="numeric"
                  maxLength={16}
                  minLength={16}
                  value={formData.nik}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="16 digit nomor KTP"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nama Lengkap <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="fullName"
                  required
                  value={formData.fullName}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Nama Lengkap"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  No HP <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="mobilePhone"
                  required
                  inputMode="numeric"
                  value={formData.mobilePhone}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Contoh: 08123456789"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Alamat Email (Opsional)"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Kabupaten
                  </label>
                  <input
                    type="text"
                    name="kabupaten"
                    value={formData.kabupaten}
                    disabled
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed"
                    placeholder="Kabupaten"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Kecamatan <span className="text-red-500">*</span>
                  </label>
                  <Select
                    options={kecamatanOptions}
                    value={kecamatanOptions.find(opt => opt.value === formData.kecamatan) || null}
                    onChange={(selected) => setFormData({ ...formData, kecamatan: selected?.value || '', desa: '' })}
                    placeholder="Pilih Kecamatan"
                    isClearable
                    menuPlacement="auto"
                    menuPosition="fixed"
                    className="react-select-container"
                    classNamePrefix="react-select"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Desa <span className="text-red-500">*</span>
                </label>
                <Select
                  options={desaOptions}
                  value={desaOptions.find(opt => opt.value === formData.desa) || null}
                  onChange={(selected) => setFormData({ ...formData, desa: selected?.value || '' })}
                  placeholder="Pilih Desa"
                  isClearable
                  isDisabled={!formData.kecamatan}
                  menuPlacement="auto"
                  menuPosition="fixed"
                  className="react-select-container"
                  classNamePrefix="react-select"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Posisi <span className="text-red-500">*</span>
                </label>
                <Select
                  options={[
                    { value: 'Ketua Koperasi', label: 'Ketua Koperasi' },
                    { value: 'Bendahara Koperasi', label: 'Bendahara Koperasi' },
                    { value: 'Pengawas Koperasi', label: 'Pengawas Koperasi' },
                    { value: 'Lainnya', label: 'Lainnya' }
                  ]}
                  value={formData.posisi ? { value: formData.posisi, label: formData.posisi } : null}
                  onChange={(selected) => setFormData({ ...formData, posisi: selected?.value || '', posisiLainnya: '' })}
                  placeholder="Pilih Posisi"
                  isClearable
                  menuPlacement="auto"
                  menuPosition="fixed"
                  className="react-select-container"
                  classNamePrefix="react-select"
                />
              </div>

              {formData.posisi === 'Lainnya' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Posisi Lainnya <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="posisiLainnya"
                    required
                    value={formData.posisiLainnya}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Sebutkan posisi Anda"
                  />
                </div>
              )}

              {/* Foto KTP */}
              <div className="pt-4 border-t border-slate-100">
                <label className="block text-sm font-medium text-slate-700 mb-1 text-center sm:text-left">
                  Foto / Scan KTP <span className="text-red-500">*</span>
                </label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-xl hover:border-indigo-400 transition-colors group cursor-pointer relative">
                  <div className="space-y-1 text-center">
                    <FileText className="mx-auto h-10 w-10 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                    <div className="flex text-sm text-slate-600 justify-center">
                      <label className="relative cursor-pointer rounded-md font-medium text-indigo-600 hover:text-indigo-500">
                        <span>{ktpFile ? ktpFile.name : 'Pilih file KTP'}</span>
                        <input 
                          type="file" 
                          className="sr-only" 
                          accept="image/*,application/pdf"
                          capture="environment"
                          required
                          onChange={(e) => setKtpFile(e.target.files?.[0] || null)} 
                        />
                      </label>
                    </div>
                    <p className="text-xs text-slate-500">PNG, JPG, atau PDF, maks. 5MB</p>
                  </div>
                </div>
              </div>

              <ConsentCheckbox checked={consentGiven} onChange={setConsentGiven} />
              <RecaptchaWidget onChange={setRecaptchaToken} />

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting || !consentGiven || (RECAPTCHA_ENABLED && !recaptchaToken)}
                  className="w-full px-4 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center justify-center"
                >
                  {submitting ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Mengirim...</>
                  ) : 'Daftar Sekarang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
