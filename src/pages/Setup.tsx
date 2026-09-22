import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, Mail, Plus, Trash2, Upload } from "lucide-react";
import { notify } from "@/lib/notify";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import DatabaseFields from "@/components/DatabaseFields";
import AppLogo from "@/components/AppLogo";
import TimezoneSelect from "@/components/TimezoneSelect";
import {
  useSaveSetup,
  useSetupStatus,
  setAdminToken as storeAdminToken,
  type AssignmentRow,
  type BackupFile,
  type DatabaseSettings,
  type MailSettings,
  type RosterPerson,
} from "@/data/api";

/** Eerstvolgende maandag (of vandaag als het al maandag is), als jjjj-mm-dd. */
function nextMonday(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
  return d.toISOString().slice(0, 10);
}

const isMonday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 1;

// De API werkt met uu:mm:ss, het tijd-invoerveld met uu:mm.
const toTimeInput = (value: string) => value.slice(0, 5);
const toApiTime = (value: string) => (value.length === 5 ? `${value}:00` : value);

const EMPTY_MAIL: MailSettings = {
  enabled: false,
  host: "",
  port: 587,
  secure: false,
  user: "",
  password: "",
  from: "",
  cc: "",
  notifyOnStart: true,
  reminderHoursBefore: 0,
  attachIcs: true,
  subject: "Je hebt vanaf nu dienst",
  body:
    "Hoi {{name}},\n\n" +
    "Vanaf {{start}} tot {{end}} ben jij bereikbaar voor storingen op {{phone}}.\n\n" +
    "Groet,\nRotaCall",
};

const EMPTY_DB: DatabaseSettings = {
  driver: "sqlite",
  file: "",
  url: "",
  host: "localhost",
  port: 3306,
  user: "",
  password: "",
  database: "",
  table: "period_config",
};

const Setup = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = useSetupStatus();
  const save = useSaveSetup();

  const [people, setPeople] = useState<RosterPerson[]>([
    { name: "", phone: "", email: "" },
    { name: "", phone: "", email: "" },
  ]);
  const [database, setDatabase] = useState<DatabaseSettings>(EMPTY_DB);
  const [anchorDate, setAnchorDate] = useState(nextMonday());
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("11:59");
  const [weeksAhead, setWeeksAhead] = useState(12);
  const [adminToken, setAdminToken] = useState("");
  const [timezone, setTimezone] = useState("");
  const [mail, setMail] = useState<MailSettings>(EMPTY_MAIL);
  // Weken uit een geïmporteerde back-up; gaan mee bij het opslaan.
  const [restored, setRestored] = useState<AssignmentRow[]>([]);

  // Standaardwaarden van de server overnemen zodra ze binnen zijn.
  useEffect(() => {
    const defaults = status.data?.defaults;
    if (!defaults) return;
    setStartTime(toTimeInput(defaults.startTime));
    setEndTime(toTimeInput(defaults.endTime));
    setWeeksAhead(defaults.weeksAhead);
    setTimezone(defaults.timezone ?? "");
    setDatabase((current) => ({
      ...current,
      driver: defaults.database.driver,
      table: defaults.database.table,
      port: defaults.database.port,
    }));
  }, [status.data]);

  // Al ingericht? Dan hoort deze pagina er niet meer te zijn.
  useEffect(() => {
    if (status.data?.configured) navigate("/", { replace: true });
  }, [status.data, navigate]);

  /** Een eerder gedownloade back-up in het formulier zetten. */
  const importBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as BackupFile;
      if (!parsed?.settings?.roster || !Array.isArray(parsed.settings.roster)) {
        throw new Error(t("backup_invalid"));
      }

      setPeople(parsed.settings.roster.map((p) => ({ ...p, email: p.email ?? "" })));
      if (parsed.settings.rotation) {
        setAnchorDate(parsed.settings.rotation.anchorDate);
        setStartTime(toTimeInput(parsed.settings.rotation.startTime));
        setEndTime(toTimeInput(parsed.settings.rotation.endTime));
        setWeeksAhead(parsed.settings.rotation.weeksAhead);
      }
      if (parsed.settings.timezone !== undefined) setTimezone(parsed.settings.timezone);
      if (parsed.settings.database) setDatabase({ ...parsed.settings.database, password: "" });
      if (parsed.settings.mail) setMail({ ...EMPTY_MAIL, ...parsed.settings.mail });
      const weeks = Array.isArray(parsed.assignments) ? parsed.assignments : [];
      setRestored(weeks);

      notify.success(
        t("backup_imported", { people: parsed.settings.roster.length, weeks: weeks.length })
      );
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("backup_invalid"));
    }
  };

  const setPerson = (index: number, patch: Partial<RosterPerson>) =>
    setPeople((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const submit = () => {
    const roster = people
      .map((p) => ({
        name: p.name.trim(),
        phone: p.phone.trim(),
        email: (p.email ?? "").trim(),
      }))
      .filter((p) => p.name || p.phone || p.email);

    if (roster.length === 0 || roster.some((p) => !p.name || !p.phone)) {
      notify.error(t("setup_error_people"));
      return;
    }
    if (!isMonday(anchorDate)) {
      notify.error(t("setup_error_monday"));
      return;
    }

    save.mutate(
      {
        roster,
        database,
        anchorDate,
        startTime: toApiTime(startTime),
        endTime: toApiTime(endTime),
        weeksAhead,
        timezone,
        adminToken: adminToken.trim(),
        mail,
        assignments: restored.length > 0 ? restored : undefined,
      },
      {
        onSuccess: (result) => {
          if (result?.imported) {
            notify.success(t("backup_restored", { count: result.imported }));
          }
          // Meteen bruikbaar houden voor de admin- en instellingenpagina.
          if (adminToken.trim()) storeAdminToken(adminToken.trim());
          notify.success(t("setup_done"));
          navigate("/", { replace: true });
        },
        onError: (e) => notify.error(e instanceof Error ? e.message : t("toast_save_failed")),
      }
    );
  };

  if (status.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <AppLogo alt={t("app_title")} className="h-12 w-12" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {t("setup_title")}
              </h1>
              <p className="text-sm text-muted-foreground">{t("setup_subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background/70 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">{t("backup_import")}</span>
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importBackup(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>

        <div className="space-y-4">
          {/* Rooster */}
          <Card className="shadow-soft">
            <CardContent className="space-y-4 p-4">
              <div>
                <h2 className="font-semibold text-foreground">{t("setup_people")}</h2>
                <p className="text-sm text-muted-foreground">{t("setup_people_help")}</p>
              </div>

              {people.map((person, index) => (
                <div key={index} className="space-y-3 rounded-xl border border-border p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <Label className="text-xs" htmlFor={`name-${index}`}>
                        {t("setup_person_name")}
                      </Label>
                      <Input
                        id={`name-${index}`}
                        value={person.name}
                        maxLength={45}
                        onChange={(e) => setPerson(index, { name: e.target.value })}
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs" htmlFor={`phone-${index}`}>
                        {t("setup_person_phone")}
                      </Label>
                      <Input
                        id={`phone-${index}`}
                        value={person.phone}
                        inputMode="tel"
                        maxLength={15}
                        placeholder="0612345678"
                        onChange={(e) => setPerson(index, { phone: e.target.value })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("setup_remove")}
                      disabled={people.length <= 1}
                      onClick={() => setPeople((rows) => rows.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor={`email-${index}`}>
                      {t("person_email")}
                    </Label>
                    <Input
                      id={`email-${index}`}
                      type="email"
                      value={person.email ?? ""}
                      placeholder="naam@example.com"
                      onChange={(e) => setPerson(index, { email: e.target.value })}
                    />
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={() => setPeople((rows) => [...rows, { name: "", phone: "", email: "" }])}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("setup_add_person")}
              </Button>
            </CardContent>
          </Card>

          {/* Database */}
          <Card className="shadow-soft">
            <CardContent className="space-y-4 p-4">
              <h2 className="font-semibold text-foreground">{t("section_database")}</h2>
              <DatabaseFields
                value={database}
                onChange={setDatabase}
                disabled={status.data?.dbFromEnv}
              />
            </CardContent>
          </Card>

          {/* Rotatie */}
          <Card className="shadow-soft">
            <CardContent className="space-y-4 p-4">
              <h2 className="font-semibold text-foreground">{t("setup_rotation")}</h2>

              <div>
                <Label className="text-xs" htmlFor="anchor">
                  {t("setup_anchor")}
                </Label>
                <Input
                  id="anchor"
                  type="date"
                  value={anchorDate}
                  onChange={(e) => setAnchorDate(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("setup_anchor_help")}</p>
                {!isMonday(anchorDate) && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    {t("setup_error_monday")}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <Label className="text-xs" htmlFor="start-time">
                    {t("setup_start_time")}
                  </Label>
                  <Input
                    id="start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs" htmlFor="end-time">
                    {t("setup_end_time")}
                  </Label>
                  <Input
                    id="end-time"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs" htmlFor="weeks">
                    {t("setup_weeks_ahead")}
                  </Label>
                  <Input
                    id="weeks"
                    type="number"
                    min={1}
                    max={52}
                    value={weeksAhead}
                    onChange={(e) => setWeeksAhead(Number(e.target.value))}
                  />
                </div>
              </div>

              <TimezoneSelect
                value={timezone}
                onChange={setTimezone}
                serverZone={status.data?.serverTimezone ?? ""}
                disabled={status.data?.timezoneFromEnv}
                id="setup-timezone"
              />
            </CardContent>
          </Card>

          {/* E-mailmeldingen */}
          <Card className="shadow-soft">
            <CardContent className="space-y-4 p-4">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-foreground">
                  <Mail className="h-4 w-4" />
                  {t("setup_mail")}
                </h2>
                <p className="text-sm text-muted-foreground">{t("setup_mail_help")}</p>
              </div>

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={mail.enabled}
                  onChange={(e) => setMail({ ...mail, enabled: e.target.checked })}
                />
                {t("mail_enable")}
              </label>

              {mail.enabled && (
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="flex-1">
                      <Label className="text-xs" htmlFor="setup-mail-host">
                        SMTP host
                      </Label>
                      <Input
                        id="setup-mail-host"
                        value={mail.host}
                        onChange={(e) => setMail({ ...mail, host: e.target.value })}
                      />
                    </div>
                    <div className="w-full sm:w-28">
                      <Label className="text-xs" htmlFor="setup-mail-port">
                        Port
                      </Label>
                      <Input
                        id="setup-mail-port"
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
                      <Label className="text-xs" htmlFor="setup-mail-user">
                        User
                      </Label>
                      <Input
                        id="setup-mail-user"
                        value={mail.user}
                        autoComplete="off"
                        onChange={(e) => setMail({ ...mail, user: e.target.value })}
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs" htmlFor="setup-mail-password">
                        Password
                      </Label>
                      <Input
                        id="setup-mail-password"
                        type="password"
                        value={mail.password ?? ""}
                        autoComplete="new-password"
                        onChange={(e) => setMail({ ...mail, password: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs" htmlFor="setup-mail-from">
                      {t("mail_from")}
                    </Label>
                    <Input
                      id="setup-mail-from"
                      value={mail.from}
                      placeholder="RotaCall <rota@example.com>"
                      onChange={(e) => setMail({ ...mail, from: e.target.value })}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={mail.attachIcs}
                      onChange={(e) => setMail({ ...mail, attachIcs: e.target.checked })}
                    />
                    {t("mail_attach_ics")}
                  </label>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Beveiliging */}
          <Card className="shadow-soft">
            <CardContent className="space-y-3 p-4">
              <h2 className="font-semibold text-foreground">{t("setup_security")}</h2>
              <div>
                <Label className="text-xs" htmlFor="token">
                  {t("setup_admin_token")}
                </Label>
                <Input
                  id="token"
                  type="password"
                  value={adminToken}
                  autoComplete="new-password"
                  onChange={(e) => setAdminToken(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("setup_admin_token_help")}</p>
              </div>
            </CardContent>
          </Card>

          <Button className="w-full" onClick={submit} disabled={save.isPending}>
            {save.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("setup_saving")}
              </>
            ) : (
              t("setup_submit")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Setup;
