import React from 'react';
import { X, ExternalLink, Receipt } from 'lucide-react';

interface PreviewModalProps {
  url: string | null;
  onClose: () => void;
  title?: string;
}

export default function PreviewModal({ url, onClose, title = 'Preview Dokumen' }: PreviewModalProps) {
  if (!url) return null;

  const isPdf = url.toLowerCase().split('?')[0].endsWith('.pdf') || 
                url.includes('application/pdf') || 
                url.toLowerCase().includes('pdf');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" 
        onClick={onClose} 
      />
      <div className="relative bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all transform scale-100">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-600" />
            {title}
          </h3>
          <div className="flex items-center gap-2">
            <a 
              href={url} 
              target="_blank" 
              rel="noreferrer" 
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-indigo-600" 
              title="Buka di tab baru"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-red-500"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-50 overflow-auto flex items-center justify-center p-4">
          {isPdf ? (
            <iframe 
              src={url} 
              className="w-full h-full rounded-lg border border-slate-200 bg-white" 
              title="PDF Preview" 
            />
          ) : (
            <img 
              src={url} 
              alt="Preview" 
              className="max-w-full max-h-full object-contain rounded-lg shadow-sm" 
              onError={(e) => {
                // Fallback to iframe if image fails (might be a PDF without clear extension)
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  const iframe = document.createElement('iframe');
                  iframe.src = url;
                  iframe.className = "w-full h-full rounded-lg border border-slate-200 bg-white";
                  parent.appendChild(iframe);
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
