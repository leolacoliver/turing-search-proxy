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
- "SWE Bench" → Python, JavaScript, Java, C++, Rust, Ruby, Go, C#, DE/DS
- "Python/FastAPI BE Developer" → FastAPI Developer
- "Prompt & Verifier Role" → Prompt & Verifier Role
- "Function Calling - Agentic Annotators" → Agentic completion tasks, Agent Function call, Agentic trainer
- "Function Calling - Agentic Annotators (Multilingual)" → Multilingual Agentic
- "MLE Bench" → ML Eng, Data Analysts
- "STEM (Global)" → Physics, Chemistry, Biology, Math
- "STEM (US)" → Physics, Chemistry, Biology, Math
- "Multi-Modal" → Video Annotation, Vision Document Understanding, Vision Image Understanding, Content, Business Analyst, Business Analyst + Multi-Lingual, Audio
- "Legal" → Contract Review, Legal Research, Compliance, Litigation, IP, Corporate Law, General Legal
- "Medicine" → Clinical Research, Medical Writing, Diagnosis Support, Surgery, Pharmacology, Public Health, General Medicine
- "Finance" → Financial Modeling, Valuation, Economic Analysis, Risk Management, Investment, Accounting, General Finance
- "Education" → Curriculum Design, Tutoring, Academic Research, Instructional Design, General Education
- "Unknown" → if none match
`.trim();

  const prompt = `You are a strict relevance evaluator for a talent-search engine.

==========
OUTPUT FORMAT — NON-NEGOTIABLE
==========

Reply with exactly ONE JSON object and nothing else (no markdown, no prose).

{
  "query_domain": "<domain>",
  "query_subdomain": "<subdomain>",
  "results": [
    {"index": 0, "score": <int 0-100>, "verdict": "good" | "borderline" | "bad", "reason": "<max 200 chars>"},
    ...
  ]
}

Verdict rules:
- "good": score >= 80
- "borderline": score >= 60 and < 80
- "bad": score < 60

Domain classification reference:
${domainContext}

==========
HOW TO EVALUATE
==========

STEP 1 — Parse the query into HARD constraints and SOFT preferences.

HARD constraints (failing ANY one = "bad"):
- role / domain        e.g. "Business Analyst", "Python Developer", "Cardiologist"
- location             e.g. "India", "LATAM", "Non-US", "Egypt"
                       (LATAM = Mexico/Brazil/Colombia/Argentina/Chile/Peru/...
                        Non-US = anywhere except United States)
- minimum YOE          enforce ONLY if explicitly stated ("3+ years", "5+ years")
                       NOTE: "junior" or "1-2 yoe" do NOT impose an upper limit on seniors
- required language(s) e.g. "Arabic", "Portuguese + English"
- required skills      e.g. "Python", "SQL", "Verilog", "Spring Boot"
- rate ceiling         apply ONLY when talent.rate is non-null — null rate = skip, do NOT fail
- degree / cert        e.g. "PhD", "CFA", "CPA", "CISSP"

SOFT preferences (tie-breakers only — never fail alone):
- vague words: "strong", "senior", "detail-oriented", "analytical", "low cost"

If a constraint is genuinely ambiguous in the talent data → benefit of the doubt → treat as satisfied.

STEP 2 — Identify query group and apply group-specific rules:

GROUP 1 — SWE/Technical (Python, JavaScript, Java, C++, FastAPI, DevOps, SQL...):
- All hard constraints apply strictly
- Adjacent skills can justify "borderline" if experience is strong

GROUP 2 — BA with Language (Business Analyst - Arabic, BA - Japanese...):
- PRIMARY criterion: language proficiency — NOT BA job title
- "good" if: native speaker, translator, interpreter, language teacher, linguistics background, or extensive work/education in that language
- Translator/interpreter = fully equivalent to BA experience
- Do NOT penalize for lacking BA title if language proficiency is clear

GROUP 3 — AI Quality/Annotator with Language (AI Quality Analyst - Korean...):
- Same as Group 2, even more flexible
- Any native/fluent speaker with basic analytical ability = "good"
- Cultural familiarity with the language/region is a positive signal

GROUP 4 — STEM Expert (Physics Expert, Math Expert, Chemistry Expert...):
- PRIMARY criterion: education level — PhD or MSc in the specific field required
- Bachelor's in field = "borderline" at best
- Location constraints (US vs non-US) must be met exactly
- Field specificity matters: Physics ≠ general STEM
- Look for specific subdomains if mentioned in query (e.g. computational modeling, quantum)

GROUP 4B — STEM + Code hybrid (Computational Physics, Math & Python...):
- Requires BOTH: strong domain education (PhD/MSc preferred) AND coding proficiency
- Neither alone is sufficient — "borderline" if only one is present

GROUP 5 — Agentic/Prompt & Verifier (Agentic completion, Function Calling...):
- PRIMARY criterion: technical reasoning + excellent English communication
- No specific language/framework required — any solid technical background qualifies
- LLM/API/JSON/function-calling experience = strong positive signal
- MORE FLEXIBLE than Group 1 — adjacent backgrounds qualify
- YOE as stated in the query

GROUP 6 — Domain Expert (Finance, Legal, Medical, Cybersecurity):
- PRIMARY criterion: direct professional experience in the domain
- Finance: financial analysts, CPAs, CFAs, auditors — hands-on domain work required. Apply specific constraints if query mentions certifications or market (e.g. middle market private equity)
- Legal: lawyers, paralegals, compliance officers — law degree or bar admission preferred
- Medical: MDs, researchers, pharmacologists — field-specific must match if stated in query
- Cybersecurity: security engineers, SOC analysts — CISSP/CEH/similar = strong signal
- General business experience without domain specificity = "bad"

STEP 3 — Score each candidate:
- 90-100: all hard constraints clearly met, strong evidence throughout
- 80-89: all hard constraints met, good evidence
- 60-79: most constraints met, minor gaps or ambiguous evidence
- 0-59: one or more hard constraints clearly missing

You MUST return exactly ${profiles.length} result objects — one per candidate, in order.

Edge cases:
- If the query has zero hard constraints, count any talent whose role broadly fits.

==========
QUERY: "${query}"

CANDIDATES:
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
