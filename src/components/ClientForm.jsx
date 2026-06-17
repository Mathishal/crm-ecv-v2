// src/components/ClientForm.jsx
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useCurrentProfile } from "../hooks/useCurrentProfile";

export default function ClientForm({ existingClient = null, onSaved }) {
  const { profile } = useCurrentProfile();

  const [name, setName] = useState(existingClient?.name || "");
  const [companyName, setCompanyName] = useState(existingClient?.company_name || "");
  const [email, setEmail] = useState(existingClient?.email || "");
  const [phone, setPhone] = useState(existingClient?.phone || "");
  const [billingAddress, setBillingAddress] = useState(existingClient?.billing_address || "");
  const [shippingAddress, setShippingAddress] = useState(existingClient?.shipping_address || "");
  const [notes, setNotes] = useState(existingClient?.notes || "");

  const [intraVatNumber, setIntraVatNumber] = useState(existingClient?.intra_vat_number || "");
  const [intraVatVerified, setIntraVatVerified] = useState(
    existingClient?.intra_vat_verified || false
  );

  const [sameAsShipping, setSameAsShipping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Si l'utilisateur décoche la vérification après l'avoir cochée, ou change
  // le numéro de TVA, on invalide automatiquement la vérification précédente
  // (un n° différent n'a pas été vérifié pour CE numéro).
  function handleVatNumberChange(value) {
    setIntraVatNumber(value);
    if (value !== existingClient?.intra_vat_number) {
      setIntraVatVerified(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) return setErrorMsg("Le nom du client est obligatoire.");

    setSaving(true);
    try {
      const wasVerifiedBefore = existingClient?.intra_vat_verified || false;
      const isNowVerified = intraVatVerified;

      const payload = {
        name: name.trim(),
        company_name: companyName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        billing_address: billingAddress.trim() || null,
        shipping_address: (sameAsShipping ? billingAddress : shippingAddress).trim() || null,
        notes: notes.trim() || null,
        intra_vat_number: intraVatNumber.trim() || null,
        intra_vat_verified: isNowVerified,
      };

      // On trace qui a vérifié et quand, uniquement quand la vérification
      // passe de false à true (évite d'écraser l'info à chaque sauvegarde).
      if (isNowVerified && !wasVerifiedBefore) {
        payload.intra_vat_verified_at = new Date().toISOString();
        payload.intra_vat_verified_by = profile?.id || null;
      } else if (!isNowVerified) {
        payload.intra_vat_verified_at = null;
        payload.intra_vat_verified_by = null;
      }

      if (existingClient) {
        const { error } = await supabase.from("clients").update(payload).eq("id", existingClient.id);
        if (error) throw error;
        onSaved?.(existingClient.id);
      } else {
        const { data, error } = await supabase
          .from("clients")
          .insert({ ...payload, owner_id: profile?.id })
          .select()
          .single();
        if (error) throw error;
        onSaved?.(data.id);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Erreur lors de l'enregistrement du client.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="client-form">
      <h2>{existingClient ? "Modifier le client" : "Nouveau client"}</h2>

      {errorMsg && <div className="client-form__error">{errorMsg}</div>}

      <label>
        Nom * (obligatoire)
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label>
        Entreprise
        <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
      </label>

      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>

      <label>
        Téléphone
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>

      <label>
        Adresse de facturation
        <textarea value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} />
      </label>

      <label className="client-form__checkbox">
        <input
          type="checkbox"
          checked={sameAsShipping}
          onChange={(e) => setSameAsShipping(e.target.checked)}
        />
        Adresse de livraison identique à la facturation
      </label>

      {!sameAsShipping && (
        <label>
          Adresse de livraison
          <textarea value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} />
        </label>
      )}

      {/* ---- Bloc TVA intracommunautaire ---- */}
      <fieldset className="client-form__vat-block">
        <legend>TVA intracommunautaire</legend>
        <p className="client-form__vat-help">
          Requis uniquement pour facturer ce client via Atlas Group Kft (Hongrie) en
          exonération de TVA (0%, autoliquidation B2B intracommunautaire).
        </p>

        <label>
          Numéro de TVA intracommunautaire
          <input
            type="text"
            value={intraVatNumber}
            onChange={(e) => handleVatNumberChange(e.target.value)}
            placeholder="Ex: FR12345678900, DE123456789…"
          />
        </label>

        <label className="client-form__checkbox">
          <input
            type="checkbox"
            checked={intraVatVerified}
            onChange={(e) => setIntraVatVerified(e.target.checked)}
            disabled={!intraVatNumber.trim()}
          />
          Numéro vérifié manuellement (VIES ou autre source)
        </label>

        {existingClient?.intra_vat_verified_at && intraVatVerified && (
          <p className="client-form__vat-meta">
            Vérifié le {new Date(existingClient.intra_vat_verified_at).toLocaleDateString("fr-FR")}
          </p>
        )}

        {intraVatNumber.trim() && !intraVatVerified && (
          <p className="client-form__vat-warning">
            ⚠️ Tant que ce numéro n'est pas coché comme vérifié, la société Atlas Hongrie ne
            sera pas proposée sans avertissement sur les devis/factures de ce client.
          </p>
        )}
      </fieldset>

      <label>
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <div className="client-form__actions">
        <button type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : existingClient ? "Enregistrer" : "Créer le client"}
        </button>
      </div>
    </form>
  );
}
