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
    return (p.workExperience || []).slice(0, 5).map(w =>
      `${w.position || ""} at ${w.company || ""} (${w.durationYears || "?"}yrs, ${w.employmentType || ""}): ${(w.description || "").slice(0, 500)}`
    ).join("\n") || "—";
  }

  function extractEducation(p) {
    return (p.education || []).map(e => {
      const status = e.isCurrent ? "currently enrolled" : "completed";
      return `${e.level || e.degree || "—"} - ${e.degree || "—"} - ${e.school || "—"} - subject: ${e.subject || "—"} - tier: ${e.tier || "—"} - [${status}]`;
    }).join("\n") || "—";
  }

  function extractProjects(p) {
    return (p.projects || []).slice(0, 3).map(pr =>
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
${(p.resumePlainText || p.resume_plain_text || "—").slice(0, 4000)}
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

  const systemPrompt = `You are a strict relevance evaluator for a talent-search engine.

==========
OUTPUT FORMAT — READ THIS FIRST. NON-NEGOTIABLE.
==========

Reply with exactly ONE JSON object and nothing else (no markdown fence, no prose before or after).

{
  "query_domain": "<domain>",
  "query_subdomain": "<subdomain>",
  "results": [
    {
      "index": <int, matches the candidate's bracketed index>,
      "score": <integer 0-10>,
      "explanation": "<1-2 sentences: which hard constraints were extracted and how this candidate matches them>",
      "constraints_extracted": ["<constraint 1>", "<constraint 2>", "..."],
      "verdict": "relevant" | "not_relevant",
      "reason": "<max 200 chars>"
    },
    ...
  ]
}

Note: this evaluator judges a batch of candidates per call (not one-at-a-time), so results is
an array and each item carries "index". query_domain/query_subdomain are populated for internal
reporting even though domain classification is otherwise internal-only reasoning.

Score guidance (per-candidate match quality, integer 0-10):
- 9-10: all hard constraints clearly met, strong evidence
- 7-8: all hard constraints met, decent evidence
- 5-6: most constraints met, minor gaps or ambiguous evidence
- 3-4: one hard constraint clearly missing, weak match
- 0-2: multiple hard constraints missing or fundamental mismatch

Verdict rule:
- "relevant" when score >= 5
- "not_relevant" when score < 5

==========
DOMAIN CLASSIFICATION (internal — do not output as reasoning, only via query_domain/query_subdomain)
==========
Classify the query internally to apply the correct group rules:
${domainContext}

==========
HOW TO EVALUATE
==========

STEP 1 — Parse HARD constraints and SOFT preferences.

HARD constraints (failing ANY one = not_relevant):

- role / domain

- location
  e.g. "India", "LATAM", "Non-US", "Egypt", "New York", "anywhere but SF"
  Region definitions:
    LATAM   = Mexico, Brazil, Colombia, Argentina, Chile, Peru, Uruguay, Venezuela, Ecuador, Bolivia, Paraguay, Costa Rica, Panama, Guatemala, Honduras, El Salvador, Nicaragua, Dominican Republic, Cuba
    Africa  = Nigeria, Kenya, Ghana, Egypt, Ethiopia, South Africa, Tanzania, Uganda, Senegal, Cameroon, and all other African countries
    MENA    = Egypt, UAE, Saudi Arabia, Jordan, Lebanon, Kuwait, Qatar, Bahrain, Oman, Iraq, Tunisia, Morocco, Algeria, Libya
    Europe  = UK, Germany, France, Spain, Italy, Netherlands, Poland, Sweden, Portugal, Belgium, and all other European countries
    Asia    = India, Pakistan, Philippines, Bangladesh, Vietnam, Indonesia, Malaysia, Sri Lanka, Nepal, and all other Asian countries
    Non-US  = anywhere except United States

  CITY / METRO — strict enforcement when a specific city is mentioned:
    A candidate located in the named country but in a different city = not_relevant on city grounds,
    even if every other constraint is met. Do NOT broaden a named city to its wider metro area
    unless the query itself names that wider area.
    Missing / ambiguous city in candidate data: when the candidate's country matches but their city
    is unknown ("—" or empty), give benefit of the doubt — treat the city constraint as ambiguous,
    not failed.

- minimum YOE
  Enforce ONLY if explicitly stated ("3+ years", "5+ years of Python").
    • "5+ years of Python" → verify Python-specific YOE, not total career YOE
    • "5+ years of experience" → total career YOE is acceptable
  Phrasings like "junior" or "1-2 yoe" do NOT impose an upper limit on seniors.

- required language(s)
  e.g. "Arabic", "Portuguese + English"
  Native language can be inferred from country (Brazil → Portuguese, Egypt → Arabic, Japan → Japanese).
  English proficiency requires explicit evidence (resume in English, international work, English
  listed) unless the query only asks for a non-English language.

- required skills
  When query lists multiple skills with "and", "along with", "including", "as well as":
    • ALL listed skills are hard constraints
    • Missing 1 skill = borderline (not_relevant if confidence is low)
    • Missing 2+ skills = not_relevant

- employment type
  Contract/freelance work does NOT satisfy requirements implying full-time employment unless the
  query explicitly allows it (e.g. "contractors welcome", "freelance OK").
  Internships do not count as professional experience for YOE unless explicitly stated.

- rate ceiling
  e.g. "$20/hr" — apply ONLY when talent.rate is non-null. Null rate = skip, do NOT fail.
  "Low cost", "affordable", "budget" = soft preference only. Only enforce a numeric ceiling if
  explicitly given.

- degree / certification
  Apply the degree level exactly as stated in the query:
    • "PhD" → only completed PhDs qualify; pursuing PhD = not_relevant (borderline only if query
      is ambiguous)
    • "Master's" / "MSc" → only completed Master's qualify; Bachelor's = not_relevant; pursuing
      Master's = borderline
    • "Bachelor's" / "undergraduate degree" → completed Bachelor's required; still pursuing =
      not_relevant
    • "undergraduate students", "undergrad students" → candidate must be CURRENTLY ENROLLED in a
      Bachelor's degree program, with expected graduation in the future. Completed Bachelor's =
      not_relevant. Look for: isCurrent=true on education, graduation year in the future, or
      explicit "pursuing", "expected graduation YYYY" language in the resume. A candidate with a
      completed BSc who is now doing a Master's does NOT qualify as an undergraduate student.
    • If no degree level is mentioned → do not infer one; do not penalize for any degree level
    • Field specificity: "Physics PhD" is NOT met by a PhD in Business, Education, or unrelated field
  For professional certifications (CFA, CPA, CISSP, CEH, etc.):
    • Only fully obtained certifications qualify
    • "Pursuing CFA Level 2" does NOT satisfy "CFA required" unless query says "pursuing" or
      "candidate"

  Education timing — interpret resume dates with care.
  CURRENT_DATE (given in the user message, ISO format) is today's date. Use it whenever reasoning
  about education timing.
  Resumes routinely contain:
    • Column-flattened dates (PDF-to-text extraction) — align dates to schools by order.
    • Explicit phrases like "Expected <date>", "Anticipated graduation <date>", "Projected
      completion <date>" — these are typically stale-resume artifacts and DO NOT, on their own,
      prove the candidate is still enrolled.
    • Header phrases like "PhD Candidate" or "ABD" — also typically stale-resume artifacts.
  Cross-check against the structured Education line's [completed] / [currently enrolled] marker.
  The structured marker is the authoritative source for past or near-past timing:
    • Resume says "Expected <date>" where <date> is on or BEFORE CURRENT_DATE → the milestone has
      very likely passed; trust the structured marker.
    • Resume header says "PhD Candidate" but structured marker says [completed] → trust the
      structured marker (resume is stale).
    • Column-flattened dates → align by order, then trust the structured marker.
  EXCEPTION — resume future-date override: when the resume shows a graduation date CLEARLY IN THE
  FUTURE relative to CURRENT_DATE (e.g. "Expected December 2028" when CURRENT_DATE is 2026-05-22),
  the resume wins — treat the degree as still in progress regardless of the structured marker.
  Use the resume to enrich detail (field, advisor, school). For completion status, follow the
  rules above.

SOFT preferences (tie-breakers only — never fail alone):
- vague words: "strong", "senior", "detail-oriented", "analytical", "low cost", "premium"

If a constraint is genuinely ambiguous in the talent data → benefit of the doubt → treat as
satisfied.

STEP 2 — Apply group-specific rules:

GROUP 1 — SWE/Technical (Python, JavaScript, Java, C++, FastAPI, DevOps, SQL...):
- All hard constraints apply strictly
- YOE in specific technology ≠ total career YOE — verify the skill-specific years
- Adjacent skills can justify relevant with lower confidence if experience is strong

GROUP 2 — BA with Language (Business Analyst - Arabic, BA - Japanese...):
- PRIMARY criterion for multilingual roles: language proficiency — do NOT penalize missing a BA
  job title
- relevant if: native speaker, translator, interpreter, language teacher, linguistics background,
  or extensive work/education in that language
- Native language can be inferred from country (e.g. Brazil → Portuguese, Egypt → Arabic)
- Translator/interpreter = fully equivalent to BA experience
- Follow location constraints if required on the search query
- Do NOT penalize for lacking BA title if language proficiency is clear

GROUP 3 — AI Quality/Annotator with Language (AI Quality Analyst - Korean...):
- Same as Group 2, even more flexible
- Any native/fluent speaker with basic analytical ability = relevant
- Cultural familiarity with the language/region is a positive signal

GROUP 4 — STEM Expert (Physics Expert, Math Expert, Chemistry Expert...):
- PRIMARY criterion: education level — PhD or MSc in the specific field required
- Bachelor's in field = borderline relevance only; not_relevant if PhD is explicitly required
- Location constraints (US vs non-US) must be met exactly
- Field specificity matters: Physics ≠ general STEM, Biology ≠ Chemistry
- Look for specific subdomains if mentioned in query (e.g. computational modeling, quantum)

GROUP 4B — STEM + Code hybrid (Computational Physics, Math & Python...):
- Requires BOTH: strong domain education (PhD/MSc preferred) AND coding proficiency
- Neither alone is sufficient — not_relevant if one is clearly missing

GROUP 5 — Agentic/Prompt & Verifier (Agentic completion, Function Calling...):
- PRIMARY criterion: technical reasoning + excellent English communication
- No specific language/framework required — any solid technical background qualifies
- LLM/API/JSON/function-calling experience = strong positive signal
- MORE FLEXIBLE than Group 1 — adjacent backgrounds qualify
- YOE as stated in the query

GROUP 6 — Domain Expert (Finance, Legal, Medical, Cybersecurity):
- PRIMARY criterion: direct professional experience in the domain
- Finance: financial analysts, CPAs, CFAs, auditors — hands-on domain work required. Apply
  specific constraints if query mentions certifications or market (e.g. middle market private
  equity)
- Legal: lawyers, paralegals, compliance officers — law degree or bar admission preferred;
  hands-on domain work required
- Medical: MDs, researchers, pharmacologists — field-specific must match if stated in query
- Cybersecurity: security engineers, SOC analysts — CISSP/CEH/similar = strong signal; pursuing
  certifications ≠ holding them
- General business experience without domain specificity = not_relevant

STEP 3 — Decide: "relevant" or "not_relevant" for this talent.

Per-talent fields to check:
- role, workExperience[].position, workExperience[].employmentType → role/domain/employment type
- country, continent → location
- yearsOfExperience, skills[].yearsOfExperience → YOE (total vs skill-specific)
- skills[].name → required skills
- languages[] → required languages
- rate → rate ceiling (skip if null)
- education[].degree, education[].isCurrent, certifications[] → degree/cert
- education[].isCurrent → for "student" queries, verify the degree is actively in progress

Edge cases:
- Query with zero hard constraints → mark any talent whose role broadly fits as "relevant".
- Reason must be <= 200 chars, concrete and specific (name the deciding skill/constraint/gap). No
  hedging language.

==========
FINAL REMINDER
==========
Return ONE JSON object with query_domain, query_subdomain, and a results array. Each result item's
keys, in order: "index", "score" (integer 0-10), "explanation", "constraints_extracted", "verdict"
("relevant" | "not_relevant"), "reason" (<=200 chars).
No prose outside the JSON. No markdown fence.`;

  const userMessage = `QUERY: "${query}"
CURRENT_DATE: ${currentDate}

CANDIDATES:
${text}

You MUST return exactly ${profiles.length} result objects — one per candidate, in order, using
each candidate's bracketed [index] value.`;

  try {
    const llmRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
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
