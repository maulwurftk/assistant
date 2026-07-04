import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Escaped Nutzer-Strings vor der Interpolation in HTML (v. a. ausgehende
 * E-Mails). Verhindert HTML-/Link-Injection über Felder wie full_name,
 * Slot-Titel oder Beschreibungen (Security-Scan M4).
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
