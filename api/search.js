export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  let query, pageSize = 100, page = 1;

  if (req.method === "GET") {
    query = req.query.query;
    pageSize = parseInt(req.query.pageSize || "100");
    page = parseInt(req.query.page || "1");
  } else if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    query = body.query;
    pageSize = body.pageSize || 100;
    page = body.page || 1;
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!query) return res.status(400).json({ error: "query is required" });

  const token = process.env.TURING_TOKEN;
  if (!token) {
    return res.status(401).json({ error: "Please check with Leonardo Oliveira on the new JWT token." });
  }

  const filters = {
    requiredSkills: [], niceToHaveSkills: [], skillYears: {}, budgetType: "hourly",
    maxRate: "", allowHigherRates: false, higherRatePercent: "10", selectedCountries: [],
    selectedLanguages: [], contextTags: [], vettingFlow: null, vettingFlowLabel: null,
    hidePreShortlisted: false, highPerformersOnly: false, engagementsOnly: false,
    includeJobDesc: false, useIntakeNotes: false, minEducation: "any", graduatedOnly: false,
    includeStudying: false, includeStaleResumes: false, vettingFlows: [],
  };

  try {
    const upstream = await fetch("https://search.turing.com/api/talent/search/smart", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        "Origin": "https://search.turing.com",
        "Referer": "https://search.turing.com/search",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ query, page, pageSize, filters }),
    });

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return res.status(502).json({ error: "Turing API returned non-JSON", raw: text.slice(0, 500) });
    }

    if (!upstream.ok) {
      // Token likely expired
      return res.status(upstream.status).json({
        error: "Please check with Leonardo Oliveira on the new JWT token.",
        details: data,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Proxy error", details: err.message });
  }
}
