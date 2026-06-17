import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getAvailableStock } from "../lib/billingEngine";
import { formatEUR } from "../lib/format";

export default function ProductList({ onEdit, onCreateNew }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    const { data } = await supabase.from("products").select("*").order("name");
    setProducts(data || []);
    setLoading(false);
  }

  const filtered = products.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <p style={{textAlign:"center",padding:"32px",color:"var(--g5)"}}>Chargement…</p>;
  return (
    <div>
      <div className="section-head">
        <h1>Produits</h1>
        <button onClick={onCreateNew} style={{fontSize:"13px",padding:"9px 16px"}}>+ Ajouter</button>
      </div>
      <div className="gsearch">
        <span className="gsearch__icon">🔍</span>
        <input type="text" placeholder="Rechercher un produit…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {filtered.map(p => {
        const available = getAvailableStock(p);
        const isLow = available <= Number(p.low_stock_threshold);
        return (
          <div key={p.id} className="product-card" onClick={() => onEdit(p)}>
            <div className="product-card__name">{p.name}</div>
            <div className="product-card__grid">
              <div>
                <div className="pc-item__label">Prix base/{p.sale_unit}</div>
                <div className="pc-item__val pc-item__val--g">{formatEUR(p.min_price_per_unit)}</div>
              </div>
              <div>
                <div className="pc-item__label">Commission/{p.sale_unit}</div>
                <div className="pc-item__val">{formatEUR(p.base_commission_per_unit)}</div>
              </div>
              <div>
                <div className="pc-item__label">Stock physique</div>
                <div className="pc-item__val">{Number(p.stock_quantity).toFixed(2)} {p.sale_unit}</div>
              </div>
              <div>
                <div className="pc-item__label">Disponible</div>
                <div className={`pc-item__val ${isLow ? "pc-item__val--r" : "pc-item__val--g"}`}>{available.toFixed(2)} {p.sale_unit}</div>
              </div>
            </div>
            {isLow && <div className="product-card__alert">⚠️ Stock faible{p.low_stock_threshold > 0 ? ` — seuil : ${p.low_stock_threshold} ${p.sale_unit}` : ""}</div>}
          </div>
        );
      })}
    </div>
  );
}
