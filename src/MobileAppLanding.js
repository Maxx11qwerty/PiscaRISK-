import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './MobileAppLanding.css';
import logo from './assets/images/PISCARISK_LOGO.png';

const slides = [
  {
    title: 'Monitor Anywhere',
    description: 'Track fishpond health, weather, and risk updates from your phone in real time.'
  },
  {
    title: 'Fast Risk Insights',
    description: 'Get clear pond-level risk signals so you can act quickly and reduce losses.'
  },
  {
    title: 'Built for Farm Teams',
    description: 'Designed for daily operations with simple reporting and easy collaboration.'
  }
];
const LOGIN_INTENT_KEY = 'fromMobileLandingToLogin';

export default function MobileAppLanding() {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStartY, setTouchStartY] = useState(null);
  const hasNavigatedRef = useRef(false);

  const goToLogin = useCallback(() => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    try { sessionStorage.setItem(LOGIN_INTENT_KEY, '1'); } catch (_) {}
    navigate('/login');
  }, [navigate]);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  const handleTouchStart = (event) => {
    const y = event?.touches?.[0]?.clientY;
    if (typeof y === 'number') setTouchStartY(y);
  };

  const handleTouchEnd = (event) => {
    const y = event?.changedTouches?.[0]?.clientY;
    if (typeof y === 'number' && typeof touchStartY === 'number') {
      const delta = touchStartY - y;
      if (delta > 40) {
        goToLogin();
      }
    }
    setTouchStartY(null);
  };

  return (
    <div
      className="mobile-landing-page"
      onWheel={(event) => {
        if (event.deltaY > 8) {
          event.preventDefault();
          goToLogin();
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
          e.preventDefault();
          goToLogin();
        }
      }}
      tabIndex={-1}
    >
      <div className="mobile-landing-login-preview" aria-hidden="true">
        <div className="mobile-landing-login-preview-inner">
          <img src={logo} alt="" className="mobile-landing-preview-logo" />
          <div className="mobile-landing-preview-title" />
          <div className="mobile-landing-preview-subtitle" />
          <div className="mobile-landing-preview-card">
            <div className="mobile-landing-preview-input" />
            <div className="mobile-landing-preview-input" />
            <div className="mobile-landing-preview-button" />
            <div className="mobile-landing-preview-link" />
          </div>
        </div>
      </div>
      <div className="mobile-landing-blur-bg" aria-hidden="true" />
      <div className="mobile-landing-modal">
        <header className="mobile-landing-header">
          <img src={logo} alt="PiscaRISK Logo" className="mobile-landing-logo" />
          <div className="mobile-landing-title-wrap">
            <h1 className="mobile-landing-title">PiscaRISK Mobile</h1>
            <p className="mobile-landing-subtitle">Smart aquaculture monitoring on the go</p>
          </div>
        </header>

        <main className="mobile-landing-slides" aria-label="Mobile app promotion slides">
          <div className="mobile-landing-track-wrap">
            <div
              className="mobile-landing-track"
              style={{ transform: `translateX(-${activeIndex * 100}%)` }}
            >
              {slides.map((slide, index) => (
                <section className="mobile-landing-slide" key={slide.title}>
                  <div className="mobile-placeholder-card" aria-hidden="true">
                    <div className="mobile-placeholder-phone">
                      <div className="mobile-placeholder-notch" />
                      <div className="mobile-placeholder-screen">
                        <div className="mobile-placeholder-line mobile-placeholder-line-lg" />
                        <div className="mobile-placeholder-line" />
                        <div className="mobile-placeholder-line" />
                        <div className="mobile-placeholder-chart" />
                      </div>
                    </div>
                    <div className="mobile-placeholder-glow" />
                  </div>

                  <div className="mobile-landing-copy">
                    <p className="mobile-landing-step">Slide {index + 1} of {slides.length}</p>
                    <h2>{slide.title}</h2>
                    <p>{slide.description}</p>
                  </div>
                </section>
              ))}
            </div>
          </div>

          <div className="mobile-landing-dots" aria-hidden="true">
            {slides.map((slide, index) => (
              <button
                key={slide.title}
                type="button"
                className={`mobile-landing-dot ${index === activeIndex ? 'active' : ''}`}
                onClick={() => setActiveIndex(index)}
              />
            ))}
          </div>

          <div className="mobile-landing-controls">
            <button
              type="button"
              className="mobile-landing-next-btn"
              onClick={() => setActiveIndex((prev) => (prev + 1) % slides.length)}
            >
              Next →
            </button>
          </div>

          <div
            className="mobile-landing-arrow-wrap"
            onClick={goToLogin}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                goToLogin();
              }
            }}
          >
            <span className="mobile-landing-arrow-text">Swipe or scroll down to login</span>
            <span className="mobile-landing-arrow" aria-hidden="true">↓</span>
          </div>
        </main>

        <footer className="mobile-landing-footer">
          <p className="mobile-landing-login-text">
            <span
              className="mobile-landing-login-link"
              role="button"
              tabIndex={0}
              onClick={goToLogin}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  goToLogin();
                }
              }}
            >
              Log in to your account
            </span>
          </p>
        </footer>
      </div>
    </div>
  );
}
