import { Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import Avatar from "@/components/Avatar";
import type { OnCallEntry } from "@/data/onCallSchedule";
import { dateLocale } from "@/lib/dateLocale";

interface OnCallCardProps {
  entry: OnCallEntry;
  /** De eerstvolgende week krijgt meer gewicht dan de weken daarna. */
  emphasis?: boolean;
  label?: string;
}

/**
 * Eén week in de planning. De eerstvolgende week is de enige die je op korte
 * termijn moet weten, dus die staat in een kaart; de weken daarna zijn een
 * rustige lijst waarin je alleen zoekt wanneer jij aan de beurt bent.
 */
const OnCallCard = ({ entry, emphasis = false, label }: OnCallCardProps) => {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);
  const start = parseISO(entry.startDate);
  const end = parseISO(entry.endDate);
  const period = `${format(start, "d MMM", { locale })} – ${format(end, "d MMM", { locale })}`;

  return (
    <li
      className={
        emphasis
          ? "flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-soft"
          : "flex items-center gap-4 px-4 py-3"
      }
    >
      <Avatar name={entry.name} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate font-semibold text-foreground">{entry.name}</span>
          {label && <span className="text-xs font-medium text-primary">{label}</span>}
        </div>
        <p className="text-sm text-muted-foreground">{period}</p>
      </div>

      <a
        href={`tel:${entry.phone}`}
        aria-label={`${t("call_person", { name: entry.name })}: ${entry.phone}`}
        className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-input px-3 text-sm text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-10"
      >
        <Phone className="h-4 w-4" />
        <span className="tabular-nums">{entry.phone}</span>
      </a>
    </li>
  );
};

export default OnCallCard;
