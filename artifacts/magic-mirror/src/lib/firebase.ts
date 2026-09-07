import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

// User's Firebase web app configuration for project: menpoeia
export const firebaseConfig = {
  apiKey: "AIzaSyC_CB-3mBbPSo439YpiIYU7b2Lfbv3A7Mc",
  authDomain: "menpoeia.firebaseapp.com",
  projectId: "menpoeia",
  storageBucket: "menpoeia.firebasestorage.app",
  messagingSenderId: "653703571401",
  appId: "1:653703571401:web:5f922163349d24ca57ea18",
  measurementId: "G-P5Y9ST9XVQ"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;
