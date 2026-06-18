import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatDate } from "../lib/format";

const VAT_OPTIONS = [
  { value: 20, label: "20% — normal" },
  { value: 5.5, label: "5,5% — reduit" },
  { value: 10, label: "10% — intermediaire" },
];
const UNIT_OPTIONS = [
  { value: "kg", label: "Kilogramme (kg)" },
  { value: "g", label: "Gramme (g)" },
  { value: "unite", label: "Unite" },
  { value: "l", label: "Litre (l)" },
];

function NewProductModal({ onCreated, onClose }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [minPrice, setMinPrice] = useState("");
  const [baseComm, setBaseComm] = useState(100);
  const [vatRate, setVatRate] = useState(20);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSave() {
    if (!name.trim() || !minPrice) return setErr("Nom et prix de base requis.");
    setSaving(true);
    const { data, error } = await supabase.from("products").insert({
      name: name.trim(), sale_unit: unit,
      min_price_per_unit: Number(minPrice),
      base_commission_per_unit: Number(baseComm) || 0,
      vat_rate: Number(vatRate),
      stock_quantity: 0, active: true,
    }).select().single();
    if (error) { setErr(error.message); setSaving(false); return; }
    onCreated(data);
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:"#fff",borderRadius:"16px 16px 0 0",padding:"24px 20px",width:"100%",maxWidth:"480px",maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"18px"}}>
          <h3 style={{fontSize:"18px",fontWeight:800}}>Nouveau produit</h3>
          <button onClick={onClose} style={{background:"none",color:"var(--g5)",boxShadow:"none",fontSize:"20px",padding:"4px"}}>x</button>
        </div>
        {err && <div style={{background:"var(--rl)",color:"var(--r)",padding:"10px",borderRadius:"8px",marginBottom:"14px",fontSize:"13px"}}>{err}</div>}
        <label>Nom *<input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Lemon Haze" /></label>
        <label>Unite de vente
          <select value={unit} onChange={e => setUnit(e.target.value)}>
            {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </label>
        <label>Prix de base par {unit} (€) *<input type="number" step="0.01" min="0" value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="Ex: 2700" /></label>
        <label>Commission de base par {unit} (€)<input type="number" step="0.01" min="0" value={baseComm} onChange={e => setBaseComm(e.target.value)} /></label>
        <label>TVA
          <select value={vatRate} onChange={e => setVatRate(Number(e.target.value))}>
            {VAT_OPTIONS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </label>
        <div style={{display:"flex",gap:"10px",marginTop:"6px"}}>
          <button onClick={handleSave} disabled={saving} style={{flex:1,padding:"13px"}}>{saving ? "..." : "Creer"}</button>
          <button onClick={onClose} style={{flex:1,padding:"13px",background:"var(--g3)",color:"var(--g6)",boxShadow:"none"}}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

export default function StockReceptionPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [receptions, setReceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductLineIdx, setNewProductLineIdx] = useState(null);
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([{ product_id:"", quantity:"", unit_cost:"" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [sr, pr, rr] = await Promise.all([
      supabase.from("suppliers").select("*").order("name"),
      supabase.from("products").select("*").order("name"),
      supabase.from("stock_receptions").select("*, suppliers(name), stock_reception_lines(*, products(name,sale_unit))").order("received_at", { ascending: false }),
    ]);
    setSuppliers(sr.data || []);
    setProducts(pr.data || []);
    setReceptions(rr.data || []);
    setLoading(false);
  }

  function addLine() { setLines([...lines, { product_id:"", quantity:"", unit_cost:"" }]); }
  function removeLine(i) { setLines(lines.filter((_,idx) => idx !== i)); }
  function updateLine(i, field, val) { const n=[...lines]; n[i]={...n[i],[field]:val}; setLines(n); }

  function openNewProduct(lineIdx) {
    setNewProductLineIdx(lineIdx);
    setShowNewProduct(true);
  }

  async function handleProductCreated(newProduct) {
    setShowNewProduct(false);
    await load();
    if (newProductLineIdx !== null) {
      updateLine(newProductLineIdx, "product_id", newProduct.id);
    }
    setNewProductLineIdx(null);
  }

  async function handleSubmit() {
    setError(null);
    const validLines = lines.filter(l => l.product_id && Number(l.quantity) > 0);
    if (!supplierId) return setError("Selectionnez un fournisseur.");
    if (validLines.length === 0) return setError("Ajoutez au moins un produit avec une quantite.");
    setSaving(true);
    try {
      const { data: rec, error: recErr } = await supabase.from("stock_receptions").insert({
        supplier_id: supplierId, reference: reference||null,
        received_at: receivedAt, notes: notes||null,
      }).select().single();
      if (recErr) throw recErr;

      for (const line of validLines) {
        const qty = Number(line.quantity);
        const cost = line.unit_cost ? Number(line.unit_cost) : null;
        await supabase.from("stock_reception_lines").insert({ reception_id: rec.id, product_id: line.product_id, quantity: qty, unit_cost: cost });
        const { data: prod } = await supabase.from("products").select("stock_quantity").eq("id", line.product_id).single();
        const newStock = (Number(prod?.stock_quantity)||0) + qty;
        await supabase.from("products").update({ stock_quantity: newStock }).eq("id", line.product_id);
        const supplier = suppliers.find(s => s.id === supplierId);
        await supabase.from("stock_movements").insert({
          product_id: line.product_id, movement_type: "in", quantity: qty,
          note: "Reception " + (reference || rec.id.slice(0,8)) + " - " + (supplier?.name||""),
          supplier_id: supplierId, reception_id: rec.id, unit_cost: cost,
        });
      }
      setShowForm(false);
      setSupplierId(""); setReference(""); setNotes("");
      setLines([{ product_id:"", quantity:"", unit_cost:"" }]);
      load();
    } catch(err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  if (loading) return <p style={{textAlign:"center",padding:"40px",color:"var(--g5)"}}>Chargement...</p>;

  return (
    <div>
      {showNewProduct && (
        <NewProductModal
          onCreated={handleProductCreated}
          onClose={() => { setShowNewProduct(false); setNewProductLineIdx(null); }}
        />
      )}

      <div className="section-head">
        <h1>Receptions stock</h1>
        <button onClick={() => setShowForm(true)} style={{fontSize:"13px",padding:"9px 16px"}}>+ Reception</button>
      </div>

      {showForm && (
        <div style={{background:"#fff",borderRadius:"16px",border:"1px solid var(--g4)",boxShadow:"var(--sh)",padding:"18px",marginBottom:"14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"18px"}}>
            <h2 style={{fontSize:"18px",fontWeight:800}}>Nouvelle reception</h2>
            <button onClick={() => setShowForm(false)} style={{background:"none",color:"var(--g5)",boxShadow:"none",fontSize:"20px",padding:"4px"}}>x</button>
          </div>
          {error && <div style={{background:"var(--rl)",color:"var(--r)",padding:"10px 14px",borderRadius:"8px",marginBottom:"14px",fontSize:"13px"}}>{error}</div>}

          <label>Fournisseur *
            <select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">Selectionner...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
            <label>Date<input type="date" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} /></label>
            <label>Reference cmd<input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="CMD-001" /></label>
          </div>
          <label>Notes<textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></label>

          <div style={{fontSize:"12px",fontWeight:700,color:"var(--g5)",textTransform:"uppercase",letterSpacing:".4px",marginBottom:"10px",marginTop:"4px"}}>Produits recus</div>

          {lines.map((line, i) => (
            <div key={i} style={{background:"var(--g2)",borderRadius:"10px",padding:"12px",marginBottom:"8px"}}>
              <div style={{display:"flex",gap:"8px",marginBottom:"8px"}}>
                <select
                  value={line.product_id}
                  onChange={e => updateLine(i,"product_id",e.target.value)}
                  style={{flex:1,marginBottom:0}}
                >
                  <option value="">Selectionner un produit...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} (stock: {Number(p.stock_quantity).toFixed(2)} {p.sale_unit})</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => openNewProduct(i)}
                  style={{flexShrink:0,fontSize:"11px",padding:"7px 10px",background:"var(--bl)",color:"var(--b)",boxShadow:"none",border:"1px solid var(--b)",whiteSpace:"nowrap"}}
                >
                  + Nouveau
                </button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                <label style={{fontSize:"11px"}}>Quantite *<input type="number" step="0.001" min="0" value={line.quantity} onChange={e => updateLine(i,"quantity",e.target.value)} placeholder="0" style={{marginBottom:0}} /></label>
                <label style={{fontSize:"11px"}}>Prix unitaire (€)<input type="number" step="0.01" min="0" value={line.unit_cost} onChange={e => updateLine(i,"unit_cost",e.target.value)} placeholder="Optionnel" style={{marginBottom:0}} /></label>
              </div>
              {lines.length > 1 && (
                <button type="button" onClick={() => removeLine(i)} style={{width:"100%",background:"var(--rl)",color:"var(--r)",boxShadow:"none",fontSize:"12px",padding:"7px",marginTop:"8px"}}>Supprimer</button>
              )}
            </div>
          ))}

          <button type="button" onClick={addLine} style={{width:"100%",background:"none",color:"var(--gm)",border:"2px dashed var(--gm)",boxShadow:"none",padding:"10px",fontSize:"13px",fontWeight:700,borderRadius:"10px",marginBottom:"14px"}}>
            + Ajouter un produit
          </button>

          <button onClick={handleSubmit} disabled={saving} style={{width:"100%",padding:"13px",fontSize:"15px",borderRadius:"10px"}}>
            {saving ? "Enregistrement..." : "Valider la reception"}
          </button>
        </div>
      )}

      {receptions.length === 0 ? (
        <div style={{textAlign:"center",padding:"40px",color:"var(--g5)"}}>
          <div style={{fontSize:"32px",marginBottom:"12px"}}>📥</div>
          <p>Aucune reception enregistree.</p>
        </div>
      ) : receptions.map(r => (
        <div key={r.id} style={{background:"#fff",borderRadius:"16px",border:"1px solid var(--g4)",boxShadow:"var(--sh)",padding:"16px",marginBottom:"10px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"10px"}}>
            <div>
              <div style={{fontSize:"15px",fontWeight:800,color:"var(--g9)"}}>{r.suppliers?.name}</div>
              <div style={{fontSize:"12px",color:"var(--g5)"}}>{formatDate(r.received_at)}{r.reference ? " · " + r.reference : ""}</div>
            </div>
            <span style={{background:"var(--gl)",color:"var(--gm)",fontSize:"11px",padding:"3px 10px",borderRadius:"20px",fontWeight:700}}>
              {r.stock_reception_lines?.length || 0} produit(s)
            </span>
          </div>
          {r.stock_reception_lines?.map(l => (
            <div key={l.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderTop:"1px solid var(--g3)",fontSize:"13px"}}>
              <span style={{color:"var(--g9)",fontWeight:500}}>{l.products?.name}</span>
              <span style={{fontWeight:700,color:"var(--gm)"}}>+{Number(l.quantity).toFixed(2)} {l.products?.sale_unit}</span>
            </div>
          ))}
          {r.notes && <div style={{fontSize:"12px",color:"var(--g5)",marginTop:"8px",fontStyle:"italic"}}>{r.notes}</div>}
        </div>
      ))}
    </div>
  );
}
