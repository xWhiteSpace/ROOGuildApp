import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
// import { getAuth } from 'firebase/auth'; // If you use authentication on the frontend

const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "auctionrooc.firebaseapp.com",
  projectId: "auctionrooc",
  storageBucket: "auctionrooc.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id",
  
  // 🌟 ADD/FIX THIS LINE EXACTLY:
  databaseURL: "https://auctionrooc-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database and export it
export const database = getDatabase(app);
// export const auth = getAuth(app); // If needed