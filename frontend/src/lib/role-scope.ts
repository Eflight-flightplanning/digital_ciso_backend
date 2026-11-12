/**
 * What a role is scoped to, for UI filters. The API already limits data to the role's clouds;
 * these helpers keep dropdowns in line with that so a scoped account never sees options it
 * cannot use.
 */
import { authStore } from "@/lib/auth";

export type FrameworkScope = "cis" | "nca" | "soc2" | "pci" | "iso" | "hipaa" | "nist" | null;

export function currentRoleName(): string {
  return String(authStore.getState().user?.role || "").toLowerCase();
}

export function isAdminRole(role = currentRoleName()): boolean {
  const u = authStore.getState().user;
  const readOnly = Boolean(u?.is_read_only) || /read-only|read only|readonly|auditor|viewer/.test(role);
  return !readOnly && (role.includes("admin") || role.includes("owner"));
}

/**
 * The compliance framework a role is limited to, from its name ("OCI & Oracle SaaS CIS Read-Only
 * Auditor" -> "cis"). Null = every framework. "All Clouds" is about clouds, not frameworks, so it
 * does not lift a framework limit.
 */
export function roleFrameworkScope(role = currentRoleName()): FrameworkScope {
  if (isAdminRole(role)) return null;
  const r = role.replace(/all (clouds|providers)/g, "");
  if (/\ball (compliance )?frameworks?\b/.test(r)) return null;
  if (/\bcis\b/.test(r)) return "cis";
  if (/\b(nca|ecc|ccc)\b/.test(r)) return "nca";
  if (/\bsoc ?2?\b/.test(r)) return "soc2";
  if (/\bpci/.test(r)) return "pci";
  if (/\biso/.test(r)) return "iso";
  if (/\bhipaa\b/.test(r)) return "hipaa";
  if (/\bnist\b/.test(r)) return "nist";
  return null;
}

/** Whether a compliance id / framework name belongs to the scope ("cis_2.0_oraclecloud" -> cis). */
export function frameworkInScope(idOrName: string, scope: FrameworkScope): boolean {
  if (!scope) return true;
  const s = idOrName.toLowerCase();
  if (scope === "soc2") return s.includes("soc");
  if (scope === "nca") return s.includes("nca") || s.includes("ecc") || s.includes("ccc");
  return s.includes(scope);
}
