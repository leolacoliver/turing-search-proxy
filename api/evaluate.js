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
      `${pr.name || ""}: ${(pr.description || "").slice(0, 300)}`
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

  const currentDate = new Date().toISOString().slice(0, 10);

  const prompt = `You are a strict relevance evaluator for a talent-search engine.

==========
OUTPUT FORMAT — NON-NEGOTIABLE
==========

Reply with exactly ONE JSON object and nothing else (no markdown, no prose).

{
  "query_domain": "<domain>",
  "query_subdomain": "<subdomain>",
  "results": [
    {"index": 0, "score": <int 0-10>, "verdict": "relevant" | "not_relevant", "reason": "<max 200 chars>"},
    ...
  ]
}

Score guidance (per-candidate, integer 0-10):
- 9-10: all hard constraints clearly met, strong evidence
- 7-8:  all hard constraints met, decent evidence
- 5-6:  most constraints met, minor gaps or ambiguous evidence
- 3-4:  one hard constraint clearly missing
- 0-2:  multiple hard constraints missing or fundamental mismatch

Verdict rule:
- "relevant"     when score >= 5
- "not_relevant" when score <  5

Domain classification reference (internal — do not output):
${domainContext}

CURRENT_DATE: ${currentDate}

==========
HOW TO EVALUATE
==========

STEP 1 — Parse HARD constraints and SOFT preferences.

HARD constraints (failing ANY one = not_relevant):

- role / domain

- location
  e.g. "India", "LATAM", "Non-US", "Egypt", "New York"
  Region definitions:
    LATAM   = Mexico, Brazil, Colombia, Argentina, Chile, Peru, Uruguay, Venezuela, Ecuador, Bolivia, Paraguay, Costa Rica, Panama, Guatemala, Honduras, El Salvador, Nicaragua, Dominican Republic, Cuba
    Africa  = Nigeria, Kenya, Ghana, Egypt, Ethiopia, South Africa, Tanzania, Uganda, Senegal, Cameroon, and all other African countries
    MENA    = Egypt, UAE, Saudi Arabia, Jordan, Lebanon, Kuwait, Qatar, Bahrain, Oman, Iraq, Tunisia, Morocco, Algeria, Libya
    Europe  = UK, Germany, France, Spain, Italy, Netherlands, Poland, Sweden, Portugal, Belgium, and all other European countries
    Asia    = India, Pakistan, Philippines, Bangladesh, Vietnam, Indonesia, Malaysia, Sri Lanka, Nepal, and all other Asian countries
    Non-US  = anywhere except United States

  CITY / METRO — strict enforcement when a specific city is mentioned:
    A candidate located in the named country but in a different city = not_relevant.
    Missing / ambiguous city in candidate data: give benefit of the doubt.

- minimum YOE
  Enforce ONLY if explicitly stated ("3+ years", "5+ years of Python").
    • "5+ years of Python" → verify Python-specific YOE, not total career YOE
    • "5+ years of experience" → total career YOE is acceptable
  Phrasings like "junior" or "1-2 yoe" do NOT impose an upper limit on seniors.

- required language(s)
  e.g. "Arabic", "Portuguese + English"
  Native language can be inferred from country (Brazil → Portuguese, Egypt → Arabic, Japan → Japanese).
  English proficiency requires explicit evidence unless the query only asks for a non-English language.

- required skills
  When query lists multiple skills with "and", "along with", "including", "as well as":
    • ALL listed skills are hard constraints
    • Missing 1 skill = borderline (not_relevant if confidence is low)
    • Missing 2+ skills = not_relevant

- employment type
  Contract/freelance does NOT satisfy full-time requirements unless explicitly allowed.
  Internships do not count as professional YOE unless explicitly stated.

- rate ceiling
  Apply ONLY when talent.rate is non-null. Null rate = skip, do NOT fail.
  "Low cost", "affordable", "budget" = soft preference only.

- degree / certification
    • "PhD" → only completed PhDs qualify; pursuing PhD = not_relevant
    • "Master's" / "MSc" → only completed Master's qualify; pursuing = borderline
    • "Bachelor's" → completed required; still pursuing = not_relevant
    • "undergraduate students" → CURRENTLY ENROLLED in Bachelor's, graduation in the future.
      Completed BSc + now doing Master's = NOT an undergraduate student.
    • No degree mentioned → do not infer or penalize
    • Field specificity: "Physics PhD" ≠ PhD in Business or unrelated field
  Certifications (CFA, CPA, CISSP, CEH, etc.): only fully obtained qualify.

  Education timing — use CURRENT_DATE (${currentDate}) when reasoning about enrollment:
    • Resume "Expected <date>" where date is on or before CURRENT_DATE → degree likely completed; trust structured marker
    • Resume "Expected <date>" clearly in the future → treat as still in progress
    • "PhD Candidate" or "ABD" in resume header = stale artifact; trust structured [completed]/[enrolled] marker

SOFT preferences (tie-breakers only — never fail alone):
- vague words: "strong", "senior", "detail-oriented", "analytical", "low cost", "premium"

If a constraint is genuinely ambiguous → benefit of the doubt → treat as satisfied.

STEP 2 — Apply group-specific rules:

GROUP 1 — SWE/Technical (Python, JavaScript, Java, C++, FastAPI, DevOps, SQL...):
- All hard constraints apply strictly
- YOE in specific technology ≠ total career YOE
- Adjacent skills justify borderline ONLY if primary skill is present

GROUP 2 — BA with Language (Business Analyst - Arabic, BA - Japanese...):
- PRIMARY criterion: language proficiency — NOT BA job title
- relevant if: native speaker, translator, interpreter, language teacher, linguistics background, or extensive work/education in that language
- Native language inferred from country (Brazil → Portuguese, Egypt → Arabic)
- Translator/interpreter = fully equivalent to BA experience
- Do NOT penalize for lacking BA title if language proficiency is clear

GROUP 3 — AI Quality/Annotator with Language:
- Same as Group 2, even more flexible
- Any native/fluent speaker with basic analytical ability = relevant

GROUP 4 — STEM Expert (Physics, Math, Chemistry...):
- PRIMARY criterion: education — PhD or MSc in the specific field
- Bachelor's = borderline; not_relevant if PhD explicitly required
- Location (US vs non-US) must be met exactly
- Field specificity: Physics ≠ general STEM

GROUP 4B — STEM + Code hybrid:
- Requires BOTH domain education (PhD/MSc) AND coding proficiency
- Neither alone is sufficient

GROUP 5 — Agentic/Prompt & Verifier:
- PRIMARY criterion: technical reasoning + excellent English communication
- LLM/API/JSON/function-calling = strong positive signal
- MORE FLEXIBLE than Group 1

GROUP 6 — Domain Expert (Finance, Legal, Medical, Cybersecurity):
- Finance: hands-on domain work required; apply specific constraints (certifications, market type)
- Legal: law degree or bar admission preferred; hands-on work required
- Medical: field-specific must match if stated
- Cybersecurity: CISSP/CEH/similar = strong signal; pursuing ≠ holding
- General business without domain specificity = not_relevant

STEP 3 — Score and decide for each candidate.

Fields to check:
- role, workExperience[].position, workExperience[].employmentType → role/domain/employment
- country, continent → location
- yearsOfExperience, skills[].yearsOfExperience → YOE
- skills[].name → required skills
- languages[] → required languages
- rate → rate ceiling (skip if null)
- education[].degree, education[].isCurrent, certifications[] → degree/cert

You MUST return exactly ${profiles.length} result objects — one per candidate, in order.
Reason must be <= 200 chars, concrete and specific. No hedging language.

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
        model: "gpt-5.4",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 16000,
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

    const remapped = parsed.results.map(item => {
      // New prompt returns score 0-10 and verdict relevant/not_relevant
      // Map to internal format: score 0-100, verdict good/borderline/bad
      const rawScore = item.score ?? 5;
      const score100 = rawScore * 10; // convert 0-10 → 0-100
      const rawVerdict = item.verdict || "not_relevant";

      let verdict, match, borderline;
      if (rawVerdict === "relevant") {
        if (score100 >= 80) { verdict = "good"; match = true; borderline = false; }
        else { verdict = "borderline"; match = false; borderline = true; }
      } else {
        verdict = "bad"; match = false; borderline = false;
      }

      return {
        ...item,
        index: indexMap[item.index] ?? item.index,
        score: score100,
        verdict,
        match,
        borderline,
        query_domain: queryDomain,
        query_subdomain: querySubdomain,
      };
    });

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
