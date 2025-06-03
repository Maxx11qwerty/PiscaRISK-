// Client-side Firebase configuration (for web apps)
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Web App Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBBmZgmCzEXBYphPhm5C3Lyd9cUlIh4s_0",
  authDomain: "piscarisk.firebaseapp.com",
  projectId: "piscarisk",
  storageBucket: "piscarisk.appspot.com",
  messagingSenderId: "272731177206",
  appId: "1:272731177206:web:657571087b13fba0626cd7",
  measurementId: "G-NT4TSSJL22"
};

// Initialize Firebase Client
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Only initialize analytics if in browser
defineAnalytics();
function defineAnalytics() {
  if (typeof window !== "undefined") {
    import("firebase/analytics").then(({ getAnalytics }) => {
      getAnalytics(app);
    }).catch(() => {});
  }
}

// Client-side Firestore Functions
export async function addData(collectionName, data) {
  try {
    const docRef = await addDoc(collection(db, collectionName), data);
    return docRef.id;
  } catch (e) {
    console.error("Error adding document: ", e);
    throw e;
  }
}

export async function getData(collectionName) {
  try {
    const querySnapshot = await getDocs(collection(db, collectionName));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error("Error fetching documents: ", e);
    throw e;
  }
}

// Export everything
export { app, db, auth, firebaseConfig  };