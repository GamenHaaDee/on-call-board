import { initials } from "@/lib/oncall";
import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  /** "duty" staat op het groene vlak van de actieve dienst. */
  tone?: "neutral" | "duty";
  size?: "sm" | "lg";
  className?: string;
}

/**
 * Initialen in een vlak. Bewust lokaal getekend en niet opgehaald bij een
 * avatardienst: dan zouden de namen van collega's bij elke paginaweergave naar
 * een externe partij gaan, en op een afgeschermd netwerk zou er niets laden.
 *
 * De kleur draagt betekenis en is geen versiering: groen hoort alleen bij wie
 * er dienst heeft, de rest blijft neutraal.
 */
const Avatar = ({ name, tone = "neutral", size = "sm", className }: AvatarProps) => (
  <span
    aria-hidden="true"
    className={cn(
      "flex shrink-0 select-none items-center justify-center rounded-xl font-semibold",
      size === "lg" ? "h-16 w-16 rounded-2xl text-xl" : "h-11 w-11 text-sm",
      tone === "duty" ? "bg-white text-on-call" : "bg-muted text-foreground",
      className
    )}
  >
    {initials(name)}
  </span>
);

export default Avatar;
