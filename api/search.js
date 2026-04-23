export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token, query, page = 1, pageSize = 100, filters = {} } = req.body;

  if (!token) return res.status(400).json({ error: "token is required" });
  if (!query) return res.status(400).json({ error: "query is required" });

  const defaultFilters = {
    requiredSkills: [],
    niceToHaveSkills: [],
    skillYears: {},
    budgetType: "hourly",
    maxRate: "",
    allowHigherRates: false,
    higherRatePercent: "10",
    selectedCountries: [],
    selectedLanguages: [],
    contextTags: [],
    vettingFlow: null,
    vettingFlowLabel: null,
    hidePreShortlisted: false,
    highPerformersOnly: false,
    engagementsOnly: false,
    includeJobDesc: false,
    useIntakeNotes: false,
    minEducation: "any",
    graduatedOnly: false,
    includeStudying: false,
    includeStaleResumes: false,
    vettingFlows: [],
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
      },
      body: JSON.stringify({ query, page, pageSize, filters: defaultFilters }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: "Turing API error", details: data });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Proxy error", details: err.message });
  }
}
