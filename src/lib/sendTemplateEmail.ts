import { doc, getDoc, addDoc, collection } from 'firebase/firestore';
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
}

function resolveTemplate(text: string, variables: TemplateVariables): string {
  return Object.entries(variables).reduce((s, [k, v]) => {
    return s.replaceAll(`{{${k}}}`, v ?? '');
  }, text);
}

export async function sendTemplateEmail({ templateId, to, variables, attachments = [] }: SendOptions) {
  const snap = await getDoc(doc(db, 'EmailTemplates', templateId));
  if (!snap.exists()) throw new Error(`Template ${templateId} tidak ditemukan.`);

  const template = snap.data();
  const subject = resolveTemplate(template.subject, variables);
  const html = resolveTemplate(template.body, variables);

  const message: Record<string, unknown> = { subject, html };
  if (attachments.length > 0) message.attachments = attachments;

  await addDoc(collection(db, 'mail'), { to, message });
}

/** Resolve template body/subject text without sending — for preview */
export async function resolveTemplateText(
  templateId: string,
  variables: TemplateVariables
): Promise<{ subject: string; html: string } | null> {
  const snap = await getDoc(doc(db, 'EmailTemplates', templateId));
  if (!snap.exists()) return null;
  const template = snap.data();
  return {
    subject: resolveTemplate(template.subject, variables),
    html: resolveTemplate(template.body, variables),
  };
}
