import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatDate } from "../lib/format";

export default function StockReceptionPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [receptions, setReceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
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

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const validLines = lines.filter(l => l.product_id && Number(l.quantity) > 0);
    if (!supplierId) return setError("Sélectionnez un fournisseur.");
    if (validLines.length === 0) return setError("Ajoutez au moins un produit avec une quantité.");
    setSaving(true);
    try {
      const { data: rec, error: recErr } = await supabase.from("stock_receptions").insert({
        supplier_id: supplierId, reference: reference||null, received_at: receivedAt, notes: notes||null,
      }).select().single();
      if (recErr) throw recErr;

      for (const line of validLines) {
        const qty = Number(line.quantity);
        const cost = line.unit_cost ? Number(line.unit_cost) : null;
        await supabase.from("stock_reception_lines").insert({ reception_id: rec.id, product_id: line.product_id, quantity: qty, unit_cost: cost });
        const { data: prod } = await supabase.from("products").select("stock_quantity").eq("id", line.product_id).single();
        const newStock = (Number(prod?.stock_quantity)||0) + qty;
        await supabase.from("products").update({ stock_quantity: newStock }).eq("id", line.product_id);
        await supabase.from("stock_movements").insert({
          product_id: line.product_id, movement_type: "in", quantity: qty,
          note: "Réception " + (reference || rec.id.slice(0,8)) + " — " + (suppliers.find(s=>s.id===supplierId)?.name||""),
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
      <div className="section-head">
        <h1>Réceptions stock</h1>
        <button onClick={() => setShowForm(true)} style={{fontSize:"13px",padding:"9px 16px"}}>+ Réception</button>
      </div>

      {showForm && (
        <div style={{background:"#fff",borderRadius:"16px",border:"1px solid var(--g4)",boxShadow:"var(--sh)",padding:"18px",marginBottom:"14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"18px"}}>
            <h2 style={{fontSize:"18px",fontWeight:800}}>Nouvelle réception</h2>
            <button onClick={() => setShowForm(false)} style={{background:"none",color:"var(--g5)",boxShadow:"none",fontSize:"20px",padding:"4px"}}>x</button>
          </div>
          {error && <div style={{background:"var(--rl)",color:"var(--r)",padding:"10px 14px",borderRadius:"8px",marginBottom:"14px",fontSize:"13px"}}>{error}</div>}

          <label>Fournisseur *
            <select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">Sélectionner...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
            <label>Date<input type="date" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} /></label>
            <label>Référence cmd<input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="CMD-001" /></label>
          </div>
          <label>Notes<textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></label>

          <div style={{fontSize:"12px",fontWeight:700,color:"var(--g5)",textTransform:"uppercase",letterSpacing:".4px",marginBottom:"10px",marginTop:"4px"}}>Produits reçus</div>

          {lines.map((line, i) => (
            <div key={i} style={{background:"var(--g2)",borderRadius:"10px",padding:"12px",marginBottom:"8px"}}>
              <label>Produit
                <select value={line.product_id} onChange={e => updateLine(i,"product_id",e.target.value)} style={{marginBottom:"8px"}}>
                  <option value="">Sélectionner un produit...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} (stock: {Number(p.stock_quantity).toFixed(2)} {p.sale_unit})</option>)}
                </select>
              </label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                <label>Quantité *<input type="number" step="0.001" min="0" value={line.quantity} onChange={e => updateLine(i,"quantity",e.target.value)} placeholder="0" /></label>
                <label>Prix unitaire (€)<input type="number" step="0.01" min="0" value={line.unit_cost} onChange={e => updateLine(i,"unit_cost",e.target.value)} placeholder="Optionnel" /></label>
              </div>
              {lines.length > 1 && (
                <button type="button" onClick={() => removeLine(i)} style={{width:"100%",background:"var(--rl)",color:"var(--r)",boxShadow:"none",fontSize:"12px",padding:"7px"}}>Supprimer</button>
              )}
            </div>
          ))}

          <button type="button" onClick={addLine} style={{width:"100%",background:"none",color:"var(--gm)",border:"2px dashed var(--gm)",boxShadow:"none",padding:"10px",fontSize:"13px",fontWeight:700,borderRadius:"10px",marginBottom:"14px"}}>
            + Ajouter un produit
          </button>

          <button onClick={handleSubmit} disabled={saving} style={{width:"100%",padding:"13px",fontSize:"15px",borderRadius:"10px"}}>
            {saving ? "Enregistrement..." : "Valider la réception"}
          </button>
        </div>
      )}

      {receptions.length === 0 ? (
        <div style={{textAlign:"center",padding:"40px",color:"var(--g5)"}}>
          <div style={{fontSize:"32px",marginBottom:"12px"}}>📥</div>
          <p>Aucune réception enregistrée.</p>
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
