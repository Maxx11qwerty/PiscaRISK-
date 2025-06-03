import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export const exportToCSV = (feedbacks, feedbackTypes) => {
  const csvData = feedbacks.map(feedback => ({
    ID: feedback.id,
    User: feedback.user,
    Type: feedbackTypes.find(t => t.id === feedback.type)?.label,
    Message: feedback.message,
    Date: feedback.date,
    Replies: feedback.replies?.length || 0
  }));

  const headers = Object.keys(csvData[0]).join(',');
  const csvContent = [
    headers,
    ...csvData.map(item => Object.values(item).join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `feedback_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

export const exportToPDF = (feedbacks, feedbackTypes) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const lineHeight = 8;
  const gap = 2;
  doc.setFontSize(15);

  // Add title
  doc.text('PiscaRisk Feedback Report', 105, 10, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 105, 16, { align: 'center' });
  
  let yPosition = 25;
  doc.setFontSize(12);
  
  feedbacks.forEach((feedback, index) => {
    const feedbackType = feedbackTypes.find(t => t.id === feedback.type)?.label;
    const replyCount = feedback.replies?.length || 0;
    
    const textToInsert = 
      `${index + 1}. User: ${feedback.user}\n` +
      `   Type: ${feedbackType}\n` +
      `   Date: ${feedback.date}\n` +
      `   Replies: ${replyCount}\n` +
      `   Message: ${feedback.message}`;
    
    let splitText = doc.splitTextToSize(textToInsert, 190);
    // Check if we need a new page
    if (yPosition + (splitText.length * lineHeight) > doc.internal.pageSize.height - 10) {
      doc.addPage();
      yPosition = 20;
    }
    // Add each line of text
    splitText.forEach(line => {
      doc.text(line, 10, yPosition);
      yPosition += lineHeight;
    });
    // Add separator line
    doc.setDrawColor(200, 200, 200);
    doc.line(10, yPosition + 2, 200, yPosition + 2);
    yPosition += lineHeight + gap;
  });

  doc.save(`feedback_report_${new Date().toISOString().split('T')[0]}.pdf`);
}; 