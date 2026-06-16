import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';
import logo from '../../assets/images/PISCARISK_LOGO.png';
import PhoneSlider from './PhoneSlider';
import mobileAppQr from '../../assets/images/PiscaRISK_Mobile App_QR.png';

const LandingPage = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
      
      const sections = ['hero', 'about', 'features', 'how-it-works', 'faq', 'download'];
      const scrollPosition = window.scrollY + 100;
      
      for (const section of sections) {
        const element = document.getElementById(section);
        if (element) {
          const offsetTop = element.offsetTop;
          const offsetBottom = offsetTop + element.offsetHeight;
          if (scrollPosition >= offsetTop && scrollPosition < offsetBottom) {
            setActiveSection(section);
            break;
          }
        }
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const navbarHeight = 70;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - navbarHeight;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
    setIsMobileMenuOpen(false); // Close mobile menu after clicking
  };

  // Features carousel functions
  const scrollFeatures = (direction) => {
    const track = document.getElementById('featuresTrack');
    if (track) {
      const cardWidth = track.querySelector('.piscarisk-feature-card').offsetWidth;
      const gap = 32;
      const scrollAmount = cardWidth + gap;
      
      track.scrollBy({
        left: direction * scrollAmount,
        behavior: 'smooth'
      });
      
      setTimeout(updateActiveDot, 100);
    }
  };

  const updateActiveDot = () => {
    const track = document.getElementById('featuresTrack');
    const dots = document.getElementById('featuresDots');
    if (!track || !dots) return;
    
    const scrollPosition = track.scrollLeft;
    const cardWidth = track.querySelector('.piscarisk-feature-card').offsetWidth;
    const gap = 32;
    const activeIndex = Math.round(scrollPosition / (cardWidth + gap));
    
    const dotsButtons = dots.querySelectorAll('.piscarisk-carousel-dot');
    dotsButtons.forEach((dot, index) => {
      if (index === activeIndex) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  };

  // Create dots after component mounts
  useEffect(() => {
    const createDots = () => {
      const track = document.getElementById('featuresTrack');
      const dotsContainer = document.getElementById('featuresDots');
      if (!track || !dotsContainer) return;
      
      const cards = track.querySelectorAll('.piscarisk-feature-card');
      dotsContainer.innerHTML = '';
      
      cards.forEach((_, index) => {
        const dot = document.createElement('button');
        dot.className = 'piscarisk-carousel-dot';
        if (index === 0) dot.classList.add('active');
        dot.addEventListener('click', () => {
          const cardWidth = track.querySelector('.piscarisk-feature-card').offsetWidth;
          const gap = 32;
          track.scrollTo({
            left: index * (cardWidth + gap),
            behavior: 'smooth'
          });
        });
        dotsContainer.appendChild(dot);
      });
    };
    
    createDots();
    
    const track = document.getElementById('featuresTrack');
    if (track) {
      track.addEventListener('scroll', updateActiveDot);
      return () => track.removeEventListener('scroll', updateActiveDot);
    }
  }, []);

  // Close mobile menu when window is resized to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768 && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobileMenuOpen]);

  return (
    <div className="piscarisk-landing">
      {/* NAVBAR */}
      <nav className={`piscarisk-nav ${isScrolled ? 'scrolled' : ''}`}>
        <div className="piscarisk-nav-container">
          <div className="piscarisk-logo" onClick={() => scrollToSection('hero')}>
            <img src={logo} alt="PiscaRISK" className="piscarisk-logo-img" />
            <span className="piscarisk-logo-text">PiscaRISK</span>
          </div>
          
          {/* Desktop Menu */}
          <div className="piscarisk-nav-menu">
            <button onClick={() => scrollToSection('about')} className={`piscarisk-nav-link ${activeSection === 'about' ? 'active' : ''}`}>About</button>
            <button onClick={() => scrollToSection('features')} className={`piscarisk-nav-link ${activeSection === 'features' ? 'active' : ''}`}>Features</button>
            <button onClick={() => scrollToSection('how-it-works')} className={`piscarisk-nav-link ${activeSection === 'how-it-works' ? 'active' : ''}`}>How It Works</button>
            <button onClick={() => scrollToSection('faq')} className={`piscarisk-nav-link ${activeSection === 'faq' ? 'active' : ''}`}>FAQs</button>
            <button onClick={() => navigate('/login')} className="piscarisk-nav-cta">Log In</button>
            <button onClick={() => scrollToSection('download')} className="piscarisk-nav-download">Download</button>
          </div>

          {/* Hamburger Menu Button - Mobile Only */}
          <button 
            className={`piscarisk-hamburger ${isMobileMenuOpen ? 'active' : ''}`}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        <div className={`piscarisk-mobile-menu ${isMobileMenuOpen ? 'open' : ''}`}>
          <button onClick={() => scrollToSection('about')} className="piscarisk-mobile-nav-link">About</button>
          <button onClick={() => scrollToSection('features')} className="piscarisk-mobile-nav-link">Features</button>
          <button onClick={() => scrollToSection('how-it-works')} className="piscarisk-mobile-nav-link">How It Works</button>
          <button onClick={() => scrollToSection('faq')} className="piscarisk-mobile-nav-link">FAQs</button>
          <button onClick={() => navigate('/login')} className="piscarisk-mobile-cta">Log In</button>
          <button onClick={() => scrollToSection('download')} className="piscarisk-mobile-download">Download</button>
        </div>
      </nav>

      {/* Rest of your component remains the same */}
      {/* HERO SECTION */}
      <section id="hero" className="piscarisk-hero">
        <div className="piscarisk-hero-container">
          <div className="piscarisk-hero-content">
            <h1 className="piscarisk-hero-title">
              Monitor Your Farm,
              <br />
              <span className="piscarisk-gradient">Assess Risks Anytime</span>
            </h1>
            <p className="piscarisk-hero-desc">
              PiscaRISK helps fish farmers monitor pond conditions, assess potential risks, 
              and submit reports through a single mobile platform.
            </p>
            <div className="piscarisk-hero-buttons">
              <a href="/apk/PiscaRisk-App.apk" download="PiscaRisk-App.apk" className="piscarisk-btn-primary" style={{ textDecoration: 'none' }}>
                Download App
              </a>
              <button onClick={() => navigate('/login')} className="piscarisk-btn-secondary">
                Log In →
              </button>
            </div>
          </div>
          <PhoneSlider />
        </div>
      </section>

      {/* ABOUT SECTION */}
      <section id="about" className="piscarisk-about">
        <div className="piscarisk-container">
          <h2 className="piscarisk-section-title">About PiscaRISK</h2>
          <p className="piscarisk-section-subtitle">Data-driven monitoring for sustainable aquaculture</p>
          
          <div className="piscarisk-about-grid">
            <div className="piscarisk-about-card">
              <div className="piscarisk-about-icon">🎯</div>
              <h3>Our Mission</h3>
              <p>To empower fish farmers with real-time environmental data, risk monitoring, and predictive analytics to help prevent fish diseases, improve water quality management, and optimize farm productivity.</p>
            </div>
            <div className="piscarisk-about-card">
              <div className="piscarisk-about-icon">👁️</div>
              <h3>Our Vision</h3>
              <p>To promote sustainable and resilient aquaculture communities through smart, data-driven technology that supports informed decision-making for farmers in the Philippines.</p>
            </div>
            <div className="piscarisk-about-card">
              <div className="piscarisk-about-icon">💡</div>
              <h3>Why Choose Us</h3>
              <p>Integrated weather forecasting, feeding and stock monitoring, and predictive risk analysis designed to help farmers anticipate environmental changes and reduce production losses.</p>
            </div>
          </div>

          <div className="piscarisk-about-context">
            <p className="piscarisk-about-highlight">
              PiscaRISK helps fish farmers <strong>anticipate and mitigate risks</strong> like disease outbreaks, 
              unpredictable weather, and poor water quality through real-time monitoring and predictive analytics.
            </p>
            <p className="piscarisk-about-partner">
              Developed with partner farms in <strong>Sto. Domingo, Bay, Laguna</strong> and supported by the 
              <strong> Bay Laguna LGU</strong>.
            </p>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION - HORIZONTAL CAROUSEL */}
      <section id="features" className="piscarisk-features">
        <div className="piscarisk-container">
          <h2 className="piscarisk-section-title">Key Features of PiscaRISK</h2>
          <p className="piscarisk-section-subtitle">Tools for monitoring farm conditions, managing stock, and supporting data-driven decisions</p>
          
          <div className="piscarisk-features-carousel">
            <button className="piscarisk-carousel-arrow prev" onClick={() => scrollFeatures(-1)}>❮</button>
            
            <div className="piscarisk-features-track" id="featuresTrack">
              {/* Feature cards remain the same */}
              <div className="piscarisk-feature-card">
                <div className="piscarisk-feature-icon">🌊</div>
                <h3>Farm Overview at a Glance</h3>
                <p>Track pond conditions, weather, and real-time updates from your farm.</p>
                <div className="piscarisk-feature-highlights">
                  <span>✓ Monitor your ponds</span>
                  <span>✓ Stay updated</span>
                  <span>✓ Manage your farm</span>
                </div>
                <p className="piscarisk-feature-description">
                  PiscaRISK is your smart companion for fish farm monitoring and reporting. 
                  It helps you track pond conditions and submit reports in real time.
                </p>
              </div>

              <div className="piscarisk-feature-card">
                <div className="piscarisk-feature-icon">⛈️</div>
                <h3>Stay Aware, Stay Protected</h3>
                <p>Stay updated on weather conditions and identify potential risks to protect your farm.</p>
                <div className="piscarisk-feature-highlights">
                  <span>✓ Weather insights</span>
                  <span>✓ Risk assessment</span>
                  <span>✓ Preparedness</span>
                </div>
                <p className="piscarisk-feature-description">
                  PiscaRISK keeps you informed about changing weather and environmental conditions. 
                  Quickly identify potential risks and track reported issues in your area.
                </p>
              </div>

              <div className="piscarisk-feature-card">
                <div className="piscarisk-feature-icon">🤝</div>
                <h3>Building a Safer Community Together</h3>
                <p>Submit reports and share real-time information to help protect your farm and community.</p>
                <div className="piscarisk-feature-highlights">
                  <span>✓ Submit reports</span>
                  <span>✓ Share updates</span>
                  <span>✓ Collaboration</span>
                </div>
                <p className="piscarisk-feature-description">
                  PiscaRISK enables users to report issues and share important updates with ease. 
                  Stay informed while helping others stay aware.
                </p>
              </div>

              <div className="piscarisk-feature-card">
                <div className="piscarisk-feature-icon">📍</div>
                <h3>Take PiscaRISK Anywhere</h3>
                <p>Monitor risks, assess conditions, and stay updated anytime using the PiscaRISK mobile app.</p>
                <div className="piscarisk-feature-highlights">
                  <span>✓ Access anywhere</span>
                  <span>✓ Monitor risks on-the-go</span>
                  <span>✓ Take action quickly</span>
                </div>
                <p className="piscarisk-feature-description">
                  Stay connected to safety wherever you go with the PiscaRISK mobile app. 
                  Monitor risks, assess conditions, and receive important updates directly from your phone.
                </p>
              </div>
            </div>
            
            <button className="piscarisk-carousel-arrow next" onClick={() => scrollFeatures(1)}>❯</button>
          </div>
          
          <div className="piscarisk-carousel-dots" id="featuresDots"></div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section id="how-it-works" className="piscarisk-howitworks">
        <div className="piscarisk-container">
          <h2 className="piscarisk-section-title">How It Works</h2>
          <p className="piscarisk-section-subtitle">
            A step-by-step process for accessing PiscaRISK and managing farm data
          </p>
          <div className="piscarisk-steps-container">
            
            <div className="piscarisk-step">
              <div className="piscarisk-step-number">01</div>
              <div className="piscarisk-step-icon">📝</div>
              <h3>Register</h3>
              <p>Create an account with your farm and role details</p>
            </div>

            <div className="piscarisk-step-arrow">→</div>

            <div className="piscarisk-step">
              <div className="piscarisk-step-number">02</div>
              <div className="piscarisk-step-icon">🔐</div>
              <h3>Account Verification</h3>
              <p>Admin reviews and activates user accounts</p>
            </div>

            <div className="piscarisk-step-arrow">→</div>

            <div className="piscarisk-step">
              <div className="piscarisk-step-number">03</div>
              <div className="piscarisk-step-icon">🔑</div>
              <h3>Login</h3>
              <p>Access the system using registered credentials</p>
            </div>

            <div className="piscarisk-step-arrow">→</div>

            <div className="piscarisk-step">
              <div className="piscarisk-step-number">04</div>
              <div className="piscarisk-step-icon">🌊</div>
              <h3>Monitor Farm Data</h3>
              <p>View pond conditions, weather updates, and stock information</p>
            </div>

            <div className="piscarisk-step-arrow">→</div>

            <div className="piscarisk-step">
              <div className="piscarisk-step-number">05</div>
              <div className="piscarisk-step-icon">📊</div>
              <h3>Submit & View Reports</h3>
              <p>Record observations and access risk insights in real time</p>
            </div>
            
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section id="faq" className="piscarisk-faq">
        <div className="piscarisk-container">
          <h2 className="piscarisk-section-title">Frequently Asked Questions</h2>
          <p className="piscarisk-section-subtitle">Got questions? We've got answers</p>

          <div className="piscarisk-faq-list">
            <div className="piscarisk-faq-item">
              <div className="piscarisk-faq-question">What is PiscaRISK?</div>
              <div className="piscarisk-faq-answer">
                PiscaRISK is a web and mobile-based platform that provides fish farm monitoring, risk analysis,
                and environmental data support for aquaculture farmers.
              </div>
            </div>

            <div className="piscarisk-faq-item">
              <div className="piscarisk-faq-question">Is PiscaRISK available for iOS?</div>
              <div className="piscarisk-faq-answer">
                Currently, PiscaRISK is only available for Android devices.
              </div>
            </div>

            <div className="piscarisk-faq-item">
              <div className="piscarisk-faq-question">Is PiscaRISK free to use?</div>
              <div className="piscarisk-faq-answer">
                Yes. PiscaRISK is free to use for registered fish farmers.
              </div>
            </div>

            <div className="piscarisk-faq-item">
              <div className="piscarisk-faq-question">How do I access PiscaRISK?</div>
              <div className="piscarisk-faq-answer">
                Users can access the system through the web platform or mobile application once registered and approved by an administrator.
              </div>
            </div>

            <div className="piscarisk-faq-item">
              <div className="piscarisk-faq-question">Can I use PiscaRISK offline?</div>
              <div className="piscarisk-faq-answer">
                Some previously loaded data can be viewed offline, but real-time updates and submissions require an internet connection.
              </div>
            </div>

            <div className="piscarisk-faq-item">
              <div className="piscarisk-faq-question">How is my data protected?</div>
              <div className="piscarisk-faq-answer">
                PiscaRISK implements standard security practices to protect user and farm data during system use.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DOWNLOAD SECTION */}
      <section id="download" className="piscarisk-download">
        <div className="piscarisk-container">
          <h2>Manage Your Farm More Effectively</h2>
          <p>Download the PiscaRISK mobile app to monitor farm conditions and access risk insights anytime.</p>

          <div className="piscarisk-download-grid">
            <div className="piscarisk-download-content">
              <a href="/apk/PiscaRisk-App.apk" download="PiscaRisk-App.apk" className="piscarisk-apk-btn">
                Download APK
              </a>
              <div className="piscarisk-features-list">
                <div className="piscarisk-feature-item">✓ Farm condition monitoring</div>
                <div className="piscarisk-feature-item">✓ Weather information and forecasts</div>
                <div className="piscarisk-feature-item">✓ Submit farm reports</div>
                <div className="piscarisk-feature-item">✓ Risk analysis and insights</div>
                <div className="piscarisk-feature-item">✓ Data-driven farm management support</div>
              </div>
            </div>

            <div className="piscarisk-qr-section">
              <div className="piscarisk-qr-container">
                <img
                  src={mobileAppQr}
                  alt="Scan to download PiscaRISK Mobile App"
                  className="piscarisk-qr-image"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = `https://quickchart.io/qr?text=${window.location.origin}/apk/PiscaRisk-App.apk&size=150`;
                  }}
                />
                <div className="piscarisk-qr-text">Scan to Download</div>
                <p>Available for Android devices</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="piscarisk-footer">
        <div className="piscarisk-container">
          <p>© 2025 PiscaRISK. Fish Farm Monitoring and Risk Management System</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;