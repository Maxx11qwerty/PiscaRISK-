import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSecureItem, setSecureItem } from '../utils/secureStorage';

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    // Get language from secure storage or default to English
    return getSecureItem('language') || 'en';
  });

  useEffect(() => {
    // Save language preference to secure storage
    setSecureItem('language', language);
  }, [language]);

  const value = {
    language,
    setLanguage,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};
