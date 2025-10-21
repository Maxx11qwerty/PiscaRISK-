// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore, collection, addDoc, getDocs } from "firebase/firestore";

// Web App Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBBmZgmCzEXBYphPhm5C3Lyd9cUlIh4s_0",
  authDomain: "www.piscarisk.com", // Updated to use custom domain for session persistence
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
// Enhanced persistence configuration for production domain
try {
  const isEdge = /Edg/.test(navigator.userAgent);
  const hostname = window.location.hostname;
  const isProduction = hostname === 'www.piscarisk.com';
  
  // Enhanced persistence configuration for better cross-tab support
  if (isProduction) {
    // For production domain, try IndexedDB first for better cross-tab persistence
    setPersistence(auth, indexedDBLocalPersistence).catch(() => {
      console.warn('Failed to set IndexedDB persistence, falling back to localStorage');
      return setPersistence(auth, browserLocalPersistence);
    }).catch(() => {
      console.warn('Failed to set any persistence, using default');
    });
  } else if (isEdge) {
    // Edge: Try IndexedDB first, then localStorage as fallback
    setPersistence(auth, indexedDBLocalPersistence).catch(() => {
      console.warn('Edge: Failed to set IndexedDB persistence, trying localStorage');
      return setPersistence(auth, browserLocalPersistence);
    }).catch(() => {
      console.warn('Edge: Failed to set any persistence, using default');
    });
  } else {
    // Development and other environments
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

  // DISABLE ANALYTICS COMPLETELY FOR DEFENSE - NO ERRORS
  const shouldEnableAnalytics = false;

  if (shouldEnableAnalytics) {
    // Add global error handler for Google Analytics network failures (set up early)
    window.addEventListener('error', (event) => {
      if (event.target && event.target.src && 
          event.target.src.includes('google-analytics.com') && 
          event.type === 'error') {
        console.debug('Google Analytics resource failed to load, continuing without analytics');
        event.preventDefault();
        return false;
      }
    }, true);
    
    // Add global error handler for unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason && event.reason.message && 
          (event.reason.message.includes('ERR_NAME_NOT_RESOLVED') ||
           event.reason.message.includes('net::ERR_') ||
           event.reason.message.includes('google-analytics.com'))) {
        console.debug('Google Analytics promise rejected, continuing without analytics:', event.reason.message);
        event.preventDefault();
        return false;
      }
    });
    
    import("firebase/analytics")
      .then(({ getAnalytics, logEvent }) => {
        try {
          analytics = getAnalytics(app);
          
          // Enhanced Google Analytics error handling with DNS failure protection
          if (window.gtag) {
            const originalGtag = window.gtag;
            window.gtag = function(...args) {
              try {
                return originalGtag.apply(this, args);
              } catch (error) {
                // Silently handle deprecated parameter warnings and network errors
                if (error.message && (
                  error.message.includes('deprecated parameters') ||
                  error.message.includes('ERR_NAME_NOT_RESOLVED') ||
                  error.message.includes('net::ERR_') ||
                  error.message.includes('Failed to load resource')
                )) {
                  console.debug('Google Analytics request failed, continuing without analytics:', error.message);
                  return;
                }
                throw error;
              }
            };
          }
          
          // Override console.warn to suppress GA warnings
          const originalWarn = console.warn;
          console.warn = function(...args) {
            const message = args.join(' ');
            if (message.includes('deprecated parameters for the initialization function') || 
                message.includes('feature_collector.js') ||
                message.includes('using deprecated parameters')) {
              return; // Suppress these specific warnings
            }
            originalWarn.apply(console, args);
          };
          
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