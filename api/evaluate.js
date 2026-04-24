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

  const domainContext = `
Domain and subdomain classification reference:

- Domain "SWE Bench" → subdomains: Python, JavaScript, Java, C++, Rust, Ruby, Go, C#, DE/DS
- Domain "Python/FastAPI BE Developer" → subdomains: FastAPI Developer
- Domain "Prompt & Verifier Role" → subdomains: Prompt & Verifier Role
- Domain "Function Calling - Agentic Annotators" → subdomains: Agentic completion tasks, Agent Function call, Agentic trainer
- Domain "Function Calling - Agentic Annotators (Multilingual)" → subdomains: Multilingual Agentic
- Domain "MLE Bench" → subdomains: ML Eng, Data Analysts
- Domain "STEM (Global)" → subdomains: Physics, Chemistry, Biology, Math
- Domain "STEM (US)" → subdomains: Physics, Chemistry, Biology, Math
- Domain "Multi-Modal" → subdomains: Video Annotation, Vision Document Understanding, Vision Image Understanding, Content, Business Analyst, Business Analyst + Multi-Lingual, Audio - Studio Quality
- Domain "Legal" → subdomains: Contract Review, Legal Research, Compliance, Litigation, Intellectual Property, Corporate Law, General Legal
- Domain "Medicine" → subdomains: Clinical Research, Medical Writing, Diagnosis Support, Surgery, Pharmacology, Public Health, General Medicine
- Domain "Finance" → subdomains: Financial Modeling, Valuation, Economic Analysis, Risk Management, Investment, Accounting, General Finance
- Domain "Education" → subdomains: Curriculum Design, Tutoring, Academic Research, Instructional Design, General Education
- Domain "Unknown" → if none of the above clearly match
`.trim();

  const prompt = `You are an expert technical recruiter evaluating whether candidates match a search query.

First, classify this query into a domain and subdomain using this reference:
${domainContext}

Then, for each candidate, evaluate them against the query: "${query}"

Evaluation rules:
- Mark "good" only if the candidate plausibly satisfies the core intent: required skills (or directly comparable ones), role/title alignment, and any hard constraints the query mentions (country, YOE minimum, education level, rate).
- Mark "bad" if any core intent is clearly missing, OR when uncertain. Default to "bad" on ambiguity.
- Reason: <= 200 chars, concrete and specific (name the skill or constraint that decided it). No hedging.
- You MUST return exactly ${profiles.length} result objects — one per candidate, in order.

Reply ONLY with this exact JSON structure:
{
  "query_domain": "domain name",
  "query_subdomain": "subdomain name",
  "results": [
    {"index": 0, "verdict": "good", "reason": "..."},
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
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 8000,
        temperature: 0,
      }),
    });

    const llmData = await llmRes.json();
    if (!llmRes.ok) return res.status(502).json({ error: "OpenAI API error", details: llmData });

    const raw = llmData?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());

    if (!parsed.results || parsed.results.length !== profiles.length) {
      return res.status(422).json({
        error: `Incomplete response: got ${parsed.results?.length || 0} of ${profiles.length} results`,
        partial: parsed,
      });
    }

    const queryDomain = parsed.query_domain || "Unknown";
    const querySubdomain = parsed.query_subdomain || "Unknown";

    const remapped = parsed.results.map(item => ({
      ...item,
      index: indexMap[item.index] ?? item.index,
      // Normalize verdict → match for UI compatibility
      match: item.verdict === "good" || item.match === true,
      verdict: item.verdict || (item.match ? "good" : "bad"),
      query_domain: queryDomain,
      query_subdomain: querySubdomain,
    }));

    // Build a lookup of candidate input text by global index for traceability
    const inputByGlobalIdx = {};
    const textLines = text.split("\n--- CANDIDATE [");
    textLines.forEach(function(block, bi) {
      if (bi === 0) return; // skip header
      const batchIndex = parseInt(block.split("]")[0]);
      const globalIdx = indexMap[batchIndex] ?? batchIndex;
      inputByGlobalIdx[globalIdx] = ("--- CANDIDATE [" + block).trim();
    });

    // Save to Supabase
    if (supabaseUrl && supabaseKey && runId) {
      const rows = remapped.map(item => {
        const p = profiles.find(pr => (pr._idx ?? 0) === item.index)
          || profiles.find((_, j) => indexMap[j] === item.index)
          || {};
        const name = p.name || ((p.firstName || "") + " " + (p.lastName || "")).trim() || "Unknown";
        return {
          run_id: runId,
          query,
          candidate_id: p.id || null,
          candidate_name: name,
          position: item.index + 1,
          match: item.match,
          reason: item.reason,
          llm_input: inputByGlobalIdx[item.index] || null,
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

    return res.status(200).json({
      results: remapped,
      query_domain: queryDomain,
      query_subdomain: querySubdomain,
    });
  } catch (err) {
    return res.status(500).json({ error: "LLM error", details: err.message });
  }
}
