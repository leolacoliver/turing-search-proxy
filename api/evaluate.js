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

  function extractLanguageChallenges(p) {
    const challenges = p.languageChallengeDetails || [];
    if (!challenges.length) return "none";
    return challenges.map(c =>
      `${c.language || c.name || "?"} - ${c.status || c.result || "?"} (score: ${c.score ?? "?"}/${c.total ?? "?"})`
    ).join("; ");
  }

  // Detect if query is BA/annotator type with language requirement
  function isBALanguageQuery(query) {
    const q = query.toLowerCase();
    const isBA = /\b(ba|business analyst|data annotator|annotator|annotation|rater|content rater)\b/.test(q);
    const hasLang = /\b(arabic|spanish|french|portuguese|german|chinese|japanese|hindi|korean|turkish|italian|dutch|polish|russian|hebrew|persian|urdu|bengali|multilingual)\b/.test(q);
    return isBA && hasLang;
  }

  const indexMap = {};
  const text = profiles.map((p, batchIndex) => {
    const globalIdx = p._idx ?? batchIndex;
    indexMap[batchIndex] = globalIdx;
    const name = p.name || ((p.firstName || "") + " " + (p.lastName || "")).trim() || "Unknown";
    const langChallenges = extractLanguageChallenges(p);
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
Language Challenge Results: ${langChallenges}
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

  const prompt = `You are an expert technical recruiter evaluating whether candidates match a search query. You are known for being STRICT and precise — you only mark "good" when there is clear, concrete evidence in the candidate data.

First, classify this query into a domain and subdomain using this reference:
${domainContext}

Then, for each candidate, evaluate them against the query: "${query}"

Evaluation rules:
- Mark "good" ONLY if the candidate has CLEAR, EXPLICIT evidence of the required skills/experience/constraints in their resume or work history. Vague mentions or partial matches are NOT enough.
- Mark "bad" if: any core requirement is missing, experience is insufficient, the evidence is ambiguous, or you are not confident. DEFAULT TO "bad" ON ANY DOUBT.
- Hard constraints (YOE minimum, location, education level, specific technology) must ALL be met — failing even one = "bad".
- Reason: <= 200 chars, name the SPECIFIC skill, constraint, or gap that decided it. No vague praise.
- You MUST return exactly ${profiles.length} result objects — one per candidate, in order.

SPECIAL RULE — BA/Annotator with language requirement:
If the query asks for a BA, business analyst, data annotator, content rater, annotator, or similar role AND specifies a language (e.g. "BA 3+ yrs Arabic", "annotator Portuguese speaking"):
- The PRIMARY evaluation criterion is language proficiency, NOT work experience as a BA.
- Mark "good" if the candidate shows CLEAR evidence of proficiency in the required language through ANY of the following: native speaker, translator, interpreter, language teacher, linguistics background, passed language challenge, or extensive work/education in the language.
- Experience as a translator, interpreter, or language professional is FULLY VALID and should be treated as equivalent to BA experience for these queries.
- Do NOT penalize candidates for lacking explicit BA/annotator job titles if their language proficiency is strong.
- Only mark "bad" if there is no clear evidence of proficiency in the required language.

Reply ONLY with this exact JSON structure:
{
  "query_domain": "domain name",
  "query_subdomain": "subdomain name",
  "results": [
    {"index": 0, "score": 85, "verdict": "good", "reason": "..."},
    ...
  ]
}

Score and verdict rules:
- score: integer 0-100 representing match percentage
- verdict "good": score >= 75 (strong match, clear evidence)
- verdict "borderline": score >= 60 and < 75 (partial match, missing some evidence but plausible)
- verdict "bad": score < 60 (clearly missing core requirements)

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
        model: "gpt-5.4",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 8000,
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
      score: item.score ?? (item.verdict === "good" ? 80 : item.verdict === "borderline" ? 67 : 30),
      verdict: item.verdict || (item.match ? "good" : "bad"),
      // match = true only for good (>= 75%), borderline is separate
      match: item.verdict === "good",
      borderline: item.verdict === "borderline",
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
          verdict: item.verdict || "bad",
          score: item.score || 0,
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
