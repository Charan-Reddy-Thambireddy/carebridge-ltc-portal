/** Display helpers: human-readable labels for API enum values, dates, and badges. */

export const PROGRAM_LABELS = {
  MedicaidLongTermCare: "Medicaid long-term care",
  HomeAndCommunityBasedServices: "Home and community-based services",
  MedicareSavingsProgram: "Medicare Savings Program"
};

export const STATUS_LABELS = {
  Intake: "Intake",
  AssessmentScheduled: "Assessment scheduled",
  UnderReview: "Under review",
  Approved: "Approved",
  Denied: "Denied",
  Reassessment: "Reassessment"
};

export const COMMUNICATION_LABELS = {
  StandardPrint: "Standard print",
  LargePrint: "Large print",
  Braille: "Braille",
  AudioRecording: "Audio recording",
  AccessibleElectronic: "Accessible electronic document",
  TtyRelay: "TTY / relay service"
};

const BADGE_TONE = {
  Approved: "success",
  Denied: "error",
  UnderReview: "warning",
  Pending: "warning",
  Reassessment: "info",
  AssessmentScheduled: "info",
  Intake: "neutral",
  Urgent: "error",
  Expedited: "warning",
  Routine: "neutral"
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" });
const shortDateFormatter = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" });

/** Formats "2026-03-02" or an ISO timestamp. Date-only strings are parsed as local dates. */
export function formatDate(value, { short = false } = {}) {
  if (!value) {
    return "Not set";
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return (short ? shortDateFormatter : dateFormatter).format(date);
}

/** Creates a status badge. The text label is always present; color is reinforcement only. */
export function badge(value, label = STATUS_LABELS[value] || value) {
  const span = document.createElement("span");
  span.className = `bcn-badge bcn-badge--${BADGE_TONE[value] || "neutral"}`;
  span.textContent = label;
  return span;
}

/** Creates an element with optional class and text. */
export function el(tag, { className, text, attrs } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  }
  return node;
}
