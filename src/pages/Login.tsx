import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, addDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Lock, Mail, Clock } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const [lockoutUntil, setLockoutUntil] = useState<number | null>(() => {
    const saved = localStorage.getItem('login_lockout_until');
    if (saved && parseInt(saved) > Date.now()) return parseInt(saved);
    return null;
  });
  const [remainingTime, setRemainingTime] = useState(0);

  useEffect(() => {
    if (!lockoutUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutUntil(null);
        setRemainingTime(0);
        localStorage.removeItem('login_lockout_until');
        clearInterval(interval);
      } else {
        setRemainingTime(remaining);
      }
    }, 1000);
    setRemainingTime(Math.ceil((lockoutUntil - Date.now()) / 1000));
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const getIpAddress = async () => {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      return data.ip || 'unknown';
    } catch {
      return 'unknown';
    }
  };

  const handleFailedAttempt = async (errCode: string, errMsg: string) => {
    try {
      const ip = await getIpAddress();
      await addDoc(collection(db, 'login_attempts'), {
        email,
        ip,
        timestamp: new Date().toISOString(),
        success: false,
        error: errCode || errMsg,
      });
    } catch (logErr) {
      console.error('Failed to log attempt', logErr);
    }

    const attemptsKey = `login_attempts_${email.toLowerCase()}`;
    const attempts = parseInt(localStorage.getItem(attemptsKey) || '0') + 1;
    localStorage.setItem(attemptsKey, attempts.toString());

    if (attempts >= 5) {
      const unlockTime = Date.now() + 60000;
      setLockoutUntil(unlockTime);
      localStorage.setItem('login_lockout_until', unlockTime.toString());
      localStorage.removeItem(attemptsKey);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutUntil) return;
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      localStorage.removeItem(`login_attempts_${email.toLowerCase()}`);
      navigate('/');
    } catch (err: any) {
      console.error(err);
      await handleFailedAttempt(err.code, err.message);

      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('Email atau kata sandi tidak valid.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Akses akun ini telah dinonaktifkan sementara karena terlalu banyak percobaan gagal. Coba lagi nanti.');
      } else {
        setError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <img src="/favicon.png" alt="Eveniser" className="w-16 h-16 rounded-2xl shadow-lg" />
        </div>
        <h1 className="mt-5 text-center text-3xl font-extrabold text-slate-900">Eveniser</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Sistem Manajemen Acara</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-2xl sm:px-10 border border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">Masuk ke Akun Anda</h2>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Alamat Email</label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2.5 border"
                  placeholder="anda@contoh.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kata Sandi</label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2.5 border"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && !lockoutUntil && (
              <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-md">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {lockoutUntil && (
              <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded-md flex items-start gap-3">
                <Clock className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-orange-700">
                  Terlalu banyak percobaan gagal. Coba lagi dalam {remainingTime} detik.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !!lockoutUntil}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Mohon tunggu...' : 'Masuk'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Portal Usher & LO?{' '}
          <a href="/lo-login" className="text-indigo-600 hover:underline font-medium">
            Masuk di sini
          </a>
        </p>
      </div>
    </div>
  );
}
