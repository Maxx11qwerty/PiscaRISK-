import { jsPDF } from "jspdf";
import { logActivity, logMessages } from './logger';

// Helper function to format role display (matches Logs.js logic)
const formatRoleDisplay = (log) => {
  if (!log.role || log.role === 'Unknown') return '-';
  const roleLower = String(log.role).toLowerCase().trim();
  if (roleLower === 'temp_tech_officer' || roleLower === 'temporary tech officer' || roleLower === 'temporarytechofficer') {
    return 'Temporary Tech Officer';
  } else if (roleLower === 'tech_officer' || roleLower === 'tech officer' || roleLower === 'new_main_tech_officer' || roleLower === 'new main tech officer') {
    return 'Tech Officer';
  } else if (roleLower === 'fish_farmer' || roleLower === 'fish farmer') {
    return 'Fish Farmer';
  } else if (roleLower === 'super_admin' || roleLower === 'super admin') {
    return 'Super Admin';
  } else if (roleLower === 'admin') {
    // Check if it's Farm Admin
    if (log.userFarm || log.farm) {
      return 'Farm Admin';
    }
    return 'Admin';
  } else {
    // Return formatted role (capitalize first letter of each word)
    return String(log.role)
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
};

// Helper function to get action display (matches Logs.js logic)
const getActionDisplay = (log) => {
  if (!log) return 'Unknown';
  const message = String(log.message || '').toLowerCase();
  const category = String(log.category || '').toLowerCase();
  
  // Extract action from message patterns
  if (message.includes('logged out') || message.includes('logout')) {
    return 'Logout';
  }
  if (message.includes('logged in') || message.includes('login')) {
    return 'Login';
  }
  if (message.includes('account updated') || message.includes('updated')) {
    return 'Account Updated';
  }
  if (message.includes('password changed') || message.includes('password change')) {
    return 'Password Changed';
  }
  if (message.includes('profile') && (message.includes('updated') || message.includes('change'))) {
    return 'Profile Updated';
  }
  if (message.includes('selected') || message.includes('deselected')) {
    return 'Account';
  }
  if (message.includes('export')) {
    return 'Export';
  }
  if (message.includes('feedback')) {
    return 'Feedback';
  }
  if (message.includes('report')) {
    return 'Report';
  }
  if (message.includes('deleted')) {
    return 'Delete';
  }
  
  // Fallback to category formatting
  const categoryMap = {
    'phone_verification': 'Phone Verification'
  };
  
  if (categoryMap[category]) {
    return categoryMap[category];
  }
  
  if (category) {
    return category
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  return 'Unknown';
};

// Helper function to get source type (matches Logs.js logic)
const getSourceType = (log) => {
  if (log.isMobileUser) {
    return 'Mobile';
  }
  if (log.source) {
    return String(log.source).charAt(0).toUpperCase() + String(log.source).slice(1).toLowerCase();
  }
  return 'Web';
};

// Helper function to decode HTML entities
const decodeHtml = (str = '') => {
  const map = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&nbsp;': ' '
  };
  return str.replace(/&[#\w]+;/g, (entity) => map[entity] || entity);
};

export const exportLogs = async (logs, format, currentUser) => {
  try {
    // Log export start
    await logActivity('export', logMessages.export.exportStart(currentUser.username, 'logs'), currentUser.username);

    if (format === 'csv') {
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `piscarisk_logs_${timestamp}.csv`;
      
      // Create CSV content with all table columns
      let csvContent = "Timestamp,User,Role,Action,Details,Source\n";
      
      logs.forEach(log => {
        const timestamp = log.timestamp 
          ? new Date(log.timestamp).toLocaleString('en-US', {
              month: '2-digit',
              day: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            })
          : 'N/A';
        const user = log.username || 'Unknown User';
        const role = formatRoleDisplay(log);
        const action = getActionDisplay(log);
        const details = `"${decodeHtml(log.message || '').replace(/"/g, '""')}"`; // Escape quotes and decode HTML
        const source = getSourceType(log);
        
        csvContent += `${timestamp},"${user}","${role}","${action}",${details},"${source}"\n`;
      });
      
      // Add BOM for proper Excel encoding
      const BOM = '\uFEFF';
      const csvWithBOM = BOM + csvContent;
      
      // Create and download the CSV file
      const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();

      // Log successful CSV export
      await logActivity('export', logMessages.export.csvDownload(currentUser.username, 'logs'), currentUser.username);
    }
    else if (format === 'pdf') {
      const doc = new jsPDF({ 
        orientation: "landscape", 
        unit: "mm", 
        format: "a4",
        compress: true
      });
      
      // Color scheme
      const colors = {
        primary: '#1a5276',
        secondary: '#2874a6',
        accent: '#3498db',
        text: '#2c3e50',
        lightText: '#7f8c8d',
        headerBg: '#e8f4f8',
        border: '#d0d0d0'
      };

      // Font styles
      const styles = {
        title: { size: 18, style: 'bold', color: colors.primary },
        subtitle: { size: 10, style: 'normal', color: colors.lightText },
        header: { size: 10, style: 'bold', color: colors.primary },
        body: { size: 9, style: 'normal', color: colors.text },
        footer: { size: 8, style: 'italic', color: colors.lightText }
      };

      const pageWidth = 297; // A4 landscape width
      const pageHeight = 210; // A4 landscape height
      const margin = 15;
      const headerHeight = 10;
      const rowHeight = 8;
      let yPos = 20;
      let pageNum = 1;

      // Helper function to add header row
      const addTableHeader = (doc, yPos) => {
        const colWidths = [40, 35, 35, 35, 110, 25]; // Timestamp, User, Role, Action, Details, Source
        const headers = ['Timestamp', 'User', 'Role', 'Action', 'Details', 'Source'];
        let xPos = margin;
        
        // Header background
        doc.setFillColor(240, 240, 240);
        doc.rect(margin, yPos - 6, pageWidth - (margin * 2), headerHeight, 'F');
        
        // Header text
        doc.setFontSize(styles.header.size);
        doc.setFont('helvetica', styles.header.style);
        doc.setTextColor(styles.header.color);
        
        headers.forEach((header, index) => {
          doc.text(header, xPos, yPos);
          xPos += colWidths[index];
        });
        
        return yPos + 4;
      };

      // Helper function to add a log row
      const addLogRow = (doc, log, yPos, startX) => {
        const colWidths = [40, 35, 35, 35, 110, 25];
        let xPos = startX;
        
        doc.setFontSize(styles.body.size);
        doc.setFont('helvetica', styles.body.style);
        doc.setTextColor(styles.body.color);
        
        // Timestamp
        const timestamp = log.timestamp 
          ? new Date(log.timestamp).toLocaleString('en-US', {
              month: '2-digit',
              day: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            })
          : 'N/A';
        const timestampLines = doc.splitTextToSize(timestamp, colWidths[0] - 2);
        timestampLines.forEach((line, idx) => {
          doc.text(line, xPos, yPos + (idx * 4));
        });
        xPos += colWidths[0];
        
        // User
        const user = log.username || 'Unknown User';
        const userLines = doc.splitTextToSize(user, colWidths[1] - 2);
        userLines.forEach((line, idx) => {
          doc.text(line, xPos, yPos + (idx * 4));
        });
        xPos += colWidths[1];
        
        // Role
        const role = formatRoleDisplay(log);
        const roleLines = doc.splitTextToSize(role, colWidths[2] - 2);
        roleLines.forEach((line, idx) => {
          doc.text(line, xPos, yPos + (idx * 4));
        });
        xPos += colWidths[2];
        
        // Action
        const action = getActionDisplay(log);
        const actionLines = doc.splitTextToSize(action, colWidths[3] - 2);
        actionLines.forEach((line, idx) => {
          doc.text(line, xPos, yPos + (idx * 4));
        });
        xPos += colWidths[3];
        
        // Details
        const details = decodeHtml(log.message || '');
        const detailsLines = doc.splitTextToSize(details, colWidths[4] - 2);
        detailsLines.forEach((line, idx) => {
          doc.text(line, xPos, yPos + (idx * 4));
        });
        xPos += colWidths[4];
        
        // Source
        const source = getSourceType(log);
        doc.text(source, xPos, yPos);
        
        // Calculate row height based on max lines
        const maxLines = Math.max(
          timestampLines.length,
          userLines.length,
          roleLines.length,
          actionLines.length,
          detailsLines.length,
          1
        );
        
        return yPos + (maxLines * 4) + 2;
      };

      // First page header
      const generatedAt = new Date();
      const generatedDate = generatedAt.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      });
      const generatedTime = generatedAt.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      doc.setFontSize(styles.title.size);
      doc.setFont('helvetica', styles.title.style);
      doc.setTextColor(styles.title.color);
      doc.text('PiscaRisk System Logs', margin, yPos);
      yPos += 6;
      
      doc.setFontSize(styles.subtitle.size);
      doc.setFont('helvetica', styles.subtitle.style);
      doc.setTextColor(styles.subtitle.color);
      doc.text(`Generated on: ${generatedDate} ${generatedTime}`, margin, yPos);
      yPos += 5;
      doc.text(`Total Logs: ${logs.length.toLocaleString()}`, margin, yPos);
      yPos += 8;

      // Add table header
      yPos = addTableHeader(doc, yPos);

      // Add log rows
      logs.forEach((log, index) => {
        // Check for page break
        if (yPos > pageHeight - 20) {
          addFooter(doc, pageNum);
          doc.addPage();
          pageNum++;
          yPos = 15;
          yPos = addTableHeader(doc, yPos);
        }

        // Add row border
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.1);
        doc.line(margin, yPos - 2, pageWidth - margin, yPos - 2);

        // Add log row
        yPos = addLogRow(doc, log, yPos, margin);
      });

      // Add footer to each page
      addFooter(doc, pageNum);

      // Save the PDF
      const timestamp = new Date().toISOString().split('T')[0];
      doc.save(`piscarisk_logs_${timestamp}.pdf`);

      // Log successful PDF export
      await logActivity('export', logMessages.export.pdfDownload(currentUser.username, 'logs'), currentUser.username);
    }

    // Log export completion
    await logActivity('export', logMessages.export.exportComplete(currentUser.username, 'logs'), currentUser.username);

  } catch (error) {
    // Log export error
    await logActivity('export', logMessages.export.exportError(currentUser.username, 'logs', error.message), currentUser.username);
    console.error('Export error:', error);
  }
};

function addFooter(doc, pageNum) {
  const footerStyles = {
    size: 8,
    style: 'italic',
    color: '#7f8c8d'
  };
  
  doc.setFontSize(footerStyles.size);
  doc.setFont('helvetica', footerStyles.style);
  doc.setTextColor(footerStyles.color);
  doc.text(`© PiscaRisk - Aquaculture Monitoring System | Page ${pageNum}`, 148.5, 200, { align: 'center' });
}
