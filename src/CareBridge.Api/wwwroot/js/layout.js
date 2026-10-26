/**
 * Site-wide behaviour: progressive enhancement flag and the mobile navigation disclosure.
 * The menu is fully usable without JavaScript (always expanded); JS collapses it on small
 * screens behind a button that exposes its state with aria-expanded.
 */
document.documentElement.classList.add("js");

const toggle = document.querySelector("[data-menu-toggle]");
const nav = document.getElementById("primary-nav");

if (toggle && nav) {
  toggle.hidden = false;
  nav.dataset.open = "false";

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    nav.dataset.open = String(open);
  };

  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));

  // Escape closes the menu and returns focus to the toggle.
  nav.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus();
    }
  });
}
