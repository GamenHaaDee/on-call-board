import { Phone, AlertTriangle, Loader2, Settings, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import OnCallCard from "@/components/OnCallCard";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useCurrentOnCall, useOnCallSchedule } from "@/data/api";
import { avatarUrl } from "@/lib/oncall";
import { useBranding } from "@/lib/branding";
import { dateLocale } from "@/lib/dateLocale";
import { format, parseISO, formatDistanceToNowStrict } from "date-fns";

const Index = () => {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);
  const branding = useBranding();
  const current = useCurrentOnCall();
  const schedule = useOnCallSchedule(8);

  const activeEntry = current.data ?? undefined;
  const isLoading = current.isLoading || schedule.isLoading;
  const isError = current.isError || schedule.isError;

  // Aankomende weken zonder de huidige (die staat al in de hero).
  const upcoming = (schedule.data ?? []).filter((e) => e.id !== activeEntry?.id);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.orgName || t("app_title")}
                className="h-12 w-12 rounded-2xl object-contain shadow-soft"
              />
            ) : (
              <div className="gradient-primary flex h-12 w-12 items-center justify-center rounded-2xl shadow-soft">
                <AlertTriangle className="h-6 w-6 text-white" />
              </div>
            )}
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
            <Link
              to="/admin"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background/70 px-3 text-sm text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">{t("nav_manage")}</span>
            </Link>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>{t("loading")}</span>
          </div>
        )}

        {isError && !isLoading && (
          <Card className="mb-8 border-destructive/40 bg-destructive/5">
            <CardContent className="p-5 text-destructive">{t("error_load")}</CardContent>
          </Card>
        )}

        {/* Hero: nu bereikbaar */}
        {activeEntry && !isLoading && (
          <div className="relative mb-10 overflow-hidden rounded-3xl shadow-hero">
            <div className="gradient-on-call p-6 text-white sm:p-8">
              <div className="flex items-center gap-2 text-sm font-medium text-white/85">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                </span>
                {t("now_reachable")}
              </div>

              <div className="mt-4 flex items-center gap-4">
                <img
                  src={avatarUrl(activeEntry.name)}
                  alt={activeEntry.name}
                  className="h-16 w-16 rounded-2xl ring-2 ring-white/40"
                />
                <div className="min-w-0">
                  <p className="truncate text-2xl font-bold sm:text-3xl">{activeEntry.name}</p>
                  <p className="flex items-center gap-1.5 text-sm text-white/85">
                    <Clock className="h-3.5 w-3.5" />
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
                className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-semibold text-on-call shadow-sm transition-transform hover:scale-[1.01] active:scale-95"
              >
                <Phone className="h-5 w-5" />
                <span className="font-mono">{activeEntry.phone}</span>
              </a>
            </div>
          </div>
        )}

        {/* Planning */}
        {!isLoading && !isError && upcoming.length > 0 && (
          <>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("upcoming")}
            </h2>
            <div className="space-y-3">
              {upcoming.map((entry, i) => (
                <OnCallCard
                  key={entry.id}
                  entry={entry}
                  isActive={false}
                  label={i === 0 ? t("next_week") : undefined}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
