// src/components/DocumentForm.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useCurrentProfile } from "../hooks/useCurrentProfile";
import CompanySelector from "./CompanySelector";
import DocumentLineRow from "./DocumentLineRow";
import DocumentTotalsSummary from "./DocumentTotalsSummary";
import { computeDocumentTotals, getNextDocumentNumber, computeFactureCommission } from "../lib/billingEngine";
import { formatEUR } from "../lib/format";

const EMPTY_LINE = () => ({
  id: crypto.randomUUID(),
  product_id: null,
  description: "",
  quantity: 1,
  unit_price: 0,
  vat_rate: 20,
  line_discount: 0,
  unit_commission: 0,
});

/**
 * documentType: 'devis' | 'facture'
 * existingDocument: si fourni, on est en mode édition
 */
export default function DocumentForm({ documentType = "devis", existingDocument = null, onSaved }) {
  const { profile, isAdmin } = useCurrentProfile();

  const [clients, setClients] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadingRefData, setLoadingRefData] = useState(true);

  const [clientId, setClientId] = useState(existingDocument?.client_id || "");
  const [companyId, setCompanyId] = useState(existingDocument?.company_id || "");
  const [status, setStatus] = useState(existingDocument?.status || "draft");
  const [globalDiscount, setGlobalDiscount] = useState(existingDocument?.global_discount || 0);
  const [shippingFee, setShippingFee] = useState(existingDocument?.shipping_fee || 0);
  const [notes, setNotes] = useState(existingDocument?.notes || "");
  const [lines, setLines] = useState(
    existingDocument?.lines?.length ? existingDocument.lines : [EMPTY_LINE()]
  );
  const [vatRuleOverridden, setVatRuleOverridden] = useState(
    existingDocument?.vat_rule_overridden || false
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    async function loadRefData() {
      setLoadingRefData(true);
      const [clientsRes, companiesRes, productsRes] = await Promise.all([
        supabase.from("clients").select("*").order("name"),
        supabase.from("companies").select("*").order("is_default", { ascending: false }),
        supabase.from("products").select("*").eq("active", true).order("name"),
      ]);
      setClients(clientsRes.data || []);
      setCompanies(companiesRes.data || []);
      setProducts(productsRes.data || []);
      setLoadingRefData(false);
    }
    loadRefData();
  }, []);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId) || null,
    [clients, clientId]
  );
  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === companyId) || null,
    [companies, companyId]
  );

  const totals = useMemo(
    () => computeDocumentTotals(lines, { globalDiscount, shippingFee }),
    [lines, globalDiscount, shippingFee]
  );

  const totalCommission = useMemo(() => computeFactureCommission(lines), [lines]);

  function updateLine(index, updatedLine) {
    const next = [...lines];
    next[index] = updatedLine;
    setLines(next);
  }

  function addLine() {
    setLines([...lines, EMPTY_LINE()]);
  }

  function removeLine(index) {
    setLines(lines.filter((_, i) => i !== index));
  }

  function handleCompanyChange(newCompanyId) {
    setCompanyId(newCompanyId);
    setVatRuleOverridden(false); // reset override quand on change de société
    // Recalcule la TVA de chaque ligne avec produit pour la nouvelle société
    const newCompany = companies.find((c) => c.id === newCompanyId);
    if (!newCompany) return;
    setLines((prev) =>
      prev.map((line) => {
        if (!line.product_id) return line;
        const product = products.find((p) => p.id === line.product_id);
        if (!product) return line;
        const vatRate = newCompany.requires_client_intra_vat ? 0 : Number(product.vat_rate);
        return { ...line, vat_rate: vatRate };
      })
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg(null);

    if (!clientId) return setErrorMsg("Sélectionnez un client.");
    if (!companyId) return setErrorMsg("Sélectionnez une société émettrice.");
    if (lines.length === 0) return setErrorMsg("Ajoutez au moins une ligne.");

    setSaving(true);
    try {
      const table = documentType === "devis" ? "devis" : "factures";
      const lineTable = documentType === "devis" ? "devis_lines" : "facture_lines";
      const fkColumn = documentType === "devis" ? "devis_id" : "facture_id";

      const payload = {
        client_id: clientId,
        company_id: companyId,
        owner_id: profile?.id,
        status,
        global_discount: Number(globalDiscount) || 0,
        shipping_fee: Number(shippingFee) || 0,
        notes,
        subtotal_ht: totals.subtotalHt,
        total_vat: totals.totalVat,
        total_ttc: totals.totalTtc,
        vat_rule_overridden: vatRuleOverridden,
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
        const { data, error } = await supabase
          .from(table)
          .insert({ ...payload, number })
          .select()
          .single();
        if (error) throw error;
        documentId = data.id;
      }

      const linesToInsert = lines.map((l, idx) => ({
        [fkColumn]: documentId,
        product_id: l.product_id,
        description: l.description,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        vat_rate: Number(l.vat_rate),
        line_discount: Number(l.line_discount) || 0,
        unit_commission: Number(l.unit_commission) || 0,
        sort_order: idx,
      }));

      const { error: linesError } = await supabase.from(lineTable).insert(linesToInsert);
      if (linesError) throw linesError;

      onSaved?.(documentId);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  async function generateNextNumber(type) {
    const prefix = type === "devis" ? "DEV" : "FAC";
    const table = type === "devis" ? "devis" : "factures";
    const year = new Date().getFullYear();
    const { data } = await supabase
      .from(table)
      .select("number")
      .like("number", `${prefix}-${year}-%`)
      .order("number", { ascending: false })
      .limit(1);
    const last = data?.[0]?.number;
    const lastSeq = last ? parseInt(last.split("-")[2], 10) : 0;
    return getNextDocumentNumber(prefix, year, lastSeq);
  }

  if (loadingRefData) return <p>Chargement…</p>;

  return (
    <form onSubmit={handleSubmit} className="document-form">
      <h2>{existingDocument ? "Modifier" : "Nouveau"} {documentType === "devis" ? "devis" : "facture"}</h2>

      {errorMsg && <div className="document-form__error">{errorMsg}</div>}

      <label>
        Client *
        <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Sélectionner un client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.company_name ? `— ${c.company_name}` : ""}
            </option>
          ))}
        </select>
      </label>

      <CompanySelector
        companies={companies}
        client={selectedClient}
        selectedCompanyId={companyId}
        onSelect={handleCompanyChange}
        overridden={vatRuleOverridden}
        onOverrideChange={setVatRuleOverridden}
        isAdmin={isAdmin}
      />

      <label>
        Statut
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {documentType === "devis" ? (
            <>
              <option value="draft">Brouillon</option>
              <option value="sent">Envoyé</option>
              <option value="accepted">Accepté</option>
              <option value="refused">Refusé</option>
              <option value="expired">Expiré</option>
            </>
          ) : (
            <>
              <option value="draft">Brouillon</option>
              <option value="sent">Envoyée</option>
              <option value="paid">Payée</option>
              <option value="overdue">En retard</option>
              <option value="cancelled">Annulée</option>
            </>
          )}
        </select>
      </label>

      <fieldset disabled={!companyId}>
        <legend>Lignes</legend>
        {lines.map((line, idx) => (
          <DocumentLineRow
            key={line.id}
            line={line}
            products={products}
            company={selectedCompany || { requires_client_intra_vat: false }}
            onChange={(updated) => updateLine(idx, updated)}
            onRemove={() => removeLine(idx)}
          />
        ))}
        <button type="button" onClick={addLine}>
          + Ajouter une ligne
        </button>
      </fieldset>

      <div className="document-form__discount-shipping">
        <label>
          Remise globale (€)
          <input
            type="number"
            step="0.01"
            min="0"
            value={globalDiscount}
            onChange={(e) => setGlobalDiscount(e.target.value)}
          />
        </label>
        <label>
          Frais de livraison (€)
          <input
            type="number"
            step="0.01"
            min="0"
            value={shippingFee}
            onChange={(e) => setShippingFee(e.target.value)}
          />
        </label>
      </div>

      <label>
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <DocumentTotalsSummary totals={totals} />

      <div className="document-form__internal-commission" title="Information interne uniquement — n'apparaît jamais sur le PDF envoyé au client">
        🔒 Commission prévisionnelle ({documentType === "devis" ? "si accepté" : "vente confirmée"}) :{" "}
        <strong>{formatEUR(totalCommission)}</strong>
      </div>

      <div className="document-form__actions">
        <button type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : `Créer le ${documentType}`}
        </button>
      </div>
    </form>
  );
}
