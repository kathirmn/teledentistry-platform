import { jsPDF } from 'jspdf';
import { FreezeFramePayload, ChatMessage, Participant } from './webrtc-types';

export interface CaseReportData {
  roomId: string;
  clinicName: string;
  patientAlias: string;
  dentistName: string;
  consultants: Participant[];
  startTime: number;
  endTime: number;
  snapshots: FreezeFramePayload[];
  chatMessages: ChatMessage[];
  clinicalNotes: string;
}

export async function generateCaseReportPdf(data: CaseReportData): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let cursorY = margin;

  // Header Banner
  doc.setFillColor(11, 17, 32); // Dark clinical navy
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('TELEDENTISTRY CLINICAL MENTORSHIP REPORT', margin, 14);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(6, 182, 212); // Accent cyan
  doc.text(`SESSION ID: ${data.roomId}  |  GENERATED: ${new Date().toLocaleString()}`, margin, 22);

  cursorY = 36;

  // Session & Patient Details Box
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, cursorY, pageWidth - margin * 2, 38, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Clinical Session Metadata', margin + 5, cursorY + 7);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);

  const col1X = margin + 5;
  const col2X = margin + 65;
  const col3X = margin + 125;

  doc.text(`Clinic / Unit: ${data.clinicName || 'Rural Health Center'}`, col1X, cursorY + 15);
  doc.text(`Junior Clinician: ${data.dentistName || 'Dr. Rural Clinician'}`, col1X, cursorY + 22);
  doc.text(`Patient Case Ref: ${data.patientAlias || 'PT-ANONYMOUS'}`, col1X, cursorY + 29);

  const seniorNames = data.consultants.length > 0 
    ? data.consultants.map(c => c.name).join(', ')
    : 'Dr. Senior Consultant';
  doc.text(`Senior Specialist(s): ${seniorNames}`, col2X, cursorY + 15);
  
  const durationMin = Math.round((data.endTime - data.startTime) / 60000) || 1;
  doc.text(`Duration: ${durationMin} minutes`, col2X, cursorY + 22);
  doc.text(`Total Snapshots: ${data.snapshots.length}`, col2X, cursorY + 29);

  doc.text(`Platform Mode: WebRTC Hybrid`, col3X, cursorY + 15);
  doc.text(`Telestration: Dual-Mode`, col3X, cursorY + 22);
  doc.text(`Bandwidth: Tier-Adaptive`, col3X, cursorY + 29);

  cursorY += 46;

  // Clinical Summary / Procedure Notes
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Consultation Notes & Diagnostic Recommendations', margin, cursorY);
  cursorY += 6;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const notesText = data.clinicalNotes || 'Remote mentorship session concluded. Clinical recommendations reviewed live via intraoral video feed and annotated snapshots.';
  const splitNotes = doc.splitTextToSize(notesText, pageWidth - margin * 2);
  doc.text(splitNotes, margin, cursorY);
  cursorY += splitNotes.length * 5 + 8;

  // Annotated Snapshots Gallery
  if (data.snapshots.length > 0) {
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Documented Intraoral Snapshots (${data.snapshots.length})`, margin, cursorY);
    cursorY += 6;

    for (let i = 0; i < data.snapshots.length; i++) {
      const snap = data.snapshots[i];
      const imgWidth = 85;
      const imgHeight = 55;

      // Check page break
      if (cursorY + imgHeight + 15 > pageHeight - margin) {
        doc.addPage();
        cursorY = margin;
      }

      const isEven = i % 2 === 0;
      const imgX = isEven ? margin : margin + imgWidth + 10;
      const boxY = cursorY;

      try {
        doc.addImage(snap.dataUrl, 'JPEG', imgX, boxY, imgWidth, imgHeight);
      } catch (err) {
        console.warn('Could not embed snapshot image in PDF', err);
      }

      doc.setDrawColor(203, 213, 225);
      doc.rect(imgX, boxY, imgWidth, imgHeight);

      // Snapshot caption
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      
      const badgeList = snap.annotations?.badges?.map(b => `#${b.toothNumber} (${b.conditionTag || 'Flag'})`).join(', ') || 'No tooth tags';
      doc.text(`Plate ${i + 1}: ${snap.feedType.toUpperCase()} - ${badgeList}`, imgX, boxY + imgHeight + 4);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Captured: ${new Date(snap.timestamp).toLocaleTimeString()}`, imgX, boxY + imgHeight + 8);

      if (!isEven || i === data.snapshots.length - 1) {
        cursorY += imgHeight + 14;
      }
    }
  }

  // In-Call Chat Transcript
  if (data.chatMessages.length > 0) {
    if (cursorY + 40 > pageHeight - margin) {
      doc.addPage();
      cursorY = margin;
    }

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('In-Call Chat & Communications Log', margin, cursorY);
    cursorY += 6;

    doc.setFontSize(8);
    for (const msg of data.chatMessages) {
      if (cursorY + 6 > pageHeight - margin) {
        doc.addPage();
        cursorY = margin;
      }
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(2, 132, 199);
      const timeStr = new Date(msg.timestamp).toLocaleTimeString();
      doc.text(`[${timeStr}] ${msg.senderName} (${msg.senderRole}): `, margin, cursorY);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      const senderPrefixWidth = doc.getTextWidth(`[${timeStr}] ${msg.senderName} (${msg.senderRole}): `);
      doc.text(msg.text, margin + senderPrefixWidth, cursorY);
      cursorY += 5;
    }
  }

  // Footer Disclaimer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'Teledentistry Clinical Mentorship Documentation — Confidential Medical Communication — Not a standalone final diagnostic report.',
      margin,
      pageHeight - 6
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin - 15, pageHeight - 6);
  }

  const safeFilename = `Teledentistry_Case_${data.roomId}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(safeFilename);
}
