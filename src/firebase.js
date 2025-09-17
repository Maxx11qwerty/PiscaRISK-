// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs } from "firebase/firestore";

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

// Initialize Firebase with modular API
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Analytics initialization (client-side only)
if (typeof window !== "undefined") {
  const isDevelopment = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';
  
  if (!isDevelopment) {
    import("firebase/analytics")
      .then(({ getAnalytics }) => {
        try {
          getAnalytics(app);
          console.log('Analytics initialized successfully');
        } catch (error) {
          console.warn('Analytics initialization failed:', error);
        }
      })
      .catch((error) => {
        console.warn('Analytics import failed:', error);
      });
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
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      
      const processedData = {};
      Object.keys(data).forEach(key => {
        const value = data[key];
        if (value && typeof value === 'object' && value.toDate && typeof value.toDate === 'function') {
          processedData[key] = value.toDate().toISOString();
        } else if (value && typeof value === 'object' && value.seconds && value.nanoseconds) {
          const date = new Date(value.seconds * 1000 + value.nanoseconds / 1000000);
          processedData[key] = date.toISOString();
        } else {
          processedData[key] = value;
        }
      });
      
      return { id: doc.id, ...processedData };
    });
  } catch (e) {
    console.error("Error fetching documents: ", e);
    throw e;
  }
}

export { app, auth, db, firebaseConfig };