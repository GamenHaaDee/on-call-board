import Toast from "typescript-toastify";

/**
 * Meldingen ("toasts"), gebouwd op typescript-toastify.
 *
 * De library zelf levert alleen een klikbaar blokje: geen rol voor
 * schermlezers en sluiten kan alleen met de muis. Daarom staat hier een dunne
 * laag omheen die:
 *   - de container aankondigt via aria-live, zodat de melding wordt voorgelezen;
 *   - elke melding met het toetsenbord te bereiken en te sluiten maakt;
 *   - één plek geeft waar de opties staan, zodat de rest van de app niet aan
 *     deze library vastzit.
 *
 * De kleuren komen uit `src/index.css` (de CSS-variabelen van de library worden
 * daar overschreven met de tokens van de app).
 */

type Variant = "success" | "error" | "info";

const AUTO_CLOSE_MS: Record<Variant, number> = {
  // Een fout wil je kunnen lezen; een bevestiging mag sneller weg.
  success: 3500,
  info: 5000,
  error: 7000,
};

let patched = false;

/**
 * Zorgt dat elke melding die de library aanmaakt bruikbaar is zonder muis en
 * hoorbaar is voor een schermlezer. Draait één keer per pagina.
 */
function enhanceOnce() {
  if (patched || typeof document === "undefined") return;
  patched = true;

  const enhance = (node: HTMLElement) => {
    if (node.dataset.enhanced === "true") return;
    node.dataset.enhanced = "true";

    // Klikken sluit de melding (dat doet de library); dit maakt hetzelfde
    // mogelijk met Tab + Enter, Spatie of Escape.
    node.tabIndex = 0;
    node.setAttribute("role", "status");
    node.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
        event.preventDefault();
        node.click();
      }
    });

    // De library haalt bij het sluiten de klasse "show" weg en wacht daarna op
    // het einde van de CSS-overgang om het element te verwijderen. Die gebeurt
    // niet op een achtergrondtabblad of met animaties uit, en dan blijven de
    // meldingen staan. Daarom ruimen we hier zelf op.
    let shown = false;
    const watcher = new MutationObserver(() => {
      if (node.classList.contains("show")) {
        shown = true;
        return;
      }
      if (!shown) return;
      window.setTimeout(() => {
        const container = node.parentElement;
        node.remove();
        if (container && !container.hasChildNodes()) container.remove();
        watcher.disconnect();
      }, 400);
    });
    watcher.observe(node, { attributes: true, attributeFilter: ["class"] });
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const added of record.addedNodes) {
        if (!(added instanceof HTMLElement)) continue;

        if (added.classList.contains("toast-container")) {
          // De container die de library zelf aanmaakt: hierop hangt de
          // aankondiging, zodat elke nieuwe melding wordt voorgelezen.
          added.setAttribute("aria-live", "polite");
          added.setAttribute("aria-atomic", "false");
          added.querySelectorAll<HTMLElement>(".toast").forEach(enhance);
        } else if (added.classList.contains("toast")) {
          enhance(added);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function show(variant: Variant, message: string) {
  enhanceOnce();

  return new Toast({
    position: "top-right",
    toastMsg: message,
    autoCloseTime: AUTO_CLOSE_MS[variant],
    canClose: true,
    showProgress: true,
    pauseOnHover: true,
    pauseOnFocusLoss: true,
    type: variant,
    theme: "light",
  });
}

export const notify = {
  success: (message: string) => show("success", message),
  error: (message: string) => show("error", message),
  /** Neutrale mededeling: er is niets misgegaan, maar er gebeurde ook niets. */
  message: (message: string) => show("info", message),
};
