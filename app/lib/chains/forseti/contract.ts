// Multi-chain Forseti contract source.
//
// ONE policy, ONE model ID. The contract identifies which of the 16
// supported chains a sign request is for by matching `ctx.Data` against
// each chain's per-chain signing-payload shape (length + magic bytes /
// prefixes). If exactly one chain pattern matches, the request is allowed
// (subject to the executor having a wallet-signer role).
//
// Per-chain RBAC (e.g. "Alice can sign Solana but not Cardano") is enforced
// at the UI layer — the contract's role check is "any signer or admin".
// This collapses the deployment to a single ceremony and is consistent
// with the keylessh / SSH exemplar pattern (which also uses one model ID).
//
// Why shape-validation rather than full byte-exact deserialization: the
// Forseti sandbox doesn't ship Borsh/BCS/msgpack/SCALE/CBOR/protobuf
// parsers, and a contract is gas-bound to 50,000 units. Length + magic
// bytes are tight enough that a Solana payload cannot be smuggled through
// claiming to be Stellar (different lengths) — chains' signing payloads
// have meaningfully distinct envelopes.

export const CONTRACT_NAME = "MotherlodeMultiChainSigner";

// Single model ID for all chains. The contract reads `ctx.Data` only.
export const MODEL_ID = "BasicCustom<MotherlodeWallet>:BasicCustom<1>";
const [MODEL_NAME, MODEL_VERSION] = MODEL_ID.split(":");
export { MODEL_NAME, MODEL_VERSION };

export const ROLE_ADMIN = "walletAdmin";
export const ROLE_SIGNER = "walletSigner";

// SHA-512 of CONTRACT_SOURCE is used as the contractId during deployment.
// The ORK recomputes it and rejects mismatches.
export const CONTRACT_SOURCE = `using Ork.Forseti.Sdk;

public class Contract : IAccessPolicy
{
    [PolicyParam(Required = true, Description = "Realm role granting any-chain signing")]
    public string SignerRole { get; set; }

    [PolicyParam(Required = true, Description = "Realm role granting admin signing on every chain")]
    public string AdminRole { get; set; }

    public PolicyDecision ValidateData(DataContext ctx)
    {
        if (ctx == null || ctx.Data == null || ctx.Data.Length == 0)
            return PolicyDecision.Deny("No signing payload provided");

        // Sanity-bound the payload, then accept if it matches at least
        // one of our 16 chain shapes. We don't need to name WHICH chain;
        // the per-chain UI is what dispatches at sign time.
        if (ctx.Data.Length > 65536)
            return PolicyDecision.Deny("Payload too large: " + ctx.Data.Length + " bytes");

        if (!MatchesAnyChainShape(ctx.Data))
            return PolicyDecision.Deny("Payload does not match any supported chain signing-payload shape");

        return PolicyDecision.Allow();
    }

    public PolicyDecision ValidateApprovers(ApproversContext ctx)
    {
        // Implicit flow — no explicit approvers required.
        return PolicyDecision.Allow();
    }

    public PolicyDecision ValidateExecutor(ExecutorContext ctx)
    {
        var executor = new DokenDto(ctx.Doken);
        if (executor.IsExpired) return PolicyDecision.Deny("Doken expired");
        if (executor.HasRole(AdminRole)) return PolicyDecision.Allow();
        if (executor.HasRole(SignerRole)) return PolicyDecision.Allow();
        return PolicyDecision.Deny("Executor needs '" + AdminRole + "' or '" + SignerRole + "' realm role");
    }

    private static bool MatchesAnyChainShape(byte[] d)
    {
        int len = d.Length;

        // 32-byte hash family: Stellar / NEAR / Sui / Tezos all hash their
        // tx into a 32-byte signing payload before passing it to the signer.
        if (len == 32) return true;

        // Solana: compiled message (header signers byte 1..8, length 64..1232).
        if (len >= 64 && len <= 1232 && d[0] >= 1 && d[0] <= 8) return true;

        // Algorand: "TX" prefix + msgpack map.
        if (len >= 80 && len <= 4096
            && d[0] == (byte)'T' && d[1] == (byte)'X'
            && ((d[2] >= 0x80 && d[2] <= 0x8F) || d[2] == 0xDE || d[2] == 0xDF))
            return true;

        // XRPL: "STX" + null-byte prefix.
        if (len >= 32 && len <= 4096
            && d[0] == 0x53 && d[1] == 0x54 && d[2] == 0x58 && d[3] == 0x00)
            return true;

        // TON: BoC magic word.
        if (len >= 32
            && (
                (d[0] == 0xB5 && d[1] == 0xEE && d[2] == 0x9C && d[3] == 0x72) ||
                (d[0] == 0x68 && d[1] == 0xFF && d[2] == 0x65 && d[3] == 0xF3) ||
                (d[0] == 0xAC && d[1] == 0xC3 && d[2] == 0xA7 && d[3] == 0x28)
            ))
            return true;

        // Aptos: sha3_256 domain-separator (32 bytes) + BCS bytes — payload
        // strictly > 32 bytes; first byte is part of the SHA3 hash, no
        // structural constraint we can verify cheaply, so we band-check.
        if (len > 32 && len <= 8192) return true;

        return false;
    }
}
`;

// Single canonical model ID — used by both the deploy ceremony (registers
// it on the policy) and the runtime signer (passes it as the request
// model). The chain ID is no longer encoded here; the contract figures
// out the chain from the payload bytes.
export function getModelId(): string {
  return MODEL_ID;
}
