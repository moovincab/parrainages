// Rappel quotidien des primes de parrainage à payer.
// Interroge Supabase, envoie un email récap via Gmail SMTP si besoin.
// Variables d'environnement requises :
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  (clé secrète, bypass RLS)
//   GMAIL_USER                 (ex: mehdizaied28@gmail.com)
//   GMAIL_APP_PASSWORD         (mot de passe d'application Gmail)
//   DEST_EMAIL                 (destinataire)

import nodemailer from "nodemailer";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  DEST_EMAIL,
} = process.env;

function frDate(d) {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

function isoToday() {
  // Date du jour en heure de Paris (format YYYY-MM-DD)
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

function joursDeRetard(datePaiement, aujourdhui) {
  const a = new Date(datePaiement + "T00:00:00Z");
  const b = new Date(aujourdhui + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

async function main() {
  const today = isoToday();

  const url = `${SUPABASE_URL}/rest/v1/parrainages`
    + `?statut=eq.en_attente`
    + `&date_paiement=lte.${today}`
    + `&select=parrain_prenom,parrain_nom,filleul_prenom,filleul_nom,date_signature,date_paiement,montant_prime,statut`
    + `&order=date_paiement.asc`;

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
  const data = await r.json();
  console.log(`${data.length} parrainage(s) à payer (aujourd'hui ou en retard).`);
  if (data.length === 0) {
    console.log("Rien à payer aujourd'hui, pas d'email envoyé.");
    return;
  }

  const enRetard = data.filter((p) => joursDeRetard(p.date_paiement, today) > 0);
  const auj = data.length - enRetard.length;
  const total = data.reduce((s, p) => s + (Number(p.montant_prime) || 0), 0);

  const rows = data.map((p) => {
    const retard = joursDeRetard(p.date_paiement, today);
    const label = retard === 0
      ? '<span style="color:#b07d12;font-weight:600;">À payer aujourd\'hui</span>'
      : `<span style="color:#cf3a2c;font-weight:600;">En retard de ${retard} jour${retard > 1 ? "s" : ""}</span>`;
    const montant = (Number(p.montant_prime) || 0).toFixed(0);
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e3e7f1;">${p.parrain_prenom} ${p.parrain_nom}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e3e7f1;">${p.filleul_prenom} ${p.filleul_nom}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e3e7f1;">${frDate(p.date_paiement)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e3e7f1;text-align:right;font-weight:600;">${montant} €</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e3e7f1;">${label}</td>
    </tr>`;
  }).join("");

  const subject = `[Parrainages] ${data.length} prime${data.length > 1 ? "s" : ""} à payer (${total.toFixed(0)} €)`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#131a36;background:#eef1f8;padding:20px;margin:0;">
    <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:14px;padding:26px;border:1px solid #e3e7f1;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <span style="font-weight:800;letter-spacing:0.14em;color:#0a1140;font-size:16px;">MOOV'IN.CAB</span>
        <span style="color:#717a99;font-size:13px;">· Rappel paiements</span>
      </div>
      <h2 style="margin:0 0 4px;color:#0a1140;font-size:18px;">${data.length} prime${data.length > 1 ? "s" : ""} à payer</h2>
      <p style="color:#717a99;margin:0 0 18px;font-size:14px;">${auj} à payer aujourd'hui, ${enRetard.length} en retard. Total : <b style="color:#0a1140;">${total.toFixed(0)} €</b>.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#f7f9fe;">
          <th style="text-align:left;padding:10px 12px;font-size:11px;color:#717a99;text-transform:uppercase;letter-spacing:0.04em;">Parrain</th>
          <th style="text-align:left;padding:10px 12px;font-size:11px;color:#717a99;text-transform:uppercase;letter-spacing:0.04em;">Filleul</th>
          <th style="text-align:left;padding:10px 12px;font-size:11px;color:#717a99;text-transform:uppercase;letter-spacing:0.04em;">Paiement prévu</th>
          <th style="text-align:right;padding:10px 12px;font-size:11px;color:#717a99;text-transform:uppercase;letter-spacing:0.04em;">Prime</th>
          <th style="text-align:left;padding:10px 12px;font-size:11px;color:#717a99;text-transform:uppercase;letter-spacing:0.04em;">Statut</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:22px;font-size:13px;color:#717a99;">
        Une fois payés, marquez-les "Payé" sur <a href="https://moovincab.github.io/parrainages/" style="color:#4d7bff;text-decoration:none;font-weight:600;">l'app de parrainage</a> pour qu'ils sortent du rappel.
      </p>
    </div>
  </body></html>`;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  const info = await transporter.sendMail({
    from: `"MOOV'IN.CAB Parrainages" <${GMAIL_USER}>`,
    to: DEST_EMAIL,
    subject,
    html,
  });

  console.log("Email envoyé, messageId :", info.messageId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
