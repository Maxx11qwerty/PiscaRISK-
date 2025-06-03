import jsPDF from 'jspdf';
import { logActivity, logMessages } from './logger';

// Common PDF generation function
const generatePDF = (data, headers, columnWidths, title, filename, currentUser, type) => {
  const doc = new jsPDF('landscape', 'mm', 'a4');
  
  // Add title and date
  doc.setFontSize(16);
  doc.text(title, 20, 20);
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 30);
  
  let y = 40;
  let x = 20;
  
  // Add headers
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  headers.forEach((header, i) => {
    doc.text(header, x, y);
    x += columnWidths[i];
  });
  
  // Add data rows
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  data.forEach((item, index) => {
    y = 50 + (index * 10);
    if (y > 190) {
      doc.addPage();
      y = 20;
    }
    
    x = 20;
    Object.values(item).forEach((value, i) => {
      doc.text(String(value || ''), x, y);
      x += columnWidths[i];
    });
  });
  
  doc.save(filename);
  logActivity('export', logMessages.export.pdfDownload(currentUser.username, type), currentUser.username);
};

// Export user points to PDF
export const exportUserPointsToPDF = (users, currentUser) => {
  const headers = ['Username', 'Full Name', 'Points', 'Status', 'Date Joined'];
  const columnWidths = [40, 60, 30, 30, 40];
  const data = users.map(user => ({
    username: user.username || '',
    fullName: user.fullName || '',
    points: (user.points || 0).toString(),
    status: user.status || '',
    dateJoined: user.dateJoined || ''
  }));
  
  generatePDF(
    data,
    headers,
    columnWidths,
    'PiscaRisk Fish Farmer Points Report',
    'piscarisk_fishfarmer_points.pdf',
    currentUser,
    'fish farmer points'
  );
};

// Export rewards to PDF
export const exportRewardsToPDF = (rewards, currentUser) => {
  const headers = ['Reward ID', 'Name', 'Points', 'Created At', 'Last Modified'];
  const columnWidths = [40, 60, 30, 40, 40];
  const data = rewards.map(reward => ({
    rewardId: reward.rewardId || '',
    name: reward.name || '',
    points: reward.points.toString(),
    createdAt: new Date(reward.createdAt).toLocaleDateString(),
    lastModified: new Date(reward.lastModified).toLocaleDateString()
  }));
  
  generatePDF(
    data,
    headers,
    columnWidths,
    'PiscaRisk Rewards Report',
    'piscarisk_rewards.pdf',
    currentUser,
    'rewards'
  );
};

// Prepare user points data for CSV
export const prepareUserPointsCSVData = (users) => {
  return users.map(user => ({
    'Username': user.username || '',
    'Full Name': user.fullName || '',
    'Points': user.points || 0,
    'Status': user.status || '',
    'Date Joined': user.dateJoined || '',
    'Last Modified': user.lastModified || ''
  }));
};

// Prepare rewards data for CSV
export const prepareRewardsCSVData = (rewards) => {
  return rewards.map(reward => ({
    'Reward ID': reward.rewardId || '',
    'Name': reward.name || '',
    'Points': reward.points || 0,
    'Created At': new Date(reward.createdAt).toLocaleDateString(),
    'Last Modified': new Date(reward.lastModified).toLocaleDateString()
  }));
};

// Generate CSV filename with timestamp
const generateCSVFilename = (prefix) => {
  const timestamp = new Date().toISOString().split('T')[0];
  return `piscarisk_${prefix}_${timestamp}.csv`;
};

// Generate CSV filename for user points
export const generateUserPointsCSVFilename = () => generateCSVFilename('fishfarmer_points');

// Generate CSV filename for rewards
export const generateRewardsCSVFilename = () => generateCSVFilename('rewards');

// Handle CSV export logging
const handleCSVExport = (currentUser, type) => {
  logActivity('export', logMessages.export.csvDownload(currentUser.username, type), currentUser.username);
};

// Handle user points CSV export
export const handleUserPointsCSVExport = (currentUser) => handleCSVExport(currentUser, 'fish farmer points');

// Handle rewards CSV export
export const handleRewardsCSVExport = (currentUser) => handleCSVExport(currentUser, 'rewards'); 