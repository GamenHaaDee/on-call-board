import { AlertTriangle, CalendarClock, Loader2, Phone, RotateCcw, Settings, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Avatar from "@/components/Avatar";
import AppLogo from "@/components/AppLogo";
import OnCallCard from "@/components/OnCallCard";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useCurrentOnCall, useOnCallSchedule } from "@/data/api";
import { useBranding } from "@/lib/branding";
import { dateLocale } from "@/lib/dateLocale";

const Index = () => {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);
  const branding = useBranding();
  const current = useCurrentOnCall();
  const schedule = useOnCallSchedule(8);

  const activeEntry = current.data ?? undefined;
  const isLoading = current.isLoading || schedule.isLoading;
  const isError = current.isError || schedule.isError;

  // Aankomende weken zonder de huidige (die staat al bovenaan).
  const upcoming = (schedule.data ?? []).filter((e) => e.id !== activeEntry?.id);

  const navLink = "inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-9";

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-10">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <AppLogo
              url={branding.logoUrl}
              alt={branding.orgName || t("app_title")}
              className="h-12 w-12"
            />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {branding.orgName || t("app_title")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {branding.orgName ? t("app_title") : t("app_subtitle")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link to="/admin" className={navLink} aria-label={t("nav_manage")}>
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">{t("nav_manage")}</span>
            </Link>
            <Link to="/settings" className={navLink} aria-label={t("settings_nav")}>
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">{t("settings_nav")}</span>
            </Link>
          </div>
        </header>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>{t("loading")}</span>
          </div>
        )}

        {isError && !isLoading && (
          <Card className="border-destructive/70">
            <CardContent className="space-y-3 p-5">
              <p className="flex items-start gap-2 text-foreground">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                {t("error_load")}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  current.refetch();
                  schedule.refetch();
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {t("retry")}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Wie is er nu bereikbaar: de vraag waarvoor deze pagina bestaat. */}
        {activeEntry && !isLoading && (
          <section
            aria-labelledby="now-heading"
            className="gradient-on-call mb-10 rounded-2xl p-6 text-white shadow-soft sm:p-8"
          >
            <h2
              id="now-heading"
              className="flex items-center gap-2 text-sm font-medium text-white/90"
            >
              {/* Markeert een echte toestand: deze dienst loopt op dit moment. */}
              <span className="h-2 w-2 rounded-full bg-white" />
              {t("now_reachable")}
            </h2>

            <div className="mt-4 flex items-center gap-4">
              <Avatar name={activeEntry.name} tone="duty" size="lg" />
              <div className="min-w-0">
                <p className="truncate text-3xl font-bold">{activeEntry.name}</p>
                <p className="mt-0.5 text-sm text-white/90">
                  {t("change_info", {
                    when: formatDistanceToNowStrict(parseISO(activeEntry.endDate), {
                      locale,
                      addSuffix: true,
                    }),
                    date: format(parseISO(activeEntry.endDate), "d MMM", { locale }),
                  })}
                </p>
              </div>
            </div>

            <a
              href={`tel:${activeEntry.phone}`}
              aria-label={`${t("call_person", { name: activeEntry.name })}: ${activeEntry.phone}`}
              className="mt-6 flex h-14 items-center justify-center gap-2 rounded-xl bg-white text-lg font-semibold text-on-call transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            >
              <Phone className="h-5 w-5" />
              <span className="tabular-nums">{activeEntry.phone}</span>
            </a>
          </section>
        )}

        {/* Niemand ingepland: zeg wat er aan de hand is en wat de volgende stap is. */}
        {!activeEntry && !isLoading && !isError && (
          <Card className="mb-10 shadow-soft">
            <CardContent className="flex items-start gap-3 p-5">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <h2 className="font-semibold text-foreground">{t("empty_title")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {/* Staat de volgende dienst al gepland, noem die dan: dat is
                      het antwoord waar iemand op dit scherm naar zoekt. */}
                  {upcoming.length > 0
                    ? t("empty_next", {
                        name: upcoming[0].name,
                        date: format(parseISO(upcoming[0].startDate), "d MMMM", { locale }),
                      })
                    : t("empty_help")}
                </p>
                {upcoming.length === 0 && (
                  <Link
                    to="/admin"
                    className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {t("nav_manage")}
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && upcoming.length > 0 && (
          <section aria-labelledby="upcoming-heading">
            <h2 id="upcoming-heading" className="mb-3 font-semibold text-foreground">
              {t("upcoming")}
            </h2>
            {/* De eerstvolgende week apart, de weken daarna als één rustig
                blok: daar zoek je alleen op wanneer jij aan de beurt bent. */}
            <ul className="space-y-3">
              <OnCallCard entry={upcoming[0]} emphasis label={t("next_week")} />
            </ul>

            {upcoming.length > 1 && (
              <Card className="mt-3">
                <CardContent className="p-0">
                  <ul className="divide-y divide-border">
                    {upcoming.slice(1).map((entry) => (
                      <OnCallCard key={entry.id} entry={entry} />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default Index;
