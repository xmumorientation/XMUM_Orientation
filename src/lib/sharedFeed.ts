"use client";

import { useCallback, useSyncExternalStore } from "react";

// One live data source shared by every component on the page that reads it.
// Before, each caller of useConfig/useGroup/useDay2State ran its own query,
// realtime channel and poll, so a page with three callers did all of it three
// times. Now the first reader starts one load + one channel + one poll, later
// readers reuse them, and the last one to leave stops them.
//
// The last value is kept after everyone leaves, so going back to a page paints
// at once (and reloads in the background). Teardown waits a moment, so a route
// change (old page unmounts, new page mounts) or React Strict Mode does not
// close and reopen the channel.

export interface FeedSource<T> {
  /** Fetch the current value (given the last one). Return undefined to keep the previous one (e.g. on an error). */
  load: (current: T | undefined) => Promise<T | undefined>;
  /** Open the realtime channel. Call reload() on a change, or set() with a value from the payload. Returns the teardown. */
  listen?: (reload: () => void, set: (value: T) => void) => () => void;
  /** Also reload this often (ms), as a backstop for missed realtime events. */
  pollMs?: number;
  /** Reload when the tab comes back to the foreground. Default true. */
  reloadOnVisible?: boolean;
}

interface Entry<T> {
  value: T | undefined;
  listeners: Set<() => void>;
  source: FeedSource<T>;
  stop: (() => void) | null;
  stopTimer: ReturnType<typeof setTimeout> | null;
  reload: () => void;
  /** Opens the channel and timers; sets stop while running. */
  start: () => void;
}

const STOP_DELAY_MS = 2000;
const entries = new Map<string, Entry<unknown>>();

function getEntry<T>(key: string, makeSource: () => FeedSource<T>): Entry<T> {
  let entry = entries.get(key) as Entry<T> | undefined;
  if (entry) return entry;

  let request = 0;
  const e: Entry<T> = {
    value: undefined,
    listeners: new Set(),
    source: makeSource(),
    stop: null,
    stopTimer: null,
    reload: () => {
      const revision = ++request;
      void e.source.load(e.value).then(
        (value) => {
          // A slower, older request must not overwrite a newer answer.
          if (revision === request && value !== undefined) set(value);
        },
        () => {
          // Keep the last value; the next event or poll tries again.
        },
      );
    },
    start: () => {
      e.reload();
      const unlisten = e.source.listen?.(e.reload, (value) => {
        ++request; // a realtime value is newer than any load still in flight
        set(value);
      });
      // Polls skip while the tab is hidden (a phone in another app); reloadOnVisible catches up.
      const poll = e.source.pollMs
        ? setInterval(() => {
            if (document.visibilityState === "visible") e.reload();
          }, e.source.pollMs)
        : null;
      const onVisible = () => {
        if (document.visibilityState === "visible") e.reload();
      };
      const watchVisible = e.source.reloadOnVisible !== false;
      if (watchVisible) document.addEventListener("visibilitychange", onVisible);
      e.stop = () => {
        unlisten?.();
        if (poll) clearInterval(poll);
        if (watchVisible) document.removeEventListener("visibilitychange", onVisible);
        e.stop = null;
      };
    },
  };
  function set(value: T) {
    e.value = value;
    for (const l of e.listeners) l();
  }
  entry = e;
  entries.set(key, entry as Entry<unknown>);

  return entry;
}

function subscribe<T>(entry: Entry<T>, listener: () => void) {
  entry.listeners.add(listener);
  if (entry.stopTimer) {
    clearTimeout(entry.stopTimer);
    entry.stopTimer = null;
  }
  if (!entry.stop) entry.start();
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size > 0 || entry.stopTimer) return;
    entry.stopTimer = setTimeout(() => {
      entry.stopTimer = null;
      if (entry.listeners.size === 0) entry.stop?.();
    }, STOP_DELAY_MS);
  };
}

/** Reload a feed now (e.g. right after this client changed the data). No-op if nobody reads it. */
export function reloadSharedFeed(key: string) {
  entries.get(key)?.reload();
}

/** Show a value at once (an optimistic update), before the reload that follows confirms it. No-op if nobody reads it. */
export function setSharedFeed<T>(key: string, update: (current: T | undefined) => T) {
  const entry = entries.get(key) as Entry<T> | undefined;
  if (!entry) return;
  entry.value = update(entry.value);
  for (const l of entry.listeners) l();
}

const noop = () => () => {};
const none = () => undefined;

/**
 * Read a shared feed. `key` names the data (include any parameter, e.g. the
 * group id); pass null to read nothing. `makeSource` runs once per key, on
 * first use, so it must not depend on anything outside the key.
 * Returns undefined until the first load finishes.
 */
export function useSharedFeed<T>(key: string | null, makeSource: () => FeedSource<T>): T | undefined {
  const entry = key ? getEntry(key, makeSource) : null;
  const sub = useCallback((listener: () => void) => (entry ? subscribe(entry, listener) : noop()), [entry]);
  const snap = useCallback(() => entry?.value, [entry]);
  return useSyncExternalStore(sub, entry ? snap : none, none);
}
