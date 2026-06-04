// Envoie un email de remerciement au parrain à chaque nouveau parrainage.
// Tourne en cron toutes les X minutes (cf. workflow).
//
// Variables d'environnement requises :
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   GMAIL_USER
//   GMAIL_APP_PASSWORD

import nodemailer from "nodemailer";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
} = process.env;

function frDate(d) {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

async function main() {
  const url = `${SUPABASE_URL}/rest/v1/parrainages`
    + `?notification_envoyee=eq.false`
    + `&parrain_email=not.is.null`
    + `&select=id,parrain_prenom,parrain_nom,parrain_email,filleul_prenom,filleul_nom,date_signature,date_paiement,montant_prime`
    + `&order=created_at.asc`;

  const r = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Supabase ${r.status} : ${txt}`);
  }
  const rows = (await r.json()).filter((p) => p.parrain_email && p.parrain_email.trim());
  console.log(`${rows.length} parrainage(s) à notifier.`);
  if (rows.length === 0) return;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  for (const p of rows) {
    const prenom = (p.parrain_prenom || "").trim() || "Bonjour";
    const filleul = `${p.filleul_prenom} ${p.filleul_nom}`.trim();
    const datePaie = frDate(p.date_paiement);
    const prime = (Number(p.montant_prime) || 0).toFixed(0);

    const subject = `Merci pour votre parrainage chez Moov'in Cab`;
    const html = `<!doctype html><html><body style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#131a36;background:#eef1f8;padding:20px;margin:0;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;border:1px solid #e3e7f1;">
        <div style="margin-bottom:18px;font-weight:800;letter-spacing:0.14em;color:#0a1140;font-size:16px;">MOOV'IN.CAB</div>
        <h2 style="margin:0 0 14px;color:#0a1140;font-size:20px;">Merci ${escapeHtml(prenom)} !</h2>
        <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">
          <b>${escapeHtml(filleul)}</b> vient de louer un véhicule chez nous grâce à votre parrainage.
        </p>
        <p style="font-size:15px;line-height:1.6;margin:0 0 20px;">
          Votre prime de <b style="color:#e7b24c;">${prime} €</b> vous sera versée le <b>${datePaie}</b>.
        </p>
        <p style="font-size:14px;color:#717a99;margin:0;">
          Toute l'équipe Moov'in Cab vous remercie pour votre confiance.
        </p>
        <hr style="border:none;border-top:1px solid #e3e7f1;margin:22px 0;">
        <p style="font-size:12px;color:#717a99;margin:0;">
          La Maison du Chauffeur VTC · 129 avenue Laurent Cely · 92230 Gennevilliers
        </p>
      </div>
    </body></html>`;

    try {
      const info = await transporter.sendMail({
        from: `"MOOV'IN.CAB Parrainages" <${GMAIL_USER}>`,
        to: p.parrain_email,
        subject,
        html,
      });
      console.log(`OK ${p.id} → ${p.parrain_email} (id ${info.messageId})`);

      // Marquer comme notifié
      const upd = await fetch(`${SUPABASE_URL}/rest/v1/parrainages?id=eq.${p.id}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          notification_envoyee: true,
          notification_envoyee_le: new Date().toISOString(),
        }),
      });
      if (!upd.ok) {
        console.error(`Marquage échoué pour ${p.id} :`, upd.status, await upd.text());
      }
    } catch (err) {
      console.error(`Échec envoi à ${p.parrain_email} :`, err.message);
    }
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
