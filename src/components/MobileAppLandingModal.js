import React, { useEffect, useRef, useState } from 'react';
import './MobileAppLandingModal.css';
import logo from '../assets/images/PISCARISK_LOGO.png';
import mobDashboard from '../assets/images/mob_dashboard.png';
import mobWeather from '../assets/images/mob_weather.png';
import mobReports from '../assets/images/mob_reports.png';
import mobRisk from '../assets/images/mob_risk.png';
import mobileAppQr from '../assets/images/PiscaRISK_Mobile App_QR.png';

const APK_DRIVE_URL = 'https://drive.google.com/file/d/1t5fxSgbRFb9Is78jnt9enqezMaNYRyGK/view?usp=sharing';

const slides = [
  {
    title: 'Farm Overview at a Glance',
    description: 'Track pond conditions, weather, and real-time updates from your farm.',
    image: mobDashboard,
    highlights: ['Monitor your ponds', 'Stay updated', 'Manage your farm'],
    longText:
      'PiscaRISK is your smart companion for fish farm monitoring and reporting. ' +
      'It helps you track pond conditions and submit reports in real time. ' +
      'Simple, reliable, and built to keep you in control of your farm.'
  },
  {
    title: 'Stay Aware, Stay Protected',
    description: 'Get real-time weather alerts and identify potential risks before they affect your farm.',
    image: mobWeather,
    highlights: ['Weather insights', 'Risk assessment', 'Preparedness'],
    longText:
      'PiscaRISK keeps you informed about changing weather and environmental conditions. ' +
      'Quickly identify potential risks and track reported issues in your area. ' +
      'Stay prepared and take action to protect your farm and community from unexpected threats.'
  },
  {
    title: 'Building a Safer Community Together',
    description: 'Submit reports and share real-time information to help protect your farm and community.',
    image: mobReports,
    highlights: ['Submit reports', 'Share updates', 'Collaboration'],
    longText:
      'PiscaRISK enables users to report issues and share important updates with ease. ' +
      'Stay informed about potential risks while helping others stay aware. ' +
      'By working together, we can improve awareness and prevent hazards before they escalate. '  
    },
  {
    title: 'Take PiscaRISK Anywhere',
    description: 'Monitor risks, assess conditions, and stay updated anytime using the PiscaRISK mobile app. ',
    image: mobRisk,
    highlights: ['Access anywhere', 'Monitor risks on-the-go', 'Take action quickly'],
    longText:
      'Stay connected to safety wherever you go with the PiscaRISK mobile app. ' +
      'Monitor risks, assess conditions, and receive important updates directly from your phone. ' +
      'With quick access to essential tools, you can stay prepared and take action anytime.'
  }
];

export default function MobileAppLandingModal({ open, onProceed }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartYRef = useRef(null);
  const proceedOnceRef = useRef(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth <= 640);

  const proceed = () => {
    if (proceedOnceRef.current) return;
    proceedOnceRef.current = true;
    if (typeof onProceed === 'function') onProceed();
  };

  useEffect(() => {
    if (!open || isPaused) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [open, isPaused]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') proceed();
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        proceed();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth <= 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!open) return null;

  return (
    <div
      className="promo-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="PiscaRISK Mobile promotion"
      onWheel={(e) => {
        // Scroll-to-login is for desktop/web only.
        if (!isMobileView && e.deltaY > 6) proceed();
      }}
      onMouseDown={(e) => {
        // Click outside modal to proceed (like a “dismiss”)
        if (e.target?.classList?.contains('promo-modal-overlay')) proceed();
      }}
      onTouchStart={(e) => {
        const y = e?.touches?.[0]?.clientY;
        if (typeof y === 'number') touchStartYRef.current = y;
      }}
      onTouchEnd={(e) => {
        // In mobile view, allow normal reading/scrolling without auto-proceed.
        if (isMobileView) return;
        const y = e?.changedTouches?.[0]?.clientY;
        const startY = touchStartYRef.current;
        touchStartYRef.current = null;
        if (typeof y === 'number' && typeof startY === 'number') {
          // swipe up -> proceed
          if (startY - y > 40) proceed();
        }
      }}
    >
      <div className="promo-modal">
        <header className="promo-modal-header">
          <div className="promo-brand">
            <img src={logo} alt="PiscaRISK Logo" className="promo-logo" />
            <div>
              <div className="promo-title">PiscaRISK Mobile</div>
              <div className="promo-subtitle">Monitor your farm, assess risks, and submit reports anytime.</div>
            </div>
          </div>
        </header>

        <div className="promo-modal-body">
          <div className="promo-slide-shell">
            <div
              className="promo-track"
            >
              {slides.map((s, idx) => (
                <section
                  className={`promo-slide ${idx === activeIndex ? 'is-active' : ''}`}
                  key={s.title}
                >
                  <div className="promo-slide-grid">
                    <div className="promo-image-wrap" aria-hidden="true">
                      <img className="promo-image" src={s.image} alt="" />
                    </div>

                    <div className="promo-copy">
                      <div className="promo-copy-top">
                        <h2>{s.title}</h2>
                      </div>
                      <p className="promo-lead">{s.description}</p>
                      {Array.isArray(s.highlights) && s.highlights.length > 0 && (
                        <div className="promo-highlights" aria-label="Key highlights">
                          {s.highlights.map((h, idx) => (
                            <span
                              // eslint-disable-next-line react/no-array-index-key
                              key={`${h}-${idx}`}
                              className={`promo-pill ${idx === 0 ? 'promo-pill--primary' : ''}`}
                            >
                              {h}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="promo-longtext">
                        {s.longText}
                      </div>

                      <div className="promo-download-center" aria-label="Download PiscaRISK Mobile App">
                        <button
                          type="button"
                          className="promo-qr-btn"
                          onClick={() => window.open(APK_DRIVE_URL, '_blank', 'noopener,noreferrer')}
                          title="Scan QR code to download the mobile app"
                          onMouseEnter={() => setIsPaused(true)}
                          onMouseLeave={() => setIsPaused(false)}
                          onFocus={() => setIsPaused(true)}
                          onBlur={() => setIsPaused(false)}
                        >
                          <img className="promo-qr" src={mobileAppQr} alt="PiscaRISK Mobile App QR" />
                        </button>
                        <button
                          type="button"
                          className="promo-apk-link"
                          onClick={() => window.open(APK_DRIVE_URL, '_blank', 'noopener,noreferrer')}
                        >
                          Get the Mobile App
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </div>

          <div className="promo-controls">
            <div className="promo-dots" aria-hidden="true">
              {slides.map((s, idx) => (
                <button
                  key={s.title}
                  type="button"
                  className={`promo-dot ${idx === activeIndex ? 'active' : ''}`}
                  onClick={() => setActiveIndex(idx)}
                />
              ))}
            </div>

            <button
              type="button"
              className="promo-next"
              onClick={() => setActiveIndex((prev) => (prev + 1) % slides.length)}
            >
              Next →
            </button>

            {isMobileView ? (
              <div className="promo-proceed" aria-live="polite">
                Tap "Log in to your account" to continue
              </div>
            ) : (
              <button type="button" className="promo-proceed" onClick={proceed}>
                Swipe or scroll down to login
                <span className="promo-arrow" aria-hidden="true">↓</span>
              </button>
            )}

            <button type="button" className="promo-login-link" onClick={proceed}>
              Log in to your account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

