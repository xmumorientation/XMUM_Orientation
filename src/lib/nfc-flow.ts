export type RpcResult = { data: Record<string, unknown> | null; error: { code?: string; message: string } | null };
export type NfcRpc = (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

export async function activateNfc(rpc: NfcRpc, tokenHash: string, testRun: boolean): Promise<RpcResult> {
  if (testRun) return rpc('fn_activate_projector', { p_token_hash: tokenHash });
  const result = await rpc('fn_nfc_v2_redeem_nfc_card', {
    p_token_hash: tokenHash, p_request_id: crypto.randomUUID(),
  });
  // Only an installation without v2 may use the old contract. A denied
  // permission, verification or inventory check must never weaken the path.
  return result.error?.code === 'PGRST202'
    ? rpc('fn_activate_projector', { p_token_hash: tokenHash })
    : result;
}

export type PuzzleStatus = {
  pieces: number; total: number; complete: boolean; redeemed: boolean;
  projector_activated: boolean; handover_verified?: boolean;
};
export function guardianStatus(status: PuzzleStatus) {
  return { ...status, verified: status.redeemed || status.handover_verified === true };
}
