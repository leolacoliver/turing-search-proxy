export const maxDuration = 30;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const token = process.env.TURING_TOKEN;
  if (!token) return res.status(401).json({ error: "Please check with Leonardo Oliveira on the new JWT token." });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const { query, pageSize = 100 } = body;

  if (!query) return res.status(400).json({ error: "query is required" });

  const filters = {
    requiredSkills: [], niceToHaveSkills: [], skillYears: {}, budgetType: "hourly",
    maxRate: "", allowHigherRates: false, higherRatePercent: "10",
    rateSources: ["past", "icf", "signup"],
    includeTalentWithoutRates: true,
    selectedCountries: [], selectedLanguages: [], contextTags: [],
    vettingFlow: null, vettingFlowLabel: null,
    hidePreShortlisted: false, highPerformersOnly: false, engagementsOnly: false,
    includeJobDesc: false, useIntakeNotes: false, minEducation: "any",
    graduatedOnly: false, includeStudying: false, includeStaleResumes: false,
    vettingFlows: [],
  };

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
    "Origin": "https://search.turing.com",
    "Referer": "https://search.turing.com/search",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "cache-control": "no-cache",
    "pragma": "no-cache",
  };

  // Smart search to get talents + decomposition
  try {
    const searchRes = await fetch("https://search.turing.com/api/talent/search/smart", {
      method: "POST",
      headers,
      body: JSON.stringify({ query, page: 1, pageSize, filters }),
    });

    const searchData = await searchRes.json();
    if (!searchRes.ok) return res.status(searchRes.status).json({ error: "Search failed", details: searchData });

    const talents = searchData.talents || searchData.results || [];
    const decomposition = searchData.decomposition || null;

    // Return token (needed for browser to call evaluate directly) + search results
    return res.status(200).json({
      talents,
      decomposition,
      filters,
      token, // browser needs this to call /evaluate directly
    });
  } catch (err) {
    return res.status(500).json({ error: "Search error", details: err.message });
  }
}
