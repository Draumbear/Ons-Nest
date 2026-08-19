import { getStore } from "@netlify/blobs";

function timingSafeEqual(a, b) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

// Each range maps to how far back to look, and how coarsely to bucket
// points so the chart stays readable (an hour of per-minute points, a
// year of per-month points, etc).
const RANGES = {
  "1h": { ms: 60 * 60 * 1000, granularity: "minute" },
  "1d": { ms: 24 * 60 * 60 * 1000, granularity: "hour" },
  "7d": { ms: 7 * 24 * 60 * 60 * 1000, granularity: "day" },
  "30d": { ms: 30 * 24 * 60 * 60 * 1000, granularity: "day" },
  "90d": { ms: 90 * 24 * 60 * 60 * 1000, granularity: "week" },
  "180d": { ms: 180 * 24 * 60 * 60 * 1000, granularity: "week" },
  "365d": { ms: 365 * 24 * 60 * 60 * 1000, granularity: "month" },
};

function weekStartKey(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day; // shift back to Monday
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function bucketKey(date, granularity) {
  const iso = date.toISOString();
  switch (granularity) {
    case "minute": return iso.slice(0, 16); // YYYY-MM-DDTHH:MM
    case "hour": return iso.slice(0, 13); // YYYY-MM-DDTHH
    case "day": return iso.slice(0, 10); // YYYY-MM-DD
    case "week": return weekStartKey(date); // YYYY-MM-DD of Monday
    case "month": return iso.slice(0, 7); // YYYY-MM
    default: return iso.slice(0, 10);
  }
};

export default async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return new Response(JSON.stringify({ error: "ADMIN_PASSWORD is not configured on the server" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (typeof body.password !== "string" || !timingSafeEqual(body.password, adminPassword)) {
    return new Response(JSON.stringify({ error: "Wrong password" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const range = RANGES[body.range] ? body.range : "30d";
  const { ms, granularity } = RANGES[range];
  const since = Date.now() - ms;

  const store = getStore("ons-nest-analytics");
  const bucketCounts = {};
  const langCounts = {};
  let totalVisits = 0;
  let commissionClicks = 0;

  let cursor;
  do {
    const page = await store.list({ prefix: "event:", cursor });
    cursor = page.cursor;
    for (const item of page.blobs) {
      const parts = item.key.split(":");
      const ts = parseInt(parts[1], 10);
      if (!ts || ts < since) continue;

      const data = await store.get(item.key, { type: "json" });
      if (!data) continue;

      const eventDate = data.ts ? new Date(data.ts) : new Date(ts);
      const bucket = bucketKey(eventDate, granularity);

      if (data.event === "commission-click") {
        commissionClicks++;
      } else {
        totalVisits++;
        bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1;
        const lang = data.lang || "unknown";
        langCounts[lang] = (langCounts[lang] || 0) + 1;
      }
    }
  } while (cursor);

  const series = Object.entries(bucketCounts)
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => (a.bucket < b.bucket ? -1 : 1));

  return new Response(
    JSON.stringify({
      range,
      granularity,
      total_visits: totalVisits,
      commission_clicks: commissionClicks,
      conversion_rate: totalVisits ? Math.round((commissionClicks / totalVisits) * 1000) / 10 : 0,
      series,
      lang_counts: langCounts,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};

export const config = { path: "/.netlify/functions/stats" };
