# DAOvault smart contracts

`DAOvaultActivation.sol` is the first Testnet-ready payment layer. It is not
the final production reward contract.

## What it does

1. The user approves the USDT token for the activation contract.
2. The user calls `activate(sponsor)`.
3. The contract pulls the fixed activation amount from the user wallet.
4. The contract forwards the payment to the immutable treasury address.
5. The `Activated` event gives the backend a verifiable activation record.

The contract has no admin withdrawal function and no upgrade function. The
USDT address, treasury address, and activation amount are fixed at deployment.

## Deploy in Remix (Testnet only)

1. Open Remix and create `DAOvaultActivation.sol` under `contracts/`.
2. Compile with Solidity `0.8.20` or a compatible `0.8.x` compiler.
3. In MetaMask select BNB Smart Chain Testnet and connect Remix using Injected Provider.
4. Deploy with three constructor values:
   - `usdtAddress`: the verified USDT/test token address for the selected network;
   - `treasuryAddress`: a separate test treasury wallet public address;
   - `amount`: token smallest units, for example `300000000000000000000` for a token with 18 decimals.
5. After deployment, copy the address shown under **Deployed Contracts**. That is
   `PAYMENT_CONTRACT_ADDRESS`.

Do not use a mainnet token, treasury, or real funds until the complete reward
and withdrawal contracts have been independently reviewed and tested.
