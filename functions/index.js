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
const visionClient = new vision.ImageAnnotatorClient();

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
    const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    console.log('OCR Raw Lines:', JSON.stringify(lines));

    // 1. Find NIK (16 digits)
    const nikMatch = fullText.match(/\b(\d{16})\b/);
    const nik = nikMatch ? nikMatch[1] : '';

    // KTP field label patterns — lines matching these are labels, not values
    const labelPatterns = [
      /^NIK$/, /^NAMA$/, /TEMPAT/, /TGL LAHIR/, /JENIS KELAMIN/, /^ALAMAT$/,
      /^RT[\s\/]RW$/, /KEL[\s\/]DESA/, /KECAMATAN/, /^AGAMA$/, /STATUS PERKAWINAN/,
      /^PEKERJAAN$/, /KEWARGANEGARAAN/, /BERLAKU HINGGA/, /GOL\.?\s*DARAH/,
      /PROVINSI/, /KABUPATEN/, /KARTU TANDA PENDUDUK/, /REPUBLIK INDONESIA/,
    ];

    // Lines that cannot be a person's name
    const isSkippable = (line) => {
      const up = line.toUpperCase().trim();
      if (up.length < 3) return true;
      if (/^\d/.test(up)) return true;                          // starts with digit (NIK / date)
      if (/^[:\-]/.test(up)) return true;                      // starts with colon or dash (value prefix)
      if (/\d{2}[-\/]\d{2}[-\/]\d{4}/.test(up)) return true;  // contains date pattern
      if (nik && up.includes(nik)) return true;                 // is the NIK line
      if (labelPatterns.some(lp => lp.test(up))) return true;  // is a label
      return false;
    };

    let fullName = '';

    // ── Strategy 1: Birth-date anchor ────────────────────────────────────────
    // Indonesian KTP always has "Tempat/Tgl Lahir: CITY, DD-MM-YYYY"
    // OCR splits this so the name appears on the line immediately before
    // the "CITY, DD-MM-YYYY" birth-date value line.
    const birthDateIdx = lines.findIndex(l =>
      /[A-Z\s]+,\s*\d{2}-\d{2}-\d{4}/i.test(l)
    );
    if (birthDateIdx > 0) {
      for (let k = birthDateIdx - 1; k >= 0; k--) {
        const candidate = lines[k].toUpperCase().trim().replace(/[^A-Z\s]/g, '').trim();
        if (candidate.length >= 3 && !isSkippable(lines[k])) {
          fullName = candidate;
          break;
        }
      }
    }

    // ── Strategy 2: "Nama" label lookahead ───────────────────────────────────
    // Find the "Nama" label (anywhere in rawLines) and look up to 10 lines ahead
    // for the first non-label, non-location candidate.
    if (!fullName) {
      const namaIdx = lines.findIndex(l => /^NAMA$/i.test(l.trim()) || /^NAMA\s*:/i.test(l.trim()));
      if (namaIdx !== -1) {
        // Check same line first (e.g. "Nama : DANIEL ANDREW")
        const afterColon = lines[namaIdx].split(':').pop().trim();
        const inlineCandidate = afterColon.toUpperCase().replace(/[^A-Z\s]/g, '').trim();
        if (inlineCandidate.length >= 3 && !isSkippable(inlineCandidate)) {
          fullName = inlineCandidate;
        } else {
          // Look at subsequent lines
          for (let j = 1; j <= 10 && namaIdx + j < lines.length; j++) {
            const next = lines[namaIdx + j];
            if (!isSkippable(next)) {
              fullName = next.toUpperCase().replace(/[^A-Z\s]/g, '').trim();
              if (fullName.length >= 3) break;
              fullName = '';
            }
          }
        }
      }
    }

    // ── Strategy 3: Fallback after NIK line ──────────────────────────────────
    // Scan every line after the NIK value line; pick first plausible name.
    if (!fullName && nik) {
      const nikLineIndex = lines.findIndex(l => l.includes(nik));
      if (nikLineIndex !== -1) {
        for (let i = nikLineIndex + 1; i < lines.length; i++) {
          if (!isSkippable(lines[i])) {
            const candidate = lines[i].toUpperCase().replace(/[^A-Z\s]/g, '').trim();
            if (candidate.length >= 3) {
              fullName = candidate;
              break;
            }
          }
        }
      }
    }

    console.log('Extracted V3 - NIK:', nik, 'Nama:', fullName);
    res.status(200).json({ data: { nik, fullName, rawLines: lines } });
  } catch (error) {
    console.error('extractKTPData error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * extractNpwp — HTTPS callable (authenticated admin/finance)
 *
 * Uses Google Cloud Vision to OCR an NPWP file and extract the 15-digit
 * Indonesian NPWP number (format: XX.XXX.XXX.X-XXX.XXX).
 * Saves the extracted number back into the project's payments JSON blob.
 */
exports.extractNpwp = functions.region('asia-southeast2').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const { imageUrl, projectId, institutionId } = data;
  if (!imageUrl || !projectId || !institutionId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: imageUrl, projectId, institutionId.');
  }

  try {
    // Run OCR via Vision API
    const [result] = await visionClient.textDetection({ image: { source: { imageUri: imageUrl } } });
    const rawText = result.fullTextAnnotation?.text || result.textAnnotations?.[0]?.description || '';

    // Match Indonesian NPWP: XX.XXX.XXX.X-XXX.XXX (with flexible separators)
    const npwpRegex = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[.\s]?\d[-.\s]?\d{3}[.\s]?\d{3}/g;
    const matches = rawText.match(npwpRegex);
    const npwpNumber = matches ? matches[0].replace(/\s/g, '') : null;

    if (npwpNumber) {
      // Save back into the project's payments JSON
      const projRef = db.collection('projects').doc(projectId);
      const projSnap = await projRef.get();
      if (projSnap.exists) {
        const currentPayments = JSON.parse(projSnap.data().payments || '{}');
        currentPayments[institutionId] = {
          ...currentPayments[institutionId],
          npwpNumber,
        };
        await projRef.update({ payments: JSON.stringify(currentPayments) });
      }
    }

    return { npwpNumber };
  } catch (err) {
    console.error('extractNpwp error:', err);
    throw new functions.https.HttpsError('internal', 'OCR failed: ' + err.message);
  }
});

/**
 * extractNpwpPublic — HTTPS onRequest (public, no auth required)
 *
 * Accepts a Firebase Storage imageUrl, runs Vision OCR, and returns
 * the extracted Indonesian NPWP number. Used by public registration forms.
 */
exports.extractNpwpPublicV3 = functions.region('asia-southeast2').https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const data = req.body.data || req.body;
  const { imageUrl } = data;

  if (!imageUrl || typeof imageUrl !== 'string') {
    res.status(400).json({ error: 'imageUrl is required.' });
    return;
  }

  try {
    const [result] = await visionClient.textDetection({ image: { source: { imageUri: imageUrl } } });
    const rawText = result.fullTextAnnotation?.text || result.textAnnotations?.[0]?.description || '';

    const npwpRegex = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[.\s]?\d[-.\s]?\d{3}[.\s]?\d{3}/g;
    const matches = rawText.match(npwpRegex);
    const npwpNumber = matches ? matches[0].replace(/\s/g, '') : null;

    res.status(200).json({ data: { npwpNumber } });
  } catch (error) {
    console.error('extractNpwpPublic error:', error);
    res.status(500).json({ error: error.message });
  }
});
