import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Home } from 'lucide-react';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <h1 className="text-4xl font-extrabold text-slate-900 mb-2">404</h1>
        <h2 className="text-xl font-medium text-slate-700 mb-6">Halaman Tidak Ditemukan</h2>
        <p className="text-center text-slate-500 mb-8 max-w-sm">
          Maaf, halaman yang Anda cari tidak dapat ditemukan. Mungkin telah dipindahkan atau tidak ada.
        </p>
        <button
          onClick={() => navigate('/')}
          className="flex items-center justify-center px-6 py-3 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors cursor-pointer"
        >
          <Home className="w-5 h-5 mr-2" />
          Kembali ke Beranda
        </button>
      </div>
    </div>
  );
}
