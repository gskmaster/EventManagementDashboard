import React, { useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions, getFunctionUrl } from '../firebase';
import { Camera, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface KTPExtractResult {
  nik: string;
  fullName: string;
}

interface Props {
  onExtracted: (result: KTPExtractResult) => void;
  accentColor?: 'teal' | 'violet' | 'indigo';
}

const colorMap = {
  teal:   { btn: 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100', spinner: 'text-teal-600' },
  violet: { btn: 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100', spinner: 'text-violet-600' },
  indigo: { btn: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100', spinner: 'text-indigo-600' },
};

export default function KTPScanButton({ onExtracted, accentColor = 'indigo' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const colors = colorMap[accentColor];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('loading');
    setErrorMsg('');

    try {
      // Convert image to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Strip data URL prefix (e.g. "data:image/jpeg;base64,")
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Use fetch for onRequest function (fixes CORS preflight issues)
      const url = getFunctionUrl('extractKTPData');
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 }),
      });

      if (!response.ok) {
        throw new Error(`KTP OCR failed with status ${response.status}`);
      }

      const result = await response.json();
      const { nik, fullName } = result.data;

      if (!nik && !fullName) {
        setStatus('error');
        setErrorMsg('Tidak dapat membaca KTP. Pastikan foto jelas dan coba lagi, atau isi manual.');
        return;
      }

      onExtracted({ nik, fullName });
      setStatus('success');
    } catch (err) {
      console.error('KTP OCR error:', err);
      setStatus('error');
      setErrorMsg('Gagal memproses KTP. Silakan isi manual.');
    } finally {
      // Reset input so same file can be re-selected if needed
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="mb-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handleFileChange}
      />

      <button
        type="button"
        disabled={status === 'loading'}
        onClick={() => { setStatus('idle'); inputRef.current?.click(); }}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 border rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${colors.btn}`}
      >
        {status === 'loading' ? (
          <><Loader2 className={`w-4 h-4 animate-spin ${colors.spinner}`} /> Membaca KTP...</>
        ) : (
          <><Camera className="w-4 h-4" /> Scan KTP untuk isi otomatis</>
        )}
      </button>

      {status === 'success' && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Data terdeteksi. Periksa kembali sebelum submit.
        </div>
      )}

      {status === 'error' && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {errorMsg}
        </div>
      )}
    </div>
  );
}
