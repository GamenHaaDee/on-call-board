import { useTranslation } from "react-i18next";
import CirclelinkMark from "@/components/CirclelinkMark";

/**
 * Credit onderaan de pagina. Het merk komt uit de code (geen extra bestand of
 * verzoek), en de link opent in een nieuw tabblad omdat je de dienstpagina
 * openhoudt: wie hier klikt, is nog niet klaar met het rooster.
 */
const PoweredBy = () => {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-2xl justify-center px-4 py-3">
        <a
          href="https://circlelink.eu"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-0 sm:py-1"
        >
          <CirclelinkMark className="h-5 w-5 shrink-0" title="" />
          <span>{t("powered_by")}</span>
        </a>
      </div>
    </footer>
  );
};

export default PoweredBy;
