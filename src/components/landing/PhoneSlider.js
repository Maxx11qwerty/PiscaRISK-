// src/components/landing/PhoneSlider.jsx
import React, { useState, useEffect } from 'react';
import './PhoneSlider.css';
import mobDashboard from '../../assets/images/mob_dashboard.png';
import mobRisk from '../../assets/images/mob_risk.png';
import mobWeather from '../../assets/images/mob_weather.png';
import mobReports from '../../assets/images/mob_reports.png';

const PhoneSlider = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const slides = [
    {
      image: mobDashboard,
      title: 'Farm Dashboard',
      description: 'Monitor pond conditions and report statistics'
    },
    {
      image: mobWeather,
      title: 'Weather Updates',
      description: 'Real-time weather forecasts and alerts'
    },
    {
      image: mobRisk,
      title: 'Risk Assessment',
      description: 'Comprehensive risk analysis for your fish ponds'
    },
    {
        image: mobReports,
        title: 'Submit Reports',
        description: 'Submit Reports'
      }

  ];

  useEffect(() => {
    if (isPaused) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % slides.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [isPaused, slides.length]);

  const goToSlide = (index) => {
    setCurrentIndex(index);
  };

  return (
    <div 
      className="piscarisk-phone-slider"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="piscarisk-phone">
        <div className="piscarisk-phone-notch"></div>
        <div className="piscarisk-phone-screen">
          <div className="piscarisk-slide-container">
            <div 
              className="piscarisk-slides"
              style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            >
              {slides.map((slide, index) => (
                <div key={index} className="piscarisk-slide">
                  <img 
                    src={slide.image} 
                    alt={slide.title}
                    className="piscarisk-slide-image"
                  />
                </div>
              ))}
            </div>
          </div>
          
          {/* Dots Indicator */}
          <div className="piscarisk-slider-dots">
            {slides.map((_, index) => (
              <button
                key={index}
                className={`piscarisk-slider-dot ${index === currentIndex ? 'active' : ''}`}
                onClick={() => goToSlide(index)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhoneSlider;