// src/components/DocumentLineRow.jsx
import { useMemo } from "react";
import { computeLineTotals, resolveLineVatRate, getAvailableStock, computeUnitCommission } from "../lib/billingEngine";
import { formatEUR } from "../lib/format";

/**
 * Une ligne éditable de devis/facture.
 * Quand un produit est sélectionné, le prix et la TVA se pré-remplissent
 * automatiquement selon la société émettrice choisie, mais restent éditables
 * (cas négociation commerciale, prix custom, etc.)
 */
export default function DocumentLineRow({
  line,
  products,
  company,
  onChange,
  onRemove,
}) {
  const totals = useMemo(() => computeLineTotals(line), [line]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === line.product_id) || null,
    [line.product_id, products]
  );

  // La commission se recalcule en direct à chaque changement de prix unitaire,
  // selon la règle: max(commission_base, prix_vente - prix_base), 0 si vendu
  // sous le prix de base. Elle n'a de sens que si un produit catalogue est
  // sélectionné (un "produit personnalisé" n'a pas de référence de prix de base).
  const liveUnitCommission = useMemo(() => {
    if (!selectedProduct) return Number(line.unit_commission) || 0;
    return computeUnitCommission(line.unit_price, selectedProduct);
  }, [selectedProduct, line.unit_price, line.unit_commission]);

  const selectedProductStockWarning = useMemo(() => {
    if (!line.product_id) return null;
    const product = products.find((p) => p.id === line.product_id);
    if (!product) return null;
    const available = getAvailableStock(product);
    const qty = Number(line.quantity) || 0;
    if (qty > available) {
      return `Quantité demandée (${qty} ${product.sale_unit}) supérieure au stock disponible (${available} ${product.sale_unit}).`;
    }
    return null;
  }, [line.product_id, line.quantity, products]);

  // Synchronise unit_commission dans l'état de la ligne dès que le calcul live change,
  // pour que la valeur persistée en base (au moment du save) soit toujours juste,
  // même si l'utilisateur ne re-touche jamais le champ après avoir changé le prix.
  const handlePriceChange = (newPrice) => {
    const commission = selectedProduct ? computeUnitCommission(newPrice, selectedProduct) : line.unit_commission;
    onChange({ ...line, unit_price: newPrice, unit_commission: commission });
  };

  function handleProductSelect(productId) {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      onChange({ ...line, product_id: null });
      return;
    }
    const vatRate = resolveLineVatRate(company, product);
    onChange({
      ...line,
      product_id: product.id,
      description: product.name,
      unit_price: product.min_price_per_unit,
      vat_rate: vatRate,
      unit_commission: product.base_commission_per_unit,
    });
  }

  return (
    <div className="doc-line-row">
      <div className="doc-line-row__main">
        <select
          value={line.product_id || ""}
          onChange={(e) => handleProductSelect(e.target.value || null)}
          className="doc-line-row__product-select"
        >
          <option value="">— Produit personnalisé —</option>
          {products.map((p) => {
            const available = getAvailableStock(p);
            return (
              <option key={p.id} value={p.id}>
                {p.name} ({formatEUR(p.min_price_per_unit)}/{p.sale_unit}) — dispo: {available.toLocaleString("fr-FR")} {p.sale_unit}
              </option>
            );
          })}
        </select>

        <input
          type="text"
          value={line.description}
          onChange={(e) => onChange({ ...line, description: e.target.value })}
          placeholder="Description"
          className="doc-line-row__description"
        />
      </div>

      {selectedProductStockWarning && (
        <p className="doc-line-row__stock-warning">⚠️ {selectedProductStockWarning}</p>
      )}

      <div className="doc-line-row__numbers">
        <label>
          Qté
          <input
            type="number"
            step="0.001"
            min="0"
            value={line.quantity}
            onChange={(e) => onChange({ ...line, quantity: e.target.value })}
          />
        </label>

        <label>
          Prix unitaire (€)
          <input
            type="number"
            step="0.01"
            min="0"
            value={line.unit_price}
            onChange={(e) => handlePriceChange(e.target.value)}
          />
        </label>

        <label>
          Remise ligne (€)
          <input
            type="number"
            step="0.01"
            min="0"
            value={line.line_discount}
            onChange={(e) => onChange({ ...line, line_discount: e.target.value })}
          />
        </label>

        <label>
          TVA (%)
          <input
            type="number"
            step="0.1"
            min="0"
            value={line.vat_rate}
            onChange={(e) => onChange({ ...line, vat_rate: e.target.value })}
            title="Pré-rempli selon la société émettrice et le produit, modifiable si besoin"
          />
        </label>
      </div>

      <div className="doc-line-row__totals">
        <span className="doc-line-row__ht">{formatEUR(totals.netHt)} HT</span>
        <span className="doc-line-row__ttc">{formatEUR(totals.ttc)} TTC</span>
        {selectedProduct && (
          <span className="doc-line-row__commission" title="Commission interne — jamais affichée au client">
            Commission : {formatEUR(liveUnitCommission)}/{selectedProduct.sale_unit} ×{" "}
            {Number(line.quantity) || 0} = {formatEUR(liveUnitCommission * (Number(line.quantity) || 0))}
          </span>
        )}
      </div>

      <button
        type="button"
        className="doc-line-row__remove"
        onClick={onRemove}
        aria-label="Supprimer la ligne"
      >
        ✕
      </button>
    </div>
  );
}
