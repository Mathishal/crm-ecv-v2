import { useMemo } from "react";
import { computeLineTotals, resolveLineVatRate, getAvailableStock, computeUnitCommission } from "../lib/billingEngine";
import SearchSelect from "./SearchSelect";
import { formatEUR } from "../lib/format";

export default function DocumentLineRow({ line, products, company, onChange, onRemove, index, isOpen, onToggle, commercialRateOverride }) {
  const totals = useMemo(() => computeLineTotals(line), [line]);
  const selectedProduct = useMemo(() => products.find(p => p.id === line.product_id) || null, [line.product_id, products]);

  const liveCommission = useMemo(() => {
    if (!selectedProduct && !commercialRateOverride) return Number(line.unit_commission) || 0;
    return computeUnitCommission(line.unit_price, selectedProduct, commercialRateOverride);
  }, [selectedProduct, line.unit_price, line.unit_commission, commercialRateOverride]);

  const stockWarn = useMemo(() => {
    if (!selectedProduct) return null;
    const available = getAvailableStock(selectedProduct);
    return Number(line.quantity) > available ? `Stock dispo : ${available.toFixed(2)} ${selectedProduct.sale_unit}` : null;
  }, [selectedProduct, line.quantity]);

  function handleProductSelect(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) {
      onChange({ ...line, product_id: null, description: "", unit_price: 0, vat_rate: 20, unit_commission: 0 });
      return;
    }
    const vatRate = resolveLineVatRate(company, product);
    const comm = computeUnitCommission(product.min_price_per_unit, product, commercialRateOverride);
    onChange({ ...line, product_id: product.id, description: product.name, unit_price: product.min_price_per_unit, vat_rate: vatRate, unit_commission: comm });
  }

  function handlePriceChange(newPrice) {
    const comm = computeUnitCommission(newPrice, selectedProduct, commercialRateOverride);
    onChange({ ...line, unit_price: newPrice, unit_commission: comm });
  }

  return (
    <div style={{border:"1px solid var(--g4)",borderRadius:"12px",marginBottom:"8px",overflow:"hidden",background:"#fff"}}>
      <div
        onClick={onToggle}
        style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",cursor:"pointer",background:isOpen?"var(--gl)":"#fff",transition:"background .15s"}}
      >
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:"14px",fontWeight:700,color:"var(--g9)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {line.description || <span style={{color:"var(--g5)"}}>Nouvelle ligne</span>}
          </div>
          <div style={{fontSize:"12px",color:"var(--g5)",marginTop:"2px"}}>
            {Number(line.quantity).toLocaleString("fr-FR")} x {formatEUR(line.unit_price)} · TVA {line.vat_rate}%
          </div>
        </div>
        <div style={{textAlign:"right",marginLeft:"12px",flexShrink:0}}>
          <div style={{fontSize:"16px",fontWeight:900,color:"var(--g9)"}}>{formatEUR(totals.ttc)}</div>
          <div style={{fontSize:"11px",color:"var(--g5)"}}>{formatEUR(totals.netHt)} HT</div>
        </div>
        <div style={{marginLeft:"10px",color:"var(--g5)",fontSize:"14px"}}>{isOpen ? "▲" : "▼"}</div>
      </div>

      {isOpen && (
        <div style={{padding:"14px",borderTop:"1px solid var(--g4)",background:"var(--g2)"}}>
          <label style={{marginBottom:"6px"}}>Produit</label>
          <SearchSelect
            value={line.product_id || ""}
            onChange={val => handleProductSelect(val || null)}
            placeholder="Rechercher un produit..."
            options={[
              { value: "", label: "— Produit personnalisé —", sublabel: "" },
              ...products.map(p => {
                const dispo = getAvailableStock(p);
                return { value: p.id, label: p.name, sublabel: formatEUR(p.min_price_per_unit) + "/" + p.sale_unit + " · dispo " + dispo.toFixed(2) + " " + p.sale_unit };
              })
            ]}
          />

          <label>Description
            <input type="text" value={line.description} onChange={e => onChange({...line, description:e.target.value})} placeholder="Description de la ligne" />
          </label>

          {stockWarn && <div style={{fontSize:"12px",color:"var(--a)",fontWeight:600,marginTop:"-8px",marginBottom:"12px"}}>⚠️ {stockWarn}</div>}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
            <label>Quantité
              <input type="number" step="0.001" min="0" value={line.quantity} onChange={e => onChange({...line, quantity:e.target.value})} />
            </label>
            <label>Prix unitaire (€)
              <input type="number" step="0.01" min="0" value={line.unit_price} onChange={e => handlePriceChange(e.target.value)} />
            </label>
            <label>Remise ligne (€)
              <input type="number" step="0.01" min="0" value={line.line_discount} onChange={e => onChange({...line, line_discount:e.target.value})} />
            </label>
            <label>TVA (%)
              <input type="number" step="0.1" min="0" value={line.vat_rate} onChange={e => onChange({...line, vat_rate:e.target.value})} />
            </label>
          </div>

          {(selectedProduct || commercialRateOverride) && (
            <div style={{background:"var(--pl)",borderRadius:"8px",padding:"8px 12px",fontSize:"12px",color:"var(--p)",fontWeight:600,marginBottom:"12px"}}>
              {commercialRateOverride
                ? `Commission ${commercialRateOverride}% : ${formatEUR(liveCommission)}/${selectedProduct?.sale_unit || "unité"} x ${Number(line.quantity)||0} = ${formatEUR(liveCommission * (Number(line.quantity)||0))}`
                : `Commission : ${formatEUR(liveCommission)}/${selectedProduct.sale_unit} x ${Number(line.quantity)||0} = ${formatEUR(liveCommission * (Number(line.quantity)||0))}`
              }
            </div>
          )}

          <button type="button" onClick={onRemove} style={{width:"100%",background:"var(--rl)",color:"var(--r)",boxShadow:"none",fontSize:"13px",padding:"9px"}}>
            Supprimer cette ligne
          </button>
        </div>
      )}
    </div>
  );
}
