import { describe, expect, it } from 'vitest';
import { activateNfc, guardianStatus } from '../src/lib/nfc-flow';

// Remote calls are the boundary. The production adapter must never retry a
// denied canonical redemption against the weaker legacy endpoint.
describe('NFC integration', () => {
  it('uses the verified-handover redemption for ordinary cards', async () => {
    const result = await activateNfc(async (name) => name === 'fn_nfc_v2_redeem_nfc_card'
      ? { data: { ok: true, group_id: 10, location: 'TF' }, error: null }
      : { data: null, error: { code: 'P0001', message: 'SET_NOT_REDEEMED' } }, 'hash', false);
    expect(result.data).toMatchObject({ ok: true, group_id: 10 });
  });
  it('never falls back on a failed verification or permission check', async () => {
    let legacyActivated = false;
    const result = await activateNfc(async (name) => {
      if (name === 'fn_activate_projector') { legacyActivated = true; return { data: { ok: true }, error: null }; }
      return { data: null, error: { code: 'P0001', message: 'NFC_HANDOVER_NOT_VERIFIED' } };
    }, 'hash', false);
    expect(result.error?.message).toBe('NFC_HANDOVER_NOT_VERIFIED');
    expect(legacyActivated).toBe(false);
  });
  it('preserves explicit test-run activation without requiring real puzzle pieces', async () => {
    const result = await activateNfc(async (name) => name === 'fn_activate_projector'
      ? { data: { ok: true }, error: null }
      : { data: null, error: { message: 'NFC_PUZZLES_INCOMPLETE' } }, 'hash', true);
    expect(result.data?.ok).toBe(true);
  });
  it('supports an original-schema installation only when the versioned RPC does not exist', async () => {
    const result = await activateNfc(async (name) => name === 'fn_nfc_v2_redeem_nfc_card'
      ? { data: null, error: { code: 'PGRST202', message: 'function not found' } }
      : { data: { ok: true }, error: null }, 'hash', false);
    expect(result.data?.ok).toBe(true);
  });
  it('treats a persisted handover as verified before activation, without pretending pieces are consumed', () => {
    expect(guardianStatus({pieces:5,total:5,complete:true,redeemed:false,handover_verified:true,projector_activated:false}))
      .toMatchObject({verified:true,redeemed:false,projector_activated:false});
  });
  it('does not invent successful handover from a complete set', () => {
    expect(guardianStatus({pieces:5,total:5,complete:true,redeemed:false,projector_activated:false}).verified).toBe(false);
  });
});
