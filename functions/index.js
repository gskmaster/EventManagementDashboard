/**
 * Firebase Cloud Functions — UU PDP Audit Log (Server-Side)
 *
 * PURPOSE:
 *   The client-side consentLogger.ts cannot capture the user's real IP address.
 *   This Cloud Function acts as a trusted proxy: the public form POSTs consent
 *   data here, and the function appends the real IP (req.ip) before writing to
 *   Firestore. This makes the audit record legally stronger.
 *
 * DEPLOY:
 *   cd functions && npm install && firebase deploy --only functions
 *
 * USAGE (from public form, replace client-side logConsent call):
 *   await fetch('https://<region>-<project>.cloudfunctions.net/logUserConsent', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ formType, userName, userEmail, projectId, policyVersion, policySnapshot }),
 *   });
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const vision = require('@google-cloud/vision');

admin.initializeApp();
const db = admin.firestore();

// ─── Policy version — keep in sync with src/lib/consentLogger.ts ────────────
const POLICY_VERSION = '1.0';

/**
 * logUserConsent  — HTTPS callable (public, no auth required)
 *
 * Captures real IP address from the HTTP request and writes immutable records
 * to both `user_consents` and `audit_logs` Firestore collections.
 */
exports.logUserConsentV3 = functions.region('asia-southeast2').https.onRequest(async (req, res) => {
  // Allow CORS from any origin (public forms are on external domains)
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { formType, userName, userEmail, projectId, policySnapshot } = req.body;

  if (!formType || !policySnapshot) {
    res.status(400).json({ error: 'Missing required fields: formType, policySnapshot' });
    return;
  }

  // Capture IP — prefer X-Forwarded-For (set by Firebase Hosting CDN)
  const ipAddress =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.ip ||
    'unknown';

  const base = {
    form_type: formType,
    user_name: userName || '',
    user_email: userEmail || '',
    project_id: projectId || null,
    policy_version: POLICY_VERSION,
    policy_snapshot: policySnapshot,
    consent_given: true,
    user_agent: req.headers['user-agent'] || 'unknown',
    ip_address: ipAddress,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const batch = db.batch();

    const consentRef = db.collection('user_consents').doc();
    batch.set(consentRef, base);

    const auditRef = db.collection('audit_logs').doc();
    batch.set(auditRef, { action_type: 'consent_given', ...base });

    await batch.commit();

    res.status(201).json({ success: true, consentId: consentRef.id });
  } catch (err) {
    console.error('Failed to write consent log:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * verifyAuditIntegrity — Admin-only callable
 *
 * Returns the count and date range of audit_logs for a given project.
 * Used by the DPO during legal review to confirm no gaps in the log.
 *
 * Call via Firebase SDK:
 *   const fn = httpsCallable(functions, 'verifyAuditIntegrity');
 *   const result = await fn({ projectId: 'abc123' });
 */
exports.verifyAuditIntegrity = functions.https.onCall(async (data, context) => {
  // Only authenticated users with DPO or admin role may call this
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const role = userDoc.exists ? userDoc.data().role : null;

  if (role !== 'dpo' && role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Requires DPO or admin role.');
  }

  const { projectId } = data;
  let q = db.collection('audit_logs');
  if (projectId) q = q.where('project_id', '==', projectId);

  const snap = await q.orderBy('created_at', 'asc').get();

  const records = snap.docs.map(d => ({
    id: d.id,
    action_type: d.data().action_type,
    form_type: d.data().form_type,
    user_name: d.data().user_name,
    policy_version: d.data().policy_version,
    created_at: d.data().created_at?.toDate()?.toISOString() || null,
  }));

  return {
    total: records.length,
    earliest: records[0]?.created_at || null,
    latest: records[records.length - 1]?.created_at || null,
    records,
  };
});

/**
 * checkUniqueUser — HTTPS onRequest (public, no auth required)
 * 
 * Securely checks if an email or phone number already exists in
 * the specified collection without exposing the collection data.
 */
exports.checkUniqueUserV3 = functions.region('asia-southeast2').https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const data = req.body.data || req.body;
  const { collectionName, email, mobilePhone } = data;
  
  if (!collectionName || !['ushers', 'liaison_officers'].includes(collectionName)) {
    res.status(400).json({ error: 'Invalid collection name.' });
    return;
  }

  try {
    // Check email
    if (email && email.trim() !== '') {
      const emailSnap = await db.collection(collectionName).where('email', '==', email.trim()).limit(1).get();
      if (!emailSnap.empty) {
        res.status(200).json({ data: { isUnique: false, type: 'email' } });
        return;
      }
    }

    // Check phone
    if (mobilePhone && mobilePhone.trim() !== '') {
      const phoneSnap = await db.collection(collectionName).where('mobilePhone', '==', mobilePhone.trim()).limit(1).get();
      if (!phoneSnap.empty) {
        res.status(200).json({ data: { isUnique: false, type: 'phone' } });
        return;
      }
    }

    res.status(200).json({ data: { isUnique: true } });
  } catch (error) {
    console.error('checkUniqueUser error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * extractKTPData — HTTPS onRequest (public, no auth required)
 *
 * Receives a base64-encoded KTP image, runs Google Cloud Vision OCR,
 * and parses the Indonesian ID card fields: NIK (16 digits) and Nama.
 */
exports.extractKTPDataV3 = functions.region('asia-southeast2').https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const data = req.body.data || req.body;
  const { imageBase64 } = data;

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    res.status(400).json({ error: 'imageBase64 is required.' });
    return;
  }

  if (imageBase64.length > 7 * 1024 * 1024) {
    res.status(400).json({ error: 'Image too large. Max 5MB.' });
    return;
  }

  try {
    const client = new vision.ImageAnnotatorClient();
    const [result] = await client.documentTextDetection({
      image: { content: imageBase64 },
    });

    const fullText = result.fullTextAnnotation?.text || '';
    const nikMatch = fullText.match(/\b(\d{16})\b/);
    const nik = nikMatch ? nikMatch[1] : '';

    const lines = fullText.split('\n').map(l => l.trim());
    let fullName = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match "NAMA" followed by optional colon/space and then capture text
      const namaMatch = line.match(/[Nn][Aa][Mm][Aa]\s*[:\s]*\s*(.*)/);
      if (namaMatch) {
        let nameCandidate = namaMatch[1].trim();
        // If the line was just "NAMA" or "NAMA:", look at the next line
        if ((nameCandidate === '' || nameCandidate === ':') && i + 1 < lines.length) {
          nameCandidate = lines[i+1].trim();
        }
        // Clean up: remove "NIK", ":" or other typical OCR noise at start/end
        fullName = nameCandidate
          .replace(/^[:\s-]+/, '')
          .replace(/[^A-Za-z\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (fullName.length > 2) break;
      }
    }

    res.status(200).json({ data: { nik, fullName } });
  } catch (error) {
    console.error('extractKTPData error:', error);
    res.status(500).json({ error: error.message });
  }
});
