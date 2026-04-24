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
    return (p.workExperience || []).map(w =>
      `${w.position || ""} at ${w.company || ""} (${w.durationYears || "?"}yrs, ${w.employmentType || ""}): ${(w.description || "").slice(0, 300)}`
    ).join("\n") || "—";
  }

  function extractEducation(p) {
    return (p.education || []).map(e =>
      `${e.degree || e.level || ""} at ${e.school || ""}`
    ).join("; ") || "—";
  }

  function extractProjects(p) {
    return (p.projects || []).map(pr =>
      `${pr.name || ""}: ${(pr.description || "").slice(0, 200)}`
    ).join("\n") || "—";
  }

  function extractList(arr, fields) {
    return (arr || []).map(item => {
      if (typeof item === "string") return item;
      for (const f of fields) if (item[f]) return item[f];
      return JSON.stringify(item);
    }).join(", ") || "—";
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
Certifications: ${extractList(p.certifications, ["name", "title"])}
Publications: ${extractList(p.publications, ["title", "name"])}
Languages: ${extractList(p.languages, ["name", "language"])}
Resume:
${(p.resumePlainText || p.resume_plain_text || "—").slice(0, 1500)}
`.trim();
  }).join("\n\n");

  // Domain/subdomain classification list
  const domainContext = `
Domain and subdomain reference:
- Domain "SWE Bench" → subdomains: Python, JavaScript, Java, C++, Rust, Ruby, Go, C#, DE/DS
- Domain "Python/FastAPI BE Developer" → subdomains: FastAPI Developer
- Domain "Prompt & Verifier Role" → subdomains: Prompt & Verifier Role
- Domain "Function Calling - Agentic Annotators" → subdomains: Agentic completion tasks, Agent Function call, Agentic trainer
- Domain "Function Calling - Agentic Annotators (Multilingual)" → subdomains: Multilingual Agentic
- Domain "MLE Bench" → subdomains: ML Eng, Data Analysts
- Domain "STEM (Global)" → subdomains: Physics, Chemistry, Biology, Math
- Domain "STEM (US)" → subdomains: Physics, Chemistry, Biology, Math
- Domain "Multi-Modal" → subdomains: Video Annotation, Vision Document Understanding, Vision Image Understanding, Content, Business Analyst, Business Analyst + Multi-Lingual, Audio - Studio Quality
- Domain "Unknown" → if none of the above match
`.trim();

  const prompt = `You are an expert talent recruiter evaluating candidates for the following search query: "${query}".

First, classify this query into a domain and subdomain using this reference:
${domainContext}

Then, for each candidate, decide if they are a good fit (>=70% match).

Rules:
- Base your evaluation strictly on what is present in the candidate data — do not fabricate facts.
- Good fit (match: true): candidate clearly meets the query requirements. State specifically which skills, experience, or background supports this.
- No fit (match: false): clearly state what is missing or insufficient (e.g. "only 1yr Python, query requires 5+", "no Django experience found").
- Be concise but specific. No vague praise or filler.
- No preamble, no trailing commentary.

Reply ONLY with this JSON structure:
{
  "query_domain": "domain name",
  "query_subdomain": "subdomain name",
  "results": [
    {"index": 0, "match": true, "reason": "concrete reason"},
    ...
  ]
}

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

    const queryDomain = parsed.query_domain || "Unknown";
    const querySubdomain = parsed.query_subdomain || "Unknown";

    const remapped = (parsed.results || []).map(item => ({
      ...item,
      index: indexMap[item.index] ?? item.index,
      query_domain: queryDomain,
      query_subdomain: querySubdomain,
    }));

    // Save to Supabase
    if (supabaseUrl && supabaseKey && runId) {
      const rows = remapped.map(item => {
        const p = profiles.find(pr => (pr._idx ?? 0) === item.index) || profiles.find((_, j) => indexMap[j] === item.index) || {};
        const name = p.name || ((p.firstName || "") + " " + (p.lastName || "")).trim() || "Unknown";
        return {
          run_id: runId,
          query,
          candidate_id: p.id || null,
          candidate_name: name,
          position: item.index + 1,
          match: item.match,
          reason: item.reason,
        };
      });

      await fetch(`${supabaseUrl}/rest/v1/run_results`, {
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

    return res.status(200).json({ results: remapped, query_domain: queryDomain, query_subdomain: querySubdomain });
  } catch (err) {
    return res.status(500).json({ error: "LLM error", details: err.message });
  }
}
