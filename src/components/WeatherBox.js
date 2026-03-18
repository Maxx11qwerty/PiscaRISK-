import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from 'react-i18next';
import {  
  FaCloud, 
  FaClock,
  FaSyncAlt,
  FaCompass,
  FaWater,
  FaSun
} from 'react-icons/fa';
import './WeatherBox.css';

const WeatherBox = ({isModal = false, weatherData, lastUpdated, refreshWeather, onExport }) => {
  const { t } = useTranslation();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showExportOptions, setShowExportOptions] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Memoize format function to prevent re-creation on every render
  const formatTime = useMemo(() => {
    return (timestamp) => {
      return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
  }, []);

  if (!weatherData) return <div>{t('weather.failedToLoad')}</div>;

  return (
    <div className="weather-dashboard">
      <div className="weather-header">
        <h1 className="weather-title">{t('weather.weatherDetails')}</h1>
        <div className="weather-time">
          <div className="weather-export-wrapper">
            <button
              type="button"
              className="weather-export-text-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowExportOptions((prev) => !prev);
              }}
            >
              Export Weather Data
            </button>
            {showExportOptions && (
              <div className="weather-export-dropdown">
                <button
                  type="button"
                  className="weather-export-option"
                  onClick={() => {
                    if (typeof onExport === 'function') onExport('pdf');
                    setShowExportOptions(false);
                  }}
                >
                  Export as PDF
                </button>
                <button
                  type="button"
                  className="weather-export-option"
                  onClick={() => {
                    if (typeof onExport === 'function') onExport('csv');
                    setShowExportOptions(false);
                  }}
                >
                  Export as CSV
                </button>
              </div>
            )}
          </div>
          <span className="time-updating">
            {currentTime.toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
          <button onClick={refreshWeather} className="refresh-btn" type="button">
            <FaSyncAlt />
          </button>
        </div>
      </div>

      <div className="weather-grid">
        {/* Temperature Card */}
        <div className="weather-card temperature-card">
          <div className="weather-card-header">{t('weather.temperature')}</div>
          <div className="temperature-display">
            <span className="temperature-value">{Math.round(weatherData.main.temp)}</span>
            <span className="temperature-unit">°</span>
            <span className="temperature-status">{t('weather.steady')}</span>
          </div>
          <div className="detail-description">
            {t('weather.steadyAtCurrent', { temp: Math.round(weatherData.main.temp) })}
          </div>
        </div>

        {/* Feels Like Card */}
        <div className="weather-card">
          <div className="weather-card-header">{t('weather.feelsLike')}</div>
          <div className="detail-value">{Math.round(weatherData.main.feels_like)}°</div>
          <div className="detail-secondary">{t('weather.dominantFactor')}</div>
          <div className="detail-description">
            {t('weather.feelsComparison', { 
              comparison: weatherData.main.feels_like > weatherData.main.temp ? t('weather.warmer') : t('weather.cooler') 
            })}
          </div>
        </div>

        {/* Humidity Card */}
        <div className="weather-card">
          <div className="weather-card-header">{t('weather.humidity')}</div>
          <div className="detail-value">{weatherData.main.humidity}%</div>
          <div className="detail-secondary">{t('weather.relativeHumidity')}</div>
          <div className="humidity-level">
            <div 
              className="humidity-level-fill" 
              style={{ width: `${weatherData.main.humidity}%` }}
            ></div>
          </div>
          <div className="detail-description">
            {weatherData.main.humidity > 70 ? t('weather.veryHumid') : 
             weatherData.main.humidity > 40 ? t('weather.moderateHumidity') : t('weather.dryConditions')}
          </div>
        </div>

       {/* Conditions Card */}
        <div className="weather-card">
          <div className="weather-card-header">{t('weather.conditions')}</div>
          <div className="detail-value">
            {weatherData.weather[0].main}
          </div>
          <div className="detail-secondary">
            {weatherData.weather[0].description}
          </div>
          <div className="weather-icon">
            <FaCloud style={{ fontSize: '2rem', marginTop: '0.5rem' }} />
          </div>
        </div>

        {/* Wind Card */}
        <div className="weather-card">
          <div className="weather-card-header">{t('weather.wind')}</div>
          <div className="wind-display">
            <FaCompass 
              style={{ 
                transform: `rotate(${weatherData.wind.deg || 0}deg)`,
                fontSize: '1.5rem',
                marginRight: '0.5rem'
              }} 
            />
            <span className="detail-value">
              {weatherData.wind.speed} m/s
            </span>
          </div>
          {weatherData.wind.gust && (
            <div className="weather-detail">
              <div className="detail-label">{t('weather.windGust')}</div>
              <div className="detail-value">{weatherData.wind.gust} m/s</div>
            </div>
          )}
        </div>

        {/* Pressure Card */}
        <div className="weather-card">
          <div className="weather-card-header">{t('weather.pressure')}</div>
          <div className="detail-value">{weatherData.main.pressure} hPa</div>
          <div className="detail-secondary">{t('weather.atmosphericPressure')}</div>
          <div className="detail-description">
            {weatherData.main.pressure > 1013 ? t('weather.higherThanAverage') : t('weather.lowerThanAverage')}
          </div>
        </div>

        {/* Sea Level Pressure Card */}
        {weatherData.main.sea_level && (
          <div className="weather-card">
            <div className="weather-card-header">{t('weather.seaLevelPressure')}</div>
            <div className="detail-value">{weatherData.main.sea_level} hPa</div>
                          <div className="detail-secondary">{t('weather.atSeaLevel')}</div>
            <div className="weather-icon">
              <FaWater style={{ fontSize: '1.5rem', marginTop: '0.5rem' }} />
            </div>
          </div>
        )}

        {/* Sunrise/Sunset Card */}
          <div className="weather-card">
          <div className="weather-card-header">{t('weather.sun')}</div>
          <div className="sun-moon-times">
            <div className="time-row">
              <FaSun className="time-icon" style={{ color: '#FFD700' }} />
              <span className="time-label">{t('weather.sunrise')}:</span>
              <span className="time-value">
                {formatTime(weatherData.sys?.sunrise ?? weatherData.sunrise)}
              </span>
            </div>
            <div className="time-row">
              <FaSun className="time-icon" style={{ color: '#FF8C00' }} />
              <span className="time-label">{t('weather.sunset')}:</span>
              <span className="time-value">
                {formatTime(weatherData.sys?.sunset ?? weatherData.sunset)}
              </span>
            </div>
          </div>
        </div>
      </div>
      {!isModal && (
        <div className="last-updated">
          <FaClock className="update-icon" />
            {t('weather.lastUpdated')}: {new Date().toLocaleTimeString()}
          </div>
      )}
    </div>
  );
};

export default WeatherBox;