const { summarizeByKind } = require('./reportPdf');

const WIDTH = 42;

function pad(n) { return String(n).padStart(2, '0'); }

function fmtEuro(n) {
  const v = Number(n) || 0;
  const [int, dec] = v.toFixed(2).split('.');
  const withDots = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots},${dec} EUR`;
}

function formatStamp(d) {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function rule(ch = '-') {
  return ch.repeat(WIDTH);
}

function row(left, right) {
  const l = String(left);
  const r = String(right);
  const space = Math.max(1, WIDTH - l.length - r.length);
  return l + ' '.repeat(space) + r;
}

function center(text) {
  const t = String(text);
  if (t.length >= WIDTH) return t.slice(0, WIDTH);
  const padL = Math.floor((WIDTH - t.length) / 2);
  return ' '.repeat(padL) + t;
}

function buildSettlementSlip({ summaryPaid, summaryAll, orders, items, generatedAt }) {
  const paid = Number(summaryPaid) || 0;
  const all = Number(summaryAll) || 0;
  const openAmt = Math.max(0, all - paid);
  const openCount = (orders || []).filter(o => o.status === 'open').length;
  const doneCount = (orders || []).filter(o => o.status === 'complete').length;
  const paidCount = (orders || []).filter(o => o.status === 'paid').length;
  const byKind = summarizeByKind(items);
  const top = (items || []).slice(0, 8);

  const lines = [];
  lines.push(rule('='));
  lines.push(center('RIKER'));
  lines.push(center('ABRECHNUNG'));
  lines.push(rule('='));
  lines.push(center(formatStamp(generatedAt || new Date())));
  lines.push(rule());
  lines.push('KENNZAHLEN');
  lines.push(row('Umsatz bezahlt', fmtEuro(paid)));
  lines.push(row('Umsatz gesamt', fmtEuro(all)));
  lines.push(row('Noch offen', fmtEuro(openAmt)));
  lines.push(row('Offene Bestellungen', String(openCount)));
  lines.push(row('Bestellungen gesamt', String((orders || []).length)));
  lines.push(rule());
  lines.push('SPEISEN / GETRAENKE');
  for (const kind of ['Speisen', 'Getränke', 'Sonstiges']) {
    const k = byKind[kind];
    lines.push(kind);
    lines.push(row(`  Menge ${k.qty}`, fmtEuro(k.all)));
    lines.push(row('  bezahlt', fmtEuro(k.paid)));
    lines.push(row('  offen', fmtEuro(k.open)));
  }
  lines.push(rule());
  lines.push('TOP PRODUKTE');
  if (!top.length) {
    lines.push('  keine Verkaeufe');
  } else {
    top.forEach((it, i) => {
      const name = String(it.name || '—');
      const qty = String(it.soldQty || 0);
      const maxName = WIDTH - 6 - qty.length;
      const clipped = name.length > maxName ? name.slice(0, maxName - 1) + '.' : name;
      lines.push(row(` ${String(i + 1).padStart(2)}. ${clipped}`, qty));
    });
  }
  lines.push(rule());
  lines.push('BESTELLSTATUS');
  lines.push(row('offen', String(openCount)));
  lines.push(row('fertig', String(doneCount)));
  lines.push(row('bezahlt', String(paidCount)));
  lines.push(rule('='));
  lines.push(center('Intern  ·  Thekenabrechnung'));
  lines.push(center('Details siehe PDF-Bericht'));
  lines.push(rule('='));
  lines.push('');
  return lines.join('\n');
}

module.exports = { buildSettlementSlip };
