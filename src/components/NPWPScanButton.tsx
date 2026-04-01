import React, { useRef, useState, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, getFunctionUrl } from '../firebase';
import { Camera, Loader2, CheckCircle2, AlertCircle, X, RefreshCcw, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface NPWPExtractResult {
  npwpUrl: string;
  npwpNumber: string;
}

interface Props {
  onExtracted: (result: NPWPExtractResult) => void;
  fileName?: string; // fullName from form, used for storage naming
  accentColor?: 'teal' | 'violet' | 'indigo';
}

const colorMap = {
  teal:   { btn: 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100', spinner: 'text-teal-600', primary: 'bg-teal-600' },
  violet: { btn: 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100', spinner: 'text-violet-600', primary: 'bg-violet-600' },
  indigo: { btn: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100', spinner: 'text-indigo-600', primary: 'bg-indigo-600' },
};

const sanitizeFileName = (name: string) =>
  name.trim().replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();

export default function NPWPScanButton({ onExtracted, fileName, accentColor = 'indigo' }: Props) {
  const [showScanner, setShowScanner] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'processing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIsImage, setPreviewIsImage] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const colors = colorMap[accentColor];

  useEffect(() => {
    if (showScanner) startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [showScanner]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setErrorMsg('Gagal mengakses kamera. Pastikan izin kamera diberikan.');
      setShowScanner(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  };

  const runOcr = async (npwpUrl: string): Promise<string> => {
    try {
      const url = getFunctionUrl('extractNpwpPublic');
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: npwpUrl }),
      });
      if (!response.ok) return '';
      const result = await response.json();
      return result.data?.npwpNumber || '';
    } catch {
      return '';
    }
  };

  const processFile = async (blob: Blob, isImage: boolean, ext: string) => {
    setStatus('processing');
    try {
      const safeName = fileName ? sanitizeFileName(fileName) : 'npwp';
      const storagePath = `npwp_scans/${safeName}-${Date.now()}.${ext}`;
      const storageRef = ref(storage, storagePath);
      const uploadResult = await uploadBytes(storageRef, blob);
      const npwpUrl = await getDownloadURL(uploadResult.ref);

      let npwpNumber = '';
      if (isImage) {
        npwpNumber = await runOcr(npwpUrl);
      }

      setPreviewUrl(npwpUrl);
      setPreviewIsImage(isImage);
      onExtracted({ npwpUrl, npwpNumber });
      setStatus('success');
    } catch (err) {
      console.error('NPWP upload error:', err);
      setStatus('error');
      setErrorMsg('Gagal mengunggah file. Silakan coba lagi.');
    }
  };

  const captureAndProcess = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setStatus('loading');
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.8));
      stopCamera();
      setShowScanner(false);
      await processFile(blob, true, 'jpg');
    } catch {
      setStatus('error');
      setErrorMsg('Gagal mengambil gambar.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('loading');
    const isPdf = file.type === 'application/pdf';
    const ext = isPdf ? 'pdf' : file.name.split('.').pop() || 'jpg';
    try {
      await processFile(file, !isPdf, ext);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReset = () => {
    setPreviewUrl(null);
    setStatus('idle');
    setErrorMsg('');
    onExtracted({ npwpUrl: '', npwpNumber: '' });
  };

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-slate-500 italic">Kosongkan jika tidak punya NPWP</p>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*,.pdf"
        className="hidden"
      />

      {!previewUrl ? (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              disabled={status === 'processing' || status === 'loading'}
              onClick={() => { setStatus('idle'); setShowScanner(true); }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 border-2 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${colors.btn} disabled:opacity-50`}
            >
              <Camera className="w-5 h-5 shrink-0" />
              Scan Kamera
            </button>
            <button
              type="button"
              disabled={status === 'processing' || status === 'loading'}
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 border-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50 rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <Upload className="w-5 h-5 shrink-0" />
              Unggah File NPWP
            </button>
          </div>

          <AnimatePresence>
            {(status === 'processing' || status === 'loading') && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center justify-center gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-700"
              >
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-bold animate-pulse">Sedang Memproses NPWP...</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="relative w-16 h-10 bg-slate-200 rounded overflow-hidden flex-shrink-0 border border-slate-300 flex items-center justify-center">
            {previewIsImage
              ? <img src={previewUrl} alt="NPWP Preview" className="w-full h-full object-cover" />
              : <span className="text-[10px] font-bold text-slate-500 uppercase">PDF</span>
            }
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-bold text-slate-800 truncate">File NPWP Diterima</p>
            <p className="text-[10px] text-slate-500 truncate">
              {status === 'success' ? 'OCR selesai' : 'Diproses...'}
            </p>
          </div>
          <button type="button" onClick={handleReset} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      )}

      <AnimatePresence>
        {status === 'success' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-3 flex items-center gap-2 text-xs text-green-700 font-bold bg-green-50 p-2 rounded-lg border border-green-100"
          >
            <CheckCircle2 className="w-4 h-4" />
            File NPWP berhasil diunggah! Nomor NPWP terisi otomatis jika terbaca.
          </motion.div>
        )}
        {status === 'error' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-3 flex items-start gap-2 text-xs text-red-600 font-bold bg-red-50 p-2 rounded-lg border border-red-100"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {errorMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scanner Modal */}
      <AnimatePresence>
        {showScanner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center sm:p-4"
          >
            <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/60 to-transparent">
              <button onClick={() => setShowScanner(false)} className="p-2 bg-white/10 backdrop-blur-md rounded-full text-white">
                <X className="w-6 h-6" />
              </button>
              <div className="text-white text-center">
                <p className="text-sm font-bold uppercase tracking-wider">Scan NPWP</p>
              </div>
              <div className="w-10" />
            </div>

            <div className="relative w-full h-full max-w-2xl bg-slate-900 overflow-hidden flex items-center justify-center sm:rounded-2xl">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="absolute inset-0 pointer-events-none flex flex-col z-10">
                <div className="flex-1 bg-black/60" />
                <div className="flex flex-row h-auto aspect-[1.58/1] w-full max-w-md mx-auto relative px-6">
                  <div className="absolute left-0 top-0 bottom-0 w-6 sm:w-8 bg-black/60" />
                  <div className="flex-1 relative border-2 border-white/60 rounded-2xl">
                    <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl" />
                    <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl" />
                    <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl" />
                    <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl" />
                    <motion.div
                      animate={{ top: ['10%', '90%'] }}
                      transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                      className="absolute inset-x-4 h-0.5 bg-white/50 blur-[2px]"
                    />
                    <div className="absolute inset-0 flex items-center justify-center text-white/60 text-center">
                      <p className="text-xs font-bold uppercase tracking-widest bg-black/30 px-3 py-1 rounded-full backdrop-blur-sm">
                        Posisikan NPWP di sini
                      </p>
                    </div>
                  </div>
                  <div className="absolute right-0 top-0 bottom-0 w-6 sm:w-8 bg-black/60" />
                </div>
                <div className="flex-1 bg-black/60" />
              </div>
            </div>

            <div className="p-8 w-full flex items-center justify-center bg-gradient-to-t from-black to-transparent">
              <button
                disabled={status === 'loading'}
                onClick={captureAndProcess}
                className="relative group p-1 border-4 border-white/30 rounded-full"
              >
                <div className="w-16 h-16 bg-white rounded-full group-active:scale-95 transition-transform" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
