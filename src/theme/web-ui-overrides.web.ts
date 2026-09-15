const STYLE_ID = 'tabi-web-ui-overrides';

const CSS = `
/* Headers stay visually solid. The previous translucent backdrop filter bled
   into the safe-area edge and made the upper strip look slightly blurred. */
[data-testid*="header"] {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
[data-testid="trip-header"],
[data-testid="home-header"],
[data-testid="sheet-header"] {
  background: var(--paper) !important;
}

/* Restore the itinerary item form to the same sheet/detail presentation as
   other detail editors. The separate-screen request refers to planner mode. */
[data-testid="form-modal-viewport"]:has([data-testid="itinerary-editor-fields"]) {
  padding: 16px !important;
  align-items: center !important;
  justify-content: center !important;
  background: var(--overlay) !important;
}
[data-testid="form-modal-viewport"]:has([data-testid="itinerary-editor-fields"]) > [data-testid="form-sheet"] {
  width: 100% !important;
  max-width: 640px !important;
  max-height: 92% !important;
  border-radius: 24px !important;
  box-shadow: var(--shadow-float) !important;
}

`;

export function installWebUiOverrides() {
  if (typeof document === 'undefined') return () => undefined;
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
}
