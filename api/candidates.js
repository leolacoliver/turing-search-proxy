export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Supabase not configured" });

  const { run_id, query } = req.query;
  if (!run_id || !query) return res.status(400).json({ error: "run_id and query are required" });

  const headers = {
    "apikey": supabaseKey,
    "Authorization": `Bearer ${supabaseKey}`,
  };

  try {
    // Filter by BOTH run_id AND query to get exactly the right candidates
    const encodedQuery = encodeURIComponent(query);
    const url = `${supabaseUrl}/rest/v1/run_results?select=run_id,candidate_id,candidate_name,position,match,verdict,score,reason&run_id=eq.${run_id}&query=eq.${encodedQuery}&order=position.asc&limit=1000`;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`Supabase error: ${r.status}`);
    const candidates = await r.json();
    return res.status(200).json({ candidates });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
