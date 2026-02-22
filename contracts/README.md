# PrivatePay Treasury Contract

Single contract that holds the app’s treasury logic plus **meta-address registry**, **stealth payment** bookkeeping, and a **DarkPool-style commitment pool** on Monad Testnet.

## What it does

### 1. Treasury (simple flow)
- **Receives MON** – Senders send MON to this contract (frontend uses it as `VITE_MONAD_TREASURY_ADDRESS`).
- **Withdrawals** – Only the **relayer** (or owner) can call `withdraw(to, amount)`. Your backend checks Supabase, then calls `withdraw(userAddress, amount)`.

### 2. Meta address registry (for infinite stealth addresses)
- Each user has one **meta address** on-chain: `(spendPub, viewPub)` (BIP 0352 / EIP 5564 style).
- Senders read it via `getMetaAddress(userId)`, then **off-chain** derive a one-time **stealth address** using ECDH + ephemeral key. So one meta → many stealth addresses (infinite).
- **setMetaAddress(userId, spendPub, viewPub)** – Relayer/Owner sets meta for a user (e.g. `userId = keccak256(username)`).

### 3. Stealth payments (keyed by recipient + ephemeral)
- **depositToStealth(recipientId, ephemeralPub)** – Sender pays MON into a “stealth slot” identified by `(recipientId, ephemeralPub)` instead of a raw address. No recipient address on-chain until withdrawal.
- **withdrawStealth(recipientId, ephemeralPub, to, amount)** – Relayer releases that balance to `to` after verifying the recipient off-chain (e.g. signature from stealth key).

### 4. DarkPool-style commitment pool (mixer)
- **depositToPool(commitment)** – Deposit MON under a commitment (e.g. `hash(secret)`). No address tied to the deposit on-chain.
- **withdrawFromPoolWithApproval(nullifier, amount, to, signature)** – Withdraw using a nullifier and a **relayer signature** so the contract trusts the relayer approved this withdrawal. Same nullifier cannot be reused. (A ZK proof + verifier can replace the relayer later for full privacy.)

---

## Deploy (easy)

1. **Install deps** (if not already):
   ```bash
   npm install
   ```

2. **Set in `.env`**:
   - `DEPLOYER_PRIVATE_KEY` – Key that will pay gas and own the contract.
   - `RELAYER_ADDRESS` – Address allowed to call `withdraw`, `withdrawStealth`, and to sign pool withdrawals. Derive from your backend key: `new ethers.Wallet(PRIVATE_KEY).address`.

3. **Compile and deploy**:
   ```bash
   npm run contract:compile
   npm run contract:deploy
   ```

4. **Use the deployed address**:
   - Set `VITE_MONAD_TREASURY_ADDRESS=<deployed address>` in `.env`.

---

## Contract API (summary)

| Function | Who | Description |
|----------|-----|-------------|
| **Treasury** | | |
| `receive()` | Anyone | Accept MON. |
| `withdraw(to, amount)` | Relayer/Owner | Send `amount` wei to `to`. |
| `withdrawBatch(tos, amounts)` | Relayer/Owner | Batch withdraw. |
| **Meta addresses** | | |
| `setMetaAddress(userId, spendPub, viewPub)` | Relayer/Owner | Set meta address for user (33 or 65 byte pubkeys). |
| `getMetaAddress(userId)` | Anyone | Get (spendPub, viewPub). |
| **Stealth** | | |
| `depositToStealth(recipientId, ephemeralPub)` | Anyone | Pay MON into stealth slot. |
| `withdrawStealth(recipientId, ephemeralPub, to, amount)` | Relayer/Owner | Release stealth balance to `to`. |
| **Pool (mixer)** | | |
| `depositToPool(commitment)` | Anyone | Deposit under commitment. |
| `withdrawFromPoolWithApproval(nullifier, amount, to, signature)` | Anyone | Withdraw with relayer-signed approval; nullifier used once. |
| **Admin** | | |
| `setRelayer(addr)` | Owner | Change relayer. |
| `transferOwnership(addr)` | Owner | Change owner. |

---

## Backend integration

- **Simple flow**: Check balance in Supabase, then `treasury.withdraw(destinationAddress, ethers.parseEther(amount))` with relayer key.
- **Stealth flow**: After verifying recipient (e.g. signature from stealth key), call `treasury.withdrawStealth(recipientId, ephemeralPub, destinationAddress, amount)`.
- **Pool flow**: Relayer signs `(nullifier, amount, to, chainId)` with the relayer key; user (or backend) calls `withdrawFromPoolWithApproval(nullifier, amount, to, signature)`.
