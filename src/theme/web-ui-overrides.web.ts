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

/* Planner editing is a separate full-screen workspace, like the detail
   screens, rather than an in-place mutation of the itinerary page. */
.planner-root[data-plan-enabled] {
  position: fixed !important;
  inset: 0 !important;
  z-index: 9000 !important;
  width: 100vw !important;
  height: 100dvh !important;
  max-width: none !important;
  max-height: none !important;
  background: var(--canvas) !important;
  isolation: isolate;
}
.planner-root[data-plan-enabled] [data-testid="planner-layout"] {
  height: 100dvh !important;
  max-height: 100dvh !important;
  margin-top: 0 !important;
  flex-direction: column !important;
  background: var(--canvas) !important;
  animation: planner-editor-screen-in 220ms cubic-bezier(.2,.9,.2,1) both;
}
.planner-root[data-plan-enabled] [data-testid="itinerary-intro"] {
  display: none !important;
}
.planner-root[data-plan-enabled] [data-testid="itinerary-scroll"] {
  background: var(--canvas) !important;
}
.planner-root[data-plan-enabled] [data-testid="itinerary-day-bar"] {
  top: 0 !important;
  z-index: 12 !important;
  padding-top: env(safe-area-inset-top) !important;
  background: var(--paper) !important;
  border-bottom: 1px solid var(--ash) !important;
}
.planner-root[data-plan-enabled] [data-testid="itinerary-day-bar"] > div:first-child {
  position: relative !important;
  height: auto !important;
  min-height: 56px !important;
  padding: 6px 20px 8px !important;
  overflow: visible !important;
  display: flex !important;
  align-items: center !important;
}
.planner-root[data-plan-enabled] [data-testid="itinerary-day-bar"] > div:first-child > :first-child {
  display: block !important;
  font-size: 0 !important;
  line-height: 0 !important;
}
.planner-root[data-plan-enabled] [data-testid="itinerary-day-bar"] > div:first-child > :first-child::after {
  content: 'しおりを編集';
  color: var(--ink);
  font-size: 17px;
  line-height: 24px;
  font-weight: 700;
}
.planner-root[data-plan-enabled] [data-testid="planner-toggle"] {
  position: static !important;
  min-height: 36px !important;
  padding: 7px 12px !important;
  margin-left: auto !important;
}

/* Selecting or lifting a place/item already gives enough feedback through the
   card and drop slots. Do not repeat the selected title above the day tabs. */
.planner-root[data-plan-enabled][data-plan-selected] [data-testid="itinerary-day-bar"] > div:nth-child(2) {
  display: none !important;
}

@keyframes planner-editor-screen-in {
  from { opacity: 0; transform: translateX(18px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .planner-root[data-plan-enabled] [data-testid="planner-layout"] { animation: none; }
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
