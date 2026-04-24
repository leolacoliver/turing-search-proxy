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
      if (s && typeof s === "object") {
        const yrs = s.yearsOfExperience ? ` (${s.yearsOfExperience}yrs)` : "";
        return (s.name || s.skill || s.title || "") + yrs;
      }
      return String(s);
    }).filter(Boolean).join(", ") || "—";
  }

  function extractWorkExperience(p) {
    const we = p.workExperience || [];
    return we.map(w =>
      `${w.position || ""} at ${w.company || ""} (${w.durationYears || "?"}yrs, ${w.employmentType || ""}): ${(w.description || "").slice(0, 300)}`
    ).join("\n") || "—";
  }

  function extractEducation(p) {
    const ed = p.education || [];
    return ed.map(e =>
      `${e.degree || e.level || ""} at ${e.school || ""}`
    ).join("; ") || "—";
  }

  function extractProjects(p) {
    const pr = p.projects || [];
    return pr.map(pr =>
      `${pr.name || ""}: ${(pr.description || "").slice(0, 200)}`
    ).join("\n") || "—";
  }

  function extractCertifications(p) {
    const c = p.certifications || [];
    return c.map(c => c.name || c.title || JSON.stringify(c)).join(", ") || "—";
  }

  function extractPublications(p) {
    const pub = p.publications || [];
    return pub.map(p => p.title || p.name || JSON.stringify(p)).join(", ") || "—";
  }

  function extractLanguages(p) {
    const l = p.languages || [];
    return l.map(l => typeof l === "string" ? l : l.name || l.language || JSON.stringify(l)).join(", ") || "—";
  }

  const indexMap = {};
  const text = profiles.map((p, batchIndex) => {
    const globalIdx = p._idx ?? batchIndex;
    indexMap[batchIndex] = globalIdx;

    const name = p.name || ((p.firstName || "") + " " + (p.lastName || "")).trim() || "Unknown";

    return `
--- CANDIDATE [${batchIndex}] ---
Name: ${name}
Role: ${p.role || p.designation || p.title || "—"}
Location: ${[p.city, p.country, p.continent].filter(Boolean).join(", ") || "—"}
Years of Experience: ${p.yearsOfExperience || p.totalExperience || "—"}
Availability: ${p.availability || "—"}

Skills: ${extractSkills(p)}

Work Experience:
${extractWorkExperience(p)}

Education: ${extractEducation(p)}

Projects:
${extractProjects(p)}

Certifications: ${extractCertifications(p)}
Publications: ${extractPublications(p)}
Languages: ${extractLanguages(p)}

Resume:
${(p.resumePlainText || p.resume_plain_text || "—").slice(0, 1500)}
`.trim();
  }).join("\n\n");

  const prompt = `You are an expert talent recruiter evaluating candidates for the following search query: "${query}".

For each candidate, decide if they are a good fit (>=70% match).

Rules:
- Base your evaluation strictly on what is present in the candidate data — do not fabricate facts.
- Good fit (match: true): candidate clearly meets the query requirements. State specifically which skills, experience, or background supports this.
- No fit (match: false): clearly state what is missing or insufficient (e.g. "only 1yr Python experience, query requires 5+", "no Django experience found").
- Be concise but specific. No vague praise or filler.
- No preamble, no trailing commentary.

Reply ONLY with a JSON array, one object per candidate, in order:
[{"index":0,"match":true,"reason":"concrete reason"},...]

Candidates:
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
        max_tokens: 4000,
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
        const p = profiles.find(pr => (pr._idx ?? 0) === item.index) || profiles[0];
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
