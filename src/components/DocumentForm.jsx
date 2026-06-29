import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useCurrentProfile } from "../hooks/useCurrentProfile";
import CompanySelector from "./CompanySelector";
import DocumentLineRow from "./DocumentLineRow";
import { computeDocumentTotals, computeFactureCommission } from "../lib/billingEngine";
import SearchSelect from "./SearchSelect";
import { formatEUR } from "../lib/format";

const EMPTY_LINE = () => ({
  id: crypto.randomUUID(),
  product_id: null, description: "", quantity: 1,
  unit_price: 0, vat_rate: 20, line_discount: 0, unit_commission: 0,
});

export default function DocumentForm({ documentType = "devis", existingDocument = null, onSaved }) {
  const { profile, isAdmin } = useCurrentProfile();
  const commercialRate = profile?.commission_rate_override ?? null;

  const [clients, setClients] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState(existingDocument?.client_id || "");
  const [companyId, setCompanyId] = useState(existingDocument?.company_id || "");
  const [status, setStatus] = useState(existingDocument?.status || "draft");
  const [globalDiscount, setGlobalDiscount] = useState(existingDocument?.global_discount || 0);
  const [shippingFee, setShippingFee] = useState(existingDocument?.shipping_fee || 0);
  const [notes, setNotes] = useState(existingDocument?.notes || "");
  const [lines, setLines] = useState(
    existingDocument?.lines?.length
      ? existingDocument.lines.map(l => ({ ...l, id: l.id || crypto.randomUUID() }))
      : [EMPTY_LINE()]
  );
  const [vatRuleOverridden, setVatRuleOverridden] = useState(existingDocument?.vat_rule_overridden || false);
  const [openLineIndex, setOpenLineIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [cr, cor, pr] = await Promise.all([
        supabase.from("clients").select("*").order("name"),
        supabase.from("companies").select("*").order("is_default", { ascending: false }),
        supabase.from("products").select("*").eq("active", true).order("name"),
      ]);
      setClients(cr.data || []);
      setCompanies(cor.data || []);
      setProducts(pr.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const selectedClient = useMemo(() => clients.find(c => c.id === clientId) || null, [clients, clientId]);
  const selectedCompany = useMemo(() => companies.find(c => c.id === companyId) || null, [companies, companyId]);
  const totals = useMemo(() => computeDocumentTotals(lines, { globalDiscount, shippingFee }), [lines, globalDiscount, shippingFee]);
  const totalCommission = useMemo(() => computeFactureCommission(lines), [lines]);

  function updateLine(index, updated) { const n = [...lines]; n[index] = updated; setLines(n); }
  function addLine() { setLines([...lines, EMPTY_LINE()]); setOpenLineIndex(lines.length); }
  function removeLine(index) { setLines(lines.filter((_, i) => i !== index)); setOpenLineIndex(null); }

  function handleCompanyChange(newCompanyId) {
    setCompanyId(newCompanyId);
    setVatRuleOverridden(false);
    const newCompany = companies.find(c => c.id === newCompanyId);
    if (!newCompany) return;
    setLines(prev => prev.map(line => {
      if (!line.product_id) return line;
      const product = products.find(p => p.id === line.product_id);
      if (!product) return line;
      return { ...line, vat_rate: newCompany.requires_client_intra_vat ? 0 : Number(product.vat_rate) };
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setErrorMsg(null);
    if (!clientId) return setErrorMsg("Selectionnez un client.");
    if (!companyId) return setErrorMsg("Selectionnez une societe emettrice.");
    if (lines.length === 0) return setErrorMsg("Ajoutez au moins une ligne.");
    setSaving(true);
    try {
      const table = documentType === "devis" ? "devis" : "factures";
      const lineTable = documentType === "devis" ? "devis_lines" : "facture_lines";
      const fkColumn = documentType === "devis" ? "devis_id" : "facture_id";
      const payload = {
        client_id: clientId, company_id: companyId, owner_id: profile?.id,
        status, global_discount: Number(globalDiscount)||0, shipping_fee: Number(shippingFee)||0,
        notes, subtotal_ht: totals.subtotalHt, total_vat: totals.totalVat,
        total_ttc: totals.totalTtc, vat_rule_overridden: vatRuleOverridden,
      };
      if (documentType === "facture") {
        payload.client_intra_vat_snapshot = selectedClient?.intra_vat_number || null;
        payload.client_intra_vat_verified_snapshot = selectedClient?.intra_vat_verified || false;
      }
      let documentId = existingDocument?.id;
      if (documentId) {
        const { error } = await supabase.from(table).update(payload).eq("id", documentId);
        if (error) throw error;
        await supabase.from(lineTable).delete().eq(fkColumn, documentId);
      } else {
        const number = await generateNextNumber(documentType);
        const { data, error } = await supabase.from(table).insert({ ...payload, number }).select().single();
        if (error) throw error;
        documentId = data.id;
      }
      const linesToInsert = lines.map((l, idx) => ({
        [fkColumn]: documentId, product_id: l.product_id, description: l.description,
        quantity: Number(l.quantity), unit_price: Number(l.unit_price),
        vat_rate: Number(l.vat_rate), line_discount: Number(l.line_discount)||0,
        unit_commission: Number(l.unit_commission)||0, sort_order: idx,
      }));
      const { error: lErr } = await supabase.from(lineTable).insert(linesToInsert);
      if (lErr) throw lErr;
      onSaved?.(documentId);
    } catch (err) {
      setErrorMsg(err.message || "Erreur lors de l'enregistrement.");
    } finally { setSaving(false); }
  }

  async function generateNextNumber(type) {
    const prefix = type === "devis" ? "DEV" : "FAC";
    const table = type === "devis" ? "devis" : "factures";
    const { data, error } = await supabase.rpc("next_document_number", { prefix, tbl: table });
    if (error || !data) {
      const year = new Date().getFullYear();
      const { data: rows } = await supabase.from(table).select("number").like("number", prefix + "-" + year + "-%").order("number", { ascending: false }).limit(1);
      const last = rows?.[0]?.number;
      const lastSeq = last ? parseInt(last.split("-")[2], 10) : 0;
      return prefix + "-" + year + "-" + String(lastSeq + 1).padStart(3, "0");
    }
    return data;
  }

  if (loading) return <p style={{textAlign:"center",padding:"40px",color:"var(--g5)"}}>Chargement...</p>;

  return (
    <form onSubmit={handleSubmit}>
      <h2 style={{fontSize:"20px",fontWeight:900,marginBottom:"16px"}}>
        {existingDocument ? "Modifier" : "Nouveau"} {documentType === "devis" ? "devis" : "facture"}
      </h2>

      {errorMsg && <div style={{background:"var(--rl)",color:"var(--r)",padding:"10px 14px",borderRadius:"8px",marginBottom:"14px",fontSize:"13px",fontWeight:600}}>{errorMsg}</div>}

      {/* Commission personnalisee */}
      {commercialRate !== null && (
        <div style={{background:"var(--pl)",color:"var(--p)",borderRadius:"10px",padding:"10px 14px",marginBottom:"14px",fontSize:"13px",fontWeight:700}}>
          Votre taux de commission : {commercialRate}% sur le prix de vente
        </div>
      )}

      {/* Client + societe */}
      <div style={{background:"#fff",borderRadius:"16px",border:"1px solid var(--g4)",boxShadow:"var(--sh)",padding:"16px",marginBottom:"12px"}}>
        <label style={{marginBottom:"6px"}}>Client *</label>
        <SearchSelect
          value={clientId}
          onChange={setClientId}
          placeholder="Rechercher un client..."
          options={clients.map(c => ({ value: c.id, label: c.name, sublabel: c.company_name || c.email || "" }))}
        />
        <CompanySelector
          companies={companies} client={selectedClient}
          selectedCompanyId={companyId} onSelect={handleCompanyChange}
          overridden={vatRuleOverridden} onOverrideChange={setVatRuleOverridden}
          isAdmin={isAdmin}
        />
        <label>Statut
          <select value={status} onChange={e => setStatus(e.target.value)}>
            {documentType === "devis"
              ? [["draft","Brouillon"],["sent","Envoye"],["accepted","Accepte"],["refused","Refuse"],["expired","Expire"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)
              : [["draft","Brouillon"],["sent","Envoyee"],["paid","Payee"],["overdue","En retard"],["cancelled","Annulee"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)
            }
          </select>
        </label>
      </div>

      {/* Lignes */}
      <div style={{marginBottom:"12px"}}>
        <div style={{fontSize:"12px",fontWeight:700,color:"var(--g5)",textTransform:"uppercase",letterSpacing:".4px",marginBottom:"10px"}}>Produits / Lignes</div>
        {lines.map((line, idx) => (
          <DocumentLineRow
            key={line.id || idx} line={line} products={products} index={idx}
            company={selectedCompany || { requires_client_intra_vat: false }}
            onChange={updated => updateLine(idx, updated)}
            onRemove={() => removeLine(idx)}
            isOpen={openLineIndex === idx}
            onToggle={() => setOpenLineIndex(openLineIndex === idx ? null : idx)}
            commercialRateOverride={commercialRate}
          />
        ))}
        <button type="button" onClick={addLine} style={{width:"100%",background:"none",color:"var(--gm)",border:"2px dashed var(--gm)",boxShadow:"none",padding:"12px",fontSize:"14px",fontWeight:700,borderRadius:"12px"}}>
          + Ajouter un produit
        </button>
      </div>

      {/* Options */}
      <div style={{background:"#fff",borderRadius:"16px",border:"1px solid var(--g4)",boxShadow:"var(--sh)",padding:"16px",marginBottom:"12px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
          <label>Remise globale (€)<input type="number" step="0.01" min="0" value={globalDiscount} onChange={e => setGlobalDiscount(e.target.value)} /></label>
          <label>Livraison (€)<input type="number" step="0.01" min="0" value={shippingFee} onChange={e => setShippingFee(e.target.value)} /></label>
        </div>
        <label>Notes<textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes pour le client..." rows={3} style={{marginBottom:0}} /></label>
      </div>

      {/* Totaux */}
      <div style={{background:"var(--g9)",borderRadius:"16px",padding:"18px",marginBottom:"12px",color:"#fff"}}>
        <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",fontSize:"14px",borderBottom:"1px solid rgba(255,255,255,.1)"}}>
          <span style={{color:"rgba(255,255,255,.6)"}}>Sous-total HT</span>
          <span>{formatEUR(totals.subtotalHt)}</span>
        </div>
        {totals.vatBreakdown.map(b => (
          <div key={b.rate} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",fontSize:"13px",borderBottom:"1px solid rgba(255,255,255,.1)"}}>
            <span style={{color:"rgba(255,255,255,.5)"}}>TVA {b.rate === 0 ? "0% (autoliquidation)" : b.rate + "%"}</span>
            <span style={{color:"rgba(255,255,255,.7)"}}>{formatEUR(b.vat)}</span>
          </div>
        ))}
        <div style={{display:"flex",justifyContent:"space-between",padding:"14px 0 8px",fontSize:"22px",fontWeight:900}}>
          <span>TOTAL TTC</span>
          <span style={{color:"#4ade80"}}>{formatEUR(totals.totalTtc)}</span>
        </div>
        {totalCommission > 0 && (
          <div style={{background:"rgba(255,255,255,.08)",borderRadius:"8px",padding:"8px 12px",fontSize:"12px",color:"rgba(255,255,255,.6)"}}>
            Commission interne : <strong style={{color:"#c4b5fd"}}>{formatEUR(totalCommission)}</strong>
            {commercialRate !== null && <span style={{marginLeft:"6px",fontSize:"11px"}}>({commercialRate}% sur vente)</span>}
          </div>
        )}
      </div>

      <button type="submit" disabled={saving} style={{width:"100%",padding:"14px",fontSize:"16px",fontWeight:800,borderRadius:"12px"}}>
        {saving ? "Enregistrement..." : existingDocument ? "Enregistrer le " + documentType : "Creer le " + documentType}
      </button>
    </form>
  );
}
