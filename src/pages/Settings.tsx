import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowLeft,
  Database,
  Download,
  Loader2,
  Mail,
  Plus,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  WifiOff,
} from "lucide-react";
import { notify } from "@/lib/notify";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckboxField } from "@/components/ui/checkbox-field";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import DatabaseFields from "@/components/DatabaseFields";
import TimezoneSelect from "@/components/TimezoneSelect";
import {
  ApiError,
  getAdminToken,
  setAdminToken,
  useExportBackup,
  useResetApp,
  useRunMail,
  useSaveSettings,
  useSettings,
  useTestMail,
  type DatabaseSettings,
  type MailSettings,
  type RosterPerson,
  type RotationSettings,
} from "@/data/api";

const toTimeInput = (value: string) => value.slice(0, 5);
const toApiTime = (value: string) => (value.length === 5 ? `${value}:00` : value);
const isMonday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 1;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type SectionId = "roster" | "rotation" | "database" | "mail" | "security" | "backup" | "reset";

/**
 * Eén blok instellingen. `tone` bepaalt het gewicht: het rooster is waar de
 * meeste mensen voor komen, resetten is onomkeerbaar en hoort er niet uit te
 * zien als de rest.
 */
function Section({
  id,
  title,
  description,
  icon,
  tone = "normal",
  dirty,
  children,
  footer,
}: {
  id: SectionId;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  tone?: "normal" | "lead" | "danger";
  dirty?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-6">
      <Card
        className={
          tone === "danger"
            ? "border-destructive/70 shadow-soft"
            : tone === "lead"
              ? "border-primary/30 shadow-soft"
              : "shadow-soft"
        }
      >
        <CardContent className="space-y-5 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                id={`${id}-heading`}
                className={`flex items-center gap-2 font-semibold text-foreground ${
                  tone === "lead" ? "text-lg" : ""
                }`}
              >
                {icon}
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            </div>
            {dirty && (
              <span className="shrink-0 rounded-md bg-warning/20 px-2 py-1 text-xs font-medium text-foreground">
                {t("unsaved")}
              </span>
            )}
          </div>

          {children}

          {footer && <div className="flex flex-wrap gap-2 pt-1">{footer}</div>}
        </CardContent>
      </Card>
    </section>
  );
}

const Settings = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const settings = useSettings();
  const save = useSaveSettings();
  const testMail = useTestMail();
  const runMail = useRunMail();
  const exportBackup = useExportBackup();
  const resetApp = useResetApp();

  const [token, setToken] = useState(getAdminToken());

  // Per blok de bewerkte waarde plus de laatst opgeslagen waarde, zodat de
  // opslaan-knop pas iets doet als er echt iets veranderd is.
  const [roster, setRoster] = useState<RosterPerson[]>([]);
  const [rosterSaved, setRosterSaved] = useState<RosterPerson[]>([]);
  const [rotation, setRotation] = useState<RotationSettings | null>(null);
  const [rotationSaved, setRotationSaved] = useState<RotationSettings | null>(null);
  const [timezone, setTimezone] = useState("");
  const [timezoneSaved, setTimezoneSaved] = useState("");
  const [database, setDatabase] = useState<DatabaseSettings | null>(null);
  const [databaseSaved, setDatabaseSaved] = useState<DatabaseSettings | null>(null);
  const [mail, setMail] = useState<MailSettings | null>(null);
  const [mailSaved, setMailSaved] = useState<MailSettings | null>(null);

  const [newToken, setNewToken] = useState("");
  const [testTo, setTestTo] = useState("");
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [wipeData, setWipeData] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("roster");

  // De formulieren vullen met wat de server teruggeeft.
  useEffect(() => {
    const data = settings.data;
    if (!data) return;
    const people = data.roster.map((p) => ({ ...p, email: p.email ?? "" }));
    setRoster(people);
    setRosterSaved(people);
    setRotation(data.rotation);
    setRotationSaved(data.rotation);
    setTimezone(data.timezone ?? "");
    setTimezoneSaved(data.timezone ?? "");
    setDatabase({ ...data.database, password: "" });
    setDatabaseSaved({ ...data.database, password: "" });
    setMail({ ...data.mail, password: "" });
    setMailSaved({ ...data.mail, password: "" });
  }, [settings.data]);

  const dirty = {
    roster: !same(roster, rosterSaved),
    rotation: !same(rotation, rotationSaved) || timezone !== timezoneSaved,
    database: !same(database, databaseSaved),
    mail: !same(mail, mailSaved),
  };

  const failed = useCallback(
    (e: unknown) => notify.error(e instanceof Error ? e.message : t("toast_save_failed")),
    [t]
  );
  const saved = useCallback(() => notify.success(t("settings_saved")), [t]);

  const setPerson = (index: number, patch: Partial<RosterPerson>) =>
    setRoster((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const saveRoster = () => {
    const cleaned = roster.map((p) => ({
      name: p.name.trim(),
      phone: p.phone.trim(),
      email: (p.email ?? "").trim(),
    }));
    if (cleaned.length === 0 || cleaned.some((p) => !p.name || !p.phone)) {
      notify.error(t("setup_error_people"));
      return;
    }
    save.mutate(
      { roster: cleaned },
      {
        onSuccess: () => {
          setRoster(cleaned);
          setRosterSaved(cleaned);
          saved();
        },
        onError: failed,
      }
    );
  };

  const saveRotation = () => {
    if (!rotation) return;
    if (!isMonday(rotation.anchorDate)) {
      notify.error(t("setup_error_monday"));
      return;
    }
    const payload: RotationSettings = {
      ...rotation,
      startTime: toApiTime(rotation.startTime),
      endTime: toApiTime(rotation.endTime),
    };
    save.mutate(
      {
        rotation: payload,
        // Alleen meesturen als de tijdzone hier gewijzigd mag worden.
        ...(settings.data?.timezoneFromEnv ? {} : { timezone }),
      },
      {
        onSuccess: () => {
          setRotation(payload);
          setRotationSaved(payload);
          setTimezoneSaved(timezone);
          saved();
        },
        onError: failed,
      }
    );
  };

  const saveDatabase = () => {
    if (!database) return;
    // Leeg wachtwoordveld betekent: laat het opgeslagen wachtwoord staan.
    const payload = { ...database };
    if (!payload.password) delete payload.password;
    save.mutate(
      { database: payload },
      {
        onSuccess: () => {
          setDatabaseSaved(database);
          saved();
        },
        onError: failed,
      }
    );
  };

  /**
   * Het wachtwoord komt nooit terug van de server, dus het veld is leeg zolang
   * de gebruiker geen nieuw wachtwoord typt. Die lege waarde mag niet mee, want
   * dan zou de server hem als "geen wachtwoord" opvatten.
   */
  const mailPayload = (): MailSettings | null => {
    if (!mail) return null;
    const payload = { ...mail };
    if (!payload.password) delete payload.password;
    return payload;
  };

  const saveMail = () => {
    const payload = mailPayload();
    if (!payload) return;
    save.mutate(
      { mail: payload },
      {
        onSuccess: () => {
          setMailSaved(mail);
          saved();
        },
        onError: failed,
      }
    );
  };

  /** Token wijzigen, of met een lege waarde de beveiliging uitzetten. */
  const applyToken = (value: string) =>
    save.mutate(
      { adminToken: value },
      {
        onSuccess: () => {
          // Het nieuwe token meteen gebruiken, anders volgt een 401.
          setAdminToken(value);
          setToken(value);
          setNewToken("");
          saved();
        },
        onError: failed,
      }
    );

  const verifySmtp = () => {
    const payload = mailPayload();
    if (!payload) return;
    testMail.mutate(
      { mail: payload },
      { onSuccess: () => notify.success(t("mail_verify_ok")), onError: failed }
    );
  };

  const sendTestMail = () => {
    const payload = mailPayload();
    if (!payload || !testTo.trim()) return;
    testMail.mutate(
      { mail: payload, to: testTo.trim() },
      { onSuccess: () => notify.success(t("mail_sent_ok")), onError: failed }
    );
  };

  const runNotifications = () =>
    runMail.mutate(undefined, {
      onSuccess: (result) => {
        if (result.sent > 0) {
          notify.success(t("mail_run_result", { count: result.sent }));
          return;
        }
        // Nul berichten heeft twee oorzaken, en de gebruiker moet weten welke.
        notify.message(result.recipient ? t("mail_run_already") : t("mail_run_none_email"));
      },
      onError: failed,
    });

  const resetEverything = () => {
    const question = wipeData ? t("reset_confirm_wipe") : t("reset_confirm");
    if (!window.confirm(question)) return;
    resetApp.mutate(wipeData, {
      onSuccess: () => {
        setAdminToken("");
        notify.success(t("reset_done"));
        navigate("/setup", { replace: true });
      },
      onError: failed,
    });
  };

  // --- Sectienavigatie ---

  const sections: { id: SectionId; label: string; dirty?: boolean }[] = useMemo(
    () => [
      { id: "roster", label: t("section_roster"), dirty: dirty.roster },
      { id: "rotation", label: t("section_rotation"), dirty: dirty.rotation },
      { id: "database", label: t("section_database"), dirty: dirty.database },
      { id: "mail", label: t("section_mail"), dirty: dirty.mail },
      { id: "security", label: t("section_security") },
      { id: "backup", label: t("section_backup") },
      { id: "reset", label: t("section_danger") },
    ],
    [t, dirty.roster, dirty.rotation, dirty.database, dirty.mail]
  );

  const ready = Boolean(settings.data);

  // Markeert in de navigatie welke sectie je aan het lezen bent: de laatste
  // waarvan de kop boven de leeslijn staat. Een gewone scroll-listener, want
  // die is voorspelbaar en werkt ook bij handmatig scrollen.
  useEffect(() => {
    if (!ready) return;

    const update = () => {
      const ids: SectionId[] = [
        "roster",
        "rotation",
        "database",
        "mail",
        "security",
        "backup",
        "reset",
      ];
      let current: SectionId = ids[0];
      for (const id of ids) {
        const node = document.getElementById(id);
        if (node && node.getBoundingClientRect().top <= 120) current = id;
      }
      setActiveSection(current);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [ready]);

  const goTo = (id: SectionId) => {
    document.getElementById(id)?.scrollIntoView({ block: "start" });
    setActiveSection(id);
  };

  const header = (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("settings_title")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings_subtitle")}</p>
      </div>
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <Button asChild variant="outline" size="sm">
          <Link to="/">
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("back")}
          </Link>
        </Button>
      </div>
    </header>
  );

  const page = (children: React.ReactNode) => (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
        {header}
        {children}
      </div>
    </div>
  );

  // --- Toestanden: laden, geen verbinding, token vereist ---

  if (settings.isLoading) {
    return page(
      <div
        className="flex items-center justify-center gap-2 py-20 text-muted-foreground"
        role="status"
      >
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>{t("settings_loading")}</span>
      </div>
    );
  }

  const offline = settings.error instanceof ApiError && settings.error.status === 0;

  if (settings.isError || !rotation || !database || !mail) {
    return page(
      <Card className="max-w-xl shadow-soft">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            {offline ? (
              <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            ) : (
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <div>
              <h2 className="font-semibold text-foreground">
                {offline ? t("settings_offline") : t("settings_locked_title")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {offline ? t("settings_offline_help") : t("settings_locked_help")}
              </p>
            </div>
          </div>

          {offline ? (
            <Button type="button" onClick={() => settings.refetch()}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t("retry")}
            </Button>
          ) : (
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                setAdminToken(token.trim());
                settings.refetch();
              }}
            >
              <div className="flex-1">
                <Label className="text-xs" htmlFor="admin-token">
                  {t("token_label")}
                </Label>
                <Input
                  id="admin-token"
                  type="password"
                  value={token}
                  autoFocus
                  autoComplete="current-password"
                  placeholder={t("token_placeholder")}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
              <Button type="submit">{t("token_save")}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    );
  }

  const saveButton = (onClick: () => void, isDirty: boolean) => (
    <Button type="button" onClick={onClick} disabled={save.isPending || !isDirty}>
      <Save className="mr-2 h-4 w-4" />
      {t("save")}
    </Button>
  );

  return page(
    <div className="gap-8 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)]">
      {/* Op smalle schermen een schuifrij boven de inhoud, vanaf lg een
          meelopende kolom ernaast. */}
      <nav
        aria-label={t("settings_title")}
        className="-mx-4 mb-6 overflow-x-auto px-4 pb-1 lg:mx-0 lg:mb-0 lg:overflow-visible lg:px-0"
      >
        <ul className="flex gap-2 lg:sticky lg:top-8 lg:flex-col lg:gap-1">
          {sections.map((section) => {
            const active = activeSection === section.id;
            return (
              <li key={section.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => goTo(section.id)}
                  aria-current={active ? "true" : undefined}
                  className={`flex h-11 w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-10 ${
                    section.id === "reset" ? "text-destructive" : ""
                  } ${
                    active
                      ? "bg-primary/10 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {section.label}
                  {section.dirty && (
                    <span
                      className="ml-auto h-2 w-2 shrink-0 rounded-full bg-unsaved"
                      role="img"
                      aria-label={t("unsaved")}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-5">
        {settings.data?.settingsInFile && (
          <p className="flex items-start gap-2 rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {t("settings_in_file")}
          </p>
        )}

        {/* Rooster: waar de meeste mensen voor komen, dus eerst en met gewicht. */}
        <Section
          id="roster"
          tone="lead"
          icon={<Users className="h-5 w-5 text-primary" />}
          title={t("section_roster")}
          description={t("setup_people_help")}
          dirty={dirty.roster}
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRoster((rows) => [...rows, { name: "", phone: "", email: "" }])}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("setup_add_person")}
              </Button>
              {saveButton(saveRoster, dirty.roster)}
            </>
          }
        >
          <ol className="space-y-2">
            {roster.map((person, index) => (
              <li
                key={index}
                className="flex items-end gap-2 rounded-xl border border-border bg-background/60 p-3"
              >
                <span
                  aria-hidden="true"
                  className="hidden w-4 shrink-0 pb-2.5 text-xs text-muted-foreground sm:block"
                >
                  {index + 1}
                </span>

                <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1.3fr)]">
                  <div>
                    <Label className="text-xs" htmlFor={`r-name-${index}`}>
                      {t("setup_person_name")}
                    </Label>
                    <Input
                      id={`r-name-${index}`}
                      value={person.name}
                      maxLength={45}
                      onChange={(e) => setPerson(index, { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor={`r-phone-${index}`}>
                      {t("setup_person_phone")}
                    </Label>
                    <Input
                      id={`r-phone-${index}`}
                      value={person.phone}
                      inputMode="tel"
                      maxLength={15}
                      onChange={(e) => setPerson(index, { phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor={`r-email-${index}`}>
                      {t("person_email")}
                    </Label>
                    <Input
                      id={`r-email-${index}`}
                      type="email"
                      value={person.email ?? ""}
                      placeholder="naam@example.com"
                      aria-describedby={
                        mail.enabled && !(person.email ?? "").trim() ? `r-email-${index}-note` : undefined
                      }
                      onChange={(e) => setPerson(index, { email: e.target.value })}
                    />
                    {mail.enabled && !(person.email ?? "").trim() && (
                      <p
                        id={`r-email-${index}-note`}
                        className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"
                      >
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {t("mail_no_email")}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label={`${t("setup_remove")}: ${person.name.trim() || index + 1}`}
                  disabled={roster.length <= 1}
                  onClick={() => setRoster((rows) => rows.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ol>
        </Section>

        {/* Rotatie */}
        <Section
          id="rotation"
          title={t("section_rotation")}
          dirty={dirty.rotation}
          footer={saveButton(saveRotation, dirty.rotation)}
        >
          <div>
            <Label className="text-xs" htmlFor="s-anchor">
              {t("setup_anchor")}
            </Label>
            <Input
              id="s-anchor"
              type="date"
              className="sm:max-w-xs"
              value={rotation.anchorDate}
              aria-invalid={!isMonday(rotation.anchorDate)}
              aria-describedby="s-anchor-help"
              onChange={(e) => setRotation({ ...rotation, anchorDate: e.target.value })}
            />
            {isMonday(rotation.anchorDate) ? (
              <p id="s-anchor-help" className="mt-1 text-xs text-muted-foreground">
                {t("setup_anchor_help")}
              </p>
            ) : (
              <p id="s-anchor-help" className="mt-1 flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3" />
                {t("setup_error_monday")}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs" htmlFor="s-start">
                {t("setup_start_time")}
              </Label>
              <Input
                id="s-start"
                type="time"
                value={toTimeInput(rotation.startTime)}
                onChange={(e) => setRotation({ ...rotation, startTime: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="s-end">
                {t("setup_end_time")}
              </Label>
              <Input
                id="s-end"
                type="time"
                value={toTimeInput(rotation.endTime)}
                onChange={(e) => setRotation({ ...rotation, endTime: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="s-weeks">
                {t("setup_weeks_ahead")}
              </Label>
              <Input
                id="s-weeks"
                type="number"
                min={1}
                max={52}
                value={rotation.weeksAhead}
                onChange={(e) => setRotation({ ...rotation, weeksAhead: Number(e.target.value) })}
              />
            </div>
          </div>

          <TimezoneSelect
            value={timezone}
            onChange={setTimezone}
            serverZone={settings.data?.serverTimezone ?? ""}
            disabled={settings.data?.timezoneFromEnv}
            id="s-timezone"
          />
        </Section>

        {/* Database */}
        <Section
          id="database"
          icon={<Database className="h-4 w-4 text-muted-foreground" />}
          title={t("section_database")}
          dirty={dirty.database}
          footer={settings.data?.dbFromEnv ? undefined : saveButton(saveDatabase, dirty.database)}
        >
          <DatabaseFields
            value={database}
            onChange={setDatabase}
            disabled={settings.data?.dbFromEnv}
          />
        </Section>

        {/* E-mail */}
        <Section
          id="mail"
          icon={<Mail className="h-4 w-4 text-muted-foreground" />}
          title={t("section_mail")}
          dirty={dirty.mail}
          footer={
            <>
              {saveButton(saveMail, dirty.mail)}
              <Button
                type="button"
                variant="outline"
                onClick={verifySmtp}
                disabled={testMail.isPending || !mail.host}
              >
                {t("mail_verify")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={runNotifications}
                disabled={runMail.isPending || !mail.enabled || dirty.mail}
              >
                {t("mail_run_now")}
              </Button>
            </>
          }
        >
          <CheckboxField
            label={t("mail_enable")}
            checked={mail.enabled}
            onChange={(e) => setMail({ ...mail, enabled: e.target.checked })}
          />

          {mail.enabled && (
            <>
              <fieldset className="space-y-3 border-t border-border pt-4">
                <legend className="text-sm font-medium text-foreground">
                  {t("mail_group_server")}
                </legend>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
                  <div>
                    <Label className="text-xs" htmlFor="m-host">
                      SMTP host
                    </Label>
                    <Input
                      id="m-host"
                      value={mail.host}
                      onChange={(e) => setMail({ ...mail, host: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor="m-port">
                      Port
                    </Label>
                    <Input
                      id="m-port"
                      type="number"
                      value={mail.port}
                      onChange={(e) => setMail({ ...mail, port: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs" htmlFor="m-user">
                      User
                    </Label>
                    <Input
                      id="m-user"
                      value={mail.user}
                      autoComplete="off"
                      onChange={(e) => setMail({ ...mail, user: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor="m-password">
                      Password
                    </Label>
                    <Input
                      id="m-password"
                      type="password"
                      value={mail.password ?? ""}
                      autoComplete="new-password"
                      placeholder={mail.passwordSet ? t("db_password_keep") : ""}
                      onChange={(e) => setMail({ ...mail, password: e.target.value })}
                    />
                  </div>
                </div>

                <CheckboxField
                  label="TLS (465)"
                  checked={mail.secure}
                  onChange={(e) => setMail({ ...mail, secure: e.target.checked })}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs" htmlFor="m-from">
                      {t("mail_from")}
                    </Label>
                    <Input
                      id="m-from"
                      value={mail.from}
                      placeholder="RotaCall <rota@example.com>"
                      onChange={(e) => setMail({ ...mail, from: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor="m-cc">
                      {t("mail_cc")}
                    </Label>
                    <Input
                      id="m-cc"
                      value={mail.cc}
                      onChange={(e) => setMail({ ...mail, cc: e.target.value })}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-3 border-t border-border pt-4">
                <legend className="text-sm font-medium text-foreground">
                  {t("mail_group_when")}
                </legend>

                <CheckboxField
                  label={t("mail_notify_start")}
                  checked={mail.notifyOnStart}
                  onChange={(e) => setMail({ ...mail, notifyOnStart: e.target.checked })}
                />
                <CheckboxField
                  label={t("mail_attach_ics")}
                  checked={mail.attachIcs}
                  onChange={(e) => setMail({ ...mail, attachIcs: e.target.checked })}
                />

                <div className="sm:max-w-xs">
                  <Label className="text-xs" htmlFor="m-reminder">
                    {t("mail_reminder_hours")}
                  </Label>
                  <Input
                    id="m-reminder"
                    type="number"
                    min={0}
                    max={168}
                    value={mail.reminderHoursBefore}
                    onChange={(e) =>
                      setMail({ ...mail, reminderHoursBefore: Number(e.target.value) })
                    }
                  />
                </div>
              </fieldset>

              <fieldset className="space-y-3 border-t border-border pt-4">
                <legend className="text-sm font-medium text-foreground">
                  {t("mail_group_message")}
                </legend>

                <div>
                  <Label className="text-xs" htmlFor="m-subject">
                    {t("mail_subject")}
                  </Label>
                  <Input
                    id="m-subject"
                    value={mail.subject}
                    onChange={(e) => setMail({ ...mail, subject: e.target.value })}
                  />
                </div>

                <div>
                  <Label className="text-xs" htmlFor="m-body">
                    {t("mail_body")}
                  </Label>
                  <Textarea
                    id="m-body"
                    rows={7}
                    value={mail.body}
                    aria-describedby="m-body-help"
                    onChange={(e) => setMail({ ...mail, body: e.target.value })}
                  />
                  <p id="m-body-help" className="mt-1 text-xs text-muted-foreground">
                    {t("mail_body_help")}
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Label className="text-xs" htmlFor="m-test-to">
                      {t("mail_test_to")}
                    </Label>
                    <Input
                      id="m-test-to"
                      type="email"
                      value={testTo}
                      onChange={(e) => setTestTo(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={sendTestMail}
                    disabled={testMail.isPending || !testTo.trim()}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {t("mail_test_send")}
                  </Button>
                </div>
              </fieldset>
            </>
          )}
        </Section>

        {/* Beveiliging */}
        <Section
          id="security"
          icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />}
          title={t("section_security")}
          footer={
            <>
              <Button
                type="button"
                onClick={() => applyToken(newToken.trim())}
                disabled={save.isPending || !newToken.trim()}
              >
                <Save className="mr-2 h-4 w-4" />
                {t("save")}
              </Button>
              {settings.data?.adminTokenSet && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => applyToken("")}
                  disabled={save.isPending}
                >
                  {t("token_disable")}
                </Button>
              )}
            </>
          }
        >
          <div className="sm:max-w-sm">
            <Label className="text-xs" htmlFor="s-token">
              {t("token_new")}
            </Label>
            <Input
              id="s-token"
              type="password"
              value={newToken}
              autoComplete="new-password"
              aria-describedby="s-token-help"
              onChange={(e) => setNewToken(e.target.value)}
            />
            <p id="s-token-help" className="mt-1 text-xs text-muted-foreground">
              {t("token_new_help")}
            </p>
          </div>
        </Section>

        {/* Back-up */}
        <Section
          id="backup"
          icon={<Download className="h-4 w-4 text-muted-foreground" />}
          title={t("section_backup")}
          description={t("backup_help")}
          footer={
            <Button
              type="button"
              variant="outline"
              onClick={() => exportBackup.mutate(includeSecrets, { onError: failed })}
              disabled={exportBackup.isPending}
            >
              <Download className="mr-2 h-4 w-4" />
              {t("backup_export")}
            </Button>
          }
        >
          <CheckboxField
            label={t("backup_secrets")}
            checked={includeSecrets}
            onChange={(e) => setIncludeSecrets(e.target.checked)}
          />
        </Section>

        {/* Resetten: onomkeerbaar, dus niet in dezelfde vorm als de rest. */}
        <Section
          id="reset"
          tone="danger"
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
          title={t("section_danger")}
          description={t("reset_help")}
          footer={
            <Button
              type="button"
              variant="destructive"
              onClick={resetEverything}
              disabled={resetApp.isPending}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {t("reset_button")}
            </Button>
          }
        >
          <CheckboxField
            label={t("reset_wipe")}
            checked={wipeData}
            onChange={(e) => setWipeData(e.target.checked)}
          />
        </Section>
      </div>
    </div>
  );
};

export default Settings;
