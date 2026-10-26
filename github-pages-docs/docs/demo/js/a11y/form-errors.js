/**
 * Accessible form error handling (error summary + inline messages).
 *
 * Pattern:
 *  1. An error summary at the top of the form lists every problem as a link to its field.
 *  2. Focus moves to the summary so screen-reader users hear "There is a problem" immediately.
 *  3. Each field gets an inline message, aria-invalid="true", and the message id is added to
 *     aria-describedby so it is read when the field receives focus.
 *  4. The page <title> is prefixed with "Error:" so the state is clear after a reload or tab switch.
 *
 * WCAG 2.1: 1.3.1 Info and Relationships, 3.3.1 Error Identification, 3.3.3 Error Suggestion,
 * 4.1.2 Name, Role, Value.
 *
 * @typedef {{ field: string, message: string }} FieldError
 *   `field` is the id of the control (or of the first control in a group) to link to.
 */

const ERROR_TITLE_PREFIX = "Error: ";

function addToken(el, attr, token) {
  const tokens = new Set((el.getAttribute(attr) || "").split(/\s+/).filter(Boolean));
  tokens.add(token);
  el.setAttribute(attr, [...tokens].join(" "));
}

function removeToken(el, attr, token) {
  const tokens = (el.getAttribute(attr) || "").split(/\s+/).filter((t) => t && t !== token);
  if (tokens.length) {
    el.setAttribute(attr, tokens.join(" "));
  } else {
    el.removeAttribute(attr);
  }
}

/** Returns the element that owns the description: the fieldset for grouped controls, else the control. */
function describedElementFor(control) {
  return control.closest("fieldset[data-error-group]") || control;
}

/**
 * Removes all error state from a form.
 * @param {HTMLFormElement} form
 * @param {HTMLElement} summary
 */
export function clearErrors(form, summary) {
  summary.hidden = true;
  summary.querySelector("ul").replaceChildren();

  form.querySelectorAll(".bcn-form-group--error").forEach((g) => g.classList.remove("bcn-form-group--error"));
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
  form.querySelectorAll(".bcn-error-message").forEach((msg) => {
    msg.hidden = true;
    msg.querySelector("[data-error-text]").textContent = "";
    form.querySelectorAll(`[aria-describedby~="${msg.id}"]`).forEach((el) => removeToken(el, "aria-describedby", msg.id));
  });

  if (document.title.startsWith(ERROR_TITLE_PREFIX)) {
    document.title = document.title.slice(ERROR_TITLE_PREFIX.length);
  }
}

/**
 * Shows errors inline and in the summary, then moves focus to the summary.
 * @param {HTMLFormElement} form
 * @param {HTMLElement} summary
 * @param {FieldError[]} errors
 */
export function showErrors(form, summary, errors) {
  clearErrors(form, summary);
  if (!errors.length) {
    return;
  }

  const list = summary.querySelector("ul");

  for (const { field, message } of errors) {
    const control = form.querySelector(`#${CSS.escape(field)}`);
    if (!control) {
      continue;
    }

    const group = control.closest(".bcn-form-group");
    const owner = describedElementFor(control);
    const messageEl = group?.querySelector(".bcn-error-message");

    group?.classList.add("bcn-form-group--error");

    // Mark every control in a radio/checkbox group invalid, not just the first.
    const controls = owner.tagName === "FIELDSET" ? owner.querySelectorAll("input") : [control];
    controls.forEach((c) => c.setAttribute("aria-invalid", "true"));

    if (messageEl) {
      messageEl.querySelector("[data-error-text]").textContent = message;
      messageEl.hidden = false;
      addToken(owner, "aria-describedby", messageEl.id);
    }

    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `#${field}`;
    link.textContent = message;
    link.addEventListener("click", (event) => {
      // Default anchor behaviour scrolls but does not reliably focus form controls, and it
      // hides the label/legend above the input. Focus the control and scroll its label into view.
      event.preventDefault();
      const label = owner.tagName === "FIELDSET"
        ? owner.querySelector("legend")
        : form.querySelector(`label[for="${CSS.escape(field)}"]`);
      (label || control).scrollIntoView({ block: "start" });
      control.focus({ preventScroll: true });
    });
    item.append(link);
    list.append(item);
  }

  if (!document.title.startsWith(ERROR_TITLE_PREFIX)) {
    document.title = ERROR_TITLE_PREFIX + document.title;
  }

  summary.hidden = false;
  summary.focus();
}

/**
 * Converts ASP.NET Core ValidationProblemDetails (`errors: { PropertyName: [messages] }`)
 * into FieldError[] using a map from server property names to control ids.
 * @param {Record<string, string[]>} problemErrors
 * @param {Record<string, string>} fieldMap
 * @param {string} fallbackField  Control id used when a key is not in the map.
 * @returns {FieldError[]}
 */
export function fromProblemDetails(problemErrors, fieldMap, fallbackField) {
  const errors = [];
  for (const [key, messages] of Object.entries(problemErrors || {})) {
    // Keys may be "Age" or "$.age" (JSON path for malformed values); normalise both.
    const normalised = key.replace(/^\$\./, "").toLowerCase();
    const match = Object.keys(fieldMap).find((k) => k.toLowerCase() === normalised);
    const field = match ? fieldMap[match] : fallbackField;
    errors.push({ field, message: messages[0] });
  }
  return errors;
}
