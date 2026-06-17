// src/lib/format.js
export function formatEUR(amount) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(amount) || 0);
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return new Intl.DateTimeFormat("fr-FR").format(d);
}

export function formatQty(qty, unit = "kg") {
  return `${Number(qty).toLocaleString("fr-FR", { maximumFractionDigits: 3 })} ${unit}`;
}
