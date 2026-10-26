/**
 * Screen-reader announcements through persistent ARIA live regions.
 *
 * Live regions must exist in the DOM before content is injected or many screen
 * readers (JAWS, NVDA, VoiceOver) will not announce the change. Each page includes
 * two empty regions (#bcn-live-polite, #bcn-live-assertive) in its markup.
 *
 * WCAG 2.1 SC 4.1.3 Status Messages.
 */

const CLEAR_DELAY_MS = 7000;
const timers = new Map();

/**
 * @param {string} message  Text to announce.
 * @param {"polite"|"assertive"} [politeness="polite"]  Use "assertive" only for errors that block the user.
 */
export function announce(message, politeness = "polite") {
  const region = document.getElementById(`bcn-live-${politeness}`);
  if (!region || !message) {
    return;
  }

  // Clear first, then set on the next frame, so an identical message is announced again.
  region.textContent = "";
  window.clearTimeout(timers.get(region));

  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      region.textContent = message;
      // Remove stale text so it is not re-read when a user navigates through the page.
      timers.set(region, window.setTimeout(() => { region.textContent = ""; }, CLEAR_DELAY_MS));
    }, 50);
  });
}
