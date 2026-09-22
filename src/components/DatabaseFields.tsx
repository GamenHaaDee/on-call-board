import { useTranslation } from "react-i18next";
import { Check, Database, Loader2 } from "lucide-react";
import { toast } from "sonner";
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

interface Props {
  value: DatabaseSettings;
  onChange: (next: DatabaseSettings) => void;
  /** Vastgezet via environment variables: alleen tonen, niet wijzigen. */
  disabled?: boolean;
}

/** Databasekeuze + verbindingsgegevens; gedeeld door setup en instellingen. */
const DatabaseFields = ({ value, onChange, disabled = false }: Props) => {
  const { t } = useTranslation();
  const test = useTestDatabase();

  const set = (patch: Partial<DatabaseSettings>) => onChange({ ...value, ...patch });

  const pickDriver = (driver: DbDriver) => {
    if (disabled) return;
    // Poort meeschakelen zolang de gebruiker hem niet zelf heeft aangepast.
    const port =
      value.port === DEFAULT_PORT[value.driver] || !value.port ? DEFAULT_PORT[driver] : value.port;
    set({ driver, port });
  };

  const runTest = () =>
    test.mutate(value, {
      onSuccess: () => toast.success(t("db_test_ok")),
      onError: (e) => toast.error(e instanceof Error ? e.message : t("db_test")),
    });

  const isServer = value.driver !== "sqlite";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("db_help")}</p>

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
              className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
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
          <Label className="text-xs" htmlFor="db-file">
            {t("db_file")}
          </Label>
          <Input
            id="db-file"
            value={value.file}
            disabled={disabled}
            onChange={(e) => set({ file: e.target.value })}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {value.driver === "postgres" && (
            <div>
              <Label className="text-xs" htmlFor="db-url">
                URL
              </Label>
              <Input
                id="db-url"
                value={value.url}
                disabled={disabled}
                placeholder="postgres://user:pass@host:5432/db"
                onChange={(e) => set({ url: e.target.value })}
              />
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Label className="text-xs" htmlFor="db-host">
                Host
              </Label>
              <Input
                id="db-host"
                value={value.host}
                disabled={disabled}
                onChange={(e) => set({ host: e.target.value })}
              />
            </div>
            <div className="w-full sm:w-28">
              <Label className="text-xs" htmlFor="db-port">
                Port
              </Label>
              <Input
                id="db-port"
                type="number"
                value={value.port}
                disabled={disabled}
                onChange={(e) => set({ port: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Label className="text-xs" htmlFor="db-user">
                User
              </Label>
              <Input
                id="db-user"
                value={value.user}
                disabled={disabled}
                autoComplete="off"
                onChange={(e) => set({ user: e.target.value })}
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs" htmlFor="db-password">
                Password
              </Label>
              <Input
                id="db-password"
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
            <Label className="text-xs" htmlFor="db-name">
              Database
            </Label>
            <Input
              id="db-name"
              value={value.database}
              disabled={disabled}
              onChange={(e) => set({ database: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label className="text-xs" htmlFor="db-table">
            {t("db_table")}
          </Label>
          <Input
            id="db-table"
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
