import { getStore } from "@netlify/blobs";

function timingSafeEqual(a, b) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

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

  const days = Math.min(Math.max(parseInt(body.days, 10) || 30, 1), 90);
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  const store = getStore("ons-nest-analytics");
  const dailyCounts = {};
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

      const day = data.ts ? data.ts.slice(0, 10) : new Date(ts).toISOString().slice(0, 10);

      if (data.event === "commission-click") {
        commissionClicks++;
      } else {
        totalVisits++;
        dailyCounts[day] = (dailyCounts[day] || 0) + 1;
        const lang = data.lang || "unknown";
        langCounts[lang] = (langCounts[lang] || 0) + 1;
      }
    }
  } while (cursor);

  const dailySeries = Object.entries(dailyCounts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return new Response(
    JSON.stringify({
      range_days: days,
      total_visits: totalVisits,
      commission_clicks: commissionClicks,
      conversion_rate: totalVisits ? Math.round((commissionClicks / totalVisits) * 1000) / 10 : 0,
      daily_series: dailySeries,
      lang_counts: langCounts,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};

export const config = { path: "/.netlify/functions/stats" };
