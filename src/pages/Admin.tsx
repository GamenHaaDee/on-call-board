import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Calendar, Loader2, Save, CalendarCog, Palette, SlidersHorizontal } from "lucide-react";
import { format, parseISO } from "date-fns";
import { notify } from "@/lib/notify";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useAdminStatus, useOnCallSchedule, usePeople, useUpdateAssignment, getAdminToken, setAdminToken, type Person } from "@/data/api";
import type { OnCallEntry } from "@/data/onCallSchedule";
import { avatarUrl } from "@/lib/oncall";
import { dateLocale } from "@/lib/dateLocale";
import { useBranding, setBranding } from "@/lib/branding";

const CUSTOM = "__custom__";

function WeekRow({ entry, people }: { entry: OnCallEntry; people: Person[] }) {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);
  const match = people.find((p) => p.name === entry.name && p.phone === entry.phone);
  const [choice, setChoice] = useState<string>(match ? String(match.index) : CUSTOM);
  const [name, setName] = useState(entry.name);
  const [phone, setPhone] = useState(entry.phone);
  const update = useUpdateAssignment();

  const isCustom = choice === CUSTOM;

  const onChoice = (value: string) => {
    setChoice(value);
    if (value !== CUSTOM) {
      const p = people[Number(value)];
      setName(p.name);
      setPhone(p.phone);
    }
  };

  const dirty = name !== entry.name || phone !== entry.phone;

  const save = () => {
    update.mutate(
      { id: entry.id, name: name.trim(), phone: phone.trim() },
      {
        onSuccess: () => notify.success(t("toast_updated", { name })),
        onError: (e) => notify.error(e instanceof Error ? e.message : t("toast_save_failed")),
      }
    );
  };

  return (
    <Card className="shadow-soft">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <img src={avatarUrl(name)} alt={name} className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>
              {format(parseISO(entry.startDate), "d MMM yyyy", { locale })} –{" "}
              {format(parseISO(entry.endDate), "d MMM yyyy", { locale })}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <Label className="text-xs">{t("reachable")}</Label>
            <Select value={choice} onValueChange={onChoice}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.index} value={String(p.index)}>
                    {p.name} ({p.phone})
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM}>{t("custom_option")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isCustom && (
            <>
              <div className="flex-1">
                <Label className="text-xs">{t("name")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={45} />
              </div>
              <div className="flex-1">
                <Label className="text-xs">{t("number")}</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={15} />
              </div>
            </>
          )}

          <Button onClick={save} disabled={!dirty || update.isPending} className="shrink-0">
            {update.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const Admin = () => {
  const { t } = useTranslation();
  const status = useAdminStatus();
  const schedule = useOnCallSchedule(16);
  const people = usePeople();
  const [token, setToken] = useState(getAdminToken());
  const branding = useBranding();
  const [orgName, setOrgName] = useState(branding.orgName);
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl);

  const isLoading = schedule.isLoading || people.isLoading || status.isLoading;
  const authRequired = status.data?.authRequired ?? false;

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {t("back")}
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link
              to="/settings"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background/70 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">{t("settings_nav")}</span>
            </Link>
          </div>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <div className="gradient-primary flex h-12 w-12 items-center justify-center rounded-2xl shadow-soft">
            <CalendarCog className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("admin_title")}</h1>
            <p className="text-sm text-muted-foreground">{t("admin_subtitle")}</p>
          </div>
        </div>

        {/* Branding */}
        <Card className="mb-6 shadow-soft">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Palette className="h-4 w-4 text-muted-foreground" />
              {t("branding")}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label className="text-xs">{t("org_name")}</Label>
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Acme B.V."
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">{t("logo_url")}</Label>
                <Input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://…/logo.png"
                />
              </div>
              <Button
                variant="secondary"
                className="shrink-0"
                onClick={() => {
                  setBranding({ orgName: orgName.trim(), logoUrl: logoUrl.trim() });
                  notify.success(t("brand_saved"));
                }}
              >
                <Save className="h-4 w-4" />
                {t("save")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {authRequired && (
          <Card className="mb-6 shadow-soft">
            <CardContent className="p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <Label className="text-xs">{t("token_label")}</Label>
                <Input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={t("token_placeholder")}
                />
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setAdminToken(token);
                  notify.success(t("token_saved"));
                }}
              >
                {t("token_save")}
              </Button>
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>{t("loading")}</span>
          </div>
        )}

        {!isLoading && people.data && schedule.data && (
          <div className="space-y-3">
            {schedule.data.map((entry) => (
              <WeekRow key={entry.id} entry={entry} people={people.data!} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;
