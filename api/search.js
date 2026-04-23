export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: `Method ${req.method} not allowed. Use POST.` });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const { token, query, page = 1, pageSize = 100, filters = {} } = body || {};

  if (!token) return res.status(400).json({ error: "token is required" });
  if (!query) return res.status(400).json({ error: "query is required" });

  const defaultFilters = {
    requiredSkills: [], niceToHaveSkills: [], skillYears: {}, budgetType: "hourly",
    maxRate: "", allowHigherRates: false, higherRatePercent: "10", selectedCountries: [],
    selectedLanguages: [], contextTags: [], vettingFlow: null, vettingFlowLabel: null,
    hidePreShortlisted: false, highPerformersOnly: false, engagementsOnly: false,
    includeJobDesc: false, useIntakeNotes: false, minEducation: "any", graduatedOnly: false,
    includeStudying: false, includeStaleResumes: false, vettingFlows: [],
    ...filters,
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
      body: JSON.stringify({ query, page, pageSize, filters: defaultFilters }),
    });

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return res.status(502).json({ error: "Turing API returned non-JSON", raw: text.slice(0, 500) });
    }

    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Proxy error", details: err.message });
  }
}
