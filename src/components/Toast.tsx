import { CheckCircle, XCircle, X } from 'lucide-react';
import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}

export default function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center p-4 mb-4 text-slate-800 bg-white rounded-lg shadow-lg border border-slate-200 animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className={`inline-flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-lg ${type === 'success' ? 'text-emerald-500 bg-emerald-100' : 'text-red-500 bg-red-100'}`}>
        {type === 'success' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
      </div>
      <div className="ml-3 text-sm font-medium mr-8">{message}</div>
      <button
        type="button"
        onClick={onClose}
        className="ml-auto -mx-1.5 -my-1.5 bg-white text-slate-400 hover:text-slate-900 rounded-lg focus:ring-2 focus:ring-slate-300 p-1.5 hover:bg-slate-100 inline-flex h-8 w-8"
      >
        <span className="sr-only">Close</span>
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
