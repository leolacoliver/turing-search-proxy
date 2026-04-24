export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Supabase not configured" });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const { runId, query, queryDomain, querySubdomain, totalResults, goodFits, matchRate } = body;

  if (!runId || !query) return res.status(400).json({ error: "runId and query are required" });

  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        run_id: runId,
        query,
        query_domain: queryDomain || null,
        query_subdomain: querySubdomain || null,
        total_results: totalResults || 0,
        good_fits: goodFits || 0,
        match_rate: matchRate || 0,
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: "Supabase error", details: t });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
