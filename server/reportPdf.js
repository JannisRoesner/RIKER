const PDFDocument = require('pdfkit');
const fs = require('fs');

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 42;
const HEADER_H = 78;
const FOOTER_H = 34;
const CONTENT_TOP = HEADER_H + 18;
const CONTENT_BOTTOM = PAGE_H - FOOTER_H - 8;
const CONTENT_W = PAGE_W - MARGIN * 2;

const C = {
  ink: '#111827',
  muted: '#64748b',
  line: '#e2e8f0',
  zebra: '#f8fafc',
  header: '#1a1a1a',
  header2: '#2d2d2d',
  accent: '#4f46e5',
  paid: '#059669',
  open: '#d97706',
  all: '#4f46e5',
  danger: '#dc2626',
  white: '#ffffff',
  sub: '#e5e7eb',
  band: '#eef2ff'
};

function pngSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

function fmtEuro(n) {
  const v = Number(n) || 0;
  const [int, dec] = v.toFixed(2).split('.');
  const withDots = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots},${dec} €`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatStamp(d) {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatOrderTime(s) {
  if (!s) return '—';
  return String(s).replace('T', ' ').slice(0, 19);
}

function statusDe(s) {
  if (s === 'paid') return 'bezahlt';
  if (s === 'complete') return 'fertig';
  return 'offen';
}

function drawRect(doc, x, y, w, h, fill) {
  doc.save();
  doc.rect(x, y, w, h).fill(fill);
  doc.restore();
}

function drawRounded(doc, x, y, w, h, r, fill) {
  doc.save();
  doc.roundedRect(x, y, w, h, r).fill(fill);
  doc.restore();
}

function drawBrandHeader(doc, { logoPath, generatedAt, sectionTitle }) {
  drawRect(doc, 0, 0, PAGE_W * 0.55, HEADER_H, C.header);
  drawRect(doc, PAGE_W * 0.55, 0, PAGE_W * 0.45, HEADER_H, C.header2);
  drawRect(doc, 0, HEADER_H - 3, PAGE_W, 3, C.accent);

  let textX = MARGIN;
  if (logoPath) {
    try {
      const head = Buffer.alloc(24);
      const fd = fs.openSync(logoPath, 'r');
      fs.readSync(fd, head, 0, 24, 0);
      fs.closeSync(fd);
      const natural = pngSize(head) || { width: 1, height: 1 };
      const logoH = 40;
      const logoW = logoH * (natural.width / natural.height);
      doc.image(logoPath, MARGIN, (HEADER_H - logoH) / 2, { height: logoH, width: logoW });
      textX = MARGIN + logoW + 10;
    } catch {}
  }

  doc.font('Helvetica-Bold').fontSize(16).fillColor(C.white)
    .text('RIKER', textX, 16, { width: 260, lineBreak: false });
  doc.font('Helvetica').fontSize(6.5).fillColor(C.sub)
    .text('Registrierkassen-Interface für Karnevalssitzungen', textX, 36, { width: 270, lineBreak: false })
    .text('mit Echtzeit-Rückmeldungen', textX, 46, { width: 270, lineBreak: false });

  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.white)
    .text(sectionTitle || 'Komplettbericht', MARGIN, 18, { width: CONTENT_W, align: 'right' });
  doc.font('Helvetica').fontSize(7.5).fillColor('#cbd5e1')
    .text(`Erstellt am ${formatStamp(generatedAt)}`, MARGIN, 36, { width: CONTENT_W, align: 'right' });
  doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
    .text('Vertraulich · intern', MARGIN, 50, { width: CONTENT_W, align: 'right' });
}

function drawFooter(doc, page, pages) {
  drawRect(doc, 0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H, C.header);
  drawRect(doc, 0, PAGE_H - FOOTER_H, PAGE_W, 2, C.accent);
  doc.font('Helvetica').fontSize(7).fillColor('#cbd5e1')
    .text('RIKER · Registrierkassen-Interface für Karnevalssitzungen', MARGIN, PAGE_H - 22, { width: CONTENT_W * 0.7 });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.white)
    .text(`Seite ${page} / ${pages}`, MARGIN, PAGE_H - 22, { width: CONTENT_W, align: 'right' });
}

function sectionHeading(doc, y, number, title) {
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.accent)
    .text(number, MARGIN, y, { width: 28 });
  doc.font('Helvetica-Bold').fontSize(13).fillColor(C.ink)
    .text(title, MARGIN + 28, y - 2, { width: CONTENT_W - 28 });
  y += 18;
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(C.accent).lineWidth(1.2).stroke();
  doc.moveTo(MARGIN, y + 2).lineTo(PAGE_W - MARGIN, y + 2).strokeColor(C.line).lineWidth(0.5).stroke();
  return y + 14;
}

function startPage(doc, ctx, isFirst) {
  if (!isFirst) doc.addPage();
  drawBrandHeader(doc, ctx);
  return CONTENT_TOP;
}

function needPage(doc, y, needed, ctx) {
  if (y + needed <= CONTENT_BOTTOM) return y;
  return startPage(doc, ctx, false);
}

function drawKpiCard(doc, x, y, w, h, label, value, accent) {
  drawRounded(doc, x, y, w, h, 6, C.white);
  doc.save();
  doc.lineWidth(0.8).strokeColor(C.line).roundedRect(x, y, w, h, 6).stroke();
  doc.restore();
  drawRect(doc, x, y, 4, h, accent);
  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(label.toUpperCase(), x + 14, y + 10, { width: w - 22, characterSpacing: 0.4 });
  doc.font('Helvetica-Bold').fontSize(15).fillColor(C.ink).text(value, x + 14, y + 26, { width: w - 22 });
}

function drawTimeseries(doc, y, series, ctx) {
  if (!series || series.length < 2) return y;
  y = needPage(doc, y, 168, ctx);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text('Umsatzverlauf (kumuliert)', MARGIN, y);
  y += 16;
  const chartH = 118;
  const chartX = MARGIN;
  const chartY = y;
  const max = Math.max(...series.map(s => Math.max(s.cumAll || 0, s.cumPaid || 0)), 1);

  drawRounded(doc, chartX, chartY, CONTENT_W, chartH, 6, C.zebra);
  doc.save();
  doc.lineWidth(0.6).strokeColor(C.line).roundedRect(chartX, chartY, CONTENT_W, chartH, 6).stroke();
  doc.restore();

  const leftPad = 10;
  const bottomPad = 18;
  const topPad = 12;
  const plotW = CONTENT_W - leftPad * 2;
  const plotH = chartH - topPad - bottomPad;

  function point(i, value) {
    const px = chartX + leftPad + (i / (series.length - 1)) * plotW;
    const py = chartY + topPad + plotH - (value / max) * plotH;
    return [px, py];
  }

  function polyline(key, color) {
    doc.save();
    doc.strokeColor(color).lineWidth(1.6).lineJoin('round').lineCap('round');
    series.forEach((s, i) => {
      const [px, py] = point(i, s[key] || 0);
      if (i === 0) doc.moveTo(px, py);
      else doc.lineTo(px, py);
    });
    doc.stroke();
    doc.restore();
  }

  polyline('cumAll', C.all);
  polyline('cumPaid', C.paid);

  doc.font('Helvetica').fontSize(7).fillColor(C.muted);
  doc.text(series[0].time || '', chartX + leftPad, chartY + chartH - 14, { width: 60 });
  doc.text(series[series.length - 1].time || '', chartX + CONTENT_W - 70, chartY + chartH - 14, { width: 60, align: 'right' });

  y += chartH + 8;
  doc.font('Helvetica').fontSize(8);
  doc.fillColor(C.all).text('●  Gesamt', MARGIN, y);
  doc.fillColor(C.paid).text('●  Bezahlt', MARGIN + 78, y);
  return y + 20;
}

function drawTable(doc, { y, ctx, columns, rows, emptyText }) {
  const rowH = 17;
  const headerH = 20;

  function drawHeader(atY) {
    drawRect(doc, MARGIN, atY, CONTENT_W, headerH, C.header);
    let x = MARGIN + 8;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.white);
    for (const col of columns) {
      doc.text(col.label.toUpperCase(), x, atY + 6, { width: col.width - 10, align: col.align || 'left' });
      x += col.width;
    }
    return atY + headerH;
  }

  y = needPage(doc, y, headerH + rowH * 3, ctx);
  y = drawHeader(y);

  if (!rows.length) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(C.muted)
      .text(emptyText || 'Keine Daten vorhanden.', MARGIN + 8, y + 10, { width: CONTENT_W - 16 });
    return y + 32;
  }

  for (let i = 0; i < rows.length; i++) {
    if (y + rowH > CONTENT_BOTTOM) {
      y = startPage(doc, ctx, false);
      y = drawHeader(y);
    }
    if (i % 2 === 0) drawRect(doc, MARGIN, y, CONTENT_W, rowH, C.zebra);
    doc.save();
    doc.strokeColor(C.line).lineWidth(0.3).moveTo(MARGIN, y + rowH).lineTo(PAGE_W - MARGIN, y + rowH).stroke();
    doc.restore();

    let x = MARGIN + 8;
    doc.font('Helvetica').fontSize(8).fillColor(C.ink);
    for (const col of columns) {
      const val = col.value(rows[i]);
      if (col.color) doc.fillColor(col.color(rows[i]));
      else doc.fillColor(C.ink);
      doc.text(String(val), x, y + 4.5, {
        width: col.width - 10,
        align: col.align || 'left',
        ellipsis: true,
        lineBreak: false
      });
      x += col.width;
    }
    y += rowH;
  }
  return y + 10;
}

function groupProducts(products) {
  const map = new Map();
  for (const p of products) {
    const cat = p.category || 'Sonstiges';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(p);
  }
  return map;
}

function drawProductCatalog(doc, y, products, ctx) {
  const groups = groupProducts(products);
  const rowH = 17;
  const headerH = 20;
  const columns = [
    { label: 'Artikel', width: CONTENT_W - 80 - 70 - 140, value: r => r.name || '—' },
    { label: 'Preis', width: 80, align: 'right', value: r => fmtEuro(r.price) },
    { label: 'Status', width: 70, value: r => (Number(r.available) === 0 ? 'inaktiv' : 'aktiv') },
    { label: 'Optionen', width: 140, value: r => r.note_options || '—' }
  ];

  function drawHeader(atY) {
    drawRect(doc, MARGIN, atY, CONTENT_W, headerH, C.header);
    let x = MARGIN + 8;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.white);
    for (const col of columns) {
      doc.text(col.label.toUpperCase(), x, atY + 6, { width: col.width - 10, align: col.align || 'left' });
      x += col.width;
    }
    return atY + headerH;
  }

  if (!products.length) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(C.muted)
      .text('Keine Produkte angelegt.', MARGIN, y);
    return y + 20;
  }

  for (const [cat, rows] of groups) {
    y = needPage(doc, y, headerH + rowH * 3, ctx);
    drawRounded(doc, MARGIN, y, CONTENT_W, 18, 3, C.band);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.accent)
      .text(cat, MARGIN + 8, y + 4, { width: CONTENT_W - 16, lineBreak: false });
    y += 22;
    y = drawHeader(y);

    rows.forEach((row, i) => {
      if (y + rowH > CONTENT_BOTTOM) {
        y = startPage(doc, ctx, false);
        drawRounded(doc, MARGIN, y, CONTENT_W, 18, 3, C.band);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(C.accent)
          .text(`${cat}  (Fortsetzung)`, MARGIN + 8, y + 4, { width: CONTENT_W - 16, lineBreak: false });
        y += 22;
        y = drawHeader(y);
      }
      if (i % 2 === 0) drawRect(doc, MARGIN, y, CONTENT_W, rowH, C.zebra);
      doc.save();
      doc.strokeColor(C.line).lineWidth(0.3).moveTo(MARGIN, y + rowH).lineTo(PAGE_W - MARGIN, y + rowH).stroke();
      doc.restore();
      let x = MARGIN + 8;
      doc.font('Helvetica').fontSize(8);
      for (const col of columns) {
        const inactive = Number(row.available) === 0;
        doc.fillColor(inactive ? C.muted : C.ink);
        doc.text(String(col.value(row)), x, y + 4.5, {
          width: col.width - 10,
          align: col.align || 'left',
          ellipsis: true,
          lineBreak: false
        });
        x += col.width;
      }
      y += rowH;
    });
    y += 12;
  }
  return y;
}

function buildCompleteReport({ summaryPaid, summaryAll, orders, items, products, series, generatedAt, logoPath }) {
  const paid = Number(summaryPaid) || 0;
  const all = Number(summaryAll) || 0;
  const openAmt = Math.max(0, all - paid);
  const openCount = orders.filter(o => o.status === 'open').length;
  const productCount = (products || []).length;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: 'RIKER Komplettbericht',
        Author: 'RIKER',
        Subject: 'Registrierkassen-Interface für Karnevalssitzungen'
      }
    });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let ctx = { logoPath, generatedAt, sectionTitle: '1  Übersicht' };
    let y = startPage(doc, ctx, true);

    y = sectionHeading(doc, y, '01', 'Kennzahlen');

    const gap = 10;
    const cardW = (CONTENT_W - gap) / 2;
    const cardH = 52;
    drawKpiCard(doc, MARGIN, y, cardW, cardH, 'Umsatz bezahlt', fmtEuro(paid), C.paid);
    drawKpiCard(doc, MARGIN + cardW + gap, y, cardW, cardH, 'Umsatz gesamt', fmtEuro(all), C.all);
    y += cardH + gap;
    drawKpiCard(doc, MARGIN, y, cardW, cardH, 'Offen (Betrag)', fmtEuro(openAmt), C.open);
    drawKpiCard(doc, MARGIN + cardW + gap, y, cardW, cardH, 'Offene Bestellungen', String(openCount), C.danger);
    y += cardH + 18;

    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text('Bilanz  ·  bezahlt vs. offen', MARGIN, y);
    y += 16;
    const barMax = Math.max(paid, openAmt, 1);
    const paidW = Math.max(4, (paid / barMax) * CONTENT_W);
    const openW = openAmt > 0 ? Math.max(4, (openAmt / barMax) * CONTENT_W) : 0;
    drawRounded(doc, MARGIN, y, CONTENT_W, 10, 5, C.line);
    drawRounded(doc, MARGIN, y, paidW, 10, 5, C.paid);
    y += 14;
    doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(`Bezahlt   ${fmtEuro(paid)}`, MARGIN, y);
    y += 14;
    drawRounded(doc, MARGIN, y, CONTENT_W, 10, 5, C.line);
    if (openW) drawRounded(doc, MARGIN, y, openW, 10, 5, C.open);
    y += 14;
    doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(`Offen   ${fmtEuro(openAmt)}`, MARGIN, y);
    y += 20;

    y = drawTimeseries(doc, y, series, ctx);

    drawRounded(doc, MARGIN, y, CONTENT_W, 36, 6, C.band);
    doc.font('Helvetica').fontSize(8).fillColor(C.ink)
      .text(
        `${orders.length} Bestellungen   ·   ${items.length} Artikel mit Verkäufen   ·   ${productCount} Produkte im Katalog`,
        MARGIN + 12, y + 12, { width: CONTENT_W - 24 }
      );

    // 2 Bestellungen
    ctx = { ...ctx, sectionTitle: '2  Bestellungen' };
    y = startPage(doc, ctx, false);
    y = sectionHeading(doc, y, '02', 'Bestellungen');
    y = drawTable(doc, {
      y, ctx,
      columns: [
        { label: 'Nr.', width: 42, value: r => `#${r.id}` },
        { label: 'Tisch', width: 48, value: r => r.table_number || '—' },
        { label: 'Bedienung', width: 108, value: r => r.is_guest ? `Gast ${r.customer_name || ''}`.trim() : (r.waiter || '—') },
        { label: 'Status', width: 68, value: r => statusDe(r.status) },
        { label: 'Summe', width: 78, align: 'right', value: r => fmtEuro(r.total) },
        { label: 'Zeitpunkt', width: CONTENT_W - 42 - 48 - 108 - 68 - 78, value: r => formatOrderTime(r.created_at) }
      ],
      rows: orders,
      emptyText: 'Keine Bestellungen vorhanden.'
    });

    // 3 Verkaufte Artikel
    ctx = { ...ctx, sectionTitle: '3  Verkaufte Artikel' };
    y = startPage(doc, ctx, false);
    y = sectionHeading(doc, y, '03', 'Verkaufte Artikel');
    drawTable(doc, {
      y, ctx,
      columns: [
        { label: 'Artikel', width: CONTENT_W - 64 - 80 - 96, value: r => r.name || '—' },
        { label: 'Menge', width: 64, align: 'right', value: r => String(r.soldQty || 0) },
        { label: 'Bezahlt', width: 80, align: 'right', value: r => String(r.paidQty || 0) },
        { label: 'Umsatz bezahlt', width: 96, align: 'right', value: r => fmtEuro(r.revenuePaid) }
      ],
      rows: items,
      emptyText: 'Keine verkauften Artikel vorhanden.'
    });

    // 4 Produktkatalog
    ctx = { ...ctx, sectionTitle: '4  Produktkatalog' };
    y = startPage(doc, ctx, false);
    y = sectionHeading(doc, y, '04', 'Produktkatalog');
    doc.font('Helvetica').fontSize(8).fillColor(C.muted)
      .text('Alle angelegten Speisen und Getränke, gruppiert nach Kategorie.', MARGIN, y, { width: CONTENT_W });
    y += 16;
    drawProductCatalog(doc, y, products || [], ctx);

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      drawFooter(doc, i + 1, range.count);
    }

    doc.end();
  });
}

module.exports = { buildCompleteReport };
