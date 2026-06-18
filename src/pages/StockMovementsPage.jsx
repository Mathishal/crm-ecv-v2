import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatDate } from "../lib/format";

export default function StockMovementsPage({ onOpenDevis, onOpenFacture }) {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [pr, mr] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("stock_movements")
        .select("*, products(name,sale_unit), factures(id,number), devis(id,number), suppliers(name)")
        .order("created_at", { ascending: false }),
    ]);
    setProducts(pr.data || []);
    setMovements(mr.data || []);
    setLoading(false);
  }

  const filtered = selectedProduct === "all" ? movements : movements.filter(m => m.product_id === selectedProduct);
  const displayProducts = selectedProduct === "all" ? products : products.filter(p => p.id === selectedProduct);

  function getProductSummary(productId) {
    const prod = products.find(p => p.id === productId);
    const mvts = movements.filter(m => m.product_id === productId);
    const totalIn = mvts.filter(m => m.movement_type === "in").reduce((a,m) => a + Number(m.quantity), 0);
    const totalOut = mvts.filter(m => m.movement_type === "out" || m.movement_type === "reserved").reduce((a,m) => a + Number(m.quantity), 0);
    return { prod, totalIn, totalOut, current: Number(prod?.stock_quantity||0) };
  }

  if (loading) return <p style={{textAlign:"center",padding:"40px",color:"var(--g5)"}}>Chargement...</p>;

  return (
    <div>
      <div className="section-head">
        <h1>Mouvements stock</h1>
      </div>

      <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)} style={{marginBottom:"14px",borderRadius:"10px"}}>
        <option value="all">Tous les produits</option>
        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      {displayProducts.map(prod => {
        const { totalIn, totalOut, current } = getProductSummary(prod.id);
        const prodMovements = filtered.filter(m => m.product_id === prod.id);
        if (selectedProduct === "all" && prodMovements.length === 0) return null;

        return (
          <div key={prod.id} style={{marginBottom:"16px"}}>
            <div style={{background:"var(--g9)",borderRadius:"16px",padding:"16px",marginBottom:"8px",color:"#fff"}}>
              <div style={{fontSize:"16px",fontWeight:800,marginBottom:"12px"}}>{prod.name}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px"}}>
                <div>
                  <div style={{fontSize:"11px",color:"rgba(255,255,255,.5)",marginBottom:"3px",textTransform:"uppercase"}}>Entrees</div>
                  <div style={{fontSize:"18px",fontWeight:800,color:"#4ade80"}}>+{totalIn.toFixed(2)}</div>
                  <div style={{fontSize:"11px",color:"rgba(255,255,255,.4)"}}>{prod.sale_unit}</div>
                </div>
                <div>
                  <div style={{fontSize:"11px",color:"rgba(255,255,255,.5)",marginBottom:"3px",textTransform:"uppercase"}}>Sorties</div>
                  <div style={{fontSize:"18px",fontWeight:800,color:"#f87171"}}>-{totalOut.toFixed(2)}</div>
                  <div style={{fontSize:"11px",color:"rgba(255,255,255,.4)"}}>{prod.sale_unit}</div>
                </div>
                <div>
                  <div style={{fontSize:"11px",color:"rgba(255,255,255,.5)",marginBottom:"3px",textTransform:"uppercase"}}>Stock actuel</div>
                  <div style={{fontSize:"18px",fontWeight:800,color:"#fff"}}>{current.toFixed(2)}</div>
                  <div style={{fontSize:"11px",color:"rgba(255,255,255,.4)"}}>{prod.sale_unit}</div>
                </div>
              </div>
            </div>

            <div style={{background:"#fff",borderRadius:"12px",border:"1px solid var(--g4)",boxShadow:"var(--sh)"}}>
              {prodMovements.length === 0 ? (
                <p style={{padding:"16px",color:"var(--g5)",fontSize:"13px",textAlign:"center"}}>Aucun mouvement</p>
              ) : prodMovements.map((m, i) => {
                const isIn = m.movement_type === "in";
                const hasDevis = m.devis?.id;
                const hasFacture = m.factures?.id;
                const clickable = hasDevis || hasFacture;

                return (
                  <div
                    key={m.id}
                    onClick={() => {
                      if (hasDevis && onOpenDevis) onOpenDevis(m.devis);
                      else if (hasFacture && onOpenFacture) onOpenFacture(m.factures);
                    }}
                    style={{
                      display:"flex",justifyContent:"space-between",alignItems:"center",
                      padding:"12px 14px",
                      borderBottom: i < prodMovements.length-1 ? "1px solid var(--g3)" : "none",
                      cursor: clickable ? "pointer" : "default",
                    }}
                  >
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"3px",flexWrap:"wrap"}}>
                        <span style={{fontSize:"16px"}}>{isIn ? "📥" : "📤"}</span>
                        <span style={{fontSize:"13px",fontWeight:600,color:"var(--g9)"}}>
                          {isIn ? "Entree" : m.movement_type === "reserved" ? "Reservation" : "Vente"}
                        </span>
                        {hasDevis && (
                          <span style={{fontSize:"11px",background:"var(--bl)",color:"var(--b)",padding:"2px 8px",borderRadius:"20px",fontWeight:700}}>
                            {m.devis.number} →
                          </span>
                        )}
                        {hasFacture && (
                          <span style={{fontSize:"11px",background:"var(--gl)",color:"var(--gm)",padding:"2px 8px",borderRadius:"20px",fontWeight:700}}>
                            {m.factures.number} →
                          </span>
                        )}
                        {m.suppliers && (
                          <span style={{fontSize:"11px",color:"var(--b)",fontWeight:500}}>{m.suppliers.name}</span>
                        )}
                      </div>
                      <div style={{fontSize:"11px",color:"var(--g5)"}}>{formatDate(m.created_at)}</div>
                      {m.note && <div style={{fontSize:"11px",color:"var(--g5)",marginTop:"2px"}}>{m.note}</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0,marginLeft:"12px"}}>
                      <div style={{fontSize:"16px",fontWeight:800,color: isIn ? "var(--gm)" : "var(--r)"}}>
                        {isIn ? "+" : "-"}{Number(m.quantity).toFixed(2)} {m.products?.sale_unit}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div style={{textAlign:"center",padding:"40px",color:"var(--g5)"}}>
          <div style={{fontSize:"32px",marginBottom:"12px"}}>📊</div>
          <p>Aucun mouvement de stock enregistre.</p>
        </div>
      )}
    </div>
  );
}
