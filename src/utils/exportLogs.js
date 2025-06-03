import { jsPDF } from "jspdf";
import { logActivity, logMessages } from './logger';

export const exportLogs = async (logs, format, currentUser) => {
  try {
    // Log export start
    await logActivity('export', logMessages.export.exportStart(currentUser.username, 'logs'), currentUser.username);

    if (format === 'csv') {
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `piscarisk_logs_${timestamp}.csv`;
      
      // Create CSV content
      let csvContent = "Timestamp,Category,Message,Username\n";
      
      logs.forEach(log => {
        const timestamp = new Date(log.timestamp).toLocaleString();
        const category = log.category;
        const message = `"${log.message.replace(/"/g, '""')}"`; // Escape quotes
        const username = log.username;
        
        csvContent += `${timestamp},${category},${message},${username}\n`;
      });
      
      // Create and download the CSV file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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
        orientation: "portrait", 
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
        lightText: '#7f8c8d'
      };

      // Font styles
      const styles = {
        title: { size: 22, style: 'bold', color: colors.primary },
        subtitle: { size: 12, style: 'normal', color: colors.lightText },
        sectionTitle: { size: 16, style: 'bold', color: colors.secondary },
        bodyHeader: { size: 14, style: 'bold', color: colors.text },
        bodyText: { size: 12, style: 'normal', color: colors.text },
        footer: { size: 10, style: 'italic', color: colors.lightText }
      };

      const margin = 20;
      const lineHeight = 7;
      let yPos = 30;

      // Add header with watermark effect
      doc.setFillColor(240, 240, 240);
      doc.rect(0, 0, 210, 297, 'F');
      
      // Report title
      doc.setFontSize(styles.title.size);
      doc.setFont('helvetica', styles.title.style);
      doc.setTextColor(styles.title.color);
      doc.text('PiscaRisk System Logs', margin, yPos);
      yPos += 10;

      // Generation date
      doc.setFontSize(styles.subtitle.size);
      doc.setFont('helvetica', styles.subtitle.style);
      doc.setTextColor(styles.subtitle.color);
      doc.text(`Generated: ${new Date().toLocaleString()}`, margin, yPos);
      yPos += 15;

      // Log entries
      doc.setFontSize(styles.bodyText.size);
      doc.setFont('helvetica', styles.bodyText.style);
      doc.setTextColor(styles.bodyText.color);

      logs.forEach((log, index) => {
        // Check for page break
        if (yPos > 260) {
          addFooter(doc);
          doc.addPage();
          yPos = 30;
        }

        // Log entry header
        doc.setFontSize(styles.bodyHeader.size);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(styles.sectionTitle.color);
        doc.text(`[${log.category.toUpperCase()}] ${new Date(log.timestamp).toLocaleString()}`, margin, yPos);
        yPos += lineHeight;

        // Log message
        doc.setFontSize(styles.bodyText.size);
        doc.setFont('helvetica', styles.bodyText.style);
        doc.setTextColor(styles.bodyText.color);
        const messageLines = doc.splitTextToSize(log.message, 170);
        messageLines.forEach(line => {
          if (yPos > 260) {
            addFooter(doc);
            doc.addPage();
            yPos = 30;
          }
          doc.text(line, margin + 5, yPos);
          yPos += lineHeight;
        });

        // Username
        doc.setFont('helvetica', 'italic');
        doc.text(`User: ${log.username}`, margin + 5, yPos);
        yPos += lineHeight * 2;
      });

      // Add footer to each page
      addFooter(doc);

      // Save the PDF
      doc.save('piscarisk_system_logs.pdf');

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

function addFooter(doc) {
  const footerStyles = {
    size: 10,
    style: 'italic',
    color: '#7f8c8d'
  };
  
  doc.setFontSize(footerStyles.size);
  doc.setFont('helvetica', footerStyles.style);
  doc.setTextColor(footerStyles.color);
  doc.text('© PiscaRisk - Aquaculture Monitoring System', 105, 287, { align: 'center' });
} 