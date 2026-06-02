/** Initialen voor de avatar: "Quinten Oostermann" -> "QO", "Quinten" -> "QU". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.trim().slice(0, 2) || "?").toUpperCase();
}

/** Stabiele kleur-hue per naam. */
export function avatarHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `${f(0)}${f(8)}${f(4)}`;
}

/**
 * URL naar een avatar via ui-avatars.com, met een stabiele, ingetogen
 * (zakelijke) achtergrondkleur per naam en witte initialen.
 */
export function avatarUrl(name: string): string {
  const bg = hslToHex(avatarHue(name), 52, 42);
  const params = new URLSearchParams({
    name,
    background: bg,
    color: "ffffff",
    bold: "true",
    format: "svg",
  });
  return `https://ui-avatars.com/api/?${params.toString()}`;
}
