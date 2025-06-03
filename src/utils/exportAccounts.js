import jsPDF from 'jspdf';
import { logActivity, logMessages } from './logger';

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
    doc.text(header, x, y);
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
    doc.text(user.username || '', x, y);
    x += columnWidths[0];
    doc.text(user.fullName || '', x, y);
    x += columnWidths[1];
    doc.text(user.role || '', x, y);
    x += columnWidths[2];
    doc.text(user.status || '', x, y);
    x += columnWidths[3];
    doc.text(user.email || '', x, y);
    x += columnWidths[4];
    doc.text(user.contactNumber || '', x, y);
    x += columnWidths[5];
    doc.text(user.dateJoined || '', x, y);
  });
  
  doc.save('piscarisk_User_Accounts.pdf');
  logActivity('export', logMessages.export.pdfDownload(currentUser.username, 'accounts'), currentUser.username);
};

// Prepare CSV data for accounts
export const prepareAccountCSVData = (users) => {
  return users.map(user => ({
    'Username': user.username || '',
    'Full Name': user.fullName || '',
    'Role': user.role || '',
    'Status': user.status || '',
    'Email': user.email || '',
    'Contact Number': user.contactNumber || '',
    'Address': user.address || '',
    'Date Joined': user.dateJoined || '',
    'Last Modified': user.lastModified || ''
  }));
};

// Generate CSV filename with timestamp
export const generateAccountCSVFilename = () => {
  const timestamp = new Date().toISOString().split('T')[0];
  return `piscarisk_User_Accounts_${timestamp}.csv`;
};

// Handle CSV export
export const handleAccountCSVExport = (currentUser) => {
  logActivity('export', logMessages.export.csvDownload(currentUser.username, 'accounts'), currentUser.username);
}; 