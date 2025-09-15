// Client-side Firebase configuration (for web apps)
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore'; // if you use Firestore
import 'firebase/compat/storage';
import 'firebase/compat/auth';

// Web App Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBBmZgmCzEXBYphPhm5C3Lyd9cUlIh4s_0",
  authDomain: "piscarisk.firebaseapp.com",
  projectId: "piscarisk",
  storageBucket: "piscarisk.appspot.com",
  messagingSenderId: "272731177206",
  appId: "1:272731177206:web:657571087b13fba0626cd7",
  measurementId: "G-NT4TSSJL22",
  recaptchaKey: "6LcfiMorAAAAANiZcyAwFAMoD0nEaH_fEvIcdV_8"
};
// Initialize Firebase Client
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Initialize Firebase Compat (for phone authentication)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Only initialize analytics if in browser and network is available
defineAnalytics();
function defineAnalytics() {
  if (typeof window !== "undefined") {
    // Check if we're in development mode
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // Skip analytics in development to avoid DNS issues
    if (isDevelopment) {
      return;
    }
    
    import("firebase/analytics").then(({ getAnalytics }) => {
      try {
        // Test network connectivity first
        fetch('https://www.google-analytics.com/g/collect', {
          method: 'HEAD',
          mode: 'no-cors'
        }).then(() => {
          getAnalytics(app);
          console.log('Analytics initialized successfully');
        }).catch((error) => {
          console.warn('Analytics network test failed, skipping initialization:', error);
        });
      } catch (error) {
        console.warn('Analytics initialization failed:', error);
      }
    }).catch((error) => {
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
      
      // Process Firestore Timestamps to preserve them properly
      const processedData = {};
      Object.keys(data).forEach(key => {
        const value = data[key];
        if (value && typeof value === 'object' && value.toDate && typeof value.toDate === 'function') {
          // This is a Firestore Timestamp, convert to ISO string
          processedData[key] = value.toDate().toISOString();
        } else if (value && typeof value === 'object' && value.seconds && value.nanoseconds) {
          // This is a Firestore Timestamp in a different format
          const date = new Date(value.seconds * 1000 + value.nanoseconds / 1000000);
          processedData[key] = date.toISOString();
        } else {
          // Regular value, keep as is
          processedData[key] = value;
        }
      });
      
      // Debug: Log timestamp processing for systemLogs collection
      if (collectionName === 'systemLogs' && doc.id.includes('export')) {
        console.log('Processing export log in getData:', {
          id: doc.id,
          originalTimestamp: data.timestamp,
          processedTimestamp: processedData.timestamp,
          category: data.category,
          username: data.username
        });
      }
      
      return { id: doc.id, ...processedData };
    });
  } catch (e) {
    console.error("Error fetching documents: ", e);
    throw e;
  }
}

// Export everything
export { app, db, auth, firebaseConfig  };