// src/components/DocumentTotalsSummary.jsx
import { formatEUR } from "../lib/format";

export default function DocumentTotalsSummary({ totals }) {
  const { subtotalHt, totalVat, totalTtc, vatBreakdown } = totals;

  return (
    <div className="doc-totals">
      <div className="doc-totals__row">
        <span>Sous-total HT</span>
        <span>{formatEUR(subtotalHt)}</span>
      </div>

      {vatBreakdown.length > 0 && (
        <div className="doc-totals__vat-breakdown">
          {vatBreakdown.map((b) => (
            <div className="doc-totals__row doc-totals__row--small" key={b.rate}>
              <span>
                {b.rate === 0 ? "Dont TVA 0% (autoliquidation)" : `Dont TVA ${b.rate}%`} sur{" "}
                {formatEUR(b.ht)}
              </span>
              <span>{formatEUR(b.vat)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="doc-totals__row">
        <span>Total TVA</span>
        <span>{formatEUR(totalVat)}</span>
      </div>

      <div className="doc-totals__row doc-totals__row--total">
        <span>Total TTC</span>
        <span>{formatEUR(totalTtc)}</span>
      </div>
    </div>
  );
}
