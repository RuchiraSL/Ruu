import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";

export const config = { path: "/api/data" };

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const same = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export default async (req) => {
  const secret = Netlify.env.get("APP_PASSWORD");
  if (!secret) return json({ error: "APP_PASSWORD is not set in Netlify" }, 500);

  if (!same(req.headers.get("x-app-password") || "", secret)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down password guessing
    return json({ error: "unauthorized" }, 401);
  }

  const store = getStore("nifti");
  const cur = await store.get("db", { type: "json" }); // { rev, data } or null
  const rev = cur ? cur.rev : 0;

  if (req.method === "GET") return json({ rev, data: cur ? cur.data : null });

  if (req.method === "PUT") {
    const base = Number(req.headers.get("x-base-rev") || 0);
    if (base !== rev) return json({ error: "conflict", rev }, 409);
    const data = await req.json();
    if (!data || !data.settings || !Array.isArray(data.invoices))
      return json({ error: "bad data" }, 400);
    const next = rev + 1;
    await store.setJSON("db", { rev: next, data });
    await store.setJSON("backup-" + (next % 10), { rev: next, data }); // 10 rolling backups
    return json({ rev: next });
  }

  return json({ error: "method not allowed" }, 405);
};
