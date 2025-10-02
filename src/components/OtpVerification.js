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

  useEffect(() => {
    if (open) {
      // Initialize only once per open
      if (!recaptchaVerifierRef.current && !isInitializingRef.current) {
        initializeRecaptcha();
      } else if (recaptchaVerifierRef.current && window.grecaptcha && recaptchaWidgetIdRef.current !== null) {
        try {
          window.grecaptcha.reset(recaptchaWidgetIdRef.current);
          setRecaptchaReady(false);
        } catch (_) {}
      }
    } else {
      // Clean up reCAPTCHA when modal closes
      cleanupRecaptcha();
    }
    
    return () => {
      // Clean up on component unmount
      cleanupRecaptcha();
    };
  }, [open]);

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
      const recaptchaVerifier = new RecaptchaVerifier(
        auth,
        'recaptcha-container',
        {
          'size': 'invisible',
          'callback': () => {
            console.log("reCAPTCHA solved");
            setRecaptchaReady(true);
          },
          'expired-callback': () => {
            setRecaptchaReady(false);
            setError("reCAPTCHA expired. Please try again.");
          },
          'error-callback': (error) => {
            console.error("reCAPTCHA error:", error);
            setError("Security verification failed. Please try again.");
          }
        }
      );

      recaptchaVerifierRef.current = recaptchaVerifier;
      window.recaptchaVerifier = recaptchaVerifier;
      
      // Render reCAPTCHA
      const widgetId = await recaptchaVerifier.render();
      recaptchaWidgetIdRef.current = widgetId;
      console.log("reCAPTCHA initialized successfully");
      isInitializingRef.current = false;
      setRecaptchaReady(true);
      
    } catch (error) {
      console.error("Failed to initialize reCAPTCHA:", error);
      setError("Security verification failed to load. Please refresh.");
      isInitializingRef.current = false;
    }
  };

  const sendOTP = async () => {
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
        console.error("reCAPTCHA verify failed:", vErr);
        throw vErr;
      }

      const result = await signInWithPhoneNumber(
        auth, 
        formattedPhoneNumber, 
        appVerifier
      );

      setConfirmationResult(result);
      console.log("✅ OTP sent successfully");
      resetCountdown();
      
    } catch (err) {
      console.error("Error sending OTP:", err);
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
      await onVerify(result);
    } catch (err) {
      console.error("Error verifying OTP:", err);
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
          <button className="otp-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="otp-content">
          <div className="otp-rounded-line"></div>
          <p className="otp-description">
            {confirmationResult
              ? `Enter the 6-digit code sent to ${phoneNumber}`
              : `Complete the CAPTCHA below and click "Send OTP"`}
          </p>

          {error && <div className="otp-error">{error}</div>}

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

              <button
                className="otp-send-btn"
                onClick={sendOTP}
                disabled={isSendingOTP}
              >
                {isSendingOTP ? "Sending..." : "Send OTP"}
              </button>
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