import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Loader2,
  Mail,
  Plus,
  RotateCcw,
  Save,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import DatabaseFields from "@/components/DatabaseFields";
import TimezoneSelect from "@/components/TimezoneSelect";
import {
  getAdminToken,
  setAdminToken,
  useExportBackup,
  useResetApp,
  useRunMail,
  useSaveSettings,
  useSettings,
  useTestMail,
  type AppSettings,
  type DatabaseSettings,
  type MailSettings,
  type RosterPerson,
  type RotationSettings,
} from "@/data/api";

const toTimeInput = (value: string) => value.slice(0, 5);
const toApiTime = (value: string) => (value.length === 5 ? `${value}:00` : value);
const isMonday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 1;

/** Kaart met titel en inhoud; houdt de pagina rustig en voorspelbaar. */
const Section = ({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <Card className="shadow-soft">
    <CardContent className="space-y-4 p-4">
      <h2 className="flex items-center gap-2 font-semibold text-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </CardContent>
  </Card>
);

const Settings = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [token, setToken] = useState(getAdminToken());
  const settings = useSettings();
  const save = useSaveSettings();
  const testMail = useTestMail();
  const runMail = useRunMail();
  const exportBackup = useExportBackup();
  const resetApp = useResetApp();

  const [roster, setRoster] = useState<RosterPerson[]>([]);
  const [rotation, setRotation] = useState<RotationSettings | null>(null);
  const [database, setDatabase] = useState<DatabaseSettings | null>(null);
  const [mail, setMail] = useState<MailSettings | null>(null);
  const [timezone, setTimezone] = useState("");
  const [newToken, setNewToken] = useState("");
  const [testTo, setTestTo] = useState("");
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [wipeData, setWipeData] = useState(false);

  // De formulieren vullen met wat de server teruggeeft.
  useEffect(() => {
    const data = settings.data as AppSettings | undefined;
    if (!data) return;
    setRoster(data.roster.map((p) => ({ ...p, email: p.email ?? "" })));
    setRotation({ ...data.rotation, startTime: data.rotation.startTime });
    setTimezone(data.timezone ?? "");
    setDatabase({ ...data.database, password: "" });
    setMail({ ...data.mail, password: "" });
  }, [settings.data]);

  const saveToken = () => {
    setAdminToken(token.trim());
    settings.refetch();
    toast.success(t("token_saved"));
  };

  const setPerson = (index: number, patch: Partial<RosterPerson>) =>
    setRoster((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const saved = () => toast.success(t("settings_saved"));
  const failed = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : t("toast_save_failed"));

  const saveRoster = () => {
    const cleaned = roster.map((p) => ({
      name: p.name.trim(),
      phone: p.phone.trim(),
      email: (p.email ?? "").trim(),
    }));
    if (cleaned.length === 0 || cleaned.some((p) => !p.name || !p.phone)) {
      toast.error(t("setup_error_people"));
      return;
    }
    save.mutate({ roster: cleaned }, { onSuccess: saved, onError: failed });
  };

  const saveRotation = () => {
    if (!rotation) return;
    if (!isMonday(rotation.anchorDate)) {
      toast.error(t("setup_error_monday"));
      return;
    }
    save.mutate(
      {
        rotation: {
          ...rotation,
          startTime: toApiTime(rotation.startTime),
          endTime: toApiTime(rotation.endTime),
        },
        // Alleen meesturen als hij hier gewijzigd mag worden.
        ...(settings.data?.timezoneFromEnv ? {} : { timezone }),
      },
      { onSuccess: saved, onError: failed }
    );
  };

  const saveDatabase = () => {
    if (!database) return;
    // Leeg wachtwoordveld = het opgeslagen wachtwoord laten staan.
    const payload = { ...database };
    if (!payload.password) delete payload.password;
    save.mutate({ database: payload }, { onSuccess: saved, onError: failed });
  };

  const saveMail = () => {
    if (!mail) return;
    const payload = { ...mail };
    if (!payload.password) delete payload.password;
    save.mutate({ mail: payload }, { onSuccess: saved, onError: failed });
  };

  /** Token wijzigen (of, met een lege waarde, de beveiliging uitzetten). */
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

  const verifyMail = () => {
    if (!mail) return;
    testMail.mutate(
      { mail },
      {
        onSuccess: () => toast.success(t("mail_verify_ok")),
        onError: failed,
      }
    );
  };

  const sendTestMail = () => {
    if (!mail || !testTo.trim()) return;
    testMail.mutate(
      { mail, to: testTo.trim() },
      {
        onSuccess: () => toast.success(t("mail_sent_ok")),
        onError: failed,
      }
    );
  };

  const downloadBackup = () =>
    exportBackup.mutate(includeSecrets, {
      onError: failed,
    });

  const resetEverything = () => {
    const question = wipeData ? t("reset_confirm_wipe") : t("reset_confirm");
    if (!window.confirm(question)) return;
    resetApp.mutate(wipeData, {
      onSuccess: () => {
        setAdminToken("");
        toast.success(t("reset_done"));
        navigate("/setup", { replace: true });
      },
      onError: failed,
    });
  };

  const runNotifications = () =>
    runMail.mutate(undefined, {
      onSuccess: (result) => toast.success(t("mail_run_result", { count: result.sent })),
      onError: failed,
    });

  const header = (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="gradient-primary flex h-12 w-12 items-center justify-center rounded-2xl shadow-soft">
          <SettingsIcon className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("settings_title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("settings_subtitle")}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("back")}
          </Link>
        </Button>
      </div>
    </div>
  );

  // Token-invoer: nodig zodra de server een token verwacht.
  const tokenCard = (
    <Section title={t("token_label")} icon={<ShieldCheck className="h-4 w-4" />}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label className="text-xs" htmlFor="admin-token">
            {t("token_label")}
          </Label>
          <Input
            id="admin-token"
            type="password"
            value={token}
            autoComplete="current-password"
            placeholder={t("token_placeholder")}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>
        <Button type="button" onClick={saveToken}>
          {t("token_save")}
        </Button>
      </div>
    </Section>
  );

  if (settings.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (settings.isError || !rotation || !database || !mail) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-2xl px-4 py-10">
          {header}
          <p className="mb-4 text-sm text-muted-foreground">{t("settings_locked")}</p>
          {tokenCard}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-10">
        {header}

        <div className="space-y-4">
          {/* Rooster */}
          <Section title={t("section_roster")}>
            <p className="text-sm text-muted-foreground">{t("setup_people_help")}</p>

            {roster.map((person, index) => (
              <div key={index} className="space-y-3 rounded-xl border border-border p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
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
                  <div className="flex-1">
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("setup_remove")}
                    disabled={roster.length <= 1}
                    onClick={() => setRoster((rows) => rows.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
                    onChange={(e) => setPerson(index, { email: e.target.value })}
                  />
                  {mail.enabled && !(person.email ?? "").trim() && (
                    <p className="mt-1 text-xs text-muted-foreground">{t("mail_no_email")}</p>
                  )}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRoster((rows) => [...rows, { name: "", phone: "", email: "" }])}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("setup_add_person")}
              </Button>
              <Button type="button" onClick={saveRoster} disabled={save.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {t("save")}
              </Button>
            </div>
          </Section>

          {/* Rotatie */}
          <Section title={t("section_rotation")}>
            <div>
              <Label className="text-xs" htmlFor="s-anchor">
                {t("setup_anchor")}
              </Label>
              <Input
                id="s-anchor"
                type="date"
                value={rotation.anchorDate}
                onChange={(e) => setRotation({ ...rotation, anchorDate: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t("setup_anchor_help")}</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
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
              <div className="flex-1">
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
              <div className="flex-1">
                <Label className="text-xs" htmlFor="s-weeks">
                  {t("setup_weeks_ahead")}
                </Label>
                <Input
                  id="s-weeks"
                  type="number"
                  min={1}
                  max={52}
                  value={rotation.weeksAhead}
                  onChange={(e) =>
                    setRotation({ ...rotation, weeksAhead: Number(e.target.value) })
                  }
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

            <Button type="button" onClick={saveRotation} disabled={save.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {t("save")}
            </Button>
          </Section>

          {/* Database */}
          <Section title={t("section_database")}>
            <DatabaseFields
              value={database}
              onChange={setDatabase}
              disabled={settings.data?.dbFromEnv}
            />
            {!settings.data?.dbFromEnv && (
              <Button type="button" onClick={saveDatabase} disabled={save.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {t("save")}
              </Button>
            )}
          </Section>

          {/* E-mail */}
          <Section title={t("section_mail")} icon={<Mail className="h-4 w-4" />}>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={mail.enabled}
                onChange={(e) => setMail({ ...mail, enabled: e.target.checked })}
              />
              {t("mail_enable")}
            </label>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <Label className="text-xs" htmlFor="m-host">
                  SMTP host
                </Label>
                <Input
                  id="m-host"
                  value={mail.host}
                  onChange={(e) => setMail({ ...mail, host: e.target.value })}
                />
              </div>
              <div className="w-full sm:w-28">
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

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={mail.secure}
                onChange={(e) => setMail({ ...mail, secure: e.target.checked })}
              />
              TLS (465)
            </label>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
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
              <div className="flex-1">
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

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
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
              <div className="flex-1">
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

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={mail.notifyOnStart}
                onChange={(e) => setMail({ ...mail, notifyOnStart: e.target.checked })}
              />
              {t("mail_notify_start")}
            </label>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={mail.attachIcs}
                onChange={(e) => setMail({ ...mail, attachIcs: e.target.checked })}
              />
              {t("mail_attach_ics")}
            </label>

            <div>
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
              <textarea
                id="m-body"
                rows={6}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={mail.body}
                onChange={(e) => setMail({ ...mail, body: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t("mail_body_help")}</p>
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

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={saveMail} disabled={save.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {t("save")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={verifyMail}
                disabled={testMail.isPending}
              >
                {t("mail_verify")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={runNotifications}
                disabled={runMail.isPending || !mail.enabled}
              >
                {t("mail_run_now")}
              </Button>
            </div>
          </Section>

          {/* Beveiliging */}
          <Section title={t("section_security")} icon={<ShieldCheck className="h-4 w-4" />}>
            <div>
              <Label className="text-xs" htmlFor="s-token">
                {t("token_new")}
              </Label>
              <Input
                id="s-token"
                type="password"
                value={newToken}
                autoComplete="new-password"
                onChange={(e) => setNewToken(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t("token_new_help")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
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
            </div>
          </Section>

          {/* Back-up */}
          <Section title={t("section_backup")} icon={<Download className="h-4 w-4" />}>
            <p className="text-sm text-muted-foreground">{t("backup_help")}</p>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={includeSecrets}
                onChange={(e) => setIncludeSecrets(e.target.checked)}
              />
              {t("backup_secrets")}
            </label>

            <Button
              type="button"
              variant="outline"
              onClick={downloadBackup}
              disabled={exportBackup.isPending}
            >
              <Download className="mr-2 h-4 w-4" />
              {t("backup_export")}
            </Button>
          </Section>

          {/* Resetten */}
          <Section
            title={t("section_danger")}
            icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
          >
            <p className="text-sm text-muted-foreground">{t("reset_help")}</p>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={wipeData}
                onChange={(e) => setWipeData(e.target.checked)}
              />
              {t("reset_wipe")}
            </label>

            <Button
              type="button"
              variant="destructive"
              onClick={resetEverything}
              disabled={resetApp.isPending}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {t("reset_button")}
            </Button>
          </Section>
        </div>
      </div>
    </div>
  );
};

export default Settings;
