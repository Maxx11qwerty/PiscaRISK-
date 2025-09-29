import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import './i18n'; // Import i18n configuration

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <App />
);

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
    if ((isTimeout && withinOtpGrace) || (isRecaptcha && isTimeout)) {
      // Ignore this specific benign error
      // eslint-disable-next-line no-console
      console.warn('[recaptcha] Ignoring late Timeout after OTP flow');
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