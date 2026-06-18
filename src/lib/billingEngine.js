// src/lib/billingEngine.js
// ============================================================
// Moteur de facturation : règles société / TVA / calculs de lignes
// ============================================================

/**
 * Détermine si une société peut être sélectionnée pour un client donné.
 * Règle: si company.requires_client_intra_vat est true (cas Atlas Hongrie),
 * le client DOIT avoir un intra_vat_number renseigné ET intra_vat_verified = true.
 *
 * IMPORTANT: ceci est un AVERTISSEMENT non-bloquant. Un admin peut choisir
 * de forcer la sélection malgré tout (override) — voir `allowOverride`.
 * Dans ce cas le document créé doit avoir vat_rule_overridden = true pour audit.
 */
export function isCompanyEligibleForClient(company, client) {
  if (!company.requires_client_intra_vat) return { eligible: true, warning: null };

  const hasVat = !!client?.intra_vat_number?.trim();
  const isVerified = client?.intra_vat_verified === true;

  if (!hasVat) {
    return {
      eligible: false,
      warning:
        "Ce client n'a pas de numéro de TVA intracommunautaire renseigné. Cette société est normalement réservée au B2B intracommunautaire.",
    };
  }
  if (!isVerified) {
    return {
      eligible: false,
      warning:
        "Le numéro de TVA intracommunautaire de ce client n'a pas été vérifié (case à cocher sur la fiche client).",
    };
  }
  return { eligible: true, warning: null };
}

/**
 * Retourne la liste des sociétés utilisables pour un client donné,
 * avec le statut d'éligibilité de chacune (pour affichage UI : grisé + message).
 */
export function getCompanyOptionsForClient(companies, client) {
  return companies.map((company) => ({
    company,
    ...isCompanyEligibleForClient(company, client),
  }));
}

/**
 * Détermine le taux de TVA applicable à UNE LIGNE (produit) en fonction
 * de la société émettrice choisie.
 * - Si la société requiert TVA intraco vérifiée (Atlas HU) → 0%
 * - Sinon (El Camino Verde FR) → le taux propre au produit (5.5% ou 20%)
 */
export function resolveLineVatRate(company, product) {
  if (company.requires_client_intra_vat) return 0;
  return Number(product?.vat_rate ?? 20);
}

/**
 * Calcule les totaux d'une ligne (devis ou facture)
 */
export function computeLineTotals(line) {
  const qty = Number(line.quantity) || 0;
  const unitPrice = Number(line.unit_price) || 0;
  const discount = Number(line.line_discount) || 0;
  const vatRate = Number(line.vat_rate) || 0;

  const grossHt = qty * unitPrice;
  const netHt = Math.max(0, grossHt - discount);
  const vatAmount = netHt * (vatRate / 100);
  const ttc = netHt + vatAmount;

  return {
    grossHt: round2(grossHt),
    netHt: round2(netHt),
    vatAmount: round2(vatAmount),
    ttc: round2(ttc),
  };
}

/**
 * Calcule les totaux globaux d'un devis/facture à partir de ses lignes,
 * en appliquant la remise globale et les frais de livraison.
 * NOTE: la remise globale est répartie proportionnellement avant TVA
 * pour que le total TVA reste cohérent par taux.
 */
export function computeDocumentTotals(lines, { globalDiscount = 0, shippingFee = 0 } = {}) {
  const lineResults = lines.map((l) => ({ line: l, ...computeLineTotals(l) }));
  const sumNetHt = lineResults.reduce((acc, r) => acc + r.netHt, 0);

  // Répartition proportionnelle de la remise globale par ligne, par taux de TVA
  const discountRatio = sumNetHt > 0 ? Number(globalDiscount) / sumNetHt : 0;

  const vatBuckets = {}; // { '20': { ht, vat }, '5.5': {...}, '0': {...} }

  lineResults.forEach((r) => {
    const adjustedHt = r.netHt - r.netHt * discountRatio;
    const vatRate = Number(r.line.vat_rate) || 0;
    const vatKey = vatRate.toFixed(2);
    if (!vatBuckets[vatKey]) vatBuckets[vatKey] = { rate: vatRate, ht: 0, vat: 0 };
    vatBuckets[vatKey].ht += adjustedHt;
    vatBuckets[vatKey].vat += adjustedHt * (vatRate / 100);
  });

  const subtotalHt = round2(sumNetHt - Number(globalDiscount));
  const totalVat = round2(
    Object.values(vatBuckets).reduce((acc, b) => acc + b.vat, 0)
  );
  const totalTtc = round2(subtotalHt + totalVat + Number(shippingFee || 0));

  return {
    subtotalHt,
    totalVat,
    totalTtc,
    vatBreakdown: Object.values(vatBuckets).map((b) => ({
      rate: b.rate,
      ht: round2(b.ht),
      vat: round2(b.vat),
    })),
  };
}

/**
 * Calcule la commission totale pour une facture donnée, à partir des lignes.
 * Commission = quantité * commission_unitaire (snapshot au moment de la vente).
 */
export function computeFactureCommission(lines) {
  return round2(
    lines.reduce((acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.unit_commission) || 0), 0)
  );
}

/**
 * Calcule la commission unitaire (par kg/unité) selon la règle de marge
 * progressive validée avec l'utilisateur :
 * - écart = prix de vente unitaire - prix de base du produit (= min_price_per_unit)
 * - si écart < 0 (vendu sous le prix de base) → commission = 0
 * - sinon → commission = max(commission de base du produit, écart)
 *
 * Exemple: prix de base 2700€/kg, commission de base 100€/kg
 *   - vendu à 2700€ → écart = 0 → commission = max(100, 0) = 100€/kg
 *   - vendu à 3000€ → écart = 300 → commission = max(100, 300) = 300€/kg
 *   - vendu à 2500€ → écart = -200 → commission = 0€/kg
 */
/**
 * Calcule la commission unitaire selon la règle :
 * - Si le commercial a un taux perso (commission_rate_override en %) :
 *   commission = prix_vente × taux / 100
 * - Sinon : max(commission_base_produit, écart_prix), 0 si vendu sous le prix de base
 */
export function computeUnitCommission(unitSalePrice, product, commercialRateOverride = null) {
  const salePrice = Number(unitSalePrice) || 0;

  // Taux personnalisé du commercial
  if (commercialRateOverride !== null && commercialRateOverride > 0) {
    return round2(salePrice * (Number(commercialRateOverride) / 100));
  }

  // Logique par défaut
  const basePrice = Number(product?.min_price_per_unit) || 0;
  const baseCommission = Number(product?.base_commission_per_unit) || 0;
  const gap = salePrice - basePrice;
  if (gap < 0) return 0;
  return round2(Math.max(baseCommission, gap));
}

/**
 * Stock réellement disponible à la vente = stock physique - quantité réservée
 * par des devis actifs (brouillon/envoyé/accepté).
 */
export function getAvailableStock(product) {
  const stock = Number(product?.stock_quantity) || 0;
  const reserved = Number(product?.reserved_quantity) || 0;
  return Math.max(0, stock - reserved);
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Génère le prochain numéro de document (devis ou facture) au format
 * existant: DEV-2026-196 / FAC-2026-129 — séquence commune, peu importe
 * la société émettrice (conformément au choix utilisateur).
 * `lastNumber` est le dernier numéro connu en base pour ce préfixe+année.
 */
export function getNextDocumentNumber(prefix, year, lastSequence) {
  const next = (lastSequence || 0) + 1;
  return `${prefix}-${year}-${String(next).padStart(3, "0")}`;
}
