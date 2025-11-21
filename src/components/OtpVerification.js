import { auth } from "../firebase";
import React, { useState, useEffect, useRef } from "react";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
import "./OtpVerification.css";

const OTPVerification = ({ open, phoneNumber, onVerify, onClose }) => {
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  // Countdown timer for resend visibility (90 seconds total)
  const [secondsLeft, setSecondsLeft] = useState(0);
  const recaptchaVerifierRef = useRef(null);
  const recaptchaWidgetIdRef = useRef(null);
  const isInitializingRef = useRef(false);
  const countdownIntervalRef = useRef(null);
  const hasSentRef = useRef(false);
  const closeStateRef = useRef(0);
  const [recaptchaWaited, setRecaptchaWaited] = useState(false);
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (open && recaptchaReady && recaptchaVerifierRef.current && !hasSentRef.current) {
      hasSentRef.current = true;
      setError("");
      setOtp(["", "", "", "", "", ""]);
      setConfirmationResult(null);
      sendOTP();
    }
    if (!open) {
      setOtp(["", "", "", "", "", ""]);
      setError("");
      setConfirmationResult(null);
      setIsSendingOTP(false);
      hasSentRef.current = false;
      cleanupRecaptcha();
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      setSecondsLeft(0);
    }
  }, [open, recaptchaReady]);

  // Auto-initialize reCAPTCHA when the modal opens
  useEffect(() => {
    if (open) {
      initializeRecaptcha();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setRecaptchaWaited(false);
      return;
    }
    setRecaptchaWaited(false);
    let timer = setTimeout(() => setRecaptchaWaited(true), 10000);
    return () => clearTimeout(timer);
  }, [open, recaptchaReady]);

  // If after waiting recaptcha still isn't ready, automatically retry init
  useEffect(() => {
    if (open && recaptchaWaited && !recaptchaReady && !isInitializingRef.current) {
      initializeRecaptcha();
    }
  }, [open, recaptchaWaited, recaptchaReady]);

  // Ensure cleanup also runs when OTP verification succeeds (confirmationResult resolves)
  useEffect(() => {
    if (!open && recaptchaVerifierRef.current) {
      cleanupRecaptcha();
    }
  }, [open, recaptchaVerifierRef.current]);

  const cleanupRecaptcha = () => {
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      } catch (error) {
        // Ignore cleanup errors from Firebase internals
        console.debug("Ignored reCAPTCHA cleanup error", error);
      }
    }
    
    // Also clear the global reference
    if (window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      } catch (_) {
        // Swallow cleanup errors from Firebase internals
      }
    }
    
    // Remove any existing reCAPTCHA elements
    const recaptchaElements = document.querySelectorAll('#recaptcha-container > div');
    recaptchaElements.forEach(element => element.remove());
    
    setRecaptchaReady(false);
    recaptchaWidgetIdRef.current = null;
    isInitializingRef.current = false;
    retryCountRef.current = 0;
  };

  const resetCountdown = () => {
    // 90 seconds total
    setSecondsLeft(90);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    countdownIntervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const waitForContainer = async (maxMs = 1000) => {
    let waited = 0;
    while (!document.getElementById('recaptcha-container') && waited < maxMs) {
      await new Promise(r => setTimeout(r, 50));
      waited += 50;
    }
    return !!document.getElementById('recaptcha-container');
  };

  const waitForRecaptchaReady = async (maxMs = 2000) => {
    let waited = 0;
    while (!recaptchaReady && waited < maxMs) {
      await new Promise(r => setTimeout(r, 50));
      waited += 50;
    }
    return recaptchaReady;
  };

  const addPreconnects = () => {
    try {
      const ensure = (rel, href, cross) => {
        if (![...document.querySelectorAll(`link[rel='${rel}'][href='${href}']`)].length) {
          const l = document.createElement('link');
          l.rel = rel; l.href = href; if (cross) l.crossOrigin = 'anonymous';
          document.head.appendChild(l);
        }
      };
      ensure('preconnect', 'https://www.google.com', true);
      ensure('preconnect', 'https://www.gstatic.com', true);
    } catch (_) {}
  };

  const ensureRecaptchaScript = async () => {
    addPreconnects();
    try {
      if (![...document.scripts].some(s => (s.src || '').includes('recaptcha__'))) {
        await new Promise((resolve) => {
          const s = document.createElement('script');
          s.src = 'https://www.gstatic.com/recaptcha/releases/cLm1zuaUXPLFw7nzKiQTH1dX/recaptcha__en.js';
          s.async = true; s.defer = true; s.onload = resolve; s.onerror = resolve;
          document.head.appendChild(s);
          setTimeout(resolve, 1500);
        });
      }
    } catch (_) {}
  };

  const initializeRecaptcha = async () => {
    try {
      if (recaptchaVerifierRef.current || isInitializingRef.current) return;
      isInitializingRef.current = true;

      // Ensure container exists in DOM
      const hasContainer = await waitForContainer(1200);
      if (!hasContainer) {
        throw new Error('reCAPTCHA container not found');
      }

      // Create reCAPTCHA verifier
      await ensureRecaptchaScript();
      const recaptchaVerifier = new RecaptchaVerifier(
        auth,
        'recaptcha-container',
        {
          'size': 'invisible',
          'callback': () => {
            setRecaptchaReady(true);
          },
          'expired-callback': () => {
            setRecaptchaReady(false);
            setError("reCAPTCHA expired. Please try again.");
          },
          'error-callback': (error) => {
            if (process.env.NODE_ENV === 'development') {
              // eslint-disable-next-line no-console
              console.error("reCAPTCHA error:", error);
            }
            setError("Security verification failed. Please try again.");
          }
        }
      );

      recaptchaVerifierRef.current = recaptchaVerifier;
      window.recaptchaVerifier = recaptchaVerifier;
      
      // Render reCAPTCHA
      // Add a defensive timeout in case the Google iframe hangs
      const renderPromise = recaptchaVerifier.render();
      const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error('recaptcha-render-timeout')), 6000));
      const widgetId = await Promise.race([renderPromise, timeoutPromise]);
      recaptchaWidgetIdRef.current = widgetId;
      isInitializingRef.current = false;
      setRecaptchaReady(true);
      
    } catch (error) {
      // Retry: if render times out, clean up and re-initialize, then fall back to visible widget on further retries
      if (String(error?.message || '').includes('recaptcha-render-timeout')) {
        cleanupRecaptcha();
        try {
          retryCountRef.current += 1;
          await new Promise(r => setTimeout(r, 300));
          if (retryCountRef.current >= 2) {
            const recaptchaVerifier = new RecaptchaVerifier(
              auth,
              'recaptcha-container',
              {
                'size': 'normal',
                'callback': () => setRecaptchaReady(true),
                'expired-callback': () => setRecaptchaReady(false)
              }
            );
            recaptchaVerifierRef.current = recaptchaVerifier;
            window.recaptchaVerifier = recaptchaVerifier;
            await recaptchaVerifier.render();
            setRecaptchaReady(true);
            return;
          }
          await initializeRecaptcha();
          return;
        } catch (_) {}
      }
      
      setError("Security verification failed to load. Please refresh.");
      isInitializingRef.current = false;
    }
  };

  const sendOTP = async () => {
    if (!recaptchaVerifierRef.current || !recaptchaReady) {
      setError("Security check not ready. Please wait a moment and try again.");
      return;
    }
    if (!phoneNumber) return setError("Phone number is required");

    setIsSendingOTP(true);
    setError("");

    try {
      const formattedPhoneNumber = phoneNumber.replace(/\s/g, "");
      
      if (!/^\+63\d{10}$/.test(formattedPhoneNumber)) {
        setError("Please enter a valid Philippine phone number (+63XXXXXXXXXX)");
        setIsSendingOTP(false);
        return;
      }

      const appVerifier = recaptchaVerifierRef.current;
      if (!appVerifier) {
        throw new Error("reCAPTCHA not ready");
      }
      // For invisible reCAPTCHA, explicitly trigger verification
      try {
        await appVerifier.verify();
      } catch (vErr) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error("reCAPTCHA verify failed:", vErr);
        }
        throw vErr;
      }

      const result = await signInWithPhoneNumber(
        auth, 
        formattedPhoneNumber, 
        appVerifier
      );

      setConfirmationResult(result);
      resetCountdown();
      
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error("Error sending OTP:", err);
      }
      handleAuthError(err);
    } finally {
      setIsSendingOTP(false);
    }
  };

  const handleAuthError = (err) => {
    switch (err.code) {
      case "auth/invalid-phone-number":
        setError("Invalid phone number format.");
        break;
      case "auth/too-many-requests":
        setError("Too many attempts. Please try again later.");
        break;
      case "auth/quota-exceeded":
        setError("SMS quota exceeded. Try again tomorrow.");
        break;
      case "auth/invalid-app-credential":
        setError("Security verification failed. Check reCAPTCHA configuration.");
        break;
      case "auth/missing-client-identifier":
        setError("Authentication configuration issue. Please refresh.");
        break;
      default:
        setError(err.message || "Failed to send OTP. Try again.");
    }
  };

  const verifyOTP = async () => {
    const otpString = otp.join("");
    if (!confirmationResult) return setError("Please send OTP first");
    if (otpString.length !== 6) return setError("Enter 6-digit code");

    try {
      setIsLoading(true);
      const result = await confirmationResult.confirm(otpString);
      const verifyResult = await onVerify(result);
      if (verifyResult && verifyResult.success) {
        window.alert('Phone verified successfully!'); // replace with your toast if you prefer
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error("Error verifying OTP:", err);
      }
      setError("Invalid or expired code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (index, value) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value.replace(/\D/g, "");
    setOtp(newOtp);

    if (value && index < 5) {
      setTimeout(() => {
        document.getElementById(`otp-${index + 1}`)?.focus();
      }, 10);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      setTimeout(() => {
        document.getElementById(`otp-${index - 1}`)?.focus();
      }, 10);
    }
  };

  const pendingTimersRef = useRef([]);

  useEffect(() => {
    return () => {
      pendingTimersRef.current.forEach(id => clearTimeout(id));
      pendingTimersRef.current = [];
    };
  }, []);

  const safeSetTimeout = (fn, ms) => {
    const id = setTimeout(fn, ms);
    pendingTimersRef.current.push(id);
  };

  const handleResend = async () => {
    try {
      setError("");
      setOtp(["", "", "", "", "", ""]);
      setConfirmationResult(null);
      // Always fully cleanup and recreate the verifier to avoid stale widget references
      cleanupRecaptcha();
      // Allow React to re-render DOM to include the container
      await new Promise(r => setTimeout(r, 50));
      await initializeRecaptcha();
      await waitForRecaptchaReady();
      await sendOTP();
    } catch (e) {
      setError(e?.message || "Failed to resend OTP. Please try again.");
    }
  };

  if (!open) return null;

  return (
    <div className="otp-overlay">
      <div className="otp-modal">
        <div className="otp-header">
          <h3>Phone Verification</h3>
          <button className="otp-close" onClick={() => {
            setOtp(["", "", "", "", "", ""]);
            setError("");
            setConfirmationResult(null);
            setIsSendingOTP(false);
            hasSentRef.current = false;
            cleanupRecaptcha();
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            setSecondsLeft(0);
            closeStateRef.current++;
            onClose(closeStateRef.current);
          }}>&times;</button>
        </div>

        <div className="otp-content">
          <div className="otp-rounded-line"></div>
          <p className="otp-description">
            {confirmationResult
              ? `Enter the 6-digit code sent to ${phoneNumber}`
              : `Complete the CAPTCHA below and click "Send OTP"`}
          </p>

          {error && <div className="otp-error">{error}</div>}

          {!recaptchaReady && open && (
            <div style={{ margin: '18px 0', textAlign: 'center' }}>
              <span className="otp-spinner" style={{ width: 20, height: 20, verticalAlign:'middle', border: '2.5px solid #4090e2', borderTop: '2.5px solid #f7fafc', borderRadius: '50%', display: 'inline-block', animation: 'otpSpin .85s linear infinite', marginRight: '7px' }} />
              <span style={{color:'#2C517D',fontWeight:'bold'}}>Loading security check…</span><br/>
              {recaptchaWaited && (
                <span style={{ color:'#ba0101', fontSize: '0.97rem', fontWeight: 600, display:'block', marginTop:7 }}>
                  If this takes too long, try turning off any ad blockers and refresh the page.
                </span>
              )}
            </div>
          )}

          {!confirmationResult && (
            <>
              <div
                id="recaptcha-container"
                style={{
                  margin: "15px 0",
                  minHeight: "78px",
                  display: "flex",
                  justifyContent: "center",
                }}
              ></div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
                <button
                  className="otp-send-btn"
                  onClick={sendOTP}
                  disabled={isSendingOTP || !recaptchaVerifierRef.current || !recaptchaReady}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', minWidth: 150 }}
                >
                  {isSendingOTP ? (
                    <>
                      <span
                        role="status"
                        aria-label="Sending"
                        className="otp-spinner"
                        style={{
                          width: 16,
                          height: 16,
                          border: '2px solid #4090e2',
                          borderTop: '2px solid transparent',
                          borderRadius: '50%',
                          display: 'inline-block',
                          animation: 'otpSpin .8s linear infinite'
                        }}
                      />
                      <span style={{ paddingLeft: 6 }}>Sending...</span>
                    </>
                  ) : (
                    <>Send OTP</>
                  )}
                </button>
              </div>
            </>
          )}

          {confirmationResult && (
            <>
              <div className="otp-inputs">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    id={`otp-${index}`}
                    type="text"
                    inputMode="numeric"
                    maxLength="1"
                    value={digit}
                    onChange={(e) => handleInputChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="otp-input"
                    placeholder="0"
                  />
                ))}
              </div>

              <button
                className="otp-verify-btn"
                onClick={verifyOTP}
                disabled={isLoading || otp.join("").length !== 6}
              >
                {isLoading ? "Verifying..." : "Verify OTP"}
              </button>
            </>
          )}

          {confirmationResult && (
            <div className="otp-resend">
              {secondsLeft > 30 ? (
                <span>
                  Resend available in {String(Math.floor((secondsLeft - 30) / 60)).padStart(1, '0')}:{String((secondsLeft - 30) % 60).padStart(2, '0')}
                </span>
              ) : (
                <>
                  <span>Didn't receive the code? </span>
                  <button
                    className="otp-resend-btn"
                    onClick={handleResend}
                    disabled={isLoading || isSendingOTP}
                  >
                    Resend
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OTPVerification;