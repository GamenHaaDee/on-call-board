import { useTranslation } from "react-i18next";
import { Check, Database, Loader2 } from "lucide-react";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTestDatabase, type DatabaseSettings, type DbDriver } from "@/data/api";

const DRIVERS: { value: DbDriver; label: string }[] = [
  { value: "sqlite", label: "SQLite" },
  { value: "mysql", label: "MySQL / MariaDB" },
  { value: "postgres", label: "PostgreSQL" },
];

const DEFAULT_PORT: Record<DbDriver, number> = { sqlite: 0, mysql: 3306, postgres: 5432 };
const STANDARD_PORTS = Object.values(DEFAULT_PORT);

interface Props {
  value: DatabaseSettings;
  onChange: (next: DatabaseSettings) => void;
  /** Vastgezet via environment variables: alleen tonen, niet wijzigen. */
  disabled?: boolean;
  /** Zet op false waar de sectie zelf al uitlegt waar deze velden voor zijn. */
  showIntro?: boolean;
  /**
   * Voorvoegsel voor de veld-id's. Staan er twee van deze formulieren op één
   * pagina (eigen database en die van het telefoniesysteem), dan mogen de id's
   * niet botsen: anders wijst een label naar het verkeerde veld.
   */
  idPrefix?: string;
}

/** Databasekeuze + verbindingsgegevens; gedeeld door setup en instellingen. */
const DatabaseFields = ({
  value,
  onChange,
  disabled = false,
  showIntro = true,
  idPrefix = "db",
}: Props) => {
  const { t } = useTranslation();
  const test = useTestDatabase();

  const set = (patch: Partial<DatabaseSettings>) => onChange({ ...value, ...patch });

  const pickDriver = (driver: DbDriver) => {
    if (disabled) return;
    // De poort meeschakelen, tenzij er een eigen poort is ingevuld: alleen een
    // waarde die van geen enkele driver de standaard is, is er zelf ingezet.
    const custom = Boolean(value.port) && !STANDARD_PORTS.includes(value.port);
    set({ driver, port: custom ? value.port : DEFAULT_PORT[driver] });
  };

  const runTest = () =>
    test.mutate(value, {
      onSuccess: () => notify.success(t("db_test_ok")),
      onError: (e) => notify.error(e instanceof Error ? e.message : t("db_test")),
    });

  const isServer = value.driver !== "sqlite";

  return (
    <div className="space-y-4">
      {showIntro && <p className="text-sm text-muted-foreground">{t("db_help")}</p>}

      {disabled && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          {t("db_locked_env")}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        {DRIVERS.map((driver) => {
          const active = value.driver === driver.value;
          return (
            <button
              key={driver.value}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => pickDriver(driver.value)}
              className={`min-h-11 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                active
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted/60"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Database className="h-4 w-4" />
                {driver.label}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {isServer ? t("db_server_help") : t("db_sqlite_help")}
      </p>

      {value.driver === "sqlite" ? (
        <div>
          <Label className="text-xs" htmlFor={`${idPrefix}-file`}>
            {t("db_file")}
          </Label>
          <Input
            id={`${idPrefix}-file`}
            value={value.file}
            disabled={disabled}
            onChange={(e) => set({ file: e.target.value })}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {value.driver === "postgres" && (
            <div>
              <Label className="text-xs" htmlFor={`${idPrefix}-url`}>
                URL
              </Label>
              <Input
                id={`${idPrefix}-url`}
                value={value.url}
                disabled={disabled}
                placeholder="postgres://user:pass@host:5432/db"
                onChange={(e) => set({ url: e.target.value })}
              />
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Label className="text-xs" htmlFor={`${idPrefix}-host`}>
                Host
              </Label>
              <Input
                id={`${idPrefix}-host`}
                value={value.host}
                disabled={disabled}
                onChange={(e) => set({ host: e.target.value })}
              />
            </div>
            <div className="w-full sm:w-28">
              <Label className="text-xs" htmlFor={`${idPrefix}-port`}>
                Port
              </Label>
              <Input
                id={`${idPrefix}-port`}
                type="number"
                value={value.port}
                disabled={disabled}
                onChange={(e) => set({ port: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Label className="text-xs" htmlFor={`${idPrefix}-user`}>
                User
              </Label>
              <Input
                id={`${idPrefix}-user`}
                value={value.user}
                disabled={disabled}
                autoComplete="off"
                onChange={(e) => set({ user: e.target.value })}
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs" htmlFor={`${idPrefix}-password`}>
                Password
              </Label>
              <Input
                id={`${idPrefix}-password`}
                type="password"
                value={value.password ?? ""}
                disabled={disabled}
                autoComplete="new-password"
                placeholder={value.passwordSet ? t("db_password_keep") : ""}
                onChange={(e) => set({ password: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs" htmlFor={`${idPrefix}-name`}>
              Database
            </Label>
            <Input
              id={`${idPrefix}-name`}
              value={value.database}
              disabled={disabled}
              onChange={(e) => set({ database: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label className="text-xs" htmlFor={`${idPrefix}-table`}>
            {t("db_table")}
          </Label>
          <Input
            id={`${idPrefix}-table`}
            value={value.table}
            disabled={disabled}
            onChange={(e) => set({ table: e.target.value })}
          />
        </div>
        <Button type="button" variant="outline" onClick={runTest} disabled={test.isPending}>
          {test.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-2 h-4 w-4" />
          )}
          {t("db_test")}
        </Button>
      </div>
    </div>
  );
};

export default DatabaseFields;
