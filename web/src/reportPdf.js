// Turns the server's Markdown report (GET /runs/:id/report) into a simple A4 PDF.
// jsPDF is loaded on demand so it is not part of the initial bundle.
export async function downloadReportPdf(markdown, fileName) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const bottom = doc.internal.pageSize.getHeight() - margin;
  let y = margin;
  doc.setProperties({ title: fileName.replace(/\.pdf$/i, ""), subject: "Migration report", creator: "Verdigrade" });

  const write = (text, { size = 10, bold = false, mono = false, indent = 0, gap = 4 } = {}) => {
    doc.setFont(mono ? "courier" : "helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    // jsPDF's standard fonts are Latin-1 only: replace arrows and other symbols.
    const safe = text.replace(/→/g, "->").replace(/[×]/g, "x").replace(/[−–—]/g, "-").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
    for (const line of doc.splitTextToSize(safe, width - indent)) {
      if (y + size > bottom) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin + indent, y + size);
      y += size + 3;
    }
    y += gap;
  };

  // Brand line above the report title.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(79, 70, 229);
  doc.text("LEAPFROG", margin, y + 9);
  doc.setTextColor(0, 0, 0);
  y += 22;

  let inCode = false;
  for (const raw of markdown.split(/\r?\n/)) {
    if (raw.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      write(raw || " ", { size: 8, mono: true, gap: 0 });
      continue;
    }
    const text = raw.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
    if (!text.trim()) continue;
    // Markdown tables (the engine scorecard): drop the separator row, print the cells on one line.
    if (text.startsWith("|")) {
      if (/^\|[\s|:-]+\|?$/.test(text)) continue;
      write(text.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()).join("   |   "), { size: 9, gap: 1 });
      continue;
    }
    if (text.startsWith("# ")) write(text.slice(2), { size: 18, bold: true, gap: 8 });
    else if (text.startsWith("## ")) {
      y += 6;
      write(text.slice(3), { size: 13, bold: true, gap: 4 });
    } else if (text.startsWith("### ")) write(text.slice(4), { size: 11, bold: true });
    else {
      const bullet = /^(\s*)[-*]\s+(.*)$/.exec(text);
      if (bullet) write(`- ${bullet[2]}`, { indent: 12 + bullet[1].length * 6, gap: 1 });
      else write(text);
    }
  }
  doc.save(fileName);
}
