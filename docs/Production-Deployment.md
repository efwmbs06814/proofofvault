# Proof of Vault Production Deployment

## Topology

- X Layer mainnet contracts
- POV token + lockbox deployed from the production wallet
- Fastify API on a dedicated Linux server
- Next.js frontend on Vercel
- Vercel rewrite proxy from `/backend/*` to the API server

## Mainnet Network

- EVM chain id: `196`
- OKX ChainIndex: `196`
- RPC: `https://rpc.xlayer.tech`
- Explorer: `https://www.oklink.com/xlayer`

## Tokenomics Defaults

- `POV` is deployed with a fixed supply
- `99%` is locked in `TokenLockbox`
- `1%` remains in the treasury for agent staking allocation and rewards
- `PROOF_OF_VAULT_AGENT_REGISTRATION_STAKE_AMOUNT` can automatically seed each newly judge-listed agent into `AgentStaking`
- agent withdrawals remain disabled by default unless governance explicitly enables them
- native OKB setup deposit minimum remains configurable on-chain and currently defaults to `0.01 OKB`

## API Server

1. Copy `apps/api/.env.example` to `apps/api/.env.production`.
2. Fill all production values:
   - Postgres connection
   - OKX credentials
   - IPFS pinning credentials
   - X Layer mainnet RPC and deployed contract addresses
   - auth and operator secrets
3. Run:

```bash
sudo bash ops/server/deploy-api.sh
```

4. Verify:

```bash
systemctl status proof-of-vault-api
curl http://127.0.0.1:4000/health
```

## Vercel Frontend

Set these environment variables in the Vercel project:

- `NEXT_PUBLIC_API_URL=/backend`
- `API_PROXY_TARGET=http://<api-server-host>:4000`
- `NEXT_PUBLIC_X_LAYER_RPC_URL=https://rpc.xlayer.tech`
- `NEXT_PUBLIC_PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID=196`
- `NEXT_PUBLIC_PROOF_OF_VAULT_OKX_CHAIN_INDEX=196`
- `NEXT_PUBLIC_PROOF_OF_VAULT_EXPLORER_URL=https://www.oklink.com/xlayer`
- `NEXT_PUBLIC_PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS=<mainnet-vault-factory>`
- `NEXT_PUBLIC_PROOF_OF_VAULT_POV_TOKEN_ADDRESS=<mainnet-pov-token>`

The Vercel rewrite keeps the browser on HTTPS while proxying API traffic to the backend service.

## Launch Checklist

- contracts deployed and verified on X Layer mainnet
- API `/health` returns `realDemoReady=true`
- Vercel frontend reads the mainnet runtime config
- agent skill examples reference `chainId=196`
- no production provider is set to `mock`
- no production payload provider is set to `local`
