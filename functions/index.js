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
exports.logUserConsent = functions.https.onRequest(async (req, res) => {
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
 * checkUniqueUser — HTTPS callable (public, no auth required)
 * 
 * Securely checks if an email or phone number already exists in
 * the specified collection without exposing the collection data.
 */
exports.checkUniqueUser = functions.https.onCall(async (data, context) => {
  const { collectionName, email, mobilePhone } = data;
  
  if (!collectionName || !['ushers', 'liaison_officers'].includes(collectionName)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid collection name.');
  }

  // Check email
  if (email && email.trim() !== '') {
    const emailSnap = await db.collection(collectionName).where('email', '==', email.trim()).limit(1).get();
    if (!emailSnap.empty) return { isUnique: false, type: 'email' };
  }

  // Check phone
  if (mobilePhone && mobilePhone.trim() !== '') {
    const phoneSnap = await db.collection(collectionName).where('mobilePhone', '==', mobilePhone.trim()).limit(1).get();
    if (!phoneSnap.empty) return { isUnique: false, type: 'phone' };
  }

  return { isUnique: true };
});
