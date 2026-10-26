/**
 * PORTFOLIO DEMO BUILD: in-browser stand-in for the CareBridge REST API.
 *
 * The full project runs these pages against the ASP.NET Core 8 API. This hosted copy has no
 * server, so the same routes are answered here with the same response shapes, the same
 * fictional seed data and the same sample eligibility rules as the C# code. Page code is
 * unchanged: it still calls apiGet/apiPost with the real API URLs.
 *
 * Decisions are kept in sessionStorage so they survive moving between demo pages.
 */

const PROGRAMS = ["MedicaidLongTermCare", "HomeAndCommunityBasedServices", "MedicareSavingsProgram"];
const STATUSES = ["Intake", "AssessmentScheduled", "UnderReview", "Approved", "Denied", "Reassessment"];
const PRIORITIES = ["Routine", "Expedited", "Urgent"];
const PREFERENCES = ["StandardPrint", "LargePrint", "Braille", "AudioRecording", "AccessibleElectronic", "TtyRelay"];
const FIRST = "Avery Jordan Morgan Riley Casey Quinn Rowan Emerson Harper Skyler Dakota Reese Finley Sage Parker Logan Elliot Hayden Jamie Kendall Marlow Noel Peyton Tatum".split(" ");
const LAST = "Alvarez Brooks Chen Delgado Ellison Fischer Garcia Haddad Iverson Jensen Kowalski Lindqvist Moreno Nakamura Okafor Petrov Quintero Ramirez Sorensen Tran Umarov Vasquez Whitfield Yilmaz".split(" ");
const COUNTIES = ["Prairie", "Riverbend", "Oak Hollow", "Cedar Ridge", "Lakeshore"];
const LANGUAGES = ["English", "Spanish", "Vietnamese", "Arabic", "Bosnian", "English"];
const WORKERS = ["A. Rivera", "B. Thompson", "C. Osei", "D. Laurent"];
const SERVICES = [
  ["PCA", "Personal care assistance"], ["HDM", "Home-delivered meals"], ["ADH", "Adult day health"],
  ["RES", "Respite care"], ["PERS", "Personal emergency response system"], ["SNF", "Skilled nursing facility stay"]
];
const STORE_KEY = "carebridge-demo-decisions";

const day = 86_400_000;
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const addMonths = (ms, m) => { const d = new Date(ms); d.setUTCMonth(d.getUTCMonth() + m); return d.getTime(); };

function seed() {
  const base = Date.UTC(2026, 2, 2, 14);
  const cases = [];
  let authId = 1;
  for (let i = 0; i < 24; i++) {
    const medicaidId = `XX${String(10_000_000 + ((i * 7_919_311) % 89_999_999)).padStart(8, "0")}`;
    const opened = base - i * 6 * day + i * 3_600_000;
    const language = LANGUAGES[i % LANGUAGES.length];
    const authorizations = [];
    for (let s = 0; s < 1 + (i % 3); s++) {
      const [code, name] = SERVICES[(i + s) % SERVICES.length];
      const start = opened + 14 * day;
      authorizations.push({
        id: authId++, serviceCode: code, serviceName: name, unitsPerWeek: 4 + (((i + s) * 3) % 17),
        startDate: isoDate(start), endDate: isoDate(addMonths(start, 6)),
        status: s === 0 ? "Pending" : "Approved", decisionReason: null,
        decidedBy: s === 0 ? null : WORKERS[(i + 1) % WORKERS.length],
        decidedUtc: s === 0 ? null : new Date(opened + 10 * day).toISOString()
      });
    }
    const first = FIRST[i];
    const last = LAST[(i * 5) % LAST.length];
    cases.push({
      id: i + 1, caseNumber: `LTC-2026-${String(1001 + i).padStart(5, "0")}`, first, last,
      program: PROGRAMS[i % 3], status: STATUSES[(i * 7) % 6], priority: PRIORITIES[(i * 11) % 3],
      assignedWorker: WORKERS[i % 4], openedUtc: new Date(opened).toISOString(),
      nextReviewDate: isoDate(addMonths(opened, 6)),
      beneficiary: {
        fullName: `${first} ${last}`,
        dateOfBirth: `${1938 + ((i * 3) % 30)}-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + ((i * 7) % 28)).padStart(2, "0")}`,
        maskedMedicaidId: `*****${medicaidId.slice(-4)}`, medicaidIdLast4: medicaidId.slice(-4),
        county: COUNTIES[i % 5], preferredLanguage: language, needsInterpreter: language !== "English",
        communicationPreference: PREFERENCES[i % 6]
      },
      authorizations,
      carePlanGoals: [
        { id: i * 2 + 1, description: "Attend scheduled primary-care and medication-review visits.", targetDate: isoDate(addMonths(opened, 2)), met: i % 3 === 0 },
        { id: i * 2 + 2, description: "Remain safely at home with daily support for bathing and dressing.", targetDate: isoDate(addMonths(opened, 3)), met: i % 4 === 0 }
      ]
    });
  }
  return cases;
}

const CASES = seed();

// Re-apply decisions made earlier in this browser tab.
try {
  const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}");
  for (const c of CASES) for (const a of c.authorizations) if (saved[a.id]) Object.assign(a, saved[a.id]);
} catch { /* storage unavailable: start fresh */ }

function saveDecision(a) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}");
    saved[a.id] = { status: a.status, decisionReason: a.decisionReason, decidedBy: a.decidedBy, decidedUtc: a.decidedUtc };
    sessionStorage.setItem(STORE_KEY, JSON.stringify(saved));
  } catch { /* ignore */ }
}

// ---- Sample eligibility rules (same values as appsettings.json / EligibilityService.cs) ----
const money = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

function screen(r) {
  const age = r.age ?? 0, income = r.monthlyIncome ?? 0, assets = r.countableAssets ?? 0, adl = r.dailyActivitiesNeedingHelp ?? 0;
  const household = Math.max(1, r.householdSize ?? 1);
  const categorical = age >= 65 || r.hasDisability === true;
  const ltcIncome = income <= 2901, ltcAssets = assets <= 2000;

  const ltcOk = categorical && ltcIncome && ltcAssets && adl >= 2;
  const hcbsOk = categorical && ltcIncome && ltcAssets && adl >= 1;
  const mspLimit = 1325 + 465 * (household - 1);
  const mspAssets = household >= 2 ? 14470 : 9660;
  const mspOk = r.hasMedicarePartA === true && income <= mspLimit && assets <= mspAssets;

  return {
    results: [
      {
        program: PROGRAMS[0], programName: "Medicaid long-term care", mayQualify: ltcOk,
        reasons: [
          categorical ? "You are 65 or older, or you have a disability." : "This program is for people 65 or older, or people with a disability.",
          ltcIncome ? `Your monthly income is at or below the sample limit of ${money(2901)}.` : `Your monthly income is above the sample limit of ${money(2901)}. Some people still qualify by spending down income on medical costs.`,
          ltcAssets ? `Your countable assets are at or below the sample limit of ${money(2000)}.` : `Your countable assets are above the sample limit of ${money(2000)}.`,
          adl >= 2 ? "You need help with enough daily activities to suggest a nursing-facility level of care." : "This program usually requires help with at least 2 daily activities."
        ],
        nextStep: ltcOk ? "Start an application and request a functional assessment." : "You can still apply. A caseworker can review spend-down and other options with you."
      },
      {
        program: PROGRAMS[1], programName: "Home and community-based services", mayQualify: hcbsOk,
        reasons: [
          categorical ? "You meet the age or disability requirement." : "Home and community-based services are for older adults and people with disabilities.",
          ltcIncome && ltcAssets ? "Your income and assets are within the sample limits." : "Your income or assets are above the sample limits.",
          adl >= 1 ? "You need help with at least one daily activity, so services at home may help." : "These services are for people who need help with daily activities."
        ],
        nextStep: hcbsOk ? "Ask about in-home supports such as personal care, meals, and respite." : "Contact your local aging and disability resource center to explore other supports."
      },
      {
        program: PROGRAMS[2], programName: "Medicare Savings Program", mayQualify: mspOk,
        reasons: [
          r.hasMedicarePartA ? "You have Medicare Part A." : "Medicare Savings Programs are for people who have, or can get, Medicare Part A.",
          income <= mspLimit ? `Your income is at or below the sample limit of ${money(mspLimit)} for a household of ${household}.` : `Your income is above the sample limit of ${money(mspLimit)} for a household of ${household}.`,
          assets <= mspAssets ? `Your assets are at or below the sample limit of ${money(mspAssets)}.` : `Your assets are above the sample limit of ${money(mspAssets)}.`
        ],
        nextStep: mspOk ? "Apply to have help paying Medicare premiums, deductibles, and copays." : "A benefits counselor can check whether other help with Medicare costs is available."
      }
    ],
    disclaimer: "This is an estimate only, based on sample rules for a demonstration. It is not a decision. Only a full application reviewed by the agency can determine eligibility."
  };
}

// ---- Routes ----
const ok = (data) => ({ ok: true, status: 200, data, problem: null });
const fail = (status, problem) => ({ ok: false, status, data: null, problem });
const SORT_KEYS = {
  caseNumber: (c) => c.caseNumber, beneficiary: (c) => `${c.last} ${c.first}`, program: (c) => c.program,
  status: (c) => c.status, priority: (c) => c.priority, opened: (c) => c.openedUtc
};

function searchCases(params) {
  let items = CASES;
  const search = params.get("search");
  if (search) items = items.filter((c) => c.caseNumber.includes(search) || c.first.includes(search) || c.last.includes(search));
  if (params.get("status")) items = items.filter((c) => c.status === params.get("status"));
  if (params.get("program")) items = items.filter((c) => c.program === params.get("program"));
  const key = SORT_KEYS[params.get("sort")] || SORT_KEYS.opened;
  const dir = params.get("dir") === "asc" ? 1 : -1;
  items = [...items].sort((a, b) => (key(a) < key(b) ? -dir : key(a) > key(b) ? dir : a.caseNumber.localeCompare(b.caseNumber)));
  const page = Number(params.get("page")) || 1;
  const pageSize = Number(params.get("pageSize")) || 10;
  return ok({
    items: items.slice((page - 1) * pageSize, page * pageSize).map((c) => ({
      id: c.id, caseNumber: c.caseNumber, beneficiaryName: c.beneficiary.fullName, program: c.program,
      status: c.status, priority: c.priority, assignedWorker: c.assignedWorker, openedUtc: c.openedUtc,
      pendingAuthorizations: c.authorizations.filter((a) => a.status === "Pending").length
    })),
    page, pageSize, totalCount: items.length, totalPages: Math.ceil(items.length / pageSize)
  });
}

const delay = () => new Promise((resolve) => setTimeout(resolve, 250)); // feel like a network call

export async function apiGet(url) {
  await delay();
  const u = new URL(url, location.href);
  if (u.pathname.endsWith("/api/cases")) return searchCases(u.searchParams);
  const match = u.pathname.match(/\/api\/cases\/(\d+)$/);
  if (match) {
    const c = CASES.find((x) => x.id === Number(match[1]));
    if (!c) return fail(404, { title: "Case not found", detail: `No case exists with ID ${match[1]}.` });
    const { first, last, ...detail } = c;
    return ok(structuredClone(detail));
  }
  return fail(404, { title: "Not found", detail: "Unknown demo route." });
}

export async function apiPost(url, body) {
  await delay();
  if (url.endsWith("/api/eligibility/screen")) return ok(screen(body));
  const match = url.match(/\/api\/cases\/(\d+)\/authorizations\/(\d+)\/decision$/);
  if (match) {
    const c = CASES.find((x) => x.id === Number(match[1]));
    const a = c?.authorizations.find((x) => x.id === Number(match[2]));
    if (!a) return fail(404, { title: "Authorization not found", detail: "The service authorization could not be found for this case." });
    if (a.status !== "Pending") return fail(409, { title: "Already decided", detail: "This service authorization was already decided. Refresh the page to see the current status." });
    if (body.decision === "Denied" && !body.reason) {
      return fail(400, { title: "One or more validation errors occurred.", errors: { Reason: ["Enter a reason for the denial. The reason is included in the notice sent to the beneficiary."] } });
    }
    Object.assign(a, { status: body.decision, decisionReason: body.reason || null, decidedBy: "demo.caseworker", decidedUtc: new Date().toISOString() });
    saveDecision(a);
    return ok(structuredClone(a));
  }
  return fail(404, { title: "Not found", detail: "Unknown demo route." });
}
