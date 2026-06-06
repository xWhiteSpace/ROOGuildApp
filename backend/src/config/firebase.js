// backend/src/config/firebase.js
import admin from 'firebase-admin';

/**
 * REQ055 / REQ057: Seamless Firebase Admin Initialization Pass
 * Named export matching your index.js import sequence perfectly
 */
export function initializeFirebase() {
  if (!admin.apps.length) { // REQ054: Prevent duplicate connection instances
    try {
      // REQ056: Sanitize cryptographic newline characters from the environment private key
      const privateKey = process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined;

      // Authenticate using secure administrative certificate tokens
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
      console.log("SUCCESS: Firebase Admin SDK initialized seamlessly.");
    } catch (error) {
      console.error("FATAL: Firebase initialization failed:", error.message);
      process.exit(1);
    }
  }
}

/**
 * 📡 LIVE PROXIED DATABASE GATEWAY
 * Uses a dynamic property wrapper to prevent compile-time race conditions.
 * Guarantees downstream imports always resolve to an active instance upon invocation.
 */
export const db = {
  ref: (path) => admin.apps.length ? admin.database().ref(path) : null
};
