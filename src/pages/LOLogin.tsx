import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Mail, Phone, Clock } from 'lucide-react';

// Error codes where we should fall through to account creation
const WRONG_CREDENTIAL_CODES = [
  'auth/invalid-credential', // Production Firebase SDK
  'auth/wrong-password',     // Firebase emulator (old code)
  'auth/user-not-found',     // Firebase emulator (old code)
];

export default function LOLogin() {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const [lockoutUntil, setLockoutUntil] = useState<number | null>(() => {
    const saved = localStorage.getItem('lo_login_lockout_until');
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
        localStorage.removeItem('lo_login_lockout_until');
        clearInterval(interval);
      } else {
        setRemainingTime(remaining);
      }
    }, 1000);
    setRemainingTime(Math.ceil((lockoutUntil - Date.now()) / 1000));
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const recordFailedAttempt = () => {
    const attemptsKey = `lo_login_attempts_${email.toLowerCase()}`;
    const attempts = parseInt(localStorage.getItem(attemptsKey) || '0') + 1;
    localStorage.setItem(attemptsKey, attempts.toString());
    if (attempts >= 5) {
      const unlockTime = Date.now() + 60000;
      setLockoutUntil(unlockTime);
      localStorage.setItem('lo_login_lockout_until', unlockTime.toString());
      localStorage.removeItem(attemptsKey);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutUntil) return;
    setError('');
    setLoading(true);

    try {
      let currentUser;
      let isNewAccount = false;

      // ── Step 1: Try sign in (returning user) ──
      try {
        const cred = await signInWithEmailAndPassword(auth, email, phone);
        currentUser = cred.user;
      } catch (signInErr: any) {
        if (!WRONG_CREDENTIAL_CODES.includes(signInErr.code)) {
          throw signInErr; // unexpected error — re-throw
        }

        // ── Step 2: First-time login — create Firebase Auth account ──
        try {
          const cred = await createUserWithEmailAndPassword(auth, email, phone);
          currentUser = cred.user;
          isNewAccount = true;
        } catch (createErr: any) {
          if (createErr.code === 'auth/email-already-in-use') {
            // Account exists but phone is wrong
            setError('Nomor telepon salah. Pastikan nomor telepon sesuai dengan yang didaftarkan.');
            recordFailedAttempt();
            return;
          }
          throw createErr;
        }
      }

      // ── Step 3: Ensure users/{uid} doc exists with role='lo' BEFORE any
      //    Firestore queries — isLO() in security rules requires this doc. ──
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (!userDocSnap.exists()) {
        await setDoc(userDocRef, {
          uid: currentUser.uid,
          email: currentUser.email,
          role: 'lo',
          displayName: email, // temporary; updated below after lo lookup
          createdAt: new Date().toISOString(),
        });
      }

      // ── Step 4: Verify email is registered as LO or Usher ──
      // users doc now exists so isLO() / isUsher() rules work for subsequent queries.
      const emailLower = email.toLowerCase();

      const loSnap = await getDocs(
        query(collection(db, 'liaison_officers'), where('email', '==', emailLower))
      );
      const usherSnap = loSnap.empty
        ? await getDocs(query(collection(db, 'ushers'), where('email', '==', emailLower)))
        : null;

      const isRegisteredLO = !loSnap.empty;
      const isRegisteredUsher = !isRegisteredLO && usherSnap != null && !usherSnap.empty;

      if (!isRegisteredLO && !isRegisteredUsher) {
        if (isNewAccount) await signOut(auth);
        setError('Email tidak terdaftar sebagai LO atau Usher. Hubungi admin.');
        recordFailedAttempt();
        return;
      }

      const staffData = isRegisteredLO
        ? loSnap.docs[0].data()
        : usherSnap!.docs[0].data();
      const staffRole: 'lo' | 'usher' = isRegisteredLO ? 'lo' : 'usher';

      // ── Step 5: Finalize users doc with correct role and displayName ──
      if (!userDocSnap.exists()) {
        // Update the temporary doc we created in Step 3
        await updateDoc(userDocRef, {
          role: staffRole,
          displayName: staffData.fullName || email,
        });
      } else if (userDocSnap.data()?.role !== staffRole) {
        // Correct role if it was set wrong on a prior attempt
        await updateDoc(userDocRef, { role: staffRole });
      }

      localStorage.removeItem(`lo_login_attempts_${email.toLowerCase()}`);
      navigate('/lo-dashboard');
    } catch (err: any) {
      console.error(err);
      recordFailedAttempt();

      if (err.code === 'auth/too-many-requests') {
        setError('Terlalu banyak percobaan login. Coba lagi nanti.');
      } else if (err.code === 'auth/weak-password') {
        setError('Nomor telepon terlalu pendek (minimal 6 karakter).');
      } else if (err.code === 'auth/invalid-email') {
        setError('Format email tidak valid.');
      } else {
        setError('Terjadi kesalahan. Silakan coba lagi.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src="/favicon.png" alt="Eveniser" className="w-16 h-16 rounded-2xl shadow-xl" />
        </div>
        <h1 className="text-center text-2xl font-bold text-white mb-1">Eveniser</h1>
        <p className="text-center text-blue-200 text-sm mb-8">Portal Usher & Liaison Officer</p>

        <div className="bg-white rounded-2xl shadow-xl px-6 py-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">Masuk ke Akun Usher / LO</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="email@example.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nomor Telepon
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="08xxxxxxxxxx"
                  autoComplete="tel"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Gunakan nomor yang sama saat registrasi LO / Usher
              </p>
            </div>

            {error && !lockoutUntil && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {lockoutUntil && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-start gap-2">
                <Clock className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-orange-700">
                  Terlalu banyak percobaan. Coba lagi dalam {remainingTime} detik.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !!lockoutUntil}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors"
            >
              {loading ? 'Mohon tunggu...' : 'Masuk'}
            </button>
          </form>
        </div>

        <p className="text-center text-blue-200 text-xs mt-6">
          Belum terdaftar?{' '}
          <a href="/register-lo" className="text-white underline font-medium">
            Daftar di sini
          </a>
        </p>
      </div>
    </div>
  );
}
