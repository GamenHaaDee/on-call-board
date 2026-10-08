import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTestZabbix, type ZabbixInfo, type ZabbixSettings } from "@/data/api";

const SELECT_CLASS =
  "flex h-11 w-full rounded-md border border-input sm:h-10 bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

/** Soort media-type, zoals Zabbix ze nummert. */
const MEDIA_KINDS: Record<string, string> = {
  "0": "e-mail",
  "1": "script",
  "2": "sms",
  "4": "webhook",
};

interface Props {
  value: ZabbixSettings;
  onChange: (next: ZabbixSettings) => void;
}

/**
 * Verbindingsgegevens van Zabbix, plus de keuze welke gebruiker en welk
 * media-type bijgewerkt worden. Die twee lijsten komen uit Zabbix zelf, dus
 * eerst de verbinding testen; zolang dat nog niet is gebeurd staat er wat er
 * is opgeslagen.
 */
const ZabbixFields = ({ value, onChange }: Props) => {
  const { t } = useTranslation();
  const test = useTestZabbix();
  const [info, setInfo] = useState<ZabbixInfo | null>(null);

  const set = (patch: Partial<ZabbixSettings>) => onChange({ ...value, ...patch });

  // Is de koppeling al ingericht, dan de lijsten meteen ophalen: anders staan
  // er alleen nummers (#5) waar een naam hoort. Stilletjes, want dit is niet
  // iets waar de gebruiker om gevraagd heeft; mislukt het, dan blijft het
  // nummer staan en kan hij alsnog zelf testen.
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    if (!value.userId || !(value.tokenSet || value.passwordSet)) return;
    loaded.current = true;
    test.mutate(value, { onSuccess: setInfo, onError: () => {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.userId, value.tokenSet, value.passwordSet]);

  const runTest = () =>
    test.mutate(value, {
      onSuccess: (result) => {
        setInfo(result);
        notify.success(t("zbx_tested", { version: result.version }));
      },
      onError: (err) =>
        notify.error(err instanceof Error ? err.message : t("zbx_test_failed")),
    });

  // Zolang er niet getest is, is de opgeslagen keuze het enige dat we weten.
  const userOptions =
    info?.users.map((u) => ({
      value: u.userid,
      label: [u.username, [u.name, u.surname].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(" — "),
    })) ?? (value.userId ? [{ value: value.userId, label: `#${value.userId}` }] : []);

  const mediaOptions =
    info?.mediaTypes.map((m) => ({
      value: m.mediatypeid,
      // De soort erachter zetten helpt kiezen, maar niet als de naam het al
      // zegt ("SMS (sms)" leest nergens naar).
      label:
        MEDIA_KINDS[m.type] && !m.name.toLowerCase().includes(MEDIA_KINDS[m.type])
          ? `${m.name} (${MEDIA_KINDS[m.type]})`
          : m.name,
    })) ?? (value.mediaTypeId ? [{ value: value.mediaTypeId, label: `#${value.mediaTypeId}` }] : []);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs" htmlFor="zbx-url">
          {t("zbx_url")}
        </Label>
        <Input
          id="zbx-url"
          value={value.url}
          placeholder="https://zabbix.example.com/api_jsonrpc.php"
          onChange={(e) => set({ url: e.target.value })}
        />
      </div>

      <div>
        <Label className="text-xs" htmlFor="zbx-token">
          {t("zbx_token")}
        </Label>
        <Input
          id="zbx-token"
          type="password"
          value={value.token ?? ""}
          autoComplete="off"
          placeholder={value.tokenSet ? t("zbx_secret_kept") : ""}
          onChange={(e) => set({ token: e.target.value })}
        />
        <p className="mt-1 text-xs text-muted-foreground">{t("zbx_token_help")}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <Label className="text-xs" htmlFor="zbx-user">
            {t("zbx_user")}
          </Label>
          <Input
            id="zbx-user"
            value={value.user}
            autoComplete="off"
            onChange={(e) => set({ user: e.target.value })}
          />
        </div>
        <div className="flex-1">
          <Label className="text-xs" htmlFor="zbx-password">
            {t("zbx_password")}
          </Label>
          <Input
            id="zbx-password"
            type="password"
            value={value.password ?? ""}
            autoComplete="new-password"
            placeholder={value.passwordSet ? t("zbx_secret_kept") : ""}
            onChange={(e) => set({ password: e.target.value })}
          />
        </div>
      </div>

      <Button type="button" variant="outline" onClick={runTest} disabled={test.isPending}>
        {test.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Check className="mr-2 h-4 w-4" />
        )}
        {t("zbx_test")}
      </Button>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <Label className="text-xs" htmlFor="zbx-userid">
            {t("zbx_target_user")}
          </Label>
          <select
            id="zbx-userid"
            className={SELECT_CLASS}
            value={value.userId}
            onChange={(e) => set({ userId: e.target.value })}
          >
            <option value="">{t("zbx_choose")}</option>
            {userOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <Label className="text-xs" htmlFor="zbx-mediatypeid">
            {t("zbx_media_type")}
          </Label>
          <select
            id="zbx-mediatypeid"
            className={SELECT_CLASS}
            value={value.mediaTypeId}
            onChange={(e) => set({ mediaTypeId: e.target.value })}
          >
            <option value="">{t("zbx_choose")}</option>
            {mediaOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {info ? t("zbx_lists_loaded") : t("zbx_test_first")}
      </p>
    </div>
  );
};

export default ZabbixFields;
