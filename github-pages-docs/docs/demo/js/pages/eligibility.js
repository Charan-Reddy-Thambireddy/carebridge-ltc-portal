import { apiPost } from "../api.js";
import { announce } from "../a11y/announcer.js";
import { clearErrors, fromProblemDetails, showErrors } from "../a11y/form-errors.js";
import { el } from "../format.js";

const form = document.getElementById("screening-form");
const summary = document.getElementById("error-summary");
const resultsSection = document.getElementById("results");
const resultsHeading = document.getElementById("results-heading");
const resultsList = document.getElementById("results-list");
const disclaimer = document.getElementById("results-disclaimer");
const submitButton = form.querySelector('button[type="submit"]');

// Server property name -> id of the control the error summary should link to.
const FIELD_MAP = {
  Age: "age",
  HouseholdSize: "householdSize",
  MonthlyIncome: "monthlyIncome",
  CountableAssets: "countableAssets",
  HasDisability: "hasDisability-yes",
  HasMedicarePartA: "hasMedicarePartA-yes",
  DailyActivitiesNeedingHelp: "adl-bathing"
};

const ADL_INPUTS = () => [...form.querySelectorAll('input[name="adl"]')];

// "None of these" is mutually exclusive with the individual activities.
form.addEventListener("change", (event) => {
  const target = event.target;
  if (target.name !== "adl") return;
  const none = document.getElementById("adl-none");
  if (target === none && none.checked) {
    ADL_INPUTS().forEach((c) => { if (c !== none) c.checked = false; });
  } else if (target !== none && target.checked) {
    none.checked = false;
  }
});

/** Strips currency formatting users commonly type: "$1,250.00" -> "1250.00". */
function parseMoney(raw) {
  const cleaned = raw.replace(/[$,\s]/g, "");
  return cleaned === "" ? null : Number(cleaned);
}

function parseWhole(raw) {
  const cleaned = raw.trim();
  return cleaned === "" ? null : Number(cleaned);
}

function radioValue(name) {
  const checked = form.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value === "true" : null;
}

function readForm() {
  const adls = ADL_INPUTS().filter((c) => c.checked && c.id !== "adl-none");
  return {
    age: parseWhole(form.age.value),
    householdSize: parseWhole(form.householdSize.value),
    monthlyIncome: parseMoney(form.monthlyIncome.value),
    countableAssets: parseMoney(form.countableAssets.value),
    hasDisability: radioValue("hasDisability"),
    hasMedicarePartA: radioValue("hasMedicarePartA"),
    dailyActivitiesNeedingHelp: adls.length,
    adlAnswered: ADL_INPUTS().some((c) => c.checked)
  };
}

/**
 * Client-side validation mirrors the server rules so users get instant feedback, but the
 * server remains the source of truth (its 400 response is rendered the same way).
 * Messages say what went wrong AND how to fix it (SC 3.3.3).
 */
function validate(values) {
  const errors = [];
  const isWhole = (n) => Number.isInteger(n);

  if (values.age === null) {
    errors.push({ field: "age", message: "Enter your age." });
  } else if (!isWhole(values.age) || values.age < 0 || values.age > 120) {
    errors.push({ field: "age", message: "Age must be a whole number between 0 and 120, like 72." });
  }

  if (values.householdSize === null) {
    errors.push({ field: "householdSize", message: "Enter how many people live in your household." });
  } else if (!isWhole(values.householdSize) || values.householdSize < 1 || values.householdSize > 12) {
    errors.push({ field: "householdSize", message: "Household size must be a whole number between 1 and 12." });
  }

  if (values.monthlyIncome === null) {
    errors.push({ field: "monthlyIncome", message: "Enter your total monthly income before taxes. Enter 0 if you have none." });
  } else if (Number.isNaN(values.monthlyIncome) || values.monthlyIncome < 0) {
    errors.push({ field: "monthlyIncome", message: "Monthly income must be an amount in dollars, like 1250 or 1250.50." });
  }

  if (values.countableAssets === null) {
    errors.push({ field: "countableAssets", message: "Enter the total value of your countable assets. Enter 0 if you have none." });
  } else if (Number.isNaN(values.countableAssets) || values.countableAssets < 0) {
    errors.push({ field: "countableAssets", message: "Countable assets must be an amount in dollars, like 1500." });
  }

  if (values.hasDisability === null) {
    errors.push({ field: "hasDisability-yes", message: "Select whether you have a disability." });
  }

  if (values.hasMedicarePartA === null) {
    errors.push({ field: "hasMedicarePartA-yes", message: "Select whether you have Medicare Part A." });
  }

  if (!values.adlAnswered) {
    errors.push({ field: "adl-bathing", message: "Select the daily activities you need help with, or select None of these." });
  }

  return errors;
}

function renderResults(response) {
  resultsList.replaceChildren();

  for (const result of response.results) {
    const card = el("li", { className: `bcn-result${result.mayQualify ? " bcn-result--yes" : ""}` });
    const heading = el("h3", { text: result.programName });
    const verdict = el("p", {
      className: "bcn-result__verdict",
      text: result.mayQualify ? "You may qualify" : "You may not qualify based on these answers"
    });
    const reasonsLabel = el("p", { text: "Why:" });
    const reasons = el("ul");
    result.reasons.forEach((r) => reasons.append(el("li", { text: r })));
    const next = el("p");
    next.append(el("strong", { text: "Next step: " }), document.createTextNode(result.nextStep));

    card.append(heading, verdict, reasonsLabel, reasons, next);
    resultsList.append(card);
  }

  disclaimer.textContent = response.disclaimer;
  resultsSection.hidden = false;

  // Move focus to the results heading so keyboard and screen-reader users land on the new content.
  resultsHeading.focus();

  const count = response.results.filter((r) => r.mayQualify).length;
  announce(`Results ready. You may qualify for ${count} of ${response.results.length} programs.`);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const values = readForm();
  const errors = validate(values);
  if (errors.length) {
    resultsSection.hidden = true;
    showErrors(form, summary, errors);
    return;
  }

  clearErrors(form, summary);
  submitButton.setAttribute("aria-disabled", "true");
  submitButton.textContent = "Checking…";
  announce("Checking your answers.");

  const { adlAnswered, ...payload } = values;
  const result = await apiPost("/api/eligibility/screen", payload);

  submitButton.removeAttribute("aria-disabled");
  submitButton.textContent = "Check eligibility";

  if (result.ok) {
    renderResults(result.data);
  } else if (result.status === 400 && result.problem?.errors) {
    showErrors(form, summary, fromProblemDetails(result.problem.errors, FIELD_MAP, "age"));
  } else {
    showErrors(form, summary, [{
      field: "age",
      message: result.problem?.detail || "Something went wrong. Please try again."
    }]);
  }
});

form.addEventListener("reset", () => {
  clearErrors(form, summary);
  resultsSection.hidden = true;
  announce("The form was cleared.");
});
