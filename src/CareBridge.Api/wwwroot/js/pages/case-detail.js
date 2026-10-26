import { apiGet, apiPost } from "../api.js";
import { announce } from "../a11y/announcer.js";
import { clearErrors, fromProblemDetails, showErrors } from "../a11y/form-errors.js";
import { initTabs } from "../a11y/tabs.js";
import { COMMUNICATION_LABELS, PROGRAM_LABELS, badge, el, formatDate } from "../format.js";

const caseId = Number(new URLSearchParams(location.search).get("id"));

const loading = document.getElementById("case-loading");
const content = document.getElementById("case-content");
const notFound = document.getElementById("case-error");
const heading = document.getElementById("case-heading");
const crumb = document.getElementById("breadcrumb-current");
const authBody = document.getElementById("auth-body");
const decisionNotice = document.getElementById("decision-notice");

const dialog = document.getElementById("decision-dialog");
const dialogForm = document.getElementById("decision-form");
const dialogSummary = document.getElementById("decision-error-summary");
const dialogService = document.getElementById("decision-service");
const reason = document.getElementById("decision-reason");
const reasonCount = document.getElementById("decision-reason-count");
const REASON_MAX = 500;

let caseData = null;
let activeAuthorization = null;
let lastTrigger = null;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderSummary(c) {
  const b = c.beneficiary;
  document.title = `Case ${c.caseNumber} – CareBridge`;
  heading.textContent = `Case ${c.caseNumber}`;
  crumb.textContent = c.caseNumber;

  document.getElementById("case-subtitle").textContent = `${b.fullName} · ${PROGRAM_LABELS[c.program]}`;
  const badges = document.getElementById("case-badges");
  badges.replaceChildren(badge(c.status), badge(c.priority, `${c.priority} priority`));

  const list = document.getElementById("beneficiary-details");
  list.replaceChildren();
  const add = (term, value) => {
    list.append(el("dt", { text: term }));
    const dd = el("dd");
    if (value instanceof Node) dd.append(value); else dd.textContent = value;
    list.append(dd);
  };

  // Masked ID: screen readers hear "ending in 4 8 2 1" instead of "star star star star star 4821".
  const masked = el("span");
  masked.append(
    el("span", { text: b.maskedMedicaidId, attrs: { "aria-hidden": "true" } }),
    el("span", { className: "bcn-visually-hidden", text: `Ending in ${b.medicaidIdLast4.split("").join(" ")}` })
  );

  add("Name", b.fullName);
  add("Date of birth", formatDate(b.dateOfBirth));
  add("Medicaid ID", masked);
  add("County", b.county);
  add("Preferred language", b.preferredLanguage + (b.needsInterpreter ? " (interpreter needed)" : ""));
  add("Notice format", COMMUNICATION_LABELS[b.communicationPreference] || b.communicationPreference);
  add("Assigned worker", c.assignedWorker);
  add("Opened", formatDate(c.openedUtc));
  add("Next review", formatDate(c.nextReviewDate));

  // Surface accommodation needs prominently so staff honor them (effective communication).
  const accommodation = document.getElementById("accommodation-alert");
  const needsFormat = b.communicationPreference !== "StandardPrint";
  if (needsFormat || b.needsInterpreter) {
    const parts = [];
    if (needsFormat) parts.push(`send all notices in ${COMMUNICATION_LABELS[b.communicationPreference].toLowerCase()}`);
    if (b.needsInterpreter) parts.push(`arrange a ${b.preferredLanguage} interpreter for calls and visits`);
    document.getElementById("accommodation-text").textContent =
      `This beneficiary has requested an accommodation: ${parts.join(" and ")}.`;
    accommodation.hidden = false;
  }
}

function renderAuthorizations(auths) {
  authBody.replaceChildren();
  for (const a of auths) {
    const row = el("tr", { attrs: { "data-auth-id": String(a.id) } });
    const service = el("th", { attrs: { scope: "row" } });
    service.append(document.createTextNode(a.serviceName), el("br"), el("span", { className: "bcn-hint", text: `Code ${a.serviceCode}` }));

    const status = el("td");
    status.append(badge(a.status));
    if (a.decidedBy) {
      status.append(el("span", { className: "bcn-hint", text: `by ${a.decidedBy}, ${formatDate(a.decidedUtc, { short: true })}` }));
    }
    if (a.decisionReason) {
      status.append(el("span", { className: "bcn-hint", text: `Reason: ${a.decisionReason}` }));
    }

    const actions = el("td");
    if (a.status === "Pending") {
      const button = el("button", {
        className: "bcn-button bcn-button--small",
        text: "Decide",
        attrs: { type: "button", "aria-haspopup": "dialog" }
      });
      // Visible text is short; the accessible name includes the service so a list of
      // buttons is not just "Decide, Decide, Decide" in a screen reader's button list.
      button.append(el("span", { className: "bcn-visually-hidden", text: ` on ${a.serviceName}` }));
      button.addEventListener("click", () => openDecision(a, button));
      actions.append(button);
    } else {
      actions.append(el("span", { className: "bcn-hint", text: "No action needed" }));
    }

    row.append(
      service,
      el("td", { className: "bcn-table__numeric", text: String(a.unitsPerWeek) }),
      el("td", { text: `${formatDate(a.startDate, { short: true })} to ${formatDate(a.endDate, { short: true })}` }),
      status,
      actions
    );
    authBody.append(row);
  }
}

function renderCarePlan(goals) {
  const list = document.getElementById("care-plan-list");
  list.replaceChildren();
  for (const g of goals) {
    const item = el("li", { className: "bcn-panel" });
    item.append(
      el("p", { text: g.description }),
      el("p", { className: "bcn-hint", text: `Target date: ${formatDate(g.targetDate)}` }),
      badge(g.met ? "Approved" : "Pending", g.met ? "Goal met" : "In progress")
    );
    list.append(item);
  }
}

// ---------------------------------------------------------------------------
// Decision dialog
// ---------------------------------------------------------------------------

function updateCount() {
  const remaining = REASON_MAX - reason.value.length;
  const over = remaining < 0;
  reasonCount.textContent = over
    ? `You have ${Math.abs(remaining)} characters too many`
    : `You have ${remaining} characters remaining`;
  reasonCount.classList.toggle("bcn-char-count--over", over);
}

// Announce the count only when the user pauses typing, so the screen reader is not flooded.
let countTimer;
reason.addEventListener("input", () => {
  updateCount();
  window.clearTimeout(countTimer);
  countTimer = window.setTimeout(() => announce(reasonCount.textContent), 1000);
});

function openDecision(authorization, trigger) {
  activeAuthorization = authorization;
  lastTrigger = trigger;
  dialogForm.reset();
  clearErrors(dialogForm, dialogSummary);
  updateCount();
  dialogService.textContent = `${authorization.serviceName}, ${authorization.unitsPerWeek} units per week`;
  dialog.showModal();
  // Initial focus on the first field; the heading is still announced via aria-labelledby.
  document.getElementById("decision-approve").focus();
}

function closeDecision() {
  dialog.close();
}

// Restore focus to whatever opened the dialog (WCAG 2.4.3 Focus Order). This also runs when
// the browser closes the dialog with Escape.
dialog.addEventListener("close", () => {
  if (lastTrigger && document.contains(lastTrigger)) {
    lastTrigger.focus();
  }
});

document.querySelectorAll("[data-dialog-close]").forEach((b) => b.addEventListener("click", closeDecision));

dialogForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const decision = dialogForm.querySelector('input[name="decision"]:checked')?.value || null;
  const reasonText = reason.value.trim();

  const errors = [];
  if (!decision) errors.push({ field: "decision-approve", message: "Select Approve or Deny." });
  if (decision === "Denied" && !reasonText) {
    errors.push({ field: "decision-reason", message: "Enter a reason for the denial. It is included in the notice to the beneficiary." });
  }
  if (reasonText.length > REASON_MAX) {
    errors.push({ field: "decision-reason", message: `Reason must be ${REASON_MAX} characters or fewer.` });
  }
  if (errors.length) {
    showErrors(dialogForm, dialogSummary, errors);
    return;
  }

  const result = await apiPost(
    `/api/cases/${caseId}/authorizations/${activeAuthorization.id}/decision`,
    { decision, reason: reasonText || null });

  if (result.ok) {
    const updated = result.data;
    caseData.authorizations = caseData.authorizations.map((a) => (a.id === updated.id ? updated : a));
    lastTrigger = null; // the trigger button is removed by the re-render
    dialog.close();
    renderAuthorizations(caseData.authorizations);

    const verb = updated.status === "Approved" ? "approved" : "denied";
    decisionNotice.querySelector("[data-notice-text]").textContent =
      `${updated.serviceName} was ${verb}. The beneficiary will be sent a notice.`;
    decisionNotice.hidden = false;
    // Focus the confirmation so keyboard users are not dropped at the top of the document.
    decisionNotice.focus();
    return;
  }

  if (result.status === 400 && result.problem?.errors) {
    showErrors(dialogForm, dialogSummary,
      fromProblemDetails(result.problem.errors, { Decision: "decision-approve", Reason: "decision-reason" }, "decision-approve"));
  } else {
    showErrors(dialogForm, dialogSummary, [{
      field: "decision-approve",
      message: result.problem?.detail || "The decision could not be saved. Try again."
    }]);
  }
});

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

async function load() {
  if (!Number.isInteger(caseId) || caseId <= 0) {
    showNotFound("The link to this case is missing a case ID.");
    return;
  }

  const result = await apiGet(`/api/cases/${caseId}`);
  loading.hidden = true;

  if (!result.ok) {
    showNotFound(result.problem?.detail || "The case could not be loaded.");
    return;
  }

  caseData = result.data;
  renderSummary(caseData);
  renderAuthorizations(caseData.authorizations);
  renderCarePlan(caseData.carePlanGoals);
  content.hidden = false;
  initTabs(document.querySelector("[data-tabs]"));
  announce(`Case ${caseData.caseNumber} loaded.`);
}

function showNotFound(message) {
  loading.hidden = true;
  document.title = "Case not found – CareBridge";
  heading.textContent = "Case not found";
  crumb.textContent = "Case not found";
  notFound.querySelector("[data-error-text]").textContent = message;
  notFound.hidden = false;
}

load();
