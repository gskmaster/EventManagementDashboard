import React from 'react';
import { useNavigate, useRouteError } from 'react-router-dom';
import { ShieldAlert, RefreshCcw } from 'lucide-react';

interface ErrorPageProps {
  error?: Error;
}

export default function ErrorPage({ error }: ErrorPageProps) {
  const navigate = useNavigate();
  // If we're using a data router, useRouteError might be populated
  const routeError = useRouteError() as Error | undefined;
  
  const displayError = error || routeError;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <ShieldAlert className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Terjadi Kesalahan</h2>
        <p className="text-center text-slate-500 mb-6 max-w-sm">
          Terjadi kesalahan tak terduga. Silakan coba lagi atau hubungi dukungan jika masalah berlanjut.
        </p>
        
        {displayError && (
          <div className="bg-red-50 p-4 rounded-lg w-full mb-6 overflow-auto border border-red-100">
            <p className="text-sm font-mono text-red-800 break-words whitespace-pre-wrap">
              {displayError.message || String(displayError)}
            </p>
          </div>
        )}

        <div className="flex space-x-4 w-full justify-center">
          <button
            onClick={() => window.location.reload()}
            className="flex flex-1 items-center justify-center px-4 py-2 border border-slate-300 rounded-lg shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors cursor-pointer"
          >
            <RefreshCcw className="w-4 h-4 mr-2" />
            Muat Ulang
          </button>
          
          <button
            onClick={() => navigate('/')}
            className="flex flex-1 items-center justify-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors cursor-pointer"
          >
            Ke Beranda
          </button>
        </div>
      </div>
    </div>
  );
}
