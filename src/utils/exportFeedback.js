import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { logActivity } from './logger';

export const exportToCSV = (feedbacks, feedbackTypes, currentUser) => {
  // Separate feedback by status
  const inboxFeedbacks = feedbacks.filter(f => !f.hasResponse && f.status !== 'archived');
  const responseFeedbacks = feedbacks.filter(f => f.hasResponse && f.status !== 'archived');
  const archiveFeedbacks = feedbacks.filter(f => f.status === 'archived');

  let csvContent = [];
  
  // Add title
  csvContent.push('PiscaRisk Feedback Report');
  csvContent.push(`Generated on: ${new Date().toLocaleDateString()}`);
  csvContent.push(''); // Empty line

  // Helper function to format feedback data
  const formatFeedbackData = (feedbackList, sectionTitle) => {
    if (feedbackList.length === 0) return [];
    
    const sectionData = [];
    sectionData.push(`=== ${sectionTitle} ===`);
    sectionData.push('ID,User,Type,Message,Date,Status,Replies,Response Messages');
    
    feedbackList.forEach(feedback => {
      const feedbackType = feedbackTypes.find(t => t.id === feedback.type)?.label;
      const replyCount = feedback.replies?.length || 0;
      
      // Format response messages
      let responseMessages = '';
      if (feedback.replies && feedback.replies.length > 0) {
        responseMessages = feedback.replies.map(reply => 
          `${reply.adminName}: ${reply.text}`
        ).join(' | ');
      }
      
      const row = [
        feedback.id,
        feedback.userName || feedback.user,
        feedbackType,
        `"${feedback.message.replace(/"/g, '""')}"`, // Escape quotes in CSV
        feedback.date,
        feedback.status || 'active',
        replyCount,
        `"${responseMessages.replace(/"/g, '""')}"`
      ].join(',');
      
      sectionData.push(row);
    });
    
    sectionData.push(''); // Empty line after section
    return sectionData;
  };

  // Add each section
  csvContent = csvContent.concat(formatFeedbackData(inboxFeedbacks, 'INBOX FEEDBACK'));
  csvContent = csvContent.concat(formatFeedbackData(responseFeedbacks, 'RESPONSE FEEDBACK'));
  csvContent = csvContent.concat(formatFeedbackData(archiveFeedbacks, 'ARCHIVE FEEDBACK'));

  // Add summary
  csvContent.push('=== SUMMARY ===');
  csvContent.push(`Total Inbox: ${inboxFeedbacks.length}`);
  csvContent.push(`Total Responses: ${responseFeedbacks.length}`);
  csvContent.push(`Total Archived: ${archiveFeedbacks.length}`);
  csvContent.push(`Total Feedback: ${feedbacks.length}`);

  const blob = new Blob([csvContent.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `piscarisk_feedback_report_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();

  // Log the export activity
  const filename = `piscarisk_feedback_report_${new Date().toISOString().split('T')[0]}.csv`;
  logActivity('export', `Exported File: ${filename}`, currentUser?.username || 'Admin');
};

export const exportToPDF = (feedbacks, feedbackTypes, currentUser) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const lineHeight = 8;
  const gap = 2;
  
  // Separate feedback by status
  const inboxFeedbacks = feedbacks.filter(f => !f.hasResponse && f.status !== 'archived');
  const responseFeedbacks = feedbacks.filter(f => f.hasResponse && f.status !== 'archived');
  const archiveFeedbacks = feedbacks.filter(f => f.status === 'archived');

  // Add title
  doc.setFontSize(18);
  doc.setTextColor(26, 115, 232); // Blue color for title
  doc.text('PiscaRisk Feedback Report', 105, 15, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 105, 22, { align: 'center' });
  
  let yPosition = 30;
  doc.setFontSize(12);

  // Helper function to add section
  const addSection = (sectionTitle, feedbackList, startY) => {
    let currentY = startY;
    
    // Section header
    doc.setFontSize(14);
    doc.setTextColor(26, 115, 232);
    doc.text(sectionTitle, 10, currentY);
    currentY += lineHeight + 2;
    
    // Section separator line
    doc.setDrawColor(26, 115, 232);
    doc.line(10, currentY, 200, currentY);
    currentY += lineHeight + gap;
    
    if (feedbackList.length === 0) {
      doc.setFontSize(10);
      doc.setTextColor(150, 150, 150);
      doc.text('No feedback in this section', 10, currentY);
      currentY += lineHeight + gap;
      return currentY;
    }
    
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    
    feedbackList.forEach((feedback, index) => {
      const feedbackType = feedbackTypes.find(t => t.id === feedback.type)?.label;
      const replyCount = feedback.replies?.length || 0;
      
      let textToInsert = [
        `${index + 1}. User: ${feedback.userName || feedback.user}`,
        `   Type: ${feedbackType}`,
        `   Date: ${feedback.date}`,
        `   Status: ${feedback.status || 'active'}`,
        `   Replies: ${replyCount}`,
        `   Message: ${feedback.message}`
      ].join('\n');
      
      // Add response messages if they exist
      if (feedback.replies && feedback.replies.length > 0) {
        textToInsert += '\n   Responses:';
        feedback.replies.forEach(reply => {
          textToInsert += `\n     ${reply.adminName}: ${reply.text}`;
        });
      }
      
      let splitText = doc.splitTextToSize(textToInsert, 190);
      
      // Check if we need a new page
      if (currentY + (splitText.length * lineHeight) > doc.internal.pageSize.height - 15) {
        doc.addPage();
        currentY = 20;
      }
      
      // Add each line of text
      splitText.forEach(line => {
        doc.text(line, 10, currentY);
        currentY += lineHeight;
      });
      
      // Add separator line between feedback items
      doc.setDrawColor(200, 200, 200);
      doc.line(10, currentY + 2, 200, currentY + 2);
      currentY += lineHeight + gap;
    });
    
    return currentY;
  };

  // Add each section
  yPosition = addSection('INBOX FEEDBACK', inboxFeedbacks, yPosition);
  yPosition = addSection('RESPONSE FEEDBACK', responseFeedbacks, yPosition);
  yPosition = addSection('ARCHIVE FEEDBACK', archiveFeedbacks, yPosition);

  // Add summary on a new page
  doc.addPage();
  yPosition = 20;
  
  doc.setFontSize(16);
  doc.setTextColor(26, 115, 232);
  doc.text('SUMMARY', 105, yPosition, { align: 'center' });
  yPosition += lineHeight + 5;
  
  doc.setFontSize(12);
  doc.setTextColor(50, 50, 50);
  
  const summaryItems = [
    `Total Inbox: ${inboxFeedbacks.length}`,
    `Total Responses: ${responseFeedbacks.length}`,
    `Total Archived: ${archiveFeedbacks.length}`,
    `Total Feedback: ${feedbacks.length}`
  ];
  
  summaryItems.forEach(item => {
    doc.text(item, 10, yPosition);
    yPosition += lineHeight + 2;
  });

  doc.save(`piscarisk_feedback_report_${new Date().toISOString().split('T')[0]}.pdf`);

  // Log the export activity
  const filename = `piscarisk_feedback_report_${new Date().toISOString().split('T')[0]}.pdf`;
  logActivity('export', `Exported File: ${filename}`, currentUser?.username || 'Admin');
}; 