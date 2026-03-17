import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Calendar, MapPin, User, CheckCircle2 } from 'lucide-react';
import Select from 'react-select';
import { locations } from '../data/locations';

export default function PublicRegistration() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    
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
    
    setSubmitting(true);
    setError('');

    try {
      const newPerson = {
        ...formData,
        projectId,
        attendanceStatus: 'registered',
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'persons'), newPerson);
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
                  name="nik"
                  required
                  value={formData.nik}
                  onChange={handleChange}
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
                  type="tel"
                  name="mobilePhone"
                  required
                  value={formData.mobilePhone}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Nomor Handphone"
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

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Mengirim...' : 'Daftar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
