import React from 'react';
import { useTranslation } from 'react-i18next';
import './RefreshStatusMessage.css';

/**
 * @param {'default' | 'onDark' | 'onHeader'} variant - background context for readable colors
 */
const RefreshStatusMessage = ({ status, variant = 'default', className = '' }) => {
  const { t } = useTranslation();
  if (!status) return null;

  const messageByStatus = {
    loading: t('common.refreshingData'),
    success: t('common.refreshSuccess'),
    error: t('common.refreshFailed'),
  };

  return (
    <p
      className={`refresh-status-message refresh-status-message--${status} refresh-status-message--${variant} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      {messageByStatus[status] || ''}
    </p>
  );
};

export default RefreshStatusMessage;
