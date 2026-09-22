import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES, changeLanguage } from "@/i18n";

const LanguageSwitcher = () => {
  const { i18n, t } = useTranslation();
  const current = i18n.language?.slice(0, 2) ?? "en";

  return (
    <Select value={current} onValueChange={changeLanguage}>
      <SelectTrigger
        className="h-11 w-auto gap-1.5 border-input bg-background/70 px-3 backdrop-blur sm:h-9"
        aria-label={t("language")}
      >
        <Languages className="h-4 w-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((l) => (
          <SelectItem key={l.code} value={l.code}>
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default LanguageSwitcher;
