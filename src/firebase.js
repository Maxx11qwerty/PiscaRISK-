// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore, collection, addDoc, getDocs } from "firebase/firestore";

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
// Ensure durable sessions across refreshes and tabs (within the same browser profile)
// Prefer IndexedDB (more robust), fallback to localStorage if needed
// Special handling for Edge browser compatibility
try {
  const isEdge = /Edg/.test(navigator.userAgent);
  if (isEdge) {
    // Edge sometimes has IndexedDB issues, use localStorage for better compatibility
    setPersistence(auth, browserLocalPersistence).catch(() => {
      console.warn('Failed to set browser persistence, using default');
    });
  } else {
    setPersistence(auth, indexedDBLocalPersistence).catch(() => setPersistence(auth, browserLocalPersistence));
  }
} catch (_) {
  // No-op for non-browser environments
}
// Use initializeFirestore with enhanced configuration for better connectivity
const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  ignoreUndefinedProperties: true,
  // Add retry configuration for better reliability
  maxRetries: 3,
  retryDelayMs: 1000
});
let analytics = null;

// Analytics initialization (client-side only)
if (typeof window !== "undefined") {
  const hostname = window.location.hostname;
  const isDevelopment = hostname === 'localhost' || hostname === '127.0.0.1';
  const isRender = hostname.endsWith('.onrender.com');
  const envFlag = (process.env.REACT_APP_ENABLE_ANALYTICS || '').toLowerCase();
  const explicitlyDisabled = envFlag === 'false' || envFlag === '0' || envFlag === 'off';

  const shouldEnableAnalytics = !isDevelopment && !isRender && !explicitlyDisabled;

  if (shouldEnableAnalytics) {
    import("firebase/analytics")
      .then(({ getAnalytics, logEvent }) => {
        try {
          analytics = getAnalytics(app);
          // Suppress Google Analytics deprecated parameter warnings
          if (window.gtag) {
            const originalGtag = window.gtag;
            window.gtag = function(...args) {
              try {
                return originalGtag.apply(this, args);
              } catch (error) {
                // Silently handle deprecated parameter warnings
                if (error.message && error.message.includes('deprecated parameters')) {
                  return;
                }
                throw error;
              }
            };
          }
        } catch (error) {
          console.warn('Analytics initialization failed:', error?.message || error);
        }
      })
      .catch((error) => {
        console.warn('Analytics import failed:', error?.message || error);
      });
  } else {
    // Analytics disabled for this environment
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

export { app, auth, db, firebaseConfig, analytics };