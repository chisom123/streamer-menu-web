import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyBOi9UCGqF9Ex1VPvzEP7c8nlB3IVrMv5w",
  authDomain: "pingbear-96b4c.firebaseapp.com",
  projectId: "pingbear-96b4c",
  storageBucket: "pingbear-96b4c.appspot.com",
  messagingSenderId: "958676880670",
  appId: "1:958676880670:web:a48c74d785335d474a0d0f",
  measurementId: "G-TRNPBJ4REL"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export default app;
