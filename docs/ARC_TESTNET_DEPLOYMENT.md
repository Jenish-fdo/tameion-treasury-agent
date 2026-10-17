# Arc testnet deployment checklist: MandateRegistry and DecisionLog

**Status: a plan. Nothing has been deployed and no transaction has been sent to any network.** Arc testnet only. This does not claim mainnet readiness, and the contracts are unaudited.

Steps marked **[SENDS TRANSACTIONS]** need your explicit reply ("GO deploy", "GO smoke test") before I run them. Everything else is local or read-only. Read-only means calls such as `eth_call`, `eth_chainId` and `eth_gasPrice`, which change nothing on chain.

## 0. What was checked, and what was not

Checked against Circle's Arc docs on 2026-10-17 ([connect](https://docs.arc.io/integrate/connect-to-arc), [gas and fees](https://docs.arc.io/arc/references/gas-and-fees), [EVM differences](https://docs.arc.io/arc/references/evm-differences), [deploy](https://docs.arc.io/arc/tutorials/deploy-on-arc), [install Arc Foundry](https://docs.arc.io/arc/tutorials/install-arc-foundry)) and against the live public RPC with read-only calls:

| Fact | Value |
|---|---|
| Chain ID | 5042002 (the RPC returns it) |
| RPC / explorer / faucet | `https://rpc.testnet.arc.io` · `https://explorer.testnet.arc.io` (Blockscout) · `https://faucet.circle.com` |
| Gas token | USDC. Native balance has 18 decimals, so 1 USDC = 10^18 wei of gas |
| Fee floor | `maxFeePerGas` below **20 gwei is silently dropped** (no error). Right now: base fee 20 gwei, `eth_gasPrice` 25 gwei, suggested tip 5 gwei |
| Finality | Final on inclusion; one confirmation is enough |
| Baseline fork | Osaka. Our bytecode is compiled for **Prague** (solc 0.8.28, optimizer 200 runs); the docs do not say Prague code is accepted, so the arc-anvil re-test below is the proof, not an assumption |
| Cost | The script uses about 4.7M gas in the local VM (forge's own estimate with its safety margin is 6.55M). Worst case at a 40 gwei max fee is about 0.19 USDC; the actual charge is base fee plus tip, so roughly 0.1 USDC |
| Contract size | `MandateRegistry` 14,568 bytes, `DecisionLog` 8,214 bytes (limit 24,576) |

Not checked: how `ecrecover` and ERC-1271 behave on Arc (the docs are silent, and every signed path in `MandateRegistry` depends on them); whether Arc Foundry's `arc-forge script` accepts exactly the flags below (they are upstream Foundry's, and the rehearsal used upstream `forge`); any static analysis or independent review (none done).

Rehearsed locally on 2026-10-17, not on Arc: the whole sequence below (throwaway keystore, dry run, broadcast with `--slow`, `verify-deployment.sh`, the smoke test, the read-only confirmations) against a local Anvil node with chain ID 5042002. It passed. That proves the commands and scripts, not Arc's behaviour.

## 1. Decisions I need from you first

1. **Deployer key.** `~/.foundry/keystores` already holds `credentia-deployer` and `swiftpay-deployer` (names only; I have not opened them). I recommend a **new** keystore, `arc-testnet-deployer`, used for nothing else. The contracts have no owner or admin, so after deployment this key has no power at all; the only thing it can lose is testnet gas money.
2. **Download of Arc Foundry** (`arc-forge`, `arc-anvil`, `arc-cast`) from the `circlefin/arc-foundry` GitHub releases. It is not installed here. I will not download it without your yes, and the docs publish no checksums, so you may want to check the release page yourself.
3. **Demo owner and relayer for the backend** (Phase E): a separate funded testnet key for the managed demo owner, and one for the relayer. You create and fund them; I never see them.
4. **Pin the compiler** in `contracts/foundry.toml` (`solc_version = "0.8.28"`, `evm_version = "prague"`) so a toolchain update cannot change the deployed bytecode. Proposed, not applied.
5. **Review.** Strongly recommended before deploying anywhere public: a second pair of eyes on `MandateRegistry.sol` and `DecisionLog.sol`, and a static-analysis pass (Slither or Aderyn, not installed here).

## 2. Phase A: preparation (no network)

- [ ] **A1. Clean, tested tree.** On branch `feat/phase3-mandates`, `git status` is clean. Then:
  ```bash
  cd contracts && forge test                      # expect 174 passed
  cd ../backend && NODE_OPTIONS=--experimental-vm-modules ./node_modules/.bin/jest   # 160 passed
  cd ../web-app && ./node_modules/.bin/jest       # 252 passed
  ```
- [ ] **A2. Pin the compiler** (decision 4), rebuild, re-run A1. Note the commit hash: it goes into the deployment record.
- [ ] **A3. Install Arc Foundry** (after your yes). From the docs: download the archive for your platform (macOS Apple Silicon is supported) from the `circlefin/arc-foundry` releases, then:
  ```bash
  tar -xzf arc-foundry-<version>-<target>.tar.gz
  mkdir -p ~/.local/bin
  mv forge ~/.local/bin/arc-forge && mv cast ~/.local/bin/arc-cast && mv anvil ~/.local/bin/arc-anvil
  arc-forge --version
  ```
  The binaries are renamed `arc-*`, so they do not replace your upstream `forge`.
- [ ] **A4. Re-test under Arc's runtime.** Upstream `anvil` cannot reproduce Arc. In `contracts/`:
  ```bash
  arc-forge test --network arc          # expect 174 passed, the same as upstream
  ```
  If anything differs, stop and find out why before going on. What to watch, and the tests that exercise it:

  | Arc difference | Our code it touches | Tests |
  |---|---|---|
  | `ecrecover` / ERC-1271 behaviour is undocumented | every signed path: `createMandateWithSig`, `revokeMandateWithSig`, payment approvals | `test_CreateWithSig_*`, `test_RevokeWithSig_*`, `test_Approval_*` (incl. the ERC-1271 mock) |
  | Timestamps are non-decreasing, one second | spend windows, expiry, record ordering | `test_Expiry_*`, `test_Caps_*`, `test_SameBlockRecordsAreOrderedBySequenceNotTimestamp` |
  | Native transfers can revert; contracts must not hold value | we accept none | `test_NoFundsAreHeld` |
  | New opcodes (we compile for Prague) | whole bytecode | the full suite |
  | `block.chainid` is 5042002 | EIP-712 domain separator | `test_CreateWithSig_SignatureIsBoundToThisRegistryAndChain` |
- [ ] **A5. Re-run the backend end-to-end suite on an Arc local node.** `deploy-local.sh` calls `forge` and `cast` by name, so put the Arc tools first on `PATH` under those names for this one shell:
  ```bash
  mkdir -p /tmp/arc-shim && ln -sf "$(command -v arc-forge)" /tmp/arc-shim/forge \
    && ln -sf "$(command -v arc-cast)" /tmp/arc-shim/cast && ln -sf "$(command -v arc-anvil)" /tmp/arc-shim/anvil
  cd backend && cp .env.local /tmp/env.local.bak          # deploy-local.sh OVERWRITES it
  PATH=/tmp/arc-shim:$PATH anvil --network arc &  ANVIL_PID=$!   # check `arc-anvil --help` for the chain-id and funding flags
  PATH=/tmp/arc-shim:$PATH bash scripts/deploy-local.sh
  ./node_modules/.bin/tsx --test test/e2e/*.e2e.ts        # expect 36 pass
  kill $ANVIL_PID; cp /tmp/env.local.bak .env.local
  ```
  Kill by the saved PID only, never by name. Pass criterion: 36 of 36.
- [ ] **A6. Dry run against the live chain** (read-only; `--broadcast` is absent). This is the first time the real RPC's fee and gas numbers are seen:
  ```bash
  cd contracts
  export ARC_TESTNET_RPC=https://rpc.testnet.arc.io      # the `arc_testnet` alias in foundry.toml reads this
  arc-forge script script/DeployTreasury.s.sol:DeployTreasury \
    --rpc-url arc_testnet --account arc-testnet-deployer --sender <DEPLOYER_ADDRESS> \
    --with-gas-price 40gwei --priority-gas-price 1gwei
  ```
  Expected: "Script ran successfully", the two predicted addresses, an estimated total near 6.5M gas and "Estimated amount required" near 0.26 USDC. **The nonce must not change** (`arc-cast nonce <DEPLOYER_ADDRESS> --rpc-url $ARC_TESTNET_RPC`, before and after).

## 3. Phase B: keystore and funding

- [ ] **B1. Create the key encrypted from the start.** The private key is never shown and never typed:
  ```bash
  cast wallet new ~/.foundry/keystores arc-testnet-deployer      # prompts twice for a password; prints only the ADDRESS
  ```
  Put the password in your password manager. Write down the printed address (it is public). Back up the encrypted file `~/.foundry/keystores/arc-testnet-deployer` somewhere that is not this repo and not iCloud Documents.
- [ ] **B2. Never do these:** `--private-key` on a command line, `--unsafe-password`, a key in any `.env`, or a keystore inside the repo (it would be committed). The safe, supported flag is `--account arc-testnet-deployer`; Foundry prompts for the password at run time.
- [ ] **B3. Fund it.** Open `https://faucet.circle.com`, choose **Arc Testnet**, paste the address, request USDC. Ask for more than the estimate (1 USDC is plenty). Confirm, read-only:
  ```bash
  cast balance <DEPLOYER_ADDRESS> --ether --rpc-url https://rpc.testnet.arc.io     # whole USDC (native, 18 decimals)
  ```

## 4. Phase C: deploy  **[SENDS TRANSACTIONS]**

Wait for "GO deploy". Two transactions, sent one at a time (`--slow`), from the keystore account:

```bash
cd contracts
export ARC_TESTNET_RPC=https://rpc.testnet.arc.io
arc-forge script script/DeployTreasury.s.sol:DeployTreasury \
  --rpc-url arc_testnet --account arc-testnet-deployer --sender <DEPLOYER_ADDRESS> \
  --with-gas-price 40gwei --priority-gas-price 1gwei \
  --broadcast --slow
```

Why the fee flags: `--with-gas-price` is the **max** fee per gas for EIP-1559 transactions, and you pay only base fee plus tip, so a 40 gwei ceiling costs nothing extra. Without it, upstream Foundry estimated about 2 gwei on a local node; if it did the same on Arc, the transactions would be dropped silently at the 20 gwei floor.

Flags are written inline on purpose: your shell is zsh, which does not split an unquoted `$FLAGS` variable into separate arguments.

- [ ] **C1.** Read both addresses from the broadcast record, not from console output:
  ```bash
  python3 -c 'import json; d=json.load(open("broadcast/DeployTreasury.s.sol/5042002/run-latest.json")); [print(t["contractName"], t["contractAddress"], t["hash"]) for t in d["transactions"]]'
  ```
- [ ] **C2.** Both receipts have status 1: `cast receipt <TX_HASH> status --rpc-url $ARC_TESTNET_RPC`.
- [ ] **C3.** Open both addresses on `https://explorer.testnet.arc.io`.

## 5. Phase D: verify

- [ ] **D1. Source verification on the explorer** (Blockscout; public source is the point of this step). Same compiler settings as the deployment:
  ```bash
  arc-forge verify-contract <MANDATE_REGISTRY> src/MandateRegistry.sol:MandateRegistry \
    --chain-id 5042002 --verifier blockscout --verifier-url https://explorer.testnet.arc.io/api/ \
    --compiler-version 0.8.28 --num-of-optimizations 200 --evm-version prague --watch
  arc-forge verify-contract <DECISION_LOG> src/DecisionLog.sol:DecisionLog \
    --chain-id 5042002 --verifier blockscout --verifier-url https://explorer.testnet.arc.io/api/ \
    --compiler-version 0.8.28 --num-of-optimizations 200 --evm-version prague --watch \
    --constructor-args $(arc-cast abi-encode "constructor(address)" <MANDATE_REGISTRY>)
  ```
  I did not run `verify-contract` locally (no explorer to talk to); the flag names come from `forge verify-contract --help` and the Arc docs. Bytecode cannot be compared byte for byte, because both contracts carry immutables (the EIP-712 domain cache in `MandateRegistry`, the registry address in `DecisionLog`); explorer verification is the check.
- [ ] **D2. Read-only deployment checks** (tested on the local rehearsal: all PASS, and each of three deliberately wrong inputs FAILs):
  ```bash
  cd contracts
  RPC_URL=https://rpc.testnet.arc.io CHECK_EXPLORER=1 CAST=arc-cast \
    ./script/verify-deployment.sh <MANDATE_REGISTRY> <DECISION_LOG>
  ```
  It checks: chain ID; code present and under the size limit; `DecisionLog.registry()` points at the registry; the EIP-712 domain (name, version, chain ID, verifying contract); the constants match `PHASE3_PLAN.md`; **no `owner`, `pendingOwner`, `paused`, `implementation` or `admin` function exists on either contract**; nothing recorded yet; and, with `CHECK_EXPLORER=1`, that the explorer shows verified source. It exits non-zero on any failure.
- [ ] **D3. Compare with the plan.** `MAX_MANDATE_DURATION` is 31,536,000 seconds, recipients cap 100, risk tier cap 2, page cap 50 (the script checks these).
- [ ] **D4. Smoke test  [SENDS TRANSACTIONS]** (wait for "GO smoke test"; four transactions, signed by the same keystore as the business owner; moves no funds):
  ```bash
  cd contracts
  MANDATE_REGISTRY=<MANDATE_REGISTRY> DECISION_LOG=<DECISION_LOG> \
  arc-forge script script/SmokeTestTreasury.s.sol:SmokeTestTreasury \
    --rpc-url arc_testnet --account arc-testnet-deployer --sender <DEPLOYER_ADDRESS> \
    --with-gas-price 40gwei --priority-gas-price 1gwei --broadcast --slow
  ```
  It registers a business, grants a mandate to an agent address nobody holds a key for, records one decision, and revokes the mandate. Then confirm, read-only, with the three ids it prints:
  ```bash
  arc-cast call <DECISION_LOG> 'countByBusiness(bytes32)(uint256)' <BUSINESS_ID> --rpc-url https://rpc.testnet.arc.io      # 1
  arc-cast call <DECISION_LOG> 'verifyRecord(bytes32)(bool)' <DECISION_ID> --rpc-url https://rpc.testnet.arc.io           # true
  arc-cast call <MANDATE_REGISTRY> 'validate(bytes32,address,(address,uint128,uint8,uint8,bytes32))((bool,bool,uint8,uint128,uint128,uint128))' \
    <MANDATE_ID> 0x0000000000000000000000000000000000000001 \
    "(0x0000000000000000000000000000000000000002,1000000,1,0,$(arc-cast keccak smoke))" --rpc-url https://rpc.testnet.arc.io
  # expect (false, false, 2, 0, 0, 0): not allowed, reason 2 = REVOKED
  ```
  Afterwards re-run D2 with `EXPECT_EMPTY=0` (the contracts are no longer empty).

## 6. Phase E: connect the backend and web app (testnet, demo keys)

- [ ] **E1.** In `backend/.env` (git-ignored): set `MANDATE_REGISTRY_ADDRESS`, `DECISION_LOG_ADDRESS`, `ARC_NETWORK=testnet`. Unset them to turn the routes off again (they then answer 503).
- [ ] **E2.** `BUSINESS_OWNER_PRIVATE_KEYS` and `BACKEND_WALLET_PRIVATE_KEY` must be **funded testnet-only keys that you create** (decision 3). Never reuse the deployer, and never a key that has ever held real value. The backend holds these in memory; this is the demo shortcut described in `PHASE3_PLAN.md`, not custody for real funds.
- [ ] **E3.** Start the backend and web app on free ports, register a demo business from `/founder/mandates`, and confirm the page shows the new business and the relayer authorised. Stop only the processes you started.

## 7. Rollback and abort

The contracts are immutable and have no admin, so there is no "undo". What you can do depends on when:

| Situation | What to do |
|---|---|
| Any gate fails before C | Nothing was sent. Fix and repeat; there is nothing to roll back |
| The dry run (A6) looks wrong (gas, fee, addresses) | Stop. Nothing was sent |
| Deploy stopped halfway (registry deployed, `DecisionLog` not) | Resume without re-sending what landed: add `--resume` to the same command. If it cannot resume, redeploy; a stray registry on testnet is harmless |
| A transaction is stuck or dropped | Almost always the fee floor. Re-send with a higher `--with-gas-price`; check `cast nonce` first so nothing is sent twice |
| D2 or D4 fails after deploy | Do not point anything at it. Leave the backend env unset (routes answer 503), record the addresses as **abandoned**, fix the cause, deploy a new pair |
| A bug is found after the system is in use | (1) Unset the addresses in `backend/.env` and restart, so the API stops using them. (2) For each live mandate, the owner revokes it (`POST /mandates/:id/revoke` or `revokeMandate`); a revoked mandate cannot be consumed. (3) Deploy a corrected pair as **new addresses** and update the record. (4) Old decision records stay on chain forever; this is why only hashes are ever written, never rationales or personal data |
| The deployer key leaks | Harmless to the contracts: it has no powers. Stop funding it |
| An owner, recorder or approver key leaks | The business owner calls `setRecorder(..., false)` / `setApprover(..., false)` and revokes mandates; ownership can be moved with the two-step `proposeBusinessOwner` / `acceptBusinessOwner` |
| Backend or web regression | Revert the env change and redeploy the previous build; no chain action is needed |

## 8. Record keeping

- [ ] Create `docs/deployments/arc-testnet.md` with: both addresses, deploy block and transaction hashes, chain ID, compiler settings, the git commit and tag, explorer links, the deployer address (public), and the date. Mark any abandoned pair clearly.
- [ ] Commit `contracts/broadcast/DeployTreasury.s.sol/5042002/run-latest.json` after reading it once. It holds addresses and transaction hashes; the rehearsal's copy contained no key, password or mnemonic. The separate `cache/.../run-latest.json` ("sensitive values") is git-ignored and stays that way.
- [ ] `git tag arc-testnet-v0 <commit>`.

## 9. Go / no-go

I will not send a transaction until you reply with the matching phrase:

| Gate | You reply | Runs |
|---|---|---|
| Install Arc Foundry | "yes, download Arc Foundry" | A3 |
| Everything in Phase A and B is checked | "GO deploy" | Phase C |
| Phase C and D1-D3 are clean | "GO smoke test" | D4 |

Checklist before "GO deploy": decisions 1-5 answered; A1-A6 pass; keystore created and funded; you are comfortable with the unaudited status. If any item fails or surprises us, we stop there.
