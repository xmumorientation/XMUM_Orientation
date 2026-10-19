import { describe, expect, it } from 'vitest';
import { newlyPowered, readActivationJourney, JOURNEY_MAX_AGE_MS } from '../src/lib/activation-journey';

describe('activation to map journey', () => {
  it('replays every newly powered zone, including custom keys powering multiple zones', () => {
    expect(newlyPowered({west:1,central:0,east:0}, {west:1,central:1,east:1})).toEqual(['central','east']);
  });
  it('does not invent a power-up when an override or another key already powered the park', () => {
    expect(newlyPowered({west:1,central:1,east:1}, {west:1,central:1,east:1})).toEqual([]);
  });
  it('accepts a recent journey and removes invalid or duplicated zones', () => {
    expect(readActivationJourney(JSON.stringify({at:100,zones:['east','east','fake']}),101)).toEqual(['east']);
  });
  it('rejects stale, future and malformed journeys', () => {
    for (const value of ['bad', 'null', '{"zones":["west"]}', JSON.stringify({at:1,zones:['west']})]) {
      expect(readActivationJourney(value,JOURNEY_MAX_AGE_MS+2)).toEqual([]);
    }
    expect(readActivationJourney(JSON.stringify({at:10,zones:['west']}),9)).toEqual([]);
  });
});
