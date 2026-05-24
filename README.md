# Motherlode

A multi-chain wallet covering 16 chains (Solana, Stellar, XRPL, Cardano, Polkadot,
Cosmos, TON, Aptos, Sui, NEAR, Hedera, Algorand, Tezos, Zcash, IOTA, Monero), with
authentication and threshold key signing handled by [TideCloak](https://tide.org).
Built on Next.js 16 + React 19.

## Prerequisites

- **Node.js 20.9+** and npm (the build runs on the webpack compiler — see the
  `--webpack` flag in the npm scripts).
- **Docker** — `npm run init` runs a TideCloak dev container.
- **curl** and **jq** — used by the init script.
- A free port **8080** (TideCloak) and **3000** (the app).

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Bootstrap TideCloak

This is a **one-time, interactive** step. It starts the TideCloak container,
creates the realm/client, and exports the adapter config to
`data/tidecloak.json` (gitignored — the app reads it at runtime).

```bash
npm run init
```

Partway through, the script prints an **invite link**. Open it in your browser
and link your Tide account to the `admin` user. The script polls until the
account is linked, then finishes approving change-sets and exports the config.

When it prints `Init complete!`, TideCloak is running on
`http://localhost:8080` (admin console login: `admin` / `password`) and
`data/tidecloak.json` exists.

Useful overrides (defaults shown):

| Env var          | Default                  | Purpose                         |
| ---------------- | ------------------------ | ------------------------------- |
| `TIDECLOAK_URL`  | `http://localhost:8080`  | TideCloak base URL              |
| `REALM_NAME`     | `motherlode`             | Realm to create                 |
| `CLIENT_NAME`    | `motherlode-client`      | OIDC client id                  |
| `CLIENT_APP_URL` | `http://localhost:3000`  | App origin (redirect URIs)      |
| `ADMIN_EMAIL`    | `info@tide.org`          | Email for the admin user        |

To start over from scratch, wipe the embedded DB and re-run init:

```bash
docker rm -f tidecloak
sudo rm -f data/keycloakdb*
npm run init
```

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with the Tide
account you linked during init.

### 4. Sign the wallet policy

Before any transaction can be signed, an admin must deploy and sign the wallet
policy. Navigate to:

```
http://localhost:3000/admin/deploy-policy
```

This page hashes the Forseti contract, drives ORK approval to obtain a VVK
signature, and commits the signed policy (`POST /api/wallet/policy`). Until this
ceremony completes, transaction signing fails because the runtime signer has no
committed policy to fetch.

## Funding testnet wallets (optional)

All 16 chain addresses are derived from the realm's Ed25519 key in
`data/tidecloak.json`. To auto-fund the chains with programmatic faucets and
print addresses + faucet URLs for the rest:

```bash
node scripts/fund-test-wallets.mjs
```

Some chains need a manually provisioned account id. Set these in a `.env.local`
file (all optional — features degrade gracefully without them):

| Env var                          | Used by      |
| -------------------------------- | ------------ |
| `NEXT_PUBLIC_NEAR_ACCOUNT_ID`    | NEAR adapter |
| `NEXT_PUBLIC_HEDERA_ACCOUNT_ID`  | Hedera adapter |
| `NEXT_PUBLIC_BLOCKFROST_PROJECT_ID` / `NEXT_PUBLIC_RPC_CARDANO` | Cardano adapter |
| `XRPL_RPC_URL`                   | XRPL proxy   |

## Production build

```bash
npm run build
npm start
```

`npm start` still expects `data/tidecloak.json` to be present. Alternatively,
provide the adapter config inline via the `CLIENT_ADAPTER` env var (full JSON
string) instead of the file.

## Project layout

- `app/` — Next.js App Router (UI, API routes, chain adapters under
  `app/lib/chains/`).
- `scripts/init-tidecloak.sh` — TideCloak bootstrap (`npm run init`).
- `scripts/fund-test-wallets.mjs` — testnet faucet helper.
- `data/` — runtime config (`tidecloak.json`, `wallet-policy.json`).

> Note: this project pins a modified build of Next.js. The npm scripts already
> pass the required `--webpack` flag — run them via `npm run`, not raw `next`.
