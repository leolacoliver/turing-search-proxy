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

  const headers = {
    "apikey": supabaseKey,
    "Authorization": `Bearer ${supabaseKey}`,
    "Range-Unit": "items",
  };

  async function fetchAll(table, select, filter = "") {
    const PAGE = 1000;
    let all = [];
    let from = 0;
    while (true) {
      const range = `${from}-${from + PAGE - 1}`;
      const url = `${supabaseUrl}/rest/v1/${table}?select=${select}${filter}&order=id.asc&limit=${PAGE}&offset=${from}`;
      const r = await fetch(url, { headers: { ...headers, "Range": range } });
      if (!r.ok) throw new Error(`Supabase error on ${table}: ${r.status}`);
      const data = await r.json();
      all = all.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
      // Safety limit - max 20k results per table
      if (all.length >= 20000) break;
    }
    return all;
  }

  try {
    const [runs, results, reviews] = await Promise.all([
      fetchAll("runs", "*", "&order=created_at.desc"),
      fetchAll("run_results", "run_id,query,candidate_id,candidate_name,position,match,verdict,score,reason"),
      fetchAll("runs", "query,good_fits,good_fits_borderline,total_results,human_review,human_reviewed_by,human_reviewed_at", "&human_review=not.is.null&order=human_reviewed_at.desc"),
    ]);

    return res.status(200).json({ runs, results, reviews });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
