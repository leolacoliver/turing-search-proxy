export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY not configured" });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const { query, profiles } = body;

  if (!query) return res.status(400).json({ error: "query is required" });
  if (!profiles || !profiles.length) return res.status(400).json({ error: "profiles is required" });

  function extractSkills(p) {
    const raw = p.skills || p.topSkills || p.primarySkills || [];
    return raw.map(s => {
      if (typeof s === "string") return s;
      if (s && typeof s === "object") return s.name || s.skill || s.title || "";
      return String(s);
    }).filter(Boolean).slice(0, 12).join(", ") || "—";
  }

  // Build profile text using sequential 0-based index within this batch
  // but store the global _idx so we can map back correctly
  const indexMap = {}; // batchIndex -> globalIdx
  const text = profiles.map((p, batchIndex) => {
    const globalIdx = p._idx ?? batchIndex;
    indexMap[batchIndex] = globalIdx;
    const name = p.name || ((p.firstName || "") + " " + (p.lastName || "")).trim() || "Unknown";
    const skills = extractSkills(p);
    const exp = p.totalExperience || p.yearsOfExperience || "?";
    const title = p.title || p.designation || "";
    return `[${batchIndex}] ${name} | ${title} | ${exp}yrs | Skills: ${skills}`;
  }).join("\n");

  const prompt = `You are an expert talent recruiter, and you will evaluate talent profiles for the search query: "${query}".
For each profile, decide if it's a good fit (>=70% match).
Your answer must be a concrete statement grounded in the candidate's fields (role, country, city, continent, years_of_experience, skills, education, work_experience, languages, certifications, publications, resume_plain_text) — not vague praise.
- If the candidate is a weak match with less than 70%, still return the format below, but add a brief caveat (e.g., "limited evidence of X", "only adjacent to Y") where relevant.
- Do not fabricate facts that aren't present in the candidate payload.
- No preamble, no trailing commentary.
Reply ONLY with a JSON array, one object per profile, in order:
[{"index":0,"match":true,"reason":"short reason"},...]

Profiles:
${text}`;

  try {
    const llmRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0,
      }),
    });

    const llmData = await llmRes.json();

    if (!llmRes.ok) {
      return res.status(502).json({ error: "OpenAI API error", details: llmData });
    }

    const raw = llmData?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());

    // Remap batch index back to global index
    const remapped = parsed.map(item => ({
      ...item,
      index: indexMap[item.index] ?? item.index,
    }));

    return res.status(200).json({ results: remapped });
  } catch (err) {
    return res.status(500).json({ error: "LLM error", details: err.message });
  }
}
