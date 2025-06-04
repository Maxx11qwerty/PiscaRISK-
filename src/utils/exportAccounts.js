import jsPDF from 'jspdf';
import { logActivity, logMessages } from './logger';

// Export account data to PDF
export const exportAccountToPDF = (users, currentUser) => {
  const doc = new jsPDF('landscape', 'mm', 'a4');
  
  // Helper function to format timestamp
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    
    try {
      // Handle Firestore timestamp
      if (timestamp.seconds) {
        const date = new Date(timestamp.seconds * 1000);
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
      }
      
      // Handle ISO string or other date string
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
      }
      
      return String(timestamp);
    } catch (error) {
      console.warn('Error formatting date:', error);
      return String(timestamp);
    }
  };

  // Function to add headers and title to a page
  const addPageHeaders = (y) => {
    // Add title and date
    doc.setFontSize(16);
    doc.text('PiscaRisk Account Management Report', 20, y);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, y + 10);
    
    // Add table headers
    const headers = ['Username', 'Full Name', 'Role', 'Status', 'Email', 'Contact', 'Date Joined'];
    
    // Calculate column widths for landscape mode - adjusted for better spacing
    const columnWidths = [30, 40, 25, 25, 60, 35, 35]; // Increased email width, adjusted others
    let x = 20;
    
    // Add headers
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    headers.forEach((header, i) => {
      doc.text(header, x, y + 20);
      x += columnWidths[i];
    });
    
    return { columnWidths, headerHeight: y + 35 }; // Increased spacing after headers
  };
  
  // Add first page headers and get initial values
  let y = 45; // Increased initial y position
  const { columnWidths, headerHeight } = addPageHeaders(20);
  const rowHeight = 10; // Height of each row
  const pageHeight = 190; // Maximum height before new page
  const marginBottom = 20; // Bottom margin
  
  // Add data rows
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  users.forEach((user, index) => {
    // Check if we need a new page
    if (y + rowHeight > pageHeight - marginBottom) {
      doc.addPage();
      y = headerHeight; // Start after headers on new page
      addPageHeaders(20); // Add headers to new page
      // Reset font to normal for data rows
      doc.setFont(undefined, 'normal');
      doc.setFontSize(10);
    }
    
    let x = 20; // Declare x here for each row
    // Convert all values to strings and handle null/undefined
    const values = [
      String(user.username || ''),
      String(user.fullName || ''),
      String(user.role || ''),
      String(user.status || ''),
      String(user.email || ''),
      String(user.contactNumber || ''),
      formatTimestamp(user.dateJoined)
    ];
    
    // Calculate maximum height needed for this row
    let maxHeight = 0;
    values.forEach((value, i) => {
      const lines = doc.splitTextToSize(value, columnWidths[i] - 2); // -2 for padding
      const height = lines.length * 5; // 5mm per line
      maxHeight = Math.max(maxHeight, height);
    });
    
    // If this row would cause overflow, start a new page
    if (y + maxHeight > pageHeight - marginBottom) {
      doc.addPage();
      y = headerHeight;
      addPageHeaders(20);
      // Reset font to normal for data rows
      doc.setFont(undefined, 'normal');
      doc.setFontSize(10);
    }
    
    // Add the row content
    values.forEach((value, i) => {
      // Truncate long values if needed
      let displayValue = value;
      if (i === 4 && value.length > 30) { // Email column
        displayValue = value.substring(0, 27) + '...';
      }
      
      // Split text into multiple lines if needed
      const lines = doc.splitTextToSize(displayValue, columnWidths[i] - 2);
      lines.forEach((line, lineIndex) => {
        doc.text(line, x, y + (lineIndex * 5));
      });
      
      x += columnWidths[i];
    });
    
    // Move to next row, accounting for multi-line content
    y += maxHeight + 5; // Add 5mm padding between rows
  });
  
  doc.save('piscarisk_User_Accounts.pdf');
  logActivity('export', logMessages.export.pdfDownload(currentUser.username, 'accounts'), currentUser.username);
};

// Prepare CSV data for accounts
export const prepareAccountCSVData = (users) => {
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    
    try {
      // Handle Firestore timestamp
      if (timestamp.seconds) {
        const date = new Date(timestamp.seconds * 1000);
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
      }
      
      // Handle ISO string or other date string
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
      }
      
      return String(timestamp);
    } catch (error) {
      console.warn('Error formatting date:', error);
      return String(timestamp);
    }
  };

  return users.map(user => ({
    'Username': user.username || '',
    'Full Name': user.fullName || '',
    'Role': user.role || '',
    'Status': user.status || '',
    'Email': user.email || '',
    'Contact Number': user.contactNumber || '',
    'Address': user.address || '',
    'Date Joined': formatTimestamp(user.dateJoined),
    'Last Modified': formatTimestamp(user.lastModified)
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