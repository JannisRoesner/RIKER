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
  const t = Date.parse(String(s).replace(' ', 'T'));
  if (isNaN(t)) return String(s).replace('T', ' ').slice(0, 16);
  const d = new Date(t);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatChartTick(ms, withDate) {
  const d = new Date(ms);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (!withDate) return hm;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.  ${hm}`;
}

function pct(part, total) {
  if (!total) return '0 %';
  return `${(part / total * 100).toFixed(1).replace('.', ',')} %`;
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
    .text('RIKER · Registrierkassen-Interface für Karnevalssitzungen', MARGIN, PAGE_H - 20, {
      width: CONTENT_W - 90,
      lineBreak: false
    });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.white)
    .text(`Seite ${page} / ${pages}`, PAGE_W - MARGIN - 80, PAGE_H - 20, {
      width: 80,
      align: 'right',
      lineBreak: false
    });
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

function drawSwatch(doc, x, y, color) {
  drawRounded(doc, x, y, 8, 8, 2, color);
}

function drawRevenueSplit(doc, y, paid, openAmt) {
  const total = paid + openAmt;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text('Bezahlt und noch offen', MARGIN, y);
  y += 13;
  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
    .text('Anteil am gesamten Umsatz, inklusive unbezahlter Positionen.', MARGIN, y, { width: CONTENT_W });
  y += 16;

  const barH = 16;
  drawRounded(doc, MARGIN, y, CONTENT_W, barH, 5, C.line);
  if (total > 0) {
    const paidW = Math.max(paid > 0 ? 6 : 0, (paid / total) * CONTENT_W);
    const openW = Math.max(0, CONTENT_W - paidW);
    if (paidW) drawRounded(doc, MARGIN, y, paidW, barH, 5, C.paid);
    if (openW && paidW < CONTENT_W - 1) {
      doc.save();
      doc.rect(MARGIN + paidW, y, openW, barH).fill(C.open);
      doc.restore();
    }
  }
  y += barH + 10;
  drawSwatch(doc, MARGIN, y + 1, C.paid);
  doc.font('Helvetica').fontSize(8).fillColor(C.ink)
    .text(`Bezahlt   ${fmtEuro(paid)}   (${pct(paid, total)})`, MARGIN + 14, y, { width: CONTENT_W / 2 - 14 });
  drawSwatch(doc, MARGIN + CONTENT_W / 2, y + 1, C.open);
  doc.text(`Noch offen   ${fmtEuro(openAmt)}   (${pct(openAmt, total)})`, MARGIN + CONTENT_W / 2 + 14, y, { width: CONTENT_W / 2 - 14 });
  return y + 22;
}

function drawTopSellers(doc, y, items, ctx) {
  const top = (items || []).slice(0, 8);
  y = needPage(doc, y, 40 + top.length * 18, ctx);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text('Top verkaufte Produkte', MARGIN, y);
  y += 13;
  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
    .text('Nach verkaufter Menge, unabhängig vom Zahlungsstatus.', MARGIN, y, { width: CONTENT_W });
  y += 14;

  if (!top.length) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(C.muted).text('Noch keine Verkäufe.', MARGIN, y);
    return y + 18;
  }

  const maxQty = Math.max(...top.map(r => Number(r.soldQty) || 0), 1);
  const nameW = 150;
  const qtyW = 36;
  const barX = MARGIN + 22 + nameW + 8;
  const barW = CONTENT_W - 22 - nameW - 8 - qtyW - 8;

  top.forEach((row, i) => {
    y = needPage(doc, y, 18, ctx);
    const qty = Number(row.soldQty) || 0;
    if (i % 2 === 0) drawRect(doc, MARGIN, y, CONTENT_W, 18, C.zebra);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.accent)
      .text(String(i + 1), MARGIN + 6, y + 4, { width: 16, lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor(C.ink)
      .text(row.name || '—', MARGIN + 22, y + 4, { width: nameW, ellipsis: true, lineBreak: false });
    const fillW = Math.max(qty ? 4 : 0, (qty / maxQty) * barW);
    drawRounded(doc, barX, y + 5, barW, 8, 3, C.line);
    if (fillW) drawRounded(doc, barX, y + 5, fillW, 8, 3, C.all);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.ink)
      .text(String(qty), barX + barW + 8, y + 4, { width: qtyW, align: 'right', lineBreak: false });
    y += 18;
  });
  return y + 12;
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
  y = needPage(doc, y, 178, ctx);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text('Umsatzverlauf (kumuliert)', MARGIN, y);
  y += 12;
  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
    .text('Summe über den gesamten Datenbestand, nicht nur den aktuellen Tag.', MARGIN, y, { width: CONTENT_W });
  y += 14;

  const chartH = 124;
  const yAxisW = 52;
  const chartX = MARGIN;
  const chartY = y;
  const max = Math.max(...series.map(s => Math.max(s.cumAll || 0, s.cumPaid || 0)), 1);
  const firstT = series[0].t || 0;
  const lastT = series[series.length - 1].t || 0;
  const withDate = lastT - firstT >= 20 * 60 * 60 * 1000;

  drawRounded(doc, chartX, chartY, CONTENT_W, chartH, 6, C.zebra);
  doc.save();
  doc.lineWidth(0.6).strokeColor(C.line).roundedRect(chartX, chartY, CONTENT_W, chartH, 6).stroke();
  doc.restore();

  const leftPad = yAxisW;
  const rightPad = 10;
  const bottomPad = 22;
  const topPad = 12;
  const plotW = CONTENT_W - leftPad - rightPad;
  const plotH = chartH - topPad - bottomPad;

  function point(i, value) {
    const px = chartX + leftPad + (i / (series.length - 1)) * plotW;
    const py = chartY + topPad + plotH - (value / max) * plotH;
    return [px, py];
  }

  doc.save();
  doc.strokeColor(C.line).lineWidth(0.4);
  for (let g = 0; g <= 3; g++) {
    const gy = chartY + topPad + (plotH * g) / 3;
    doc.moveTo(chartX + leftPad, gy).lineTo(chartX + leftPad + plotW, gy).stroke();
  }
  doc.restore();

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

  doc.font('Helvetica').fontSize(6.5).fillColor(C.muted);
  doc.text(fmtEuro(max), chartX + 4, chartY + topPad - 2, { width: yAxisW - 8, align: 'right', lineBreak: false });
  doc.text(fmtEuro(0), chartX + 4, chartY + topPad + plotH - 6, { width: yAxisW - 8, align: 'right', lineBreak: false });

  const ticks = [0, Math.floor((series.length - 1) / 2), series.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i);
  ticks.forEach(i => {
    const s = series[i];
    const label = s.t ? formatChartTick(s.t, withDate) : (s.time || '');
    const [px] = point(i, 0);
    const tw = withDate ? 72 : 40;
    let tx = px - tw / 2;
    if (tx < chartX + leftPad) tx = chartX + leftPad;
    if (tx + tw > chartX + CONTENT_W - 4) tx = chartX + CONTENT_W - tw - 4;
    doc.text(label, tx, chartY + chartH - 14, { width: tw, align: 'center', lineBreak: false });
  });

  y += chartH + 8;
  drawSwatch(doc, MARGIN, y + 1, C.all);
  doc.font('Helvetica').fontSize(8).fillColor(C.ink).text('Gesamtumsatz', MARGIN + 14, y, { lineBreak: false });
  drawSwatch(doc, MARGIN + 110, y + 1, C.paid);
  doc.text('Davon bezahlt', MARGIN + 124, y, { lineBreak: false });
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

function classifyKind(category, name) {
  const cat = String(category || '').toLowerCase();
  const nm = String(name || '').toLowerCase();
  const blob = `${cat} ${nm}`;
  if (/getränk/.test(cat) || /drink|beverage/.test(cat)) return 'Getränke';
  if (/speise|essen|imbiss|küche/.test(cat)) return 'Speisen';
  if (/wein|bier|cola|saft|schorle|aperol|sekt|wasser|radler|pils|kölsch|altbier|sprudel|limo|limonade|kaffee|tee|schnaps|korn|fanta|sprite|orangensaft|apfelsaft|a-sauer|a-süß|a-süss/.test(blob)) return 'Getränke';
  if (/wurst|brötchen|pommes|brezel|kuchen|flammkuchen|mett|fleisch|salat|suppe|pizza|snack|semmel|laugen|hotdog|frikadelle/.test(blob)) return 'Speisen';
  return 'Sonstiges';
}

function summarizeByKind(items) {
  const kinds = ['Speisen', 'Getränke', 'Sonstiges'];
  const out = {};
  for (const k of kinds) out[k] = { all: 0, paid: 0, open: 0, qty: 0 };
  for (const it of items || []) {
    const kind = classifyKind(it.category, it.name);
    const all = Number(it.revenueAll != null ? it.revenueAll : it.revenuePaid) || 0;
    const paid = Number(it.revenuePaid) || 0;
    out[kind].all += all;
    out[kind].paid += paid;
    out[kind].open += Math.max(0, all - paid);
    out[kind].qty += Number(it.soldQty) || 0;
  }
  return out;
}

function drawCover(doc, { logoPath, generatedAt }) {
  drawRect(doc, 0, 0, PAGE_W, PAGE_H, C.white);
  drawRect(doc, 0, 0, PAGE_W, 210, C.header);
  drawRect(doc, PAGE_W * 0.62, 0, PAGE_W * 0.38, 210, C.header2);
  drawRect(doc, 0, 210, PAGE_W, 5, C.accent);

  let textX = MARGIN;
  if (logoPath) {
    try {
      const head = Buffer.alloc(24);
      const fd = fs.openSync(logoPath, 'r');
      fs.readSync(fd, head, 0, 24, 0);
      fs.closeSync(fd);
      const natural = pngSize(head) || { width: 1, height: 1 };
      const logoH = 72;
      const logoW = logoH * (natural.width / natural.height);
      doc.image(logoPath, MARGIN, 58, { height: logoH, width: logoW });
      textX = MARGIN + logoW + 16;
    } catch {}
  }

  doc.font('Helvetica-Bold').fontSize(32).fillColor(C.white).text('RIKER', textX, 62, { lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor(C.sub)
    .text('Registrierkassen-Interface für Karnevalssitzungen', textX, 102, { width: 280 })
    .text('mit Echtzeit-Rückmeldungen', textX, 116, { width: 280 });

  doc.font('Helvetica').fontSize(8).fillColor(C.accent)
    .text('DOKUMENTATION', MARGIN, 250, { characterSpacing: 2 });
  doc.font('Helvetica-Bold').fontSize(26).fillColor(C.ink)
    .text('Komplettbericht', MARGIN, 268);
  doc.font('Helvetica').fontSize(12).fillColor(C.muted)
    .text('Kassen- und Umsatzdokumentation der Sitzung', MARGIN, 304, { width: CONTENT_W });

  drawRounded(doc, MARGIN, 350, CONTENT_W, 88, 8, C.zebra);
  doc.save();
  doc.lineWidth(0.8).strokeColor(C.line).roundedRect(MARGIN, 350, CONTENT_W, 88, 8).stroke();
  doc.restore();
  doc.font('Helvetica').fontSize(8).fillColor(C.muted).text('ERSTELLT AM', MARGIN + 18, 366);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(C.ink).text(formatStamp(generatedAt), MARGIN + 18, 380);
  doc.font('Helvetica').fontSize(8).fillColor(C.muted).text('EINSTUFUNG', MARGIN + 18, 406);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink).text('Vertraulich  ·  nur für den internen Gebrauch', MARGIN + 18, 420);

  doc.font('Helvetica').fontSize(8).fillColor(C.muted)
    .text('Gemeinnütziger Verein  ·  Karnevalssitzung  ·  Dokumentation der Thekenumsätze', MARGIN, 470, { width: CONTENT_W });

  drawRect(doc, 0, PAGE_H - 48, PAGE_W, 48, C.header);
  drawRect(doc, 0, PAGE_H - 48, PAGE_W, 3, C.accent);
  doc.font('Helvetica').fontSize(8).fillColor('#cbd5e1')
    .text('RIKER  ·  Registrierkassen-Interface für Karnevalssitzungen', MARGIN, PAGE_H - 28, { lineBreak: false });
}

function drawTocLine(doc, y, number, title, page) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.accent)
    .text(number, MARGIN, y, { width: 28, lineBreak: false });
  const titleX = MARGIN + 32;
  doc.font('Helvetica').fontSize(11).fillColor(C.ink).text(title, titleX, y, { lineBreak: false });
  const titleW = doc.widthOfString(title);
  const pageStr = page != null ? String(page) : '';
  const pageX = PAGE_W - MARGIN - 28;
  const dotsX = titleX + titleW + 10;
  const dotsW = Math.max(8, pageX - 6 - dotsX);
  doc.font('Helvetica').fontSize(7).fillColor(C.line)
    .text('.'.repeat(160), dotsX, y + 4, { width: dotsW, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink)
    .text(pageStr, pageX, y, { width: 28, align: 'right', lineBreak: false });
  return y + 28;
}

function drawTaxBreakdown(doc, y, items, ctx) {
  y = sectionHeading(doc, y, '02', 'Aufschlüsselung Speisen und Getränke');
  doc.font('Helvetica').fontSize(8).fillColor(C.muted)
    .text('Zuordnung nach Kategorie (Getränke / Speisen) sowie Namensheuristik. Dient der Dokumentation gegenüber dem Finanzamt.', MARGIN, y, { width: CONTENT_W });
  y += 18;

  const summary = summarizeByKind(items);
  const kinds = ['Speisen', 'Getränke', 'Sonstiges'];
  const cols = [
    { label: 'Bereich', width: 110 },
    { label: 'Menge', width: 70, align: 'right' },
    { label: 'Umsatz gesamt', width: 110, align: 'right' },
    { label: 'Bezahlt', width: 100, align: 'right' },
    { label: 'Noch offen', width: CONTENT_W - 110 - 70 - 110 - 100, align: 'right' }
  ];
  const headerH = 20;
  const rowH = 20;
  drawRect(doc, MARGIN, y, CONTENT_W, headerH, C.header);
  let x = MARGIN + 8;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.white);
  for (const col of cols) {
    doc.text(col.label.toUpperCase(), x, y + 6, { width: col.width - 10, align: col.align || 'left' });
    x += col.width;
  }
  y += headerH;

  let totAll = 0, totPaid = 0, totOpen = 0, totQty = 0;
  kinds.forEach((kind, i) => {
    const row = summary[kind];
    totAll += row.all; totPaid += row.paid; totOpen += row.open; totQty += row.qty;
    if (i % 2 === 0) drawRect(doc, MARGIN, y, CONTENT_W, rowH, C.zebra);
    const vals = [kind, String(row.qty), fmtEuro(row.all), fmtEuro(row.paid), fmtEuro(row.open)];
    x = MARGIN + 8;
    doc.font(i === 2 ? 'Helvetica' : 'Helvetica-Bold').fontSize(9).fillColor(C.ink);
    cols.forEach((col, ci) => {
      doc.text(vals[ci], x, y + 5, { width: col.width - 10, align: col.align || 'left', lineBreak: false });
      x += col.width;
    });
    y += rowH;
  });

  drawRect(doc, MARGIN, y, CONTENT_W, rowH, C.band);
  x = MARGIN + 8;
  const totals = ['Summe', String(totQty), fmtEuro(totAll), fmtEuro(totPaid), fmtEuro(totOpen)];
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink);
  cols.forEach((col, ci) => {
    doc.text(totals[ci], x, y + 5, { width: col.width - 10, align: col.align || 'left', lineBreak: false });
    x += col.width;
  });
  y += rowH + 18;

  const barMax = Math.max(totAll, 1);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text('Umsatzanteile nach Bereich', MARGIN, y);
  y += 16;
  const colors = { Speisen: C.all, Getränke: C.paid, Sonstiges: C.open };
  for (const kind of kinds) {
    const w = Math.max(summary[kind].all > 0 ? 4 : 0, (summary[kind].all / barMax) * CONTENT_W);
    drawRounded(doc, MARGIN, y, CONTENT_W, 10, 4, C.line);
    if (w) drawRounded(doc, MARGIN, y, w, 10, 4, colors[kind]);
    y += 14;
    drawSwatch(doc, MARGIN, y + 1, colors[kind]);
    doc.font('Helvetica').fontSize(8).fillColor(C.ink)
      .text(`${kind}   ${fmtEuro(summary[kind].all)}   (${pct(summary[kind].all, totAll)})`, MARGIN + 14, y);
    y += 16;
  }

  y += 8;
  y = needPage(doc, y, 168, ctx);
  drawRounded(doc, MARGIN, y, CONTENT_W, 158, 8, C.zebra);
  doc.save();
  doc.lineWidth(0.8).strokeColor(C.line).roundedRect(MARGIN, y, CONTENT_W, 158, 8).stroke();
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink)
    .text('Hinweis für die Vereinsdokumentation (Hessen / Bundesrecht)', MARGIN + 12, y + 10, { width: CONTENT_W - 24 });
  const notes = [
    'Eine typische Karnevalssitzung mit Bütten, Elferrat und Brauchtum kann als Zweckbetrieb gelten (§§ 52 Abs. 2 Nr. 23, 65 AO). Eintrittsumsätze sind dann oft körperschaftsteuerfrei und umsatzsteuerlich ermäßigt.',
    'Der Verkauf von Speisen und Getränken an der Theke wird in der Praxis regelmäßig dem steuerpflichtigen wirtschaftlichen Geschäftsbetrieb zugeordnet — nicht automatisch dem Zweckbetrieb.',
    'Ertragsteuerliche Freigrenze für steuerpflichtige wirtschaftliche Geschäftsbetriebe: 45.000 € brutto bis VZ 2025, 50.000 € ab VZ 2026 (§ 64 Abs. 3 AO). Umsatzsteuer folgt eigenen Regeln (häufig Regelsteuersatz auf Verzehr).',
    'Diese Seite ordnet nur Kassenumsätze. Eintrittsgelder, Sponsoring und gemischte Entgelte sind hier nicht enthalten.'
  ];
  let ny = y + 28;
  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted);
  for (const n of notes) {
    const h = doc.heightOfString('-  ' + n, { width: CONTENT_W - 28 });
    doc.text('-  ' + n, MARGIN + 12, ny, { width: CONTENT_W - 28 });
    ny += h + 4;
  }
  doc.font('Helvetica-Oblique').fontSize(7).fillColor(C.danger)
    .text('Keine Steuerberatung. Nur Dokumentationshilfe — rechtliche Einordnung mit Steuerberatung oder Finanzamt klären.', MARGIN + 12, y + 140, { width: CONTENT_W - 24 });
  return y + 168;
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
      margin: 0,
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

    const sectionPage = {};
    const pageNo = () => doc.bufferedPageRange().count;

    drawCover(doc, { logoPath, generatedAt });
    sectionPage.cover = pageNo();

    let ctx = { logoPath, generatedAt, sectionTitle: 'Inhaltsverzeichnis' };
    let y = startPage(doc, ctx, false);
    sectionPage.toc = pageNo();
    y = sectionHeading(doc, y, '—', 'Inhaltsverzeichnis');
    const tocY = y;
    doc.font('Helvetica').fontSize(8).fillColor(C.muted)
      .text('Die Seitenzahlen beziehen sich auf dieses Dokument.', MARGIN, y, { width: CONTENT_W });

    ctx = { logoPath, generatedAt, sectionTitle: '1  Übersicht' };
    y = startPage(doc, ctx, false);
    sectionPage.overview = pageNo();

    y = sectionHeading(doc, y, '01', 'Kennzahlen');

    const gap = 10;
    const cardW = (CONTENT_W - gap) / 2;
    const cardH = 52;
    drawKpiCard(doc, MARGIN, y, cardW, cardH, 'Umsatz bezahlt', fmtEuro(paid), C.paid);
    drawKpiCard(doc, MARGIN + cardW + gap, y, cardW, cardH, 'Umsatz gesamt', fmtEuro(all), C.all);
    y += cardH + gap;
    drawKpiCard(doc, MARGIN, y, cardW, cardH, 'Offen (Betrag)', fmtEuro(openAmt), C.open);
    drawKpiCard(doc, MARGIN + cardW + gap, y, cardW, cardH, 'Offene Bestellungen', String(openCount), C.danger);
    y += cardH + 16;

    y = drawRevenueSplit(doc, y, paid, openAmt);
    y = drawTopSellers(doc, y, items, ctx);
    y = drawTimeseries(doc, y, series, ctx);

    y = needPage(doc, y, 40, ctx);
    drawRounded(doc, MARGIN, y, CONTENT_W, 36, 6, C.band);
    doc.font('Helvetica').fontSize(8).fillColor(C.ink)
      .text(
        `${orders.length} Bestellungen   ·   ${items.length} Artikel mit Verkäufen   ·   ${productCount} Produkte im Katalog`,
        MARGIN + 12, y + 12, { width: CONTENT_W - 24 }
      );

    ctx = { logoPath, generatedAt, sectionTitle: '2  Speisen und Getränke' };
    y = startPage(doc, ctx, false);
    sectionPage.tax = pageNo();
    drawTaxBreakdown(doc, y, items, ctx);

    ctx = { logoPath, generatedAt, sectionTitle: '3  Bestellungen' };
    y = startPage(doc, ctx, false);
    sectionPage.orders = pageNo();
    y = sectionHeading(doc, y, '03', 'Bestellungen');
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

    ctx = { logoPath, generatedAt, sectionTitle: '4  Verkaufte Artikel' };
    y = startPage(doc, ctx, false);
    sectionPage.sold = pageNo();
    y = sectionHeading(doc, y, '04', 'Verkaufte Artikel');
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

    ctx = { logoPath, generatedAt, sectionTitle: '5  Produktkatalog' };
    y = startPage(doc, ctx, false);
    sectionPage.catalog = pageNo();
    y = sectionHeading(doc, y, '05', 'Produktkatalog');
    doc.font('Helvetica').fontSize(8).fillColor(C.muted)
      .text('Alle angelegten Speisen und Getränke, gruppiert nach Kategorie.', MARGIN, y, { width: CONTENT_W });
    y += 16;
    drawProductCatalog(doc, y, products || [], ctx);

    const range = doc.bufferedPageRange();
    doc.switchToPage(range.start + sectionPage.toc - 1);
    let ty = tocY + 16;
    const tocEntries = [
      { num: '', title: 'Deckblatt', page: sectionPage.cover },
      { num: '—', title: 'Inhaltsverzeichnis', page: sectionPage.toc },
      { num: '01', title: 'Kennzahlen und Übersicht', page: sectionPage.overview },
      { num: '02', title: 'Aufschlüsselung Speisen und Getränke', page: sectionPage.tax },
      { num: '03', title: 'Bestellungen', page: sectionPage.orders },
      { num: '04', title: 'Verkaufte Artikel', page: sectionPage.sold },
      { num: '05', title: 'Produktkatalog', page: sectionPage.catalog }
    ];
    for (const row of tocEntries) {
      ty = drawTocLine(doc, ty, row.num || '—', row.title, row.page);
    }

    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      if (i === 0) continue;
      drawFooter(doc, i + 1, range.count);
    }

    doc.end();
  });
}

module.exports = { buildCompleteReport };
