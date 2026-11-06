import { beforeEach, expect, it, vi } from "vitest";
import { loginError } from "@/lib/loginError";

const mocks = vi.hoisted(() => ({ inventory: { data: [] as unknown, error: null as unknown }, reject: false }));
vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({
    from: (table: string) => {
      const answer = table === "inventory" ? mocks.inventory : { data: [], error: null };
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        then: (resolve: (value: unknown) => unknown, reject: (error: Error) => unknown) =>
          mocks.reject ? Promise.reject(new Error("offline")).then(resolve, reject) : Promise.resolve(answer).then(resolve, reject),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/projectorStates", () => ({ loadProjectorStates: async () => [] }));
vi.mock("@/lib/projectorPlaces", () => ({ loadProjectorClues: async () => null, projectorPlaces: () => ({}) }));
import { itemsSource } from "@/components/freshie/items/useItemsData";

beforeEach(() => { mocks.inventory = { data: [], error: null }; mocks.reject = false; });

it("distinguishes an incorrect password from a connection problem", () => {
  expect(loginError(Object.assign(new Error("Invalid login credentials"), { code: "invalid_credentials" }))).toMatch(/email or password is incorrect/i);
  expect(loginError(new TypeError("Failed to fetch"))).toMatch(/check your connection/i);
});

it("does not treat a failed puzzle query as zero pieces and recovers on retry", async () => {
  const source = itemsSource(1)();
  mocks.inventory = { data: null, error: { message: "offline" } };
  const failed = await source.load(undefined);
  expect(failed?.pieces).toBeNull();
  mocks.inventory = { data: [], error: null };
  const recovered = await source.load(failed);
  expect(recovered?.pieces).toEqual([]);
});

it("marks puzzle pieces unavailable when a request throws", async () => {
  mocks.reject = true;
  const failed = await itemsSource(1)().load(undefined);
  expect(failed?.pieces).toBeNull();
});
