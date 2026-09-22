import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";

/**
 * Alle IANA-zones die de browser kent. Lukt dat niet (oudere browser), dan
 * blijft er een korte lijst met veelgebruikte zones over, aangevuld met de
 * zone die al is ingesteld.
 */
function timezones(current: string, serverZone: string): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;

  let zones: string[] = [];
  try {
    zones = supported ? supported("timeZone") : [];
  } catch {
    zones = [];
  }
  if (zones.length === 0) {
    zones = [
      "Europe/Amsterdam",
      "Europe/Brussels",
      "Europe/Berlin",
      "Europe/London",
      "Europe/Madrid",
      "Europe/Warsaw",
      "UTC",
    ];
  }
  for (const zone of [current, serverZone]) {
    if (zone && !zones.includes(zone)) zones.push(zone);
  }
  return zones.sort((a, b) => a.localeCompare(b));
}

interface Props {
  /** Lege waarde = "volg de tijdzone van de server". */
  value: string;
  onChange: (next: string) => void;
  serverZone: string;
  disabled?: boolean;
  id?: string;
}

const TimezoneSelect = ({ value, onChange, serverZone, disabled = false, id = "timezone" }: Props) => {
  const { t } = useTranslation();
  const zones = useMemo(() => timezones(value, serverZone), [value, serverZone]);

  return (
    <div>
      <Label className="text-xs" htmlFor={id}>
        {t("tz_label")}
      </Label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">{t("tz_server", { zone: serverZone })}</option>
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-muted-foreground">
        {disabled ? t("tz_locked_env") : t("tz_help")}
      </p>
    </div>
  );
};

export default TimezoneSelect;
