# DAOvault Smart Contract Payment Guide

This document explains how to test and deploy the DAOvault payment contract safely.

> Important: the current `DAOvaultActivation.sol` contract is a basic activation-payment receiver. It transfers an approved ERC-20 token from the user to a configured treasury and emits an `Activated` event. It does **not** yet implement the complete 20-level commission, reward distribution, or withdrawal engine.

## 0. Which IDE should be used?

For the first deployment, use **Remix IDE in the browser**:

```text
https://remix.ethereum.org
```

Remix is recommended here because it needs no local blockchain installation and connects directly to MetaMask. The Solidity file is compiled in Remix, and MetaMask signs the deployment transaction.

Do not deploy the `.sol` file from VS Code, the Node.js backend, or the frontend dev server. Those tools can edit and test the code, but the contract must be deployed through a blockchain tool such as Remix, Hardhat, or Foundry.

### Exact Remix navigation

```text
Remix IDE
  → File Explorer
  → Upload File
  → contracts/DAOvaultActivation.sol
  → Solidity Compiler
  → choose compiler 0.8.20
  → Compile DAOvaultActivation.sol
  → Deploy & Run Transactions
  → Environment: Browser Extension
  → Provider: MetaMask
  → choose DAOvaultActivation
  → fill constructor values
  → Deploy
  → approve in MetaMask
```

### What each tool does

| Tool | Responsibility |
| --- | --- |
| VS Code | Edit the Solidity, frontend, and backend files. |
| Remix IDE | Compile and deploy the contract for the first test. |
| MetaMask | Select the network and sign deployment/payment transactions. |
| BSC Testnet | Safe testing blockchain using valueless test tokens. |
| BscScan Testnet | Verify the deployment, transactions, and events. |
| Node/Express backend | Read and validate on-chain events; it does not deploy user payments. |
| PostgreSQL/Prisma | Store verified application records after blockchain confirmation. |

### Remix VM versus Browser Extension

Use `Remix VM (Osaka)` only for a local compile/deploy smoke test. It creates a temporary local chain inside Remix and does not create a public contract address.

Use `Browser Extension → MetaMask` for the actual BSC Testnet deployment. This creates a public contract address on BSC Testnet and requires tBNB for gas.

For production, use the same Remix process with MetaMask switched to BSC Mainnet only after the contract has been reviewed and audited.

## 1. Payment flow

The intended decentralized payment flow is:

```text
User wallet
   |
   | 1. approve(paymentContract, activationAmount)
   v
Payment smart contract
   |
   | 2. activate(sponsor)
   v
Treasury wallet
   |
   v
Backend reads the Activated event and updates the dashboard
```

The user's private key never goes to the backend. MetaMask signs both transactions.

## 2. Important addresses

These addresses have different purposes:

| Address | Meaning |
| --- | --- |
| `USDT_CONTRACT_ADDRESS` | The BEP-20 token contract address. It is not a company wallet. |
| `COMPANY_WALLET_ADDRESS` | The treasury wallet that receives payment. Use a public address only. |
| `PAYMENT_CONTRACT_ADDRESS` | The address created after deploying `DAOvaultActivation.sol`. |
| User wallet | The wallet connected by the user in MetaMask. |

Never put a private key or seed phrase in `.env`, frontend code, or the database.

## 3. Local deployment test (no blockchain funds)

Use this only to verify that the Solidity contract compiles and deploys. It does not test real token payments.

1. Open Remix IDE.
2. Upload `contracts/DAOvaultActivation.sol`.
3. Compile with Solidity `0.8.20` or a compatible compiler.
4. Open **Deploy & Run Transactions**.
5. Select `Remix VM (Osaka)`.
6. Select `DAOvaultActivation`.
7. Use non-zero local test values:

```text
usdtAddress:
0x0000000000000000000000000000000000000001

treasuryAddress:
0xbd6faf26eb55df3e73d4f41424c8f074989b5b94

amount:
300000000000000000000
```

8. Click **Deploy**.

Do not call `activate()` in this local test. The dummy token address does not implement `transferFrom`, so payment will fail. A real payment test requires a test ERC-20 token on BSC Testnet.

## 4. BSC Testnet preparation

Testnet is a separate blockchain environment. Its tokens are for testing and have no production value.

Network settings:

```text
Network name: BSC Testnet
RPC URL: https://data-seed-prebsc-1-s1.bnbchain.org:8545
Chain ID: 97
Currency symbol: tBNB
Explorer: https://testnet.bscscan.com
```

Before deployment, the deployer wallet needs:

- Testnet `tBNB` for gas fees.
- A test ERC-20 token balance for payment testing.
- The test ERC-20 token contract address.

Do not use the BSC Mainnet USDT address on BSC Testnet. Testnet tokens are community/test tokens and their addresses must be verified on the testnet explorer or supplied by a trusted faucet.

## 5. Deploy on BSC Testnet with Remix

1. In MetaMask select **BSC Testnet**.
2. Select the test account used for deployment.
3. In Remix open `DAOvaultActivation.sol`.
4. Compile the contract.
5. Open **Deploy & Run Transactions**.
6. Set environment to **Browser Extension**.
7. Choose **MetaMask**.
8. Confirm that Remix shows the same account address as MetaMask.
9. Select `DAOvaultActivation`.
10. Fill the constructor values:

```text
usdtAddress       = verified BSC Testnet ERC-20 token address
treasuryAddress   = company testnet treasury wallet
amount            = token smallest-unit amount
```

For an 18-decimal token, 300 tokens equals:

```text
300000000000000000000
```

For a 6-decimal token, 300 tokens equals:

```text
300000000
```

11. Click **Deploy**.
12. Approve the transaction in MetaMask.
13. Copy the deployed contract address from Remix **Deployed Contracts**.
14. Open the address on `https://testnet.bscscan.com` and confirm the network and contract transaction.

The deployed address is the value for `PAYMENT_CONTRACT_ADDRESS`. It is not the treasury address.

## 6. Test the payment transaction

The user must complete two transactions.

### Transaction 1: token approval

The user calls the test token contract's `approve` function:

```text
spender: deployed payment contract address
amount: activation amount
```

This allows the payment contract to pull only the approved amount.

### Transaction 2: activation

The user calls the deployed DAOvault contract:

```text
activate(sponsorAddress)
```

Use the zero address when there is no sponsor:

```text
0x0000000000000000000000000000000000000000
```

Verify all of the following on BSC Testnet Explorer:

- The activation transaction succeeded.
- The `Activated` event exists.
- The treasury received the token amount.
- The user is marked activated by `isActivated(user)`.
- The wallet cannot activate twice.

## 7. Environment configuration after deployment

Add the deployed values to the backend environment only after the testnet deployment is complete:

```env
BSC_CHAIN_ID=97
BSC_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
USDT_CONTRACT_ADDRESS=0xVerifiedTestnetTokenAddress
COMPANY_WALLET_ADDRESS=0xTestnetTreasuryAddress
PAYMENT_CONTRACT_ADDRESS=0xDeployedTestnetPaymentContract
ACTIVATION_AMOUNT_USDT=300
```

Restart the backend after changing `.env`.

Do not expose these values through `VITE_*` variables unless the frontend specifically needs them. Contract addresses are public, but private keys are never public configuration.

## 8. Frontend integration required

The frontend activation flow must:

1. Check that MetaMask is connected.
2. Check that the active chain is BSC Testnet during testing.
3. Read the token decimals and calculate the smallest-unit amount.
4. Call the token `approve(paymentContract, amount)` function.
5. Wait for approval confirmation.
6. Call `paymentContract.activate(sponsor)`.
7. Wait for activation confirmation.
8. Send the transaction hash to the backend.
9. Refresh the dashboard from the backend.

The frontend should never mark a user as paid merely because a button was clicked. It should wait for a successful on-chain receipt.

The current frontend implementation is in `frontend/src/scripts/payment.ts`. It checks the configured chain and contract, requests ERC-20 approval, calls `activate()`, waits for both receipts, and then calls `/api/v1/activation/verify`.

The dashboard activation button stays disabled until the frontend contract and token addresses are configured. This prevents accidental fake or misdirected payments.

## 9. Backend verification required

The backend should treat the blockchain as the payment source of truth:

1. Receive the activation transaction hash.
2. Read the transaction receipt from the configured BSC RPC.
3. Confirm the receipt succeeded.
4. Confirm the transaction was sent to `PAYMENT_CONTRACT_ADDRESS`.
5. Decode and validate the `Activated` event.
6. Confirm the event user matches the connected wallet.
7. Confirm the amount and token address match configuration.
8. Store the transaction hash with a unique database constraint.
9. Mark the user activated only after validation.
10. Reject duplicate or altered requests.

Never trust an amount, wallet address, or activation status supplied only by the browser.

The current backend endpoint is:

```text
POST /api/v1/activation/verify
```

It verifies the transaction receipt, sender, destination contract, deployed token, treasury, activation amount, and `Activated` event before creating the database package. It is rate-limited as a financial endpoint and rejects duplicate activations for the same wallet.

For the current MVP, the sponsor field must be an EVM address. The landing page currently captures a referral code, so it safely sends the zero address until a server-side referral-code-to-wallet lookup is added. An arbitrary `DV...` referral code must never be sent as a contract address.

## 10. Production migration

Production uses BSC Mainnet, not BSC Testnet:

```text
Chain ID: 56
Native gas token: BNB
```

Production steps:

1. Complete the full commission and withdrawal contract design.
2. Add tests for every payment, sponsor, cap, reward, and withdrawal rule.
3. Perform an independent smart-contract security audit.
4. Create a dedicated production deployer wallet.
5. Create a dedicated company treasury wallet with secure access controls.
6. Verify the real BSC USDT contract address from an authoritative source.
7. Deploy the reviewed contract on BSC Mainnet.
8. Verify the contract source on BscScan.
9. Transfer ownership/admin roles, if any, to a multisig—not a personal wallet.
10. Configure production environment variables.
11. Test with a small controlled transaction.
12. Enable production frontend chain validation and monitoring.
13. Monitor events, failed transactions, balances, and unusual activity.

Production environment example:

```env
NODE_ENV=production
BSC_CHAIN_ID=56
BSC_RPC_URL=https://bsc-dataseed.bnbchain.org
USDT_CONTRACT_ADDRESS=0xVerifiedBSCMainnetUSDT
COMPANY_WALLET_ADDRESS=0xProductionTreasuryWallet
PAYMENT_CONTRACT_ADDRESS=0xAuditedMainnetPaymentContract
ACTIVATION_AMOUNT_USDT=300
```

Do not copy testnet contract addresses into production. Testnet and mainnet addresses are different networks.

## 11. Why each step is required

| Step | Why it is required |
| --- | --- |
| Compile | Confirms Solidity syntax and creates deployable bytecode. |
| Select BSC Testnet | Prevents accidental use of real funds. |
| Fund with tBNB | Pays blockchain gas on testnet. |
| Configure token address | Tells the contract which ERC-20 token to pull. |
| Configure treasury | Defines where the activation payment is forwarded. |
| Deploy | Creates the immutable payment contract on-chain. |
| Approve | Gives the contract permission to pull the user's tokens. |
| Activate | Performs the payment and records the user on-chain. |
| Verify event | Lets the backend prove that payment really happened. |
| Audit before mainnet | Reduces the risk of irreversible loss of real funds. |

## 12. Current project status

- Local backend dashboard fixture: available for UI testing only.
- Contract source: present in `contracts/DAOvaultActivation.sol`.
- Local Remix VM deployment: possible with dummy values.
- BSC Testnet deployment: requires tBNB and a verified test ERC-20 token.
- Frontend on-chain activation integration: still required after contract deployment.
- Complete 20-level reward/withdrawal contract: not implemented in the current contract.

## 13. Instant withdrawals: `DAOvaultPayout.sol`

Members withdraw and receive USDT in seconds. The backend never sends money: it signs a one-time voucher
(EIP-712), the member's wallet calls `claim()`, and the contract pays from a USDT float the treasury keeps in it.

### Deploy (BSC Testnet first, with Remix like section 5)
Constructor values:

| Field | Value |
|---|---|
| `usdtAddress` | the USDT token on the same chain |
| `owner_` | the treasury wallet (cold wallet or multisig). Only it can pause, change limits/signer, pull the float back |
| `signer_` | the **address** of the voucher signer key (see below). It holds no funds |
| `maxPerClaim_` | largest single instant payout, in token units (USDT has 18 decimals on BSC: $500 = `500000000000000000000`) |
| `dailyLimit_` | most the contract may pay per day, in token units |

Then:
1. Send the float: transfer USDT from the treasury to the payout contract address (e.g. $2,000–$5,000). Refill when low; the admin page shows the float.
2. Backend `.env`: `PAYOUT_CONTRACT_ADDRESS`, `USDT_CONTRACT_ADDRESS`, and on **testnet only** `PAYOUT_SIGNER_TESTNET_KEY` (a fresh throwaway key whose address you passed as `signer_`; never a wallet with funds). The server refuses this key unless `BSC_CHAIN_ID=97`. Mainnet needs a KMS signer (AWS/GCP) before going live.
3. Restart the backend. Withdrawals now pay instantly; anything above `maxPerClaim`, over the daily limit, larger than the float, or while paused goes to admin review automatically.

### Safety switches (owner wallet, in Remix or BscScan "Write contract")
- `setPaused(true)`: stops all instant payouts at once.
- `withdrawFloat(to, amount)`: pulls the float back to the treasury.
- `setSigner(newAddress)`: rotate the signer if the key may have leaked.
- `setLimits(maxPerClaim, dailyLimit)`.
- `transferOwnership` + `acceptOwnership`: two-step owner change.

A leaked signer key can at most take `dailyLimit` per day and never more than the float; pause or rotate it immediately.

### Tests
`contracts/test/` holds 13 Hardhat tests (valid claim, replay, wrong wallet, changed amount, wrong signer, other
contract, expiry, per-claim and daily limits, pause/owner controls, empty float, ownership, activation sponsor rule).
Run them from an empty folder: `npm i -D hardhat@2.22.17 @nomicfoundation/hardhat-ethers@3 @nomicfoundation/hardhat-chai-matchers@2 ethers@6 chai@4 --legacy-peer-deps`,
copy `contracts/*.sol` + `contracts/test/MockUSDT.sol` into `contracts/`, the test file into `test/`, the config to the root, then `npx hardhat test --config hardhat.config.cjs`.
