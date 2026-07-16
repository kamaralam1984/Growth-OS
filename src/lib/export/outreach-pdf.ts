import PDFDocument from "pdfkit";

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

export interface CampaignReportData {
  name: string;
  type: string;
  status: string;
  goal: string | null;
  aiPlanNotes: string | null;
  estimatedSuccessPotential: number | null;
  contactsCount: number;
  emailsSent: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  meetingsBooked: number;
  bounceRate: number;
}

/** A single-campaign performance report PDF — mirrors scan-pdf.ts's structure. */
export async function campaignReportToPdfBuffer(data: CampaignReportData): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 48, size: "A4" });
  const bufferPromise = collectPdfBuffer(doc);

  doc.fontSize(22).text(data.name);
  doc.fontSize(10).fillColor("#666666").text(`Report generated ${new Date().toLocaleString()} · ${data.type.replace(/_/g, " ")} · ${data.status}`);
  doc.moveDown(1);
  doc.fillColor("#000000");

  if (data.goal) {
    doc.fontSize(13).text("Goal");
    doc.fontSize(10).fillColor("#333333").text(data.goal);
    doc.moveDown(0.6);
    doc.fillColor("#000000");
  }

  if (data.estimatedSuccessPotential != null) {
    doc.fontSize(13).text("AI Campaign Plan");
    doc.fontSize(10).fillColor("#333333");
    doc.text(`Estimated success potential (deterministic): ${data.estimatedSuccessPotential}%`);
    if (data.aiPlanNotes) doc.text(data.aiPlanNotes);
    doc.moveDown(0.6);
    doc.fillColor("#000000");
  }

  doc.fontSize(13).text("Performance (real, tracked)");
  doc.fontSize(10).fillColor("#333333");
  doc.text(`Contacts: ${data.contactsCount}`);
  doc.text(`Emails sent: ${data.emailsSent}`);
  doc.text(`Open rate: ${data.openRate}%`);
  doc.text(`Click rate: ${data.clickRate}%`);
  doc.text(`Reply rate: ${data.replyRate}%`);
  doc.text(`Meetings booked: ${data.meetingsBooked}`);
  doc.text(`Bounce rate: ${data.bounceRate}% (real SMTP-level send failures only)`);

  doc.end();
  return bufferPromise;
}

export interface OutreachPerformanceReportData {
  organizationName: string;
  periodLabel: string;
  totalCampaigns: number;
  totalEmailsSent: number;
  totalReplies: number;
  totalMeetings: number;
  campaigns: Array<{ name: string; status: string; emailsSent: number; openRate: number; replyRate: number }>;
}

/** A real org-wide outreach performance report — reused for Weekly/Monthly/Performance reports by varying periodLabel and the date-scoped input data. */
export async function outreachPerformanceReportToPdfBuffer(data: OutreachPerformanceReportData): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 48, size: "A4" });
  const bufferPromise = collectPdfBuffer(doc);

  doc.fontSize(20).text(`${data.organizationName} — Outreach ${data.periodLabel} Report`);
  doc.fontSize(10).fillColor("#666666").text(`Generated ${new Date().toLocaleString()}`);
  doc.moveDown(1);
  doc.fillColor("#000000");

  doc.fontSize(13).text("Summary");
  doc.fontSize(10).fillColor("#333333");
  doc.text(`Campaigns: ${data.totalCampaigns}`);
  doc.text(`Emails sent: ${data.totalEmailsSent}`);
  doc.text(`Replies: ${data.totalReplies}`);
  doc.text(`Meetings booked: ${data.totalMeetings}`);
  doc.moveDown(0.8);
  doc.fillColor("#000000");

  doc.fontSize(13).text("Campaigns");
  for (const c of data.campaigns) {
    doc.fontSize(10).fillColor("#000000").text(`${c.name} (${c.status})`);
    doc.fontSize(9).fillColor("#666666").text(`${c.emailsSent} sent · ${c.openRate}% open · ${c.replyRate}% reply`);
    doc.moveDown(0.3);
    if (doc.y > doc.page.height - 100) doc.addPage();
  }

  doc.end();
  return bufferPromise;
}
