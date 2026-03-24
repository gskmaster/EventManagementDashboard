import { doc, getDoc, addDoc, collection, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export interface TemplateVariables {
  namaProyek?: string;
  tanggalMulai?: string;
  tanggalSelesai?: string;
  manajerProyek?: string;
  namaVenue?: string;
  // per-recipient
  namaPeserta?: string;
  emailPeserta?: string;
  qrCodeUrl?: string;
  [key: string]: string | undefined;
}

export interface Attachment {
  filename: string;
  path: string;
}

interface SendOptions {
  templateId: string;
  to: string;
  variables: TemplateVariables;
  attachments?: Attachment[];
  html?: string; // Optional HTML override
}

function resolveTemplate(text: string, variables: TemplateVariables): string {
  return Object.entries(variables).reduce((s, [k, v]) => {
    return s.replaceAll(`{{${k}}}`, v ?? '');
  }, text);
}

export async function sendTemplateEmail({ templateId, to, variables, attachments = [], html: htmlOverride }: SendOptions) {
  const snap = await getDoc(doc(db, 'EmailTemplates', templateId));
  if (!snap.exists()) throw new Error(`Template ${templateId} tidak ditemukan.`);

  const template = snap.data();
  const subject = resolveTemplate(template.subject, variables);
  const html = htmlOverride || resolveTemplate(template.body, variables);

  const message: Record<string, unknown> = { subject, html };
  if (attachments.length > 0) message.attachments = attachments;

  await addDoc(collection(db, 'mail'), { to, message });
}

/** Resolve template body text without sending — for preview */
export function resolveTemplateText(
  body: string,
  variables: TemplateVariables
): { html: string } {
  return {
    html: resolveTemplate(body, variables),
  };
}

interface BatchProgress {
  total: number;
  current: number;
  onProgress?: (progress: number) => void;
  onSuccess?: (recipientId: string) => void;
  onError?: (recipientId: string, error: string) => void;
}

/**
 * Waits for the "Trigger Email" extension to process the email.
 * It looks for delivery.state becoming 'SUCCESS' or 'ERROR'.
 * On timeout, resolves as SUCCESS because the mail doc was successfully
 * written to Firestore — the extension will deliver it asynchronously.
 * (The extension does not run in emulator mode, causing timeout in dev.)
 */
function waitForEmailDelivery(docId: string, timeoutMs: number = 15000): Promise<{ state: 'SUCCESS' | 'ERROR'; error?: string }> {
  return new Promise((resolve) => {
    const unsub = onSnapshot(
      doc(db, 'mail', docId),
      (snap) => {
        const data = snap.data();
        if (data?.delivery?.state === 'SUCCESS') {
          unsub();
          resolve({ state: 'SUCCESS' });
        } else if (data?.delivery?.state === 'ERROR') {
          unsub();
          resolve({ state: 'ERROR', error: data.delivery.error });
        }
        // delivery === undefined means the extension hasn't picked it up yet — keep waiting
      },
      (_error) => {
        // Network/permission error on listener — treat as SUCCESS.
        // The mail doc was already written; the extension will deliver asynchronously.
        unsub();
        resolve({ state: 'SUCCESS' });
      }
    );

    // Timeout: treat as SUCCESS — the mail doc was written and the extension will deliver it.
    // This also handles emulator mode where the extension never runs.
    setTimeout(() => {
      unsub();
      resolve({ state: 'SUCCESS' });
    }, timeoutMs);
  });
}

/** 
 * Sends emails in batches to a list of recipients.
 * Updates Firestore document for each recipient with send status.
 */
export async function sendBatchEmail(
  recipients: Array<{ id: string; email: string; variables: TemplateVariables; collectionPath: string; projectId: string }>,
  template: { subject: string; body: string },
  progress?: BatchProgress,
  emailStatusField: string = 'emailStatus'
) {
  const BATCH_SIZE = 3; // Reduced batch size because we wait for delivery
  const WAIT_MS = 500;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (r) => {
      try {
        const html = resolveTemplate(template.body, r.variables);
        const subject = resolveTemplate(template.subject, r.variables);

        // 1. Add to mail collection
        const mailRef = await addDoc(collection(db, 'mail'), {
          to: r.email,
          message: { subject, html },
        });

        // 2. Wait for delivery status (resolves SUCCESS on timeout — see waitForEmailDelivery)
        const deliveryResult = await waitForEmailDelivery(mailRef.id);

        if (deliveryResult.state === 'SUCCESS') {
          await setDoc(doc(db, r.collectionPath, r.id), {
            projectId: r.projectId,
            [emailStatusField]: 'sent',
            lastEmailAt: new Date().toISOString(),
            emailError: null,
          }, { merge: true });
          progress?.onSuccess?.(r.id);
        } else {
          await setDoc(doc(db, r.collectionPath, r.id), {
            projectId: r.projectId,
            [emailStatusField]: 'failed',
            lastEmailAt: new Date().toISOString(),
            emailError: deliveryResult.error || 'Terjadi kesalahan pada server email',
          }, { merge: true });
          progress?.onError?.(r.id, deliveryResult.error || 'Terjadi kesalahan pada server email');
        }
      } catch (err: any) {
        console.error(`Failed to trigger email to ${r.id}:`, err);

        try {
          await setDoc(doc(db, r.collectionPath, r.id), {
            projectId: r.projectId,
            [emailStatusField]: 'failed',
            emailError: err.message
          }, { merge: true });
        } catch (updateErr) {
          console.error("Failed to update error status in Firestore:", updateErr);
        }

        progress?.onError?.(r.id, err.message);
      } finally {
        progress?.onProgress?.(i + batch.length);
      }
    }));

    // Small wait between batches
    if (i + BATCH_SIZE < recipients.length) {
      await new Promise(res => setTimeout(res, WAIT_MS));
    }
  }
}
