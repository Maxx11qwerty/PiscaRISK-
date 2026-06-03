import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { FarmsProvider } from './contexts/FarmsContext';
import { RiskDataProvider } from './contexts/RiskDataContext';
import { ReportsDataProvider } from './contexts/ReportsDataContext';
import { DashboardMetaProvider } from './contexts/DashboardMetaContext';
import { WeatherProvider } from './contexts/WeatherContext';
import reportWebVitals from './reportWebVitals';
import './i18n'; // Import i18n configuration

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <FarmsProvider>
    <RiskDataProvider>
      <ReportsDataProvider>
        <DashboardMetaProvider>
          <WeatherProvider>
            <App />
          </WeatherProvider>
        </DashboardMetaProvider>
      </ReportsDataProvider>
    </RiskDataProvider>
  </FarmsProvider>
);

// Suppress browser tracking prevention warnings for reCAPTCHA resources
// These are harmless warnings from Edge/Safari blocking third-party storage
const originalWarn = console.warn;
const originalError = console.error;

const shouldSuppressTrackingWarning = (message) => {
  return (
    message.includes('Tracking Prevention blocked') &&
    (message.includes('recaptcha') || 
     message.includes('gstatic.com') || 
     message.includes('google.com') ||
     message.includes('grecaptcha'))
  );
};

console.warn = (...args) => {
  const message = args.join(' ');
  if (shouldSuppressTrackingWarning(message)) {
    // Silently ignore these benign browser warnings
    return;
  }
  // Allow all other warnings through
  originalWarn.apply(console, args);
};

console.error = (...args) => {
  const message = args.join(' ');
  if (shouldSuppressTrackingWarning(message)) {
    // Silently ignore these benign browser warnings
    return;
  }
  // Allow all other errors through
  originalError.apply(console, args);
};

// Swallow late reCAPTCHA timeouts that can fire after OTP modal has unmounted
// to prevent noisy unhandled runtime errors post-login.
window.addEventListener('unhandledrejection', (event) => {
  try {
    const reason = event?.reason;
    const message = (reason && (reason.message || String(reason))) || '';
    const stack = (reason && reason.stack) || '';
    const isRecaptcha =
      message.includes('recaptcha') ||
      stack.includes('recaptcha') ||
      message.includes('grecaptcha') ||
      stack.includes('grecaptcha');
    const isTimeout = message === 'Timeout' || message.toLowerCase().includes('timeout');
    const withinOtpGrace = typeof window.__otpGraceUntil === 'number' && Date.now() <= window.__otpGraceUntil;
    const isRecaptchaContext = isRecaptcha || typeof window.grecaptcha !== 'undefined' || document.getElementById('recaptcha-container');
    if ((isTimeout && (withinOtpGrace || isRecaptchaContext)) || (isRecaptcha && isTimeout)) {
      // Silently ignore this specific benign error
      event.preventDefault();
    }
  } catch (_) {
    // no-op
  }
});

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();