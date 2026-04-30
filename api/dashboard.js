export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  async function sbFetch(table, params) {
    const r = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
      },
    });
    if (!r.ok) throw new Error(`Supabase error on ${table}: ${r.status}`);
    return r.json();
  }

  try {
    const [runs, results, reviews] = await Promise.all([
      sbFetch("runs", "select=*&order=created_at.desc&limit=2000"),
      sbFetch("run_results", "select=run_id,match,reason&limit=20000"),
      sbFetch("runs", "select=query,good_fits,good_fits_borderline,total_results,human_review,human_reviewed_by,human_reviewed_at&human_review=not.is.null&order=human_reviewed_at.desc&limit=200"),
    ]);

    return res.status(200).json({ runs, results, reviews });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
