export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const { query, profiles } = body;

  if (!query) return res.status(400).json({ error: "query is required" });
  if (!profiles || !profiles.length) return res.status(400).json({ error: "profiles is required" });

  function extractSkills(p) {
    const raw = p.skills || p.topSkills || p.primarySkills || [];
    return raw.map(s => {
      if (typeof s === "string") return s;
      if (s && typeof s === "object") return s.name || s.skill || s.title || JSON.stringify(s);
      return String(s);
    }).filter(Boolean).slice(0, 12).join(", ") || "—";
  }

  const text = profiles.map((p) => {
    const name = p.name || ((p.firstName || "") + " " + (p.lastName || "")).trim() || "Unknown";
    const skills = extractSkills(p);
    const exp = p.totalExperience || p.yearsOfExperience || "?";
    const title = p.title || p.designation || "";
    return `[${p._idx ?? 0}] ${name} | ${title} | ${exp}yrs | Skills: ${skills}`;
  }).join("\n");

  const prompt = `You are evaluating talent profiles for the search query: "${query}".
For each profile, decide if it's a good fit (>=70% match).
Reply ONLY with a JSON array, one object per profile, in order:
[{"index":0,"match":true,"reason":"short reason"},...]

Profiles:
${text}`;

  try {
    const llmRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const llmData = await llmRes.json();
    const raw = (llmData?.content || []).map(c => c.text || "").join("");
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return res.status(200).json({ results: parsed });
  } catch (err) {
    return res.status(500).json({ error: "LLM error", details: err.message });
  }
}
