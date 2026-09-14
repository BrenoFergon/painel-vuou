// fetch-google.mjs — puxa a Google Ads API e reescreve ../data-google.json
// Rodado pelo GitHub Actions. Node 20+ (fetch global).
// Env: GOOGLE_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
//      GOOGLE_DEVELOPER_TOKEN (obrigatórias)
//      GOOGLE_CUSTOMER_ID, GOOGLE_LOGIN_CUSTOMER_ID, GOOGLE_SINCE (opcionais)

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REFRESH  = process.env.GOOGLE_REFRESH_TOKEN;
const CLIENT   = process.env.GOOGLE_CLIENT_ID;
const SECRET   = process.env.GOOGLE_CLIENT_SECRET;
const DEV_TOK  = process.env.GOOGLE_DEVELOPER_TOKEN;
const CUSTOMER = process.env.GOOGLE_CUSTOMER_ID   || "7843066364";
const MCC      = process.env.GOOGLE_LOGIN_CUSTOMER_ID || "9147312925";
const SINCE    = process.env.GOOGLE_SINCE          || "2026-09-07";
const API_VER  = "v18";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT  = join(ROOT, "data-google.json");

if (!REFRESH || !CLIENT || !SECRET || !DEV_TOK) {
  console.error("ERRO: defina os secrets GOOGLE_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_DEVELOPER_TOKEN.");
  process.exit(1);
}

const PLAN = [
  { id: "24220495323", key: "G1", tag: "G1",
    label: "Lead · Contato WhatsApp Madrid",
    goal: "Gerar leads via pesquisa Google para passagens Madrid — contato pelo WhatsApp.",
    type: "SEARCH",
    kpi: "conv", kpi_label: "Conversões", kpi_unit: "conversão",
    kpi2: "ck",  kpi2_label: "Cliques",    kpi2_unit: "clique" },
];

async function getAccessToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT,
      client_secret: SECRET,
      refresh_token: REFRESH,
    }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`OAuth: ${j.error_description || j.error}`);
  return j.access_token;
}

async function gaql(token, query) {
  const url = `https://googleads.googleapis.com/${API_VER}/customers/${CUSTOMER}/googleAds:search`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "developer-token": DEV_TOK,
      "login-customer-id": MCC,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, pageSize: 10000 }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`GAQL: ${j.error.message}`);
  return (j.results || []).map(r => {
    const flat = {};
    for (const [cat, fields] of Object.entries(r)) {
      if (typeof fields === "object" && fields !== null) {
        for (const [k, v] of Object.entries(fields)) flat[k] = v;
      } else {
        flat[cat] = fields;
      }
    }
    return flat;
  });
}

const micro = v => +(v / 1_000_000).toFixed(2);

async function main() {
  const token = await getAccessToken();
  const until = new Date().toISOString().slice(0, 10);
  const campIds = PLAN.map(p => p.id).join(",");

  const campRows = await gaql(token,
    `SELECT campaign.id, campaign.name, campaign.status, campaign.campaign_budget
     FROM campaign
     WHERE campaign.id IN (${campIds})`);

  const agRows = await gaql(token,
    `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.campaign
     FROM ad_group
     WHERE campaign.id IN (${campIds}) AND ad_group.status != 'REMOVED'`);

  const adRows = await gaql(token,
    `SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status,
            ad_group.id, ad_group.name, campaign.id
     FROM ad_group_ad
     WHERE campaign.id IN (${campIds}) AND ad_group_ad.status != 'REMOVED'`);

  const dailyRows = await gaql(token,
    `SELECT segments.date,
            ad_group_ad.ad.id,
            campaign.id,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions
     FROM ad_group_ad
     WHERE campaign.id IN (${campIds})
       AND segments.date >= '${SINCE}'
       AND segments.date <= '${until}'
     ORDER BY segments.date`);

  const daily = dailyRows
    .filter(r => r.impressions > 0 || r.costMicros > 0)
    .map(r => ({
      d: r.date,
      a: String(r.id ?? r.adId ?? r["ad.id"] ?? extractAdId(r)),
      c: String(r.campaignId ?? r["campaign.id"] ?? extractCampId(r)),
      s: micro(Number(r.costMicros || 0)),
      i: Number(r.impressions || 0),
      ck: Number(r.clicks || 0),
      conv: Math.round(Number(r.conversions || 0)),
    }))
    .sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);

  if (!daily.length) throw new Error("nenhuma linha com dados — confira o GOOGLE_CUSTOMER_ID e as credenciais");

  const usedAdIds = [...new Set(daily.map(r => r.a))];
  const usedCampIds = [...new Set(daily.map(r => r.c))];

  const campMap = Object.fromEntries(campRows.map(c => [String(c.id), c]));

  const campaigns = PLAN.filter(p => usedCampIds.includes(p.id)).map(p => {
    const c = campMap[p.id] || {};
    return {
      id: p.id, key: p.key, tag: p.tag,
      name: c.name || p.label,
      label: p.label, goal: p.goal,
      type: p.type,
      status: c.status === 2 ? "ENABLED" : (c.status === 3 ? "PAUSED" : String(c.status || "UNKNOWN")),
      daily_budget: c.budgetAmountMicros ? micro(Number(c.budgetAmountMicros)) : null,
      kpi: p.kpi, kpi_label: p.kpi_label, kpi_unit: p.kpi_unit,
      kpi2: p.kpi2, kpi2_label: p.kpi2_label, kpi2_unit: p.kpi2_unit,
    };
  });

  const adGroupMap = Object.fromEntries(agRows.map(a => [String(a.id), a]));

  const ad_groups = agRows
    .filter(a => usedCampIds.includes(String(a.campaign || a.campaignId)))
    .map(a => ({
      id: String(a.id),
      name: a.name || String(a.id),
      campaign_id: String(a.campaign || a.campaignId),
      status: a.status === 2 ? "ENABLED" : "PAUSED",
    }));

  const ads = adRows
    .filter(a => usedAdIds.includes(String(a.id ?? a.adId)))
    .map(a => ({
      id: String(a.id ?? a.adId),
      name: a.name || `Anúncio ${String(a.id ?? a.adId).slice(-4)}`,
      ad_group_id: String(a.adGroupId ?? a["adGroup.id"] ?? ""),
      campaign_id: String(a.campaignId ?? a["campaign.id"] ?? ""),
      status: a.status === 2 ? "ENABLED" : "PAUSED",
    }));

  const dates = daily.map(r => r.d);

  const data = {
    meta: {
      source: "google",
      account_id: CUSTOMER,
      account_name: "VUOU PASSAGENS AEREAS E VIAGENS LTDA",
      mcc_id: MCC,
      client: "Vuou",
      currency: "BRL",
      tz: "America/Sao_Paulo",
      updated_at: new Date().toISOString(),
      seed: false,
      first_date: dates[0],
      last_date: dates[dates.length - 1],
    },
    campaigns, ad_groups, ads, daily,
  };

  writeFileSync(OUT, JSON.stringify(data) + "\n");

  const tot = daily.reduce((s, r) => s + r.s, 0);
  const totConv = daily.reduce((s, r) => s + r.conv, 0);
  const totCk = daily.reduce((s, r) => s + r.ck, 0);
  console.log(`OK  linhas=${daily.length}  anúncios=${ads.length}`);
  console.log(`    período ${data.meta.first_date} → ${data.meta.last_date}`);
  console.log(`    investido R$${tot.toFixed(2)}  cliques=${totCk}  conversões=${totConv}`);
}

function extractAdId(r) {
  for (const v of Object.values(r)) if (typeof v === "number" && v > 800000000000) return v;
  return "unknown";
}
function extractCampId(r) {
  for (const [k, v] of Object.entries(r)) if (k.toLowerCase().includes("campaign") && typeof v === "number") return v;
  return "unknown";
}

main().catch(e => { console.error("FALHA:", e.message); process.exit(1); });
