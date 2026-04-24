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
  const { runId, query, review, reviewedBy } = body;

  if (!runId || !query) return res.status(400).json({ error: "runId and query are required" });
  if (!review || !review.trim()) return res.status(400).json({ error: "review text is required" });

  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/runs?run_id=eq.${encodeURIComponent(runId)}&query=eq.${encodeURIComponent(query)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          human_review: review.trim(),
          human_reviewed_at: new Date().toISOString(),
          human_reviewed_by: reviewedBy || "anonymous",
        }),
      }
    );

    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: "Supabase error", details: t });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
