// src/pages/TeamPage.jsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function TeamPage() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // profile en édition ou {} pour nouveau

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    // Compteurs clients/devis/factures par commercial
    const { data } = await supabase
      .from("profiles")
      .select("*, clients(count), devis(count), factures(count)")
      .order("full_name");
    setProfiles(data || []);
    setLoading(false);
  }

  async function toggleActive(profile) {
    await supabase.from("profiles").update({ active: !profile.active }).eq("id", profile.id);
    load();
  }

  async function changeRole(profile, newRole) {
    await supabase.from("profiles").update({ role: newRole }).eq("id", profile.id);
    load();
  }

  if (loading) return <p>Chargement…</p>;

  return (
    <div className="team-page">
      <h1>Commerciaux</h1>
      <p className="team-page__subtitle">Gérez les utilisateurs et leurs rôles</p>

      <p className="team-page__note">
        Note : la création d'un nouveau compte se fait via l'invitation Supabase Auth
        (email + mot de passe initial), puis sa fiche profil est complétée ici.
      </p>

      {profiles.map((p) => {
        const clientsCount = p.clients?.[0]?.count ?? 0;
        const devisCount = p.devis?.[0]?.count ?? 0;
        const facturesCount = p.factures?.[0]?.count ?? 0;

        return (
          <div key={p.id} className={`team-page__card ${!p.active ? "team-page__card--inactive" : ""}`}>
            <div className="team-page__card-header">
              <h3>{p.full_name}</h3>
            </div>
            <p className="team-page__email">{p.email}</p>

            <select value={p.role} onChange={(e) => changeRole(p, e.target.value)}>
              <option value="commercial">Commercial</option>
              <option value="admin">Admin</option>
            </select>

            <div className="team-page__stats">
              <span>{clientsCount} clients</span>
              <span>{devisCount} devis</span>
              <span>{facturesCount} factures</span>
            </div>

            <button type="button" onClick={() => toggleActive(p)}>
              {p.active ? "Désactiver" : "Réactiver"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
