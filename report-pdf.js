const PDFDocument = require('pdfkit');

function buildPdfBuffer(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { finalUrl, strategy, scores, vitals, opportunities, fetchTime } = report;

    doc.fontSize(20).text('GTmetrixBot Performance Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).fillColor('gray').text(`Generated: ${new Date(fetchTime).toLocaleString()}`);
    doc.text(`URL: ${finalUrl}`);
    doc.text(`Strategy: ${strategy}`);
    doc.moveDown();

    doc.fillColor('black').fontSize(14).text('Scores', { underline: true });
    doc.fontSize(12);
    doc.text(`Performance: ${scores.performance}`);
    doc.text(`Accessibility: ${scores.accessibility}`);
    doc.text(`Best Practices: ${scores.bestPractices}`);
    doc.text(`SEO: ${scores.seo}`);
    doc.moveDown();

    doc.fontSize(14).text('Core Web Vitals', { underline: true });
    doc.fontSize(12);
    doc.text(`LCP: ${vitals.lcp || 'n/a'}`);
    doc.text(`CLS: ${vitals.cls || 'n/a'}`);
    doc.text(`TBT: ${vitals.tbt || 'n/a'}`);
    doc.text(`FCP: ${vitals.fcp || 'n/a'}`);
    doc.text(`Speed Index: ${vitals.speedIndex || 'n/a'}`);
    doc.text(`Time to Interactive: ${vitals.tti || 'n/a'}`);
    doc.moveDown();

    if (opportunities.length) {
      doc.fontSize(14).text('Top Opportunities', { underline: true });
      doc.fontSize(12);
      opportunities.forEach((o) => {
        doc.text(`• ${o.title} — save ~${o.savingsMs}ms`);
      });
    }

    doc.end();
  });
}

module.exports = { buildPdfBuffer };
