import { jsPDF } from 'jspdf';
import { formatSats, truncAddr, scriptLabelFriendly } from './utils';

export function exportTransactionPdf(tx) {
  const doc = new jsPDF();
  let y = 20;

  doc.setFontSize(18);
  doc.text('Chain Lens — Transaction Report', 20, y);
  y += 15;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Transaction ID: ${tx.txid}`, 20, y);
  y += 8;

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.text('Summary', 20, y);
  y += 8;

  doc.setFontSize(10);
  const summary = `Moved ${formatSats(tx.total_input_sats)} from ${tx.vin.length} source(s) to ${tx.vout.length} destination(s). Fee: ${formatSats(tx.fee_sats)}`;
  doc.text(summary, 20, y, { maxWidth: 170 });
  y += 15;

  doc.setFontSize(12);
  doc.text('Value Flow', 20, y);
  y += 8;

  doc.setFontSize(10);
  doc.text('Inputs:', 20, y);
  y += 6;
  tx.vin.forEach((v, i) => {
    doc.text(`  ${i + 1}. ${formatSats(v.prevout.value_sats)} — ${scriptLabelFriendly(v.script_type)}`, 25, y);
    doc.text(truncAddr(v.address), 25, y + 5);
    y += 12;
  });

  y += 5;
  doc.text(`Fee: ${formatSats(tx.fee_sats)}`, 20, y);
  y += 8;

  doc.text('Outputs:', 20, y);
  y += 6;
  tx.vout.forEach((v, i) => {
    if (v.script_type === 'op_return') {
      doc.text(`  ${i + 1}. Data storage`, 25, y);
    } else {
      doc.text(`  ${i + 1}. ${formatSats(v.value_sats)} — ${scriptLabelFriendly(v.script_type)}`, 25, y);
      doc.text(truncAddr(v.address), 25, y + 5);
    }
    y += 12;
  });

  doc.save(`chain-lens-${tx.txid.slice(0, 16)}.pdf`);
}
