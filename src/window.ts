import type { DayWindow } from "./types";

const TZ_OFFSET_HOURS = -3; // horário de Brasília; sem horário de verão desde 2019
const HOUR = 3_600_000;

/** Janela de 00:00 a 23:59 (horário de Brasília) do dia a ser resumido. */
export function resolveWindow(now: Date = new Date()): DayWindow {
  const override = process.env.TARGET_DATE?.trim();
  let targetUtcMidnight: number;

  if (override) {
    targetUtcMidnight = Date.parse(`${override}T00:00:00Z`);
    // Date.parse aceita dias inexistentes (2026-02-31 vira 03/03); o round-trip rejeita
    const exists = !Number.isNaN(targetUtcMidnight) && new Date(targetUtcMidnight).toISOString().slice(0, 10) === override;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(override) || !exists) {
      throw new Error(`TARGET_DATE inválida: ${override} (esperado AAAA-MM-DD de uma data existente)`);
    }
  } else {
    const local = new Date(now.getTime() + TZ_OFFSET_HOURS * HOUR);
    const weekday = local.getUTCDay();
    // segunda → sexta; domingo → sexta; demais → ontem
    const daysBack = weekday === 1 ? 3 : weekday === 0 ? 2 : 1;
    targetUtcMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysBack);
  }

  const since = new Date(targetUtcMidnight - TZ_OFFSET_HOURS * HOUR);
  const until = new Date(since.getTime() + 24 * HOUR - 1);
  const label = new Date(targetUtcMidnight).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const date = new Date(targetUtcMidnight).toISOString().slice(0, 10);
  return { since, until, label, date };
}
