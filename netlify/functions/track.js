import { getStore } from "@netlify/blobs";

export default async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path.slice(0, 200) : "/";
  const lang = typeof body.lang === "string" ? body.lang.slice(0, 10).toLowerCase() : "unknown";
  const event = body.event === "commission-click" ? "commission-click" : "visit";

  const store = getStore("ons-nest-analytics");
  const key = `event:${Date.now()}:${crypto.randomUUID()}`;
  await store.setJSON(key, {
    ts: new Date().toISOString(),
    path,
    lang,
    event,
  });

  return new Response(null, { status: 204 });
};

export const config = { path: "/.netlify/functions/track" };
