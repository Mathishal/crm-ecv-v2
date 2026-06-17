import { useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { computeUnitCommission } from "../lib/billingEngine";
import { formatEUR } from "../lib/format";

const VAT = [{value:20,label:"20% — taux normal"},{value:5.5,label:"5,5% — taux réduit"},{value:10,label:"10% — taux intermédiaire"}];
const UNITS = [{value:"kg",label:"Kilogramme (kg)"},{value:"g",label:"Gramme (g)"},{value:"unite",label:"Unité"},{value:"l",label:"Litre (l)"}];

export default function ProductForm({ existingProduct = null, onSaved }) {
  const [name, setName] = useState(existingProduct?.name || "");
  const [unit, setUnit] = useState(existingProduct?.sale_unit || "kg");
  const [price, setPrice] = useState(existingProduct?.min_price_per_unit || "");
  const [comm, setComm] = useState(existingProduct?.base_commission_per_unit ?? 100);
  const [vat, setVat] = useState(existingProduct?.vat_rate > 0 ? existingProduct.vat_rate : 20);
  const [threshold, setThreshold] = useState(existingProduct?.low_stock_threshold ?? 0);
  const [active, setActive] = useState(existingProduct?.active ?? true);
  const [simPrice, setSimPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [showStock, setShowStock] = useState(false);
  const [stockQty, setStockQty] = useState("");
  const [stockNote, setStockNote] = useState("");
  const [addingStock, setAddingStock] = useState(false);

  const simComm = useMemo(() => {
    if (!price || simPrice === "") return null;
    return computeUnitCommission(simPrice, { min_price_per_unit: price, base_commission_per_unit: comm });
  }, [simPrice, price, comm]);

  async function handleSubmit(e) {
    e.preventDefault(); setErr(null);
    if (!name.trim()) return setErr("Nom obligatoire.");
    if (!price || Number(price) <= 0) return setErr("Prix de base obligatoire.");
    setSaving(true);
    try {
      const payload = { name: name.trim(), sale_unit: unit, min_price_per_unit: Number(price), base_commission_per_unit: Number(comm)||0, vat_rate: Number(vat), low_stock_threshold: Number(threshold)||0, active };
      if (existingProduct) {
        const { error } = await supabase.from("products").update(payload).eq("id", existingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert({ ...payload, stock_quantity: 0 });
        if (error) throw error;
      }
      onSaved?.();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  async function handleAddStock(e) {
    e.preventDefault();
    if (!stockQty || Number(stockQty) <= 0) return;
    setAddingStock(true);
    try {
      const qty = Number(stockQty);
      const newStock = (Number(existingProduct.stock_quantity)||0) + qty;
      const { error } = await supabase.from("products").update({ stock_quantity: newStock }).eq("id", existingProduct.id);
      if (error) throw error;
      await supabase.from("stock_movements").insert({ product_id: existingProduct.id, movement_type: "in", quantity: qty, note: stockNote || "Entrée manuelle" });
      setShowStock(false); setStockQty(""); setStockNote("");
      onSaved?.();
    } catch (e) { console.error(e); } finally { setAddingStock(false); }
  }

  return (
    <>
      {showStock && (
        <div className="modal-ov" onClick={() => setShowStock(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Entrée de stock</h3>
            <p className="modal__sub">{existingProduct?.name} · Actuel : <strong>{Number(existingProduct?.stock_quantity||0).toFixed(3)} {unit}</strong></p>
            <form onSubmit={handleAddStock}>
              <label>Quantité à ajouter ({unit}) *
                <input type="number" step="0.001" min="0.001" value={stockQty} onChange={e => setStockQty(e.target.value)} autoFocus required />
              </label>
              <label>Note (optionnel)
                <input type="text" value={stockNote} onChange={e => setStockNote(e.target.value)} placeholder="Ex: Réception fournisseur" />
              </label>
              <div className="modal__acts">
                <button type="submit" disabled={addingStock}>{addingStock ? "Ajout…" : `+ ${stockQty||"…"} ${unit}`}</button>
                <button type="button" className="btn-ghost" onClick={() => setShowStock(false)}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-wrap">
        <div className="form-head">
          <h2>{existingProduct ? "Modifier" : "Nouveau produit"}</h2>
          {existingProduct && (
            <button type="button" className="btn-ol" onClick={() => setShowStock(true)} style={{fontSize:"13px",padding:"8px 14px"}}>
              + Stock
            </button>
          )}
        </div>

        {err && <div className="ferr">{err}</div>}

        <label>Nom du produit *
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Balenciaga" />
        </label>
        <label>Unité de vente *
          <select value={unit} onChange={e => setUnit(e.target.value)}>
            {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </label>
        <label>Prix de base par {unit} (€) *
          <input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="Ex: 2700" />
        </label>
        <p className="fhint">Prix plancher de vente et référence pour le calcul des commissions.</p>
        <label>Commission de base par {unit} (€)
          <input type="number" step="0.01" min="0" value={comm} onChange={e => setComm(e.target.value)} />
        </label>
        <p className="fhint">Garantie au prix de base. Si vendu plus cher, le commercial touche l'écart si supérieur.</p>
        <label>TVA
          <select value={vat} onChange={e => setVat(Number(e.target.value))}>
            {VAT.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </label>
        <label>Seuil alerte stock ({unit})
          <input type="number" step="0.001" min="0" value={threshold} onChange={e => setThreshold(e.target.value)} />
        </label>

        {!existingProduct && <div className="finfo">ℹ️ Le stock sera ajouté après la création via le bouton "+ Stock".</div>}

        <label className="cbrow">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
          <span>Produit actif</span>
        </label>

        <div className="sim">
          <div className="sim__title">Simulateur commission</div>
          <label>Prix de vente simulé (€/{unit})
            <input type="number" step="0.01" min="0" value={simPrice} onChange={e => setSimPrice(e.target.value)} placeholder={price || "Ex: 3000"} />
          </label>
          {simComm !== null && (
            <div className="sim__res">
              → <strong>{formatEUR(simComm)}/{unit}</strong>
              {Number(simPrice) < Number(price) && <span style={{color:"var(--a)"}}> (sous prix de base — commission 0)</span>}
            </div>
          )}
        </div>

        <button type="submit" disabled={saving} className="btn-full">
          {saving ? "Enregistrement…" : existingProduct ? "Enregistrer" : "Créer le produit"}
        </button>
      </form>
    </>
  );
}
