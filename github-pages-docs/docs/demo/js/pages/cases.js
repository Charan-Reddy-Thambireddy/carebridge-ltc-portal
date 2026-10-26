import { apiGet } from "../api.js";
import { announce } from "../a11y/announcer.js";
import { PROGRAM_LABELS, STATUS_LABELS, badge, el, formatDate } from "../format.js";

const form = document.getElementById("filters");
const tableRegion = document.getElementById("cases-region");
const tbody = document.getElementById("cases-body");
const summaryText = document.getElementById("results-summary");
const pagination = document.getElementById("pagination");
const sortHeaders = [...document.querySelectorAll("th[data-sort]")];

const COLUMN_LABELS = {
  caseNumber: "Case number",
  beneficiary: "Beneficiary",
  program: "Program",
  status: "Status",
  priority: "Priority",
  opened: "Opened"
};

const PAGE_SIZE = 10;

/** State lives in the URL so filters survive reloads, can be bookmarked, and work with Back. */
function readState() {
  const p = new URLSearchParams(location.search);
  return {
    search: p.get("search") || "",
    status: p.get("status") || "",
    program: p.get("program") || "",
    sort: p.get("sort") || "opened",
    dir: p.get("dir") || "desc",
    page: Math.max(1, Number(p.get("page")) || 1)
  };
}

function writeState(state) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) {
    if (v !== "" && v !== null) p.set(k, String(v));
  }
  history.replaceState(null, "", `${location.pathname}?${p}`);
}

function describeSort(sort, dir) {
  if (sort === "opened") {
    return `sorted by date opened, ${dir === "desc" ? "newest first" : "oldest first"}`;
  }
  return `sorted by ${COLUMN_LABELS[sort].toLowerCase()}, ${dir === "asc" ? "ascending" : "descending"}`;
}

function updateSortHeaders(state) {
  for (const th of sortHeaders) {
    const key = th.dataset.sort;
    // aria-sort only on the active column; other sortable columns omit the attribute.
    if (key === state.sort) {
      th.setAttribute("aria-sort", state.dir === "asc" ? "ascending" : "descending");
    } else {
      th.removeAttribute("aria-sort");
    }
  }
}

function renderRows(items) {
  tbody.replaceChildren();

  if (!items.length) {
    const row = el("tr");
    const cell = el("td", { text: "No cases match your filters. Try a different search or clear the filters." });
    cell.colSpan = 7;
    row.append(cell);
    tbody.append(row);
    return;
  }

  for (const c of items) {
    const row = el("tr");

    // Row header: the case number identifies the row for screen-reader table navigation.
    const caseCell = el("th", { attrs: { scope: "row" } });
    const link = el("a", { text: c.caseNumber, attrs: { href: `case.html?id=${c.id}` } });
    caseCell.append(link);

    const statusCell = el("td");
    statusCell.append(badge(c.status));

    const priorityCell = el("td");
    priorityCell.append(badge(c.priority, c.priority));

    const opened = el("td");
    opened.append(el("time", { text: formatDate(c.openedUtc, { short: true }), attrs: { datetime: c.openedUtc } }));

    row.append(
      caseCell,
      el("td", { text: c.beneficiaryName }),
      el("td", { text: PROGRAM_LABELS[c.program] || c.program }),
      statusCell,
      priorityCell,
      opened,
      el("td", { className: "bcn-table__numeric", text: String(c.pendingAuthorizations) })
    );
    tbody.append(row);
  }
}

function renderPagination(state, totalPages) {
  pagination.replaceChildren();
  if (totalPages <= 1) {
    pagination.hidden = true;
    return;
  }
  pagination.hidden = false;

  const list = el("ul");
  const addButton = (label, page, { current = false, disabled = false, accessibleName } = {}) => {
    const li = el("li");
    const button = el("button", { text: label, attrs: { type: "button" } });
    if (accessibleName) button.setAttribute("aria-label", accessibleName);
    if (current) button.setAttribute("aria-current", "page");
    if (disabled) button.setAttribute("aria-disabled", "true");
    button.addEventListener("click", () => {
      if (disabled || current) return;
      load({ ...state, page }, { focusTable: true });
    });
    li.append(button);
    list.append(li);
  };

  addButton("Previous", state.page - 1, { disabled: state.page === 1, accessibleName: "Previous page" });
  for (let p = 1; p <= totalPages; p++) {
    addButton(String(p), p, { current: p === state.page, accessibleName: `Page ${p}` });
  }
  addButton("Next", state.page + 1, { disabled: state.page === totalPages, accessibleName: "Next page" });

  pagination.append(list);
}

let requestId = 0;

async function load(state, { announceResult = true, focusTable = false } = {}) {
  const current = ++requestId;
  writeState(state);
  updateSortHeaders(state);
  tableRegion.setAttribute("aria-busy", "true");

  const query = new URLSearchParams({ sort: state.sort, dir: state.dir, page: String(state.page), pageSize: String(PAGE_SIZE) });
  if (state.search) query.set("search", state.search);
  if (state.status) query.set("status", state.status);
  if (state.program) query.set("program", state.program);

  const result = await apiGet(`/api/cases?${query}`);
  if (current !== requestId) return; // a newer request superseded this one

  tableRegion.setAttribute("aria-busy", "false");

  if (!result.ok) {
    tbody.replaceChildren();
    const row = el("tr");
    const cell = el("td", { text: result.problem?.detail || "Cases could not be loaded. Try again." });
    cell.colSpan = 7;
    row.append(cell);
    tbody.append(row);
    announce("Cases could not be loaded.", "assertive");
    return;
  }

  const { items, totalCount, totalPages, page } = result.data;
  renderRows(items);
  renderPagination(state, totalPages);

  const first = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, totalCount);
  const message = totalCount === 0
    ? "No cases found."
    : `Showing ${first} to ${last} of ${totalCount} cases, ${describeSort(state.sort, state.dir)}.`;
  summaryText.textContent = message;

  if (announceResult) announce(message);
  if (focusTable) tableRegion.focus();
}

// Sorting: one button per sortable header.
for (const th of sortHeaders) {
  th.querySelector("button").addEventListener("click", () => {
    const state = readState();
    const key = th.dataset.sort;
    const dir = state.sort === key ? (state.dir === "asc" ? "desc" : "asc") : (key === "opened" ? "desc" : "asc");
    load({ ...state, sort: key, dir, page: 1 });
  });
}

// Filters apply on explicit submit, not on every keystroke or select change, so content
// never changes unexpectedly while someone is still choosing (SC 3.2.2 On Input).
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const state = readState();
  load({
    ...state,
    search: form.search.value.trim(),
    status: form.status.value,
    program: form.program.value,
    page: 1
  });
});

form.addEventListener("reset", () => {
  // Let the browser reset the controls first, then reload with defaults.
  setTimeout(() => {
    load({ search: "", status: "", program: "", sort: "opened", dir: "desc", page: 1 });
  });
});

// Populate filter selects from the shared label maps and restore state from the URL.
function populateSelect(select, labels) {
  for (const [value, label] of Object.entries(labels)) {
    select.append(new Option(label, value));
  }
}

populateSelect(form.status, STATUS_LABELS);
populateSelect(form.program, PROGRAM_LABELS);

const initial = readState();
form.search.value = initial.search;
form.status.value = initial.status;
form.program.value = initial.program;
load(initial, { announceResult: false });
