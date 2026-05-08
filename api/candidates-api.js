export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Supabase not configured" });

  const { run_ids } = req.query;
  if (!run_ids) return res.status(400).json({ error: "run_ids required" });

  const ids = run_ids.split(',').slice(0, 20); // max 20 runs at once

  // Build OR filter for run_ids
  const filter = ids.map(id => `run_id.eq.${id}`).join(',');

  const headers = {
    "apikey": supabaseKey,
    "Authorization": `Bearer ${supabaseKey}`,
  };

  try {
    // Paginate to get all candidates for these runs
    const PAGE = 1000;
    let all = [];
    let offset = 0;
    while (true) {
      const url = `${supabaseUrl}/rest/v1/run_results?select=run_id,candidate_id,candidate_name,position,match,verdict,score,reason&or=(${filter})&order=position.asc&limit=${PAGE}&offset=${offset}`;
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`Supabase error: ${r.status}`);
      const data = await r.json();
      all = all.concat(data);
      if (data.length < PAGE) break;
      offset += PAGE;
      if (all.length >= 5000) break; // safety
    }
    return res.status(200).json({ candidates: all });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
