import React, { useRef, useState, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, getFunctionUrl } from '../firebase';
import { Camera, Loader2, CheckCircle2, AlertCircle, X, Flashlight, RefreshCcw, Upload, FileImage } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface KTPExtractResult {
  nik: string;
  fullName: string;
  ktpUrl: string;
}

interface Props {
  onExtracted: (result: KTPExtractResult) => void;
  accentColor?: 'teal' | 'violet' | 'indigo';
}

const colorMap = {
  teal:   { btn: 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100', spinner: 'text-teal-600', primary: 'bg-teal-600' },
  violet: { btn: 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100', spinner: 'text-violet-600', primary: 'bg-violet-600' },
  indigo: { btn: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100', spinner: 'text-indigo-600', primary: 'bg-indigo-600' },
};

export default function KTPScanButton({ onExtracted, accentColor = 'indigo' }: Props) {
  const [showScanner, setShowScanner] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'processing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const colors = colorMap[accentColor];

  // Camera handling
  useEffect(() => {
    if (showScanner) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [showScanner]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setErrorMsg('Gagal mengakses kamera. Pastikan izin kamera diberikan.');
      setShowScanner(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const processImage = async (blob: Blob, base64: string) => {
    setStatus('processing');
    
    try {
      // 1. Upload to Firebase Storage
      const storagePath = `ktp_scans/${Date.now()}_ktp.jpg`;
      const storageRef = ref(storage, storagePath);
      const uploadResult = await uploadBytes(storageRef, blob);
      const ktpUrl = await getDownloadURL(uploadResult.ref);

      // 2. Run OCR via Cloud Function
      const url = getFunctionUrl('extractKTPDataV3'); // Use V3 as confirmed
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 }),
      });

      if (!response.ok) {
        throw new Error(`KTP OCR failed with status ${response.status}`);
      }

      const result = await response.json();
      console.log('OCR Raw Response:', result);

      if (result.data) {
        console.log('OCR Extracted Data:', result.data);
        const { nik, fullName } = result.data;
        
        if (!nik && !fullName) {
          setStatus('error');
          setErrorMsg('Data tidak terbaca. Pastikan foto KTP jelas.');
          return;
        }

        setPreviewUrl(ktpUrl);
        onExtracted({ nik, fullName, ktpUrl });
        setStatus('success');
      } else {
        throw new Error('Gagal mengekstrak data dari KTP');
      }
    } catch (err) {
      console.error('Processing error:', err);
      setStatus('error');
      setErrorMsg('Gagal memproses KTP. Silakan coba lagi atau isi manual.');
    }
  };

  const captureAndProcess = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setStatus('loading');
    
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.8));
      
      stopCamera();
      setShowScanner(false);
      
      await processImage(blob, base64);
    } catch (err) {
      console.error('Capture error:', err);
      setStatus('error');
      setErrorMsg('Gagal mengambil gambar.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('loading');
    try {
      // Create preview & convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const res = reader.result as string;
          resolve(res.split(',')[1]);
        };
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;
      
      await processImage(file, base64);
    } catch (err) {
      console.error('File upload error:', err);
      setStatus('error');
      setErrorMsg('Gagal mengunggah file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="mb-6">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept="image/*" 
        className="hidden" 
      />

      {/* Main Container */}
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
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 border-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50 rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50`}
            >
              <Upload className="w-5 h-5 shrink-0" /> 
              Unggah File KTP
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
                <span className="text-sm font-bold animate-pulse">Sedang Memproses KTP...</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="relative w-16 h-10 bg-slate-200 rounded overflow-hidden flex-shrink-0 border border-slate-300">
            <img src={previewUrl} alt="KTP Preview" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-bold text-slate-800 truncate">KTP Berhasil Diterima</p>
            <p className="text-[10px] text-slate-500 truncate">Data otomatis terisi</p>
          </div>
          <button 
            type="button" 
            onClick={() => { setPreviewUrl(null); setStatus('idle'); }}
            className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Feedback Messages */}
      <AnimatePresence>
        {status === 'success' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }}
            className="mt-3 flex items-center gap-2 text-xs text-green-700 font-bold bg-green-50 p-2 rounded-lg border border-green-100"
          >
            <CheckCircle2 className="w-4 h-4" />
            Data berhasil diekstrak! Silakan periksa kolom di bawah.
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
            {/* Header */}
            <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/60 to-transparent">
              <button 
                onClick={() => setShowScanner(false)}
                className="p-2 bg-white/10 backdrop-blur-md rounded-full text-white"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="text-white text-center">
                <p className="text-sm font-bold uppercase tracking-wider">Scan KTP</p>
              </div>
              <div className="w-10" /> {/* Spacer */}
            </div>

            {/* Video Feed & Overlay */}
            <div className="relative w-full h-full max-w-2xl bg-slate-900 overflow-hidden flex items-center justify-center sm:rounded-2xl">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover"
              />

              {/* Guide Frame Overlay - Robust implementation for mobile */}
              <div className="absolute inset-0 pointer-events-none flex flex-col z-10">
                {/* Top dark block */}
                <div className="flex-1 bg-black/60" />
                
                <div className="flex flex-row h-auto aspect-[1.58/1] w-full max-w-md mx-auto relative px-6">
                  {/* Left dark block */}
                  <div className="absolute left-0 top-0 bottom-0 w-6 sm:w-8 bg-black/60" />
                  
                  {/* Clear Hole with Frame */}
                  <div className="flex-1 relative border-2 border-white/60 rounded-2xl">
                    {/* Corner Accents */}
                    <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl" />
                    <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl" />
                    <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl" />
                    <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl" />
                    
                    {/* Scan Line Animation */}
                    <motion.div 
                      animate={{ top: ['10%', '90%'] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                      className="absolute inset-x-4 h-0.5 bg-white/50 blur-[2px]"
                    />
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60 text-center gap-2">
                      <p className="text-xs font-bold uppercase tracking-widest bg-black/30 px-3 py-1 rounded-full backdrop-blur-sm">
                        Posisikan KTP di sini
                      </p>
                    </div>
                  </div>

                  {/* Right dark block */}
                  <div className="absolute right-0 top-0 bottom-0 w-6 sm:w-8 bg-black/60" />
                </div>
                
                {/* Bottom dark block */}
                <div className="flex-1 bg-black/60" />
              </div>

              {/* Loading Overlay */}
              <AnimatePresence>
                {status === 'loading' && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-white z-20"
                  >
                    <Loader2 className="w-12 h-12 animate-spin mb-4 text-white" />
                    <p className="text-lg font-bold">Memproses KTP...</p>
                    <p className="text-sm opacity-60">Mohon tunggu sebentar</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer Controls */}
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
