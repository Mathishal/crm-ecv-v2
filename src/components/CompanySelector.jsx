// src/components/CompanySelector.jsx
import { getCompanyOptionsForClient } from "../lib/billingEngine";

/**
 * Sélecteur de société émettrice. Affiche un avertissement (non-bloquant)
 * si la société choisie nécessite normalement une TVA intraco vérifiée
 * que le client n'a pas. Un admin peut cocher "Forcer malgré l'avertissement".
 */
export default function CompanySelector({
  companies,
  client,
  selectedCompanyId,
  onSelect,
  overridden,
  onOverrideChange,
  isAdmin,
}) {
  const options = getCompanyOptionsForClient(companies, client);
  const selectedOption = options.find((o) => o.company.id === selectedCompanyId);

  return (
    <div className="company-selector">
      <label>
        Société émettrice *
        <select
          value={selectedCompanyId || ""}
          onChange={(e) => onSelect(e.target.value)}
          disabled={!client}
        >
          <option value="" disabled>
            {client ? "Sélectionner une société" : "Sélectionnez d'abord un client"}
          </option>
          {options.map(({ company, eligible }) => (
            <option key={company.id} value={company.id}>
              {company.name} {!eligible ? "⚠️" : ""}
            </option>
          ))}
        </select>
      </label>

      {selectedOption && selectedOption.warning && (
        <div className="company-selector__warning">
          <p>⚠️ {selectedOption.warning}</p>
          {isAdmin ? (
            <label className="company-selector__override">
              <input
                type="checkbox"
                checked={overridden}
                onChange={(e) => onOverrideChange(e.target.checked)}
              />
              Forcer la création malgré l'avertissement (sera tracé pour audit comptable)
            </label>
          ) : (
            <p className="company-selector__warning-note">
              Seul un administrateur peut forcer la création dans ce cas. Contacte un admin ou
              corrige la fiche client (numéro de TVA intracommunautaire + vérification).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
