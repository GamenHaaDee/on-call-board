import { useSyncExternalStore } from "react";

export interface Branding {
  orgName: string;
  logoUrl: string;
}

const KEY = "onduty-branding";
const listeners = new Set<() => void>();

function read(): Branding {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { orgName: parsed.orgName ?? "", logoUrl: parsed.logoUrl ?? "" };
  } catch {
    return { orgName: "", logoUrl: "" };
  }
}

let current = read();

export function getBranding(): Branding {
  return current;
}

export function setBranding(next: Partial<Branding>) {
  current = { ...current, ...next };
  localStorage.setItem(KEY, JSON.stringify(current));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBranding(): Branding {
  return useSyncExternalStore(subscribe, getBranding, getBranding);
}
