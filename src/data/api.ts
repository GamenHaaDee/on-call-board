import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OnCallEntry } from "./onCallSchedule";

export interface Person {
  index: number;
  name: string;
  phone: string;
}

// Vorm zoals de backend hem teruggeeft (zie server/rotation.ts).
interface ApiAssignment {
  id: number;
  week_start: string;
  week_end: string;
  person_id: number | null;
  name: string;
  phone: string;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// DB geeft DATETIME als "2026-03-02 12:00:00"; maak er ISO van zodat
// date-fns parseISO het begrijpt.
const toIso = (s: string) => s.replace(" ", "T");

function toEntry(a: ApiAssignment): OnCallEntry {
  return {
    id: String(a.id),
    name: a.name,
    phone: a.phone,
    startDate: toIso(a.week_start),
    endDate: toIso(a.week_end),
  };
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Request mislukt: ${res.status}`);
  return res.json() as Promise<T>;
}

export function useCurrentOnCall() {
  return useQuery({
    queryKey: ["oncall", "current"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/oncall/current`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Request mislukt: ${res.status}`);
      return toEntry(await res.json());
    },
  });
}

export function useOnCallSchedule(weeks = 8) {
  return useQuery({
    queryKey: ["oncall", "schedule", weeks],
    queryFn: async () => {
      const data = await fetchJson<ApiAssignment[]>(`/api/oncall/schedule?weeks=${weeks}`);
      return data.map(toEntry);
    },
  });
}

// --- Admin ---

const TOKEN_KEY = "onduty-admin-token";
export const getAdminToken = () => localStorage.getItem(TOKEN_KEY) ?? "";
export const setAdminToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);

export function useAdminStatus() {
  return useQuery({
    queryKey: ["admin", "status"],
    queryFn: () => fetchJson<{ authRequired: boolean }>("/api/admin/status"),
  });
}

export function usePeople() {
  return useQuery({
    queryKey: ["people"],
    queryFn: () => fetchJson<Person[]>("/api/people"),
  });
}

export function useUpdateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; name: string; phone: string }) => {
      const res = await fetch(`${API_BASE}/api/oncall/${vars.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": getAdminToken(),
        },
        body: JSON.stringify({ name: vars.name, phone: vars.phone }),
      });
      if (res.status === 401) throw new Error("Niet geautoriseerd — controleer het admin-token.");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Opslaan mislukt: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oncall"] });
    },
  });
}
