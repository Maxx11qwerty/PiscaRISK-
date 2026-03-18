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

// Helper: format role nicely for export (no underscores, proper casing)
const formatRoleForExport = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  const r = raw.toLowerCase();

  if (r === 'fish_farmer' || r === 'fish farmer') return 'Fish Farmer';
  if (
    r === 'tech_officer' ||
    r === 'tech officer' ||
    r === 'new_main_tech_officer' ||
    r === 'new main tech officer'
  ) {
    return 'Tech Officer';
  }
  if (
    r === 'temp_tech_officer' ||
    r === 'temporary tech officer' ||
    r === 'temporarytechofficer'
  ) {
    return 'Temporary Tech Officer';
  }
  if (r === 'admin') return 'Admin';
  if (r === 'super_admin' || r === 'super admin') return 'Super Admin';

  // Fallback: replace underscores with spaces and title‑case
  const cleaned = raw.replace(/_/g, ' ');
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Export account data to PDF
export const exportAccountToPDF = (users, currentUser) => {
  const doc = new jsPDF('landscape', 'mm', 'a4');
  
  // Add title and date
  doc.setFontSize(16);
  doc.text('PiscaRisk Account Management Report', 20, 20);
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 30);
  
  // Table setup
  // Keep widths within A4 landscape (297mm) allowing for margins.
  const headers = ['Username', 'Full Name', 'Farm', 'Address', 'Role', 'Status', 'Email', 'Contact', 'Date Joined'];
  const columnWidths = [30, 38, 26, 46, 22, 18, 48, 24, 22]; // sums to 274mm
  const startX = 12;
  const headerY = 40;
  const firstRowY = 50;
  const bottomMargin = 190; // maximum Y before starting a new page

  const drawHeaders = () => {
    let x = startX;
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    headers.forEach((header, i) => {
      doc.text(safeText(header), x, headerY);
      x += columnWidths[i];
    });
  };

  // Draw headers on first page
  drawHeaders();

  // Add data rows
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  let y = firstRowY;
  users.forEach((user) => {
    // Prepare text and wrapping for columns that can be long
    const usernameText = safeText(user.username);
    const fullNameText = safeText(user.fullName);
    // Prefer farmName (resolved in AccountManagement) and fall back to raw farm ID
    const farmText = safeText(user.farmName || user.farm);
    const addressText = safeText(user.address);
    const roleText = formatRoleForExport(user.role);
    const statusText = safeText(user.status);
    const emailText = safeText(user.email);
    const contactText = formatContact(user.contactNumber);
    const dateJoinedText = formatDate(user.dateJoined);

    // Wrap long fields so they don't overlap into the next column
    const usernameLines = doc.splitTextToSize(usernameText, columnWidths[0] - 2);
    const fullNameLines = doc.splitTextToSize(fullNameText, columnWidths[1] - 2);
    const farmLines = doc.splitTextToSize(farmText, columnWidths[2] - 2);
    const addressLines = doc.splitTextToSize(addressText, columnWidths[3] - 2);
    const roleLines = doc.splitTextToSize(roleText, columnWidths[4] - 2);
    const emailLines = doc.splitTextToSize(emailText, columnWidths[6] - 2);

    const lineCount = Math.max(
      usernameLines.length,
      fullNameLines.length,
      farmLines.length,
      addressLines.length,
      roleLines.length,
      emailLines.length,
      1
    );
    const rowHeight = lineCount * 5; // 5mm per line

    // If we're near the bottom, add a new page and redraw headers
    if (y + rowHeight > bottomMargin) {
      doc.addPage('landscape', 'mm', 'a4');
      // Re-draw title and date on new page for context
      doc.setFontSize(16);
      doc.text('PiscaRisk Account Management Report', 20, 20);
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 30);
      drawHeaders();
      y = firstRowY;
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
    }

    let x = startX;
    // Username (wrapped)
    doc.text(usernameLines, x, y);
    x += columnWidths[0];

    // Full name (wrapped)
    doc.text(fullNameLines, x, y);
    x += columnWidths[1];

    // Farm (wrapped)
    doc.text(farmLines, x, y);
    x += columnWidths[2];

    // Address (wrapped)
    doc.text(addressLines, x, y);
    x += columnWidths[3];

    // Role (wrapped)
    doc.text(roleLines, x, y);
    x += columnWidths[4];

    // Status (single line)
    doc.text(statusText, x, y);
    x += columnWidths[5];

    // Email (wrapped)
    doc.text(emailLines, x, y);
    x += columnWidths[6];

    // Contact (single line)
    doc.text(contactText, x, y);
    x += columnWidths[7];

    // Date joined (single line)
    doc.text(dateJoinedText, x, y);

    y += rowHeight;
  });
  
  doc.save('piscarisk_User_Accounts.pdf');
  logActivity('export', logMessages.export.pdfDownload(currentUser.username, 'accounts'), currentUser.username);
};

// Prepare CSV data for accounts
export const prepareAccountCSVData = (users) => {
  return users.map(user => ({
    'Username': safeText(user.username),
    'Full Name': safeText(user.fullName),
    'Farm': safeText(user.farmName || user.farm),
    'Address': safeText(user.address),
    'Role': formatRoleForExport(user.role),
    'Status': safeText(user.status),
    'Email': safeText(user.email),
    'Contact Number': formatContact(user.contactNumber),
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