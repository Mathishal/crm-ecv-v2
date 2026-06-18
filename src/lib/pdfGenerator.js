import jsPDF from "jspdf";
import "jspdf-autotable";
import { computeLineTotals, computeDocumentTotals } from "./billingEngine";
import { formatDate } from "./format";

function eur(v) {
  return (Number(v)||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g," ")+"\u20AC";
}

async function loadImg(url) {
  try {
    const r = await fetch(url);
    const b = await r.blob();
    return new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => res(null);
      fr.readAsDataURL(b);
    });
  } catch { return null; }
}

export async function generateDocumentPDF({ documentType, document, company, client, lines }) {
  const pdf = new jsPDF({ unit:"mm", format:"a4" });
  const W=210, ML=16, MR=16, CW=W-ML-MR;
  const isDevis = documentType==="devis";

  const totals = computeDocumentTotals(lines, {
    globalDiscount: document.global_discount,
    shippingFee: document.shipping_fee,
  });

  // ---- HEADER ----
  // Fond vert plein
  pdf.setFillColor(27, 94, 53);
  pdf.rect(0, 0, W, 48, "F");

  // Logo à gauche
  let lw = 0;
  if (company.logo_url) {
    const b64 = await loadImg(company.logo_url);
    if (b64) {
      try {
        const img = new Image();
        img.src = b64;
        await new Promise(r => { img.onload=r; img.onerror=r; });
        const ratio = (img.naturalWidth||1) / (img.naturalHeight||1);
        const lh = 28; lw = Math.min(lh * ratio, 50);
        pdf.addImage(b64, "PNG", ML, 10, lw, lh);
        lw += 10;
      } catch(e) { lw = 0; }
    }
  }

  // Si pas de logo : nom société
  if (lw === 0) {
    pdf.setTextColor(255,255,255);
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(16);
    pdf.text(company.name, ML, 28);
    lw = pdf.getTextWidth(company.name) + 10;
  }

  // Type document + numéro à droite — épuré, pas de répétition
  pdf.setTextColor(255,255,255);
  pdf.setFont("helvetica","bold");
  pdf.setFontSize(11);
  pdf.setTextColor(190,230,200);
  pdf.text(isDevis ? "DEVIS" : "FACTURE", W-MR, 20, {align:"right"});

  pdf.setTextColor(255,255,255);
  pdf.setFont("helvetica","bold");
  pdf.setFontSize(22);
  pdf.text(document.number, W-MR, 32, {align:"right"});

  pdf.setFont("helvetica","normal");
  pdf.setFontSize(9);
  pdf.setTextColor(190,230,200);
  pdf.text(formatDate(document.issued_at || document.created_at), W-MR, 40, {align:"right"});

  // ---- EMETTEUR / DESTINATAIRE ----
  let y = 60;
  const halfW = (CW/2)-4;

  // Labels
  pdf.setFillColor(244,246,248);
  pdf.roundedRect(ML, y, halfW, 5, 1,1,"F");
  pdf.roundedRect(ML+halfW+8, y, halfW, 5, 1,1,"F");
  pdf.setFont("helvetica","bold");
  pdf.setFontSize(7);
  pdf.setTextColor(107,127,142);
  pdf.text("DE", ML+3, y+3.5);
  pdf.text("A", ML+halfW+11, y+3.5);
  y += 8;

  pdf.setFont("helvetica","normal");
  pdf.setFontSize(9);
  pdf.setTextColor(26,35,48);

  const emLines = [
    company.name,
    company.address_line,
    [company.postal_code, company.city].filter(Boolean).join(" "),
    company.country_code==="FR"?"France":company.country_code==="HU"?"Hongrie":company.country_code,
    company.vat_number?"TVA : "+company.vat_number:null,
    company.email||null,
  ].filter(Boolean);

  const clLines = [
    client.name,
    client.company_name,
    client.billing_address,
    client.email,
    client.phone,
    client.intra_vat_number?"TVA : "+client.intra_vat_number:null,
  ].filter(Boolean);

  let yE=y, yC=y;
  emLines.forEach(l => { pdf.text(l, ML, yE); yE+=5; });
  clLines.forEach(l => {
    const wrapped = pdf.splitTextToSize(l, halfW);
    wrapped.forEach(wl => { pdf.text(wl, ML+halfW+8, yC); yC+=5; });
  });
  y = Math.max(yE,yC)+10;

  // ---- BANDE MÉTA ----
  pdf.setFillColor(237,247,240);
  pdf.roundedRect(ML, y, CW, 14, 2,2,"F");

  const metas = [
    ["Statut", isDevis ? (document.status||"").toUpperCase() : document.status==="paid" ? "PAYEE" : "EN COURS"],
    !isDevis && document.paid_at ? ["Payée le", formatDate(document.paid_at)] : null,
    !isDevis ? ["Echeance", document.due_at ? formatDate(document.due_at) : "30 jours"] : null,
    ["Commercial", document.owner_name || null],
  ].filter(Boolean).filter(m => m[1]);

  // Si peu de metas, ajouter padding
  const mw2 = CW / Math.max(metas.length, 2);
  metas.forEach(([label,val],i) => {
    const mx = ML+i*mw2+4;
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(7);
    pdf.setTextColor(107,127,142);
    pdf.text(label.toUpperCase(), mx, y+5.5);
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(9);
    pdf.setTextColor(27,94,53);
    pdf.text(String(val), mx, y+12);
  });
  y += 20;

  // ---- TABLEAU ----
  const rows = lines.map(line => {
    const t = computeLineTotals(line);
    const discount = Number(line.line_discount) > 0 ? `-${eur(line.line_discount)}` : "";
    return [
      line.description||"—",
      Number(line.quantity).toLocaleString("fr-FR"),
      eur(line.unit_price),
      discount || "—",
      line.vat_rate+"%",
      eur(t.netHt),
      eur(t.ttc),
    ];
  });

  pdf.autoTable({
    startY: y,
    head: [["Description","Qté","Prix HT","Remise","TVA","Total HT","Total TTC"]],
    body: rows,
    margin: { left:ML, right:MR },
    tableWidth: CW,
    styles: { fontSize:8.5, cellPadding:{top:5,bottom:5,left:3,right:3}, textColor:[26,35,48], overflow:"linebreak", lineColor:[232,236,240], lineWidth:0.3 },
    headStyles: { fillColor:[27,94,53], textColor:[255,255,255], fontStyle:"bold", fontSize:8, halign:"center" },
    columnStyles: {
      0: { cellWidth:55, halign:"left" },
      1: { cellWidth:13, halign:"center" },
      2: { cellWidth:24, halign:"right" },
      3: { cellWidth:18, halign:"right" },
      4: { cellWidth:13, halign:"center" },
      5: { cellWidth:26, halign:"right" },
      6: { cellWidth:29, halign:"right", fontStyle:"bold" },
    },
    alternateRowStyles: { fillColor:[248,250,252] },
  });

  y = pdf.lastAutoTable.finalY + 8;

  // ---- TOTAUX ----
  const TX = ML+CW/2+2;

  function tRow(label, val, opts={}) {
    if (opts.final) {
      pdf.setFillColor(27,94,53);
      pdf.roundedRect(TX-3, y-5, W-MR-TX+3, 12, 2,2,"F");
      pdf.setTextColor(255,255,255);
      pdf.setFont("helvetica","bold");
      pdf.setFontSize(13);
    } else {
      pdf.setTextColor(opts.muted ? 107 : 26, opts.muted ? 127 : 35, opts.muted ? 142 : 48);
      pdf.setFont("helvetica", opts.bold?"bold":"normal");
      pdf.setFontSize(opts.bold?10:9);
    }
    pdf.text(label, TX, y);
    pdf.text(val, W-MR, y, {align:"right"});
    y += opts.final?14:7;
  }

  if (Number(document.global_discount)>0) tRow("Remise globale","-"+eur(document.global_discount));
  if (Number(document.shipping_fee)>0) tRow("Frais de livraison",eur(document.shipping_fee));
  tRow("Sous-total HT", eur(totals.subtotalHt));
  totals.vatBreakdown.forEach(b => tRow("TVA "+(b.rate===0?"0% (autoliquidation)":b.rate+"%")+" / "+eur(b.ht),eur(b.vat),{muted:true}));
  tRow("Total TVA", eur(totals.totalVat), {bold:true});
  y += 3;
  tRow("TOTAL TTC", eur(totals.totalTtc), {final:true});
  y += 8;

  // ---- IBAN (sur devis ET factures) ----
  if (company.iban || company.bic) {
    const bw = CW/2-4;
    pdf.setFillColor(244,246,248);
    pdf.roundedRect(ML, y, bw, 28, 2,2,"F");
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(7);
    pdf.setTextColor(107,127,142);
    pdf.text("REGLEMENT PAR VIREMENT", ML+4, y+6);
    pdf.setFont("helvetica","normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(26,35,48);
    let yi = y+12;
    if (company.bank_name) { pdf.text("Banque : "+company.bank_name, ML+4, yi); yi+=5.5; }
    if (company.iban) { pdf.text("IBAN : "+company.iban, ML+4, yi); yi+=5.5; }
    if (company.bic) { pdf.text("BIC : "+company.bic, ML+4, yi); }
    y += 34;
  }

  // ---- NOTES ----
  if (document.notes?.trim()) {
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(7);
    pdf.setTextColor(107,127,142);
    pdf.text("NOTES", ML, y);
    y += 5;
    pdf.setFont("helvetica","normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(26,35,48);
    const nl = pdf.splitTextToSize(document.notes, CW);
    pdf.text(nl, ML, y);
    y += nl.length*4.5+6;
  }

  // ---- FOOTER ----
  const pages = pdf.internal.getNumberOfPages();
  for (let i=1; i<=pages; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(220,220,220);
    pdf.line(ML, 282, W-MR, 282);
    pdf.setFont("helvetica","normal");
    pdf.setFontSize(7);
    pdf.setTextColor(107,127,142);
    if (company.legal_footer_text) {
      const fl = pdf.splitTextToSize(company.legal_footer_text, CW-20);
      pdf.text(fl, ML, 286);
    }
    pdf.text(i+" / "+pages, W-MR, 291, {align:"right"});
  }

  pdf.save(document.number+".pdf");
}
