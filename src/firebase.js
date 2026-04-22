// ===== FIREBASE CONFIG =====
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBl47p4YmB8pnI6Vw5Owya0RBawUUpRhj0",
  authDomain: "xuong-may.firebaseapp.com",
  projectId: "xuong-may",
  storageBucket: "xuong-may.firebasestorage.app",
  messagingSenderId: "1072960768744",
  appId: "1:1072960768744:web:83c5e17044a8336627d75d"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
