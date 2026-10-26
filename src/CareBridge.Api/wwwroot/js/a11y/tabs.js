/**
 * Accessible tabs following the WAI-ARIA Authoring Practices "Tabs" pattern
 * (automatic activation).
 *
 * Markup contract:
 *   <div class="bcn-tabs" data-tabs>
 *     <div role="tablist" aria-label="...">
 *       <button role="tab" id="tab-a" aria-controls="panel-a" aria-selected="true">A</button>
 *       ...
 *     </div>
 *     <div role="tabpanel" id="panel-a" aria-labelledby="tab-a" tabindex="0">...</div>
 *   </div>
 *
 * Keyboard: Tab moves into the tablist (only the selected tab is in tab order) and then to
 * the panel; Left/Right arrows move between tabs (wrapping); Home/End jump to first/last.
 * The selected tab is also reflected in the URL hash so it survives reloads and can be linked.
 */

export function initTabs(root) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls")));

  function select(index, { focus = true, updateHash = true } = {}) {
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1; // roving tabindex
      panels[i].hidden = !selected;
    });

    if (focus) {
      tabs[index].focus();
    }

    if (updateHash) {
      history.replaceState(null, "", `${location.pathname}${location.search}#${tabs[index].id}`);
    }
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(index));

    tab.addEventListener("keydown", (event) => {
      let next = null;
      switch (event.key) {
        case "ArrowRight":
          next = (index + 1) % tabs.length;
          break;
        case "ArrowLeft":
          next = (index - 1 + tabs.length) % tabs.length;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = tabs.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      select(next);
    });
  });

  const fromHash = tabs.findIndex((t) => `#${t.id}` === location.hash);
  select(fromHash >= 0 ? fromHash : 0, { focus: false, updateHash: false });

  return { select: (id) => select(tabs.findIndex((t) => t.id === id)) };
}
