import type { FunfairPower, FunfairZone } from './funfair';

export const ACTIVATION_JOURNEY_KEY = 'vortexa:activation-journey';
export const JOURNEY_MAX_AGE_MS = 5 * 60_000;
const zones: FunfairZone[] = ['west', 'central', 'east'];

/** Compare public zone power, so custom keys, all/any rules and overrides count. */
export function newlyPowered(before: FunfairPower, after: FunfairPower): FunfairZone[] {
  return zones.filter(zone => before[zone] === 0 && after[zone] > 0);
}

export function readActivationJourney(value: string | null, now: number): FunfairZone[] {
  try {
    const data = JSON.parse(value ?? 'null');
    if (!data || !Number.isFinite(data.at) || now < data.at || now - data.at > JOURNEY_MAX_AGE_MS || !Array.isArray(data.zones)) return [];
    return zones.filter(zone => data.zones.includes(zone));
  } catch { return []; }
}
