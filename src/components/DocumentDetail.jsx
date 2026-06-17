import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { generateDocumentPDF } from "../lib/pdfGenerator";
import { formatEUR, formatDate } from "../lib/format";
import { computeLineTotals } from "../lib/billingEngine";

const DS = [{value:"draft",label:"Brouillon"},{value:"sent",label:"Envoyé"},{value:"accepted",label:"Accepté"},{value:"refused",label:"Refusé"},{value:"expired",label:"Expiré"}];
const FS = [{value:"draft",label:"Brouillon"},{value:"sent",label:"Envoyée"},{value:"paid",label:"Payée"},{value:"overdue",label:"En retard"},{value:"cancelled",label:"Annulée"}];
const SH = [{value:"to_ship",label:"À expédier"},{value:"shipped",label:"Expédiée"},{value:"delivered",label:"Livrée"}];

export default function DocumentDetail({ documentType, documentId, onBack, onConvertToFacture }) {
  const [doc, setDoc] = useState(null);
  const [company, setCompany] = useState(null);
  const [client, setClient] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [updating, setUpdating] = useState(false);

  const table = documentType === "devis" ? "devis" : "factures";
  const lineTable = documentType === "devis" ? "devis_lines" : "facture_lines";
  const fkCol = documentType === "devis" ? "devis_id" : "facture_id";
  const isDevis = documentType === "devis";

  useEffect(() => { load(); }, [documentId]);

  async function load() {
    setLoading(true);
    const [docRes, linesRes] = await Promise.all([
      supabase.from(table).select("*, clients(*), companies(*)").eq("id", documentId).single(),
      supabase.from(lineTable).select("*").eq(fkCol, documentId).order("sort_order"),
    ]);
    if (docRes.data) { setDoc(docRes.data); setClient(docRes.data.clients); setCompany(docRes.data.companies); }
    setLines(linesRes.data || []);
    setLoading(false);
  }

  async function updateStatus(field, value) {
    setUpdating(true);
    const extra = {};
    if (field === "status" && value === "paid") extra.paid_at = new Date().toISOString().split("T")[0];
    if (field === "shipping_status" && value === "shipped") extra.shipped_at = new Date().toISOString();
    await supabase.from(table).update({ [field]: value, ...extra }).eq("id", documentId);
    await load();
    setUpdating(false);
  }

  async function convertToFacture() {
    if (!doc || !lines.length) return;
    const year = new Date().getFullYear();
    const { data: last } = await supabase.from("factures").select("number").like("number", `FAC-${year}-%`).order("number", { ascending: false }).limit(1);
    const seq = last?.[0]?.number ? parseInt(last[0].number.split("-")[2], 10) : 0;
    const number = `FAC-${year}-${String(seq + 1).padStart(3, "0")}`;
    const { data: newFac, error } = await supabase.from("factures").insert({
      number, devis_id: doc.id, client_id: doc.client_id, company_id: doc.company_id,
      owner_id: doc.owner_id, status: "draft", shipping_status: "to_ship",
      global_discount: doc.global_discount, shipping_fee: doc.shipping_fee,
      notes: doc.notes, subtotal_ht: doc.subtotal_ht, total_vat: doc.total_vat,
      total_ttc: doc.total_ttc, vat_rule_overridden: doc.vat_rule_overridden,
      client_intra_vat_snapshot: client?.intra_vat_number || null,
      client_intra_vat_verified_snapshot: client?.intra_vat_verified || false,
      issued_at: new Date().toISOString().split("T")[0],
    }).select().single();
    if (error || !newFac) return;
    await supabase.from("facture_lines").insert(lines.map((l, i) => ({
      facture_id: newFac.id, product_id: l.product_id, description: l.description,
      quantity: l.quantity, unit_price: l.unit_price, vat_rate: l.vat_rate,
      line_discount: l.line_discount, unit_commission: l.unit_commission, sort_order: i,
    })));
    await supabase.from("devis").update({ status: "accepted" }).eq("id", doc.id);
    onConvertToFacture?.(newFac.id);
  }

  async function downloadPDF() {
    if (!doc || !company || !client) return;
    setGeneratingPdf(true);
    try { await generateDocumentPDF({ documentType, document: doc, company, client, lines }); }
    catch (e) { alert("Erreur PDF : " + e.message); }
    finally { setGeneratingPdf(false); }
  }

  if (loading) return <p style={{textAlign:"center",padding:"40px",color:"var(--g5)"}}>Chargement…</p>;
  if (!doc) return <p>Introuvable.</p>;

  return (
    <div>
      <button className="doc-detail__back" onClick={onBack}>← Retour</button>

      <div className="dcard">
        <div style={{marginBottom:"12px"}}>
          <div className="dcard__num">{doc.number}</div>
          <div className="dcard__client">{client?.name}</div>
          {client?.company_name && <div className="dcard__co">{client.company_name}</div>}
          <div className="dcard__via">via {company?.name} · {formatDate(doc.issued_at || doc.created_at)}</div>
        </div>
        <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
          <button className="btn-pdf" onClick={downloadPDF} disabled={generatingPdf} style={{flex:1}}>
            {generatingPdf ? "Génération…" : "⬇ PDF"}
          </button>
          {isDevis && doc.status === "accepted" && (
            <button className="btn-conv" onClick={convertToFacture} style={{flex:1}}>→ Facture</button>
          )}
        </div>
      </div>

      <div style={{background:"#fff",borderRadius:"16px",border:"1px solid var(--g4)",boxShadow:"var(--sh)",padding:"14px 16px",marginBottom:"12px"}}>
        <div style={{display:"flex",gap:"10px",flexWrap:"wrap",alignItems:"flex-end"}}>
          <label style={{flex:1,minWidth:"130px"}}>
            Statut
            <select value={doc.status} onChange={e => updateStatus("status", e.target.value)} disabled={updating}>
              {(isDevis ? DS : FS).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          {!isDevis && (
            <label style={{flex:1,minWidth:"130px"}}>
              Expédition
              <select value={doc.shipping_status} onChange={e => updateStatus("shipping_status", e.target.value)} disabled={updating}>
                {SH.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          )}
          {!isDevis && doc.paid_at && <div style={{fontSize:"12px",color:"var(--gm)",fontWeight:700,paddingBottom:"2px"}}>✓ Payée le {formatDate(doc.paid_at)}</div>}
        </div>
      </div>

      <div style={{background:"#fff",borderRadius:"16px",border:"1px solid var(--g4)",boxShadow:"var(--sh)",padding:"18px",marginBottom:"12px"}}>
        <div style={{fontSize:"11px",fontWeight:700,color:"var(--g5)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:"14px"}}>Lignes</div>
        {lines.map((line, i) => {
          const t = computeLineTotals(line);
          return (
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"12px 0",borderBottom: i < lines.length-1 ? "1px solid var(--g3)" : "none",gap:"12px"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:"14px",fontWeight:700,color:"var(--g9)",marginBottom:"3px"}}>{line.description}</div>
                <div style={{fontSize:"12px",color:"var(--g5)"}}>{Number(line.quantity).toLocaleString("fr-FR")} × {formatEUR(line.unit_price)} HT · TVA {line.vat_rate}%{Number(line.line_discount)>0?` · Remise ${formatEUR(line.line_discount)}`:""}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:"12px",color:"var(--g5)",marginBottom:"2px"}}>{formatEUR(t.netHt)} HT</div>
                <div style={{fontSize:"17px",fontWeight:900,color:"var(--g9)"}}>{formatEUR(t.ttc)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{background:"#fff",borderRadius:"16px",border:"1px solid var(--g4)",boxShadow:"var(--sh)",padding:"18px",marginBottom:"12px"}}>
        {Number(doc.global_discount)>0 && <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:"14px",color:"var(--g5)",borderBottom:"1px solid var(--g3)"}}><span>Remise globale</span><span>-{formatEUR(doc.global_discount)}</span></div>}
        {Number(doc.shipping_fee)>0 && <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:"14px",color:"var(--g5)",borderBottom:"1px solid var(--g3)"}}><span>Frais de livraison</span><span>{formatEUR(doc.shipping_fee)}</span></div>}
        <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:"14px",color:"var(--g5)",borderBottom:"1px solid var(--g3)"}}><span>Sous-total HT</span><span>{formatEUR(doc.subtotal_ht)}</span></div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:"14px",color:"var(--g5)",borderBottom:"1px solid var(--g3)"}}><span>TVA</span><span>{formatEUR(doc.total_vat)}</span></div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0 4px",fontSize:"22px",fontWeight:900,color:"var(--g9)"}}><span>TOTAL TTC</span><span>{formatEUR(doc.total_ttc)}</span></div>
      </div>

      {doc.notes && (
        <div style={{background:"#fff",borderRadius:"16px",border:"1px solid var(--g4)",boxShadow:"var(--sh)",padding:"16px"}}>
          <div style={{fontSize:"11px",fontWeight:700,color:"var(--g5)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:"8px"}}>Notes</div>
          <p style={{fontSize:"14px",color:"var(--g6)"}}>{doc.notes}</p>
        </div>
      )}
    </div>
  );
}
