// backend/src/config/firebase.js
const admin = require('firebase-admin');

if (!admin.apps.length) { // REQ054: Prevent duplicate connection instances
  try {
    // REQ056: Sanitize cryptographic newline characters from the environment private key
    const privateKey = process.env.FIREBASE_PRIVATE_KEY 
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
      : undefined;

    // REQ055: Authenticate using secure administrative certificate tokens
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
      // REQ057: Bind securely to the real-time cloud database destination URL
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    console.log("SUCCESS: Firebase Admin SDK initialized seamlessly.");
  } catch (error) {
    console.error("FATAL: Firebase initialization failed:", error.message);
    process.exit(1);
  }
}

const db = admin.database();
module.exports = db;