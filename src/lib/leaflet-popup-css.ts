/**
 * Shared CSS string for dark-themed Leaflet popups.
 * Inject via useEffect in any client map component:
 *
 *   useEffect(() => {
 *     const style = document.createElement("style");
 *     style.textContent = DARK_POPUP_CSS;
 *     document.head.appendChild(style);
 *     return () => document.head.removeChild(style);
 *   }, []);
 */
export const DARK_POPUP_CSS = `
  .leaflet-popup-content-wrapper {
    background: #18181b !important;
    border: 1px solid #27272a !important;
    border-radius: 8px !important;
    box-shadow: 0 4px 24px rgba(0,0,0,0.6) !important;
    color: #e5e7eb !important;
    padding: 0 !important;
  }
  .leaflet-popup-tip {
    background: #18181b !important;
  }
  .leaflet-popup-content {
    margin: 10px 14px !important;
    color: #e5e7eb !important;
  }
  .leaflet-popup-close-button {
    color: #71717a !important;
    font-size: 16px !important;
    right: 8px !important;
    top: 6px !important;
    padding: 0 !important;
    line-height: 1 !important;
  }
  .leaflet-popup-close-button:hover {
    color: #e5e7eb !important;
    background: transparent !important;
  }
`;
