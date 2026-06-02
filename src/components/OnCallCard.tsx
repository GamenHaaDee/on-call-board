import { Phone, Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { OnCallEntry } from "@/data/onCallSchedule";
import { format, parseISO } from "date-fns";
import { avatarUrl } from "@/lib/oncall";
import { dateLocale } from "@/lib/dateLocale";

interface OnCallCardProps {
  entry: OnCallEntry;
  isActive: boolean;
  label?: string;
}

const OnCallCard = ({ entry, isActive, label }: OnCallCardProps) => {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);
  const start = parseISO(entry.startDate);
  const end = parseISO(entry.endDate);

  return (
    <Card
      className={`overflow-hidden border transition-all duration-300 shadow-soft ${
        isActive
          ? "ring-2 ring-on-call border-on-call/40"
          : "hover:-translate-y-0.5 hover:shadow-lg"
      }`}
    >
      <CardContent className="p-4 flex items-center gap-4">
        {/* Avatar */}
        <img
          src={avatarUrl(entry.name)}
          alt={entry.name}
          className="h-12 w-12 shrink-0 rounded-xl"
          loading="lazy"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-foreground">{entry.name}</span>
            {isActive ? (
              <Badge className="bg-on-call text-on-call-foreground text-[10px] uppercase tracking-wide">
                {t("active_now")}
              </Badge>
            ) : label ? (
              <Badge variant="secondary" className="text-[10px]">
                {label}
              </Badge>
            ) : null}
          </div>

          <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              {format(start, "d MMM", { locale })} – {format(end, "d MMM", { locale })}
            </span>
          </div>
        </div>

        <a
          href={`tel:${entry.phone}`}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Phone className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{entry.phone}</span>
        </a>
      </CardContent>
    </Card>
  );
};

export default OnCallCard;
