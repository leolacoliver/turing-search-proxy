export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY not configured" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const { query, profiles, runId } = body;

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

  const indexMap = {};
  const text = profiles.map((p, batchIndex) => {
    const globalIdx = p._idx ?? batchIndex;
    indexMap[batchIndex] = globalIdx;
    const name = p.name || ((p.firstName || "") + " " + (p.lastName || "")).trim() || "Unknown";
    const skills = extractSkills(p);
    const exp = p.totalExperience || p.yearsOfExperience || "?";
    const title = p.title || p.designation || "";
    const resume = p.resume_plain_text ? p.resume_plain_text.slice(0, 800) : "";
    return `[${batchIndex}] ${name} | ${title} | ${exp}yrs | Skills: ${skills}${resume ? ` | Resume excerpt: ${resume}` : ""}`;
  }).join("\n");

  const prompt = `You are an expert talent recruiter evaluating profiles for: "${query}".

For each profile decide if it is a good fit (>=70% match). Base your answer strictly on what is present in the data.

Rules:
- Good fit (match: true): candidate clearly meets the query requirements.
- No fit (match: false): briefly state what is missing or weak (e.g. "only 2yrs Python, no Django experience").
- Do not fabricate facts not present in the data.
- No preamble, no trailing commentary.

Reply ONLY with a JSON array, one object per profile, in order:
[{"index":0,"match":true,"reason":"concrete reason based on data"},...]

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
        max_tokens: 8000,
        temperature: 0,
      }),
    });

    const llmData = await llmRes.json();
    if (!llmRes.ok) return res.status(502).json({ error: "OpenAI API error", details: llmData });

    const raw = llmData?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());

    const remapped = parsed.map(item => ({
      ...item,
      index: indexMap[item.index] ?? item.index,
    }));

    // Save to Supabase if configured
    if (supabaseUrl && supabaseKey && runId) {
      const rows = remapped.map(item => {
        const p = profiles.find(pr => (pr._idx ?? 0) === (item.index - (profiles[0]?._idx ?? 0)));
        const name = p ? (p.name || ((p.firstName || "") + " " + (p.lastName || "")).trim()) : "Unknown";
        return {
          run_id: runId,
          query,
          candidate_name: name,
          candidate_idx: item.index,
          match: item.match,
          reason: item.reason,
        };
      });

      await fetch(`${supabaseUrl}/rest/v1/evaluations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify(rows),
      });
    }

    return res.status(200).json({ results: remapped });
  } catch (err) {
    return res.status(500).json({ error: "LLM error", details: err.message });
  }
}
