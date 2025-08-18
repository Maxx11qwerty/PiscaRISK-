import jsPDF from 'jspdf';
import { logActivity, logMessages } from './logger';

// Helper: ensure value is a string for jsPDF
const safeText = (value) => {
  if (value === null || value === undefined) return '';
  // Avoid objects
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

// Helper: format dates (supports Firestore Timestamp, ISO strings, Date, fallback)
const formatDate = (value) => {
  if (!value) return '';
  try {
    // Firestore Timestamp
    if (value && typeof value === 'object' && ('seconds' in value || 'nanoseconds' in value)) {
      const date = new Date((value.seconds || 0) * 1000);
      return date.toLocaleDateString();
    }
    // ISO string or other date-like
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toLocaleDateString();
    return safeText(value);
  } catch {
    return safeText(value);
  }
};

// Helper: normalize phone/contact number to string without decimals
const formatContact = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Math.trunc(value).toString();
  const s = String(value);
  // Strip decimal part if any (e.g., spreadsheet-imported numbers)
  return s.includes('.') ? s.split('.')[0] : s;
};

// Export account data to PDF
export const exportAccountToPDF = (users, currentUser) => {
  const doc = new jsPDF('landscape', 'mm', 'a4');
  
  // Add title and date
  doc.setFontSize(16);
  doc.text('PiscaRisk Account Management Report', 20, 20);
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 30);
  
  // Add table headers
  const headers = ['Username', 'Full Name', 'Role', 'Status', 'Email', 'Contact', 'Date Joined'];
  let y = 40;
  
  // Calculate column widths for landscape mode
  const columnWidths = [35, 45, 25, 25, 50, 35, 30];
  let x = 20;
  
  // Add headers
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  headers.forEach((header, i) => {
    doc.text(safeText(header), x, y);
    x += columnWidths[i];
  });
  
  // Add data rows
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  users.forEach((user, index) => {
    y = 50 + (index * 10);
    if (y > 190) {
      doc.addPage();
      y = 20;
    }
    
    x = 20;
    doc.text(safeText(user.username), x, y);
    x += columnWidths[0];
    doc.text(safeText(user.fullName), x, y);
    x += columnWidths[1];
    doc.text(safeText(user.role), x, y);
    x += columnWidths[2];
    doc.text(safeText(user.status), x, y);
    x += columnWidths[3];
    doc.text(safeText(user.email), x, y);
    x += columnWidths[4];
    doc.text(formatContact(user.contactNumber), x, y);
    x += columnWidths[5];
    doc.text(formatDate(user.dateJoined), x, y);
  });
  
  doc.save('piscarisk_User_Accounts.pdf');
  logActivity('export', logMessages.export.pdfDownload(currentUser.username, 'accounts'), currentUser.username);
};

// Prepare CSV data for accounts
export const prepareAccountCSVData = (users) => {
  return users.map(user => ({
    'Username': safeText(user.username),
    'Full Name': safeText(user.fullName),
    'Role': safeText(user.role),
    'Status': safeText(user.status),
    'Email': safeText(user.email),
    'Contact Number': formatContact(user.contactNumber),
    'Address': safeText(user.address),
    'Date Joined': formatDate(user.dateJoined),
    'Last Modified': formatDate(user.lastModified)
  }));
};

// Generate CSV filename with timestamp
export const generateAccountCSVFilename = () => {
  const timestamp = new Date().toISOString().split('T')[0];
  return `piscarisk_User_Accounts_${timestamp}.csv`;
};

// Handle CSV export
export const handleAccountCSVExport = (currentUser) => {
  try {
    // Get the current users data from localStorage
    const users = JSON.parse(localStorage.getItem('currentUsers') || '[]');
    
    if (users.length === 0) {
      alert('No users data available for export. Please try again.');
      return;
    }
    
    // Prepare CSV data
    const csvData = prepareAccountCSVData(users);
    
    // Convert to CSV string
    const headers = Object.keys(csvData[0]);
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => 
        headers.map(header => {
          const value = row[header];
          // Escape commas and quotes in CSV
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = generateAccountCSVFilename();
    link.style.display = 'none';
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    URL.revokeObjectURL(url);
    
    // Log the export activity
    logActivity('export', logMessages.export.csvDownload(currentUser.username, 'accounts'), currentUser.username);
  } catch (error) {
    console.error('Error during CSV export:', error);
    alert('CSV export failed. Please try again.');
  }
}; 