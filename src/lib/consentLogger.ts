import { collection, addDoc, getDocs, query, where, limit, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// ─── Hardcoded fallback (used when no active T&C exists in Firestore) ────────
export const PRIVACY_POLICY_VERSION = '1.0';

export const PRIVACY_POLICY_TEXT =
  'Dengan mengirimkan formulir ini, saya menyetujui pemrosesan data pribadi saya ' +
  '(nama lengkap, NIK, alamat email, nomor telepon, dan informasi rekening bank) ' +
  'oleh penyelenggara kegiatan untuk keperluan administrasi acara, pembayaran honorarium, ' +
  'dan pelaporan pajak sesuai peraturan yang berlaku. ' +
  'Pemrosesan data ini dilakukan berdasarkan Undang-Undang Perlindungan Data Pribadi (UU PDP) ' +
  'No. 27 Tahun 2022 dan peraturan pelaksanaannya. ' +
  'Data Anda disimpan dengan aman, tidak akan dijual, dan tidak akan dibagikan kepada ' +
  'pihak ketiga tanpa persetujuan Anda, kecuali diwajibkan oleh hukum. ' +
  'Anda berhak mengakses, memperbaiki, atau meminta penghapusan data Anda kapan saja.';

export type FormType =
  | 'public_registration'
  | 'speaker_registration'
  | 'usher_registration'
  | 'lo_registration'
  | 'payment_registration';

interface ConsentPayload {
  formType: FormType;
  userName: string;
  userEmail: string;
  projectId?: string | null;
}

// Set VITE_CONSENT_FUNCTION_URL in .env for production to capture real IP via Cloud Function.
// Leave empty for local development — falls back to direct Firestore write.
const FUNCTION_URL = import.meta.env.VITE_CONSENT_FUNCTION_URL as string | undefined;

/** Fetches the active T&C from Firestore. Returns hardcoded fallback on failure. */
async function fetchActivePolicy(): Promise<{ version: string; snapshot: string }> {
  try {
    const snap = await getDocs(
      query(collection(db, 'terms_and_conditions'), where('isActive', '==', true), limit(1))
    );
    if (!snap.empty) {
      const d = snap.docs[0].data();
      if (d.version && d.content) {
        return { version: d.version, snapshot: d.content };
      }
    }
  } catch {
    // fall through to hardcoded values
  }
  return { version: PRIVACY_POLICY_VERSION, snapshot: PRIVACY_POLICY_TEXT };
}

/**
 * Logs user consent with the currently active T&C snapshot.
 *
 * Production (VITE_CONSENT_FUNCTION_URL set):
 *   POSTs to the Cloud Function which captures the real IP from req.ip / X-Forwarded-For.
 *
 * Development / emulator (VITE_CONSENT_FUNCTION_URL not set):
 *   Falls back to direct Firestore write with ip_address = 'browser-submitted'.
 */
export async function logConsent({ formType, userName, userEmail, projectId }: ConsentPayload) {
  const { version: policyVersion, snapshot: policySnapshot } = await fetchActivePolicy();

  if (FUNCTION_URL) {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        formType,
        userName,
        userEmail,
        projectId: projectId ?? null,
        policyVersion,
        policySnapshot,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Consent function error ${res.status}: ${body}`);
    }
    return;
  }

  // ── Fallback: direct Firestore write (local dev / emulator) ──────────────
  const base = {
    form_type: formType,
    user_name: userName,
    user_email: userEmail,
    project_id: projectId ?? null,
    policy_version: policyVersion,
    policy_snapshot: policySnapshot,
    consent_given: true,
    user_agent: navigator.userAgent,
    ip_address: 'browser-submitted',
    created_at: serverTimestamp(),
  };

  await Promise.all([
    addDoc(collection(db, 'user_consents'), base),
    addDoc(collection(db, 'audit_logs'), { action_type: 'consent_given', ...base }),
  ]);
}
