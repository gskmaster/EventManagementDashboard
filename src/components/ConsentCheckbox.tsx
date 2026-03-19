import React, { useState, useEffect } from 'react';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { PRIVACY_POLICY_TEXT, PRIVACY_POLICY_VERSION } from '../lib/consentLogger';
import { X, Shield, Loader2 } from 'lucide-react';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

interface ActivePolicy {
  version: string;
  content: string;
  title: string;
  effectiveDate: string;
}

export default function ConsentCheckbox({ checked, onChange }: Props) {
  const [policy, setPolicy] = useState<ActivePolicy | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Fetch the active T&C from Firestore, fall back to hardcoded text
  useEffect(() => {
    const fetch = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'terms_and_conditions'), where('isActive', '==', true), limit(1))
        );
        if (!snap.empty) {
          const d = snap.docs[0].data();
          setPolicy({
            version: d.version || PRIVACY_POLICY_VERSION,
            content: d.content || PRIVACY_POLICY_TEXT,
            title: d.title || 'Syarat dan Ketentuan',
            effectiveDate: d.effectiveDate || '',
          });
        }
      } catch {
        // leave policy null — renders fallback text
      } finally {
        setLoadingPolicy(false);
      }
    };
    fetch();
  }, []);

  const displayVersion = policy?.version ?? PRIVACY_POLICY_VERSION;

  return (
    <>
      <div className="pt-4 border-t border-slate-100">
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            required
            checked={checked}
            onChange={e => onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
          />
          <span className="text-sm text-slate-700 group-hover:text-slate-900 leading-relaxed">
            Saya telah membaca dan menyetujui{' '}
            {loadingPolicy ? (
              <span className="inline-flex items-center gap-1 text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                memuat...
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="font-semibold text-indigo-600 underline underline-offset-2 hover:text-indigo-800 transition-colors"
              >
                Syarat &amp; Ketentuan
              </button>
            )}{' '}
            serta memberikan persetujuan pemrosesan data pribadi saya sesuai UU PDP No. 27 Tahun 2022.{' '}
            <span className="text-red-500">*</span>
          </span>
        </label>
        {!loadingPolicy && (
          <p className="text-xs text-slate-400 mt-1.5 ml-7">
            Versi kebijakan: v{displayVersion}
          </p>
        )}
      </div>

      {/* ── T&C Modal ──────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[9999] bg-black/60 flex items-start justify-center overflow-y-auto p-4"
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {policy?.title ?? 'Syarat dan Ketentuan'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    v{displayVersion}
                    {policy?.effectiveDate && ` · Berlaku: ${policy.effectiveDate}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors ml-4 flex-shrink-0"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Content */}
            <div
              className="
                px-6 py-5 overflow-y-auto text-sm text-slate-700 leading-relaxed flex-1
                [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-4 [&_h2]:mb-2
                [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-800 [&_h3]:mt-3 [&_h3]:mb-1
                [&_p]:mb-2
                [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2
                [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2
                [&_li]:mb-0.5
                [&_strong]:font-semibold
              "
              dangerouslySetInnerHTML={{
                __html: policy?.content ?? `<p>${PRIVACY_POLICY_TEXT}</p>`,
              }}
            />

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-4 flex-shrink-0 bg-slate-50 rounded-b-2xl">
              <p className="text-xs text-slate-500">
                Dengan mencentang kotak persetujuan, Anda mengakui telah membaca dokumen ini.
              </p>
              <button
                onClick={() => {
                  onChange(true);
                  setModalOpen(false);
                }}
                className="flex-shrink-0 px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Saya Setuju
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
