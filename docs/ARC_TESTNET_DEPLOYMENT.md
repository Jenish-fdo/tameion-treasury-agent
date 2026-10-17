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
2. **Download of Arc Foundry** (`arc-forge`, `arc-anvil`, `arc-cast`) from the `circlefin/arc-foundry` GitHub releases. It is not installed here. I will not download it without your yes. The project's README says each archive ships with a matching `.sha256` file and tells you to verify it before extracting (step A3). The latest release on the page was `v0.8.0-2` (tag signed by one maintainer and shown as "Verified" by GitHub); the page did not show the asset list or any build attestation, and the README does not name the upstream Foundry version it forks. A checksum from the same page proves the file was not corrupted, not who built it.
3. **Demo owner and relayer for the backend** (Phase E): a separate funded testnet key for the managed demo owner, and one for the relayer. **Decided 2026-10-17:** you create and fund both yourself, testnet-only; I use their public addresses only and never ask for, display, store or commit the keys or passwords.
4. **Pin the compiler: DECLINED 2026-10-17.** `solc` and `evm_version` stay unpinned; `--network arc` is what selects Arc's rules, as the Arc Foundry documentation recommends. The deployed bytecode is instead identified by the compiler version recorded at deploy time (0.8.28, Prague) and by explorer verification. Original proposal, kept for the record: pin the compiler in `contracts/foundry.toml` (`solc_version = "0.8.28"`, `evm_version = "prague"`) so a toolchain update cannot change the deployed bytecode. Proposed, not applied. Per the Arc Foundry README, `evm_version` only tells the compiler which instruction set to emit (keep it at or below Arc's level, which Prague is) and does **not** choose the rules tests run under; `--network arc` does. **Do not add a `hardfork = ...` key**: the README warns a pinned hardfork overrides fork detection, so a stale pin silently runs old rules.
5. **Review. Decided 2026-10-17:** before any deployment, run Slither or Aderyn if already installed (neither is installed here; nothing gets installed without your yes), plus `forge build`, `forge test`, and a manual review of access control, nonce handling, expiry and approval flows, summarised for your approval. See section 2a. Gates: no transaction without "GO deploy", no smoke-test transaction without "GO smoke test", Arc testnet only.

## 2. Phase A: preparation (no network)

- [ ] **A1. Clean, tested tree.** On branch `feat/phase3-mandates`, `git status` is clean. Then:
  ```bash
  cd contracts && forge test                      # expect 178 passed (174 + 4 viem cross-check vectors)
  cd ../backend && NODE_OPTIONS=--experimental-vm-modules ./node_modules/.bin/jest   # 160 passed
  cd ../web-app && ./node_modules/.bin/jest       # 252 passed
  ```
- [x] **A2. Pin the compiler: declined by the owner (decision 4); nothing to do.** Note the commit hash for the deployment record.
- [x] **A3. Install Arc Foundry** (done 2026-10-17; record below). This machine is Apple Silicon (arm64), which has a prebuilt binary. Download into a **new, empty folder** (not the repo, not `~/.local/bin`) both the archive and its `.sha256` file from the `circlefin/arc-foundry` release, then verify **before** extracting:
  ```bash
  cd "$(mktemp -d)"                       # a fresh folder just for this download
  # download arc-foundry-<version>-<target>.tar.gz and arc-foundry-<version>-<target>.tar.gz.sha256 here
  shasum -a 256 -c arc-foundry-<version>-<target>.tar.gz.sha256      # must print "OK"; stop if it does not
  tar -xzf arc-foundry-<version>-<target>.tar.gz
  mkdir -p ~/.local/bin
  mv forge ~/.local/bin/arc-forge && mv cast ~/.local/bin/arc-cast && mv anvil ~/.local/bin/arc-anvil
  arc-forge --version && arc-anvil --version && arc-cast --version
  ```
  **macOS prerequisite found during the install on 2026-10-17:** the release `v0.8.0-2` binaries are linked against Homebrew's `libusb` (hardware-wallet support) at `/opt/homebrew/opt/libusb/lib/libusb-1.0.0.dylib`. Without it every `arc-*` command fails at start-up with `dyld: Library not loaded`. Install it first with `brew install libusb` (or `HOMEBREW_NO_AUTO_UPDATE=1 brew install libusb` to leave your other formulae alone). Upstream `forge` does not need it.
  The binaries are renamed `arc-*`, so they do not replace your upstream `forge`. Arc Foundry is **not** installable through `foundryup`. Do not run the extracted binaries from inside the downloaded folder. If `~/.local/bin` is not on your `PATH`, add `export PATH="$HOME/.local/bin:$PATH"` to `~/.zshrc` yourself; nothing edits it for you. Arc Foundry ships `forge`, `cast`, `anvil` and `chisel`; `chisel` does not work on Arc and is not needed.
  **A3 install record (2026-10-17).** Release `v0.8.0-2`, archive `arc-foundry-v0.8.0-2-aarch64-apple-darwin.tar.gz`, sha256 `90e3eefbf7dd80652fd283a7562e9263301a48797bc2224cc21a3964e2d5db87` (matched the release's `.sha256` file and GitHub's API digest). Installed as `~/.local/bin/arc-forge`, `arc-cast`, `arc-anvil` after `HOMEBREW_NO_AUTO_UPDATE=1 brew install libusb` (libusb 1.0.30; the only formula added). Upstream Foundry in `~/.foundry/bin` was verified unchanged. All three report `1.7.1-dev`, commit `d497bee` (older than upstream Foundry 1.8.5 on this machine, so A4 is also where any cheatcode or flag difference would surface). `arc-forge script --help` and `arc-forge test --help` list `-n, --network <NETWORK>` with possible values `ethereum, optimism, tempo, arc`. Every flag used in this checklist exists in this build (`verify-contract` takes `-c/--chain`, and `--chain-id` is accepted too). No key was created and nothing was sent to any network.
- [x] **A4. Re-test under Arc's runtime** (done 2026-10-17; record below). Upstream `anvil` cannot reproduce Arc. In `contracts/`:
  ```bash
  arc-forge test --network arc          # expect 174 passed, the same as upstream
  ```
  If anything differs, stop and find out why before going on. Two README warnings apply: the local node differs from a real Arc node in block production, finality and hardfork activation (only forking a live network exercises hardfork boundaries), and `--gas-limit` / `--disable-block-gas-limit` are rejected (we use neither). What to watch, and the tests that exercise it:

  | Arc difference | Our code it touches | Tests |
  |---|---|---|
  | `ecrecover` / ERC-1271 behaviour is undocumented | every signed path: `createMandateWithSig`, `revokeMandateWithSig`, payment approvals | `test_CreateWithSig_*`, `test_RevokeWithSig_*`, `test_Approval_*` (incl. the ERC-1271 mock) |
  | Timestamps are non-decreasing, one second | spend windows, expiry, record ordering | `test_Expiry_*`, `test_Caps_*`, `test_SameBlockRecordsAreOrderedBySequenceNotTimestamp` |
  | Native transfers can revert; contracts must not hold value | we accept none | `test_NoFundsAreHeld` |
  | New opcodes (we compile for Prague) | whole bytecode | the full suite |
  | `block.chainid` is 5042002 | EIP-712 domain separator | `test_CreateWithSig_SignatureIsBoundToThisRegistryAndChain` |
  **A4 result (2026-10-17).** `arc-forge test --network arc` (Arc Foundry `1.7.1-dev`, commit `d497bee`, solc 0.8.28): **174 passed, 0 failed, 0 skipped**, exit code 0, the same 174 tests as upstream `forge` 1.8.5 (identical test names, none missing or extra). That includes every signature path: the 29 `CreateWithSig`/`RevokeWithSig`/`Approval` tests on `MandateRegistry` (with the 2 ERC-1271 mock-wallet cases) and the 8 credential signed-issuance tests, so `ecrecover` and ERC-1271 work under Arc's runtime as far as these tests reach. Gas differs: 165 of 169 comparable tests use different gas, **16.6% less in total on Arc** (for example `new MandateRegistry` 2.92M vs 3.21M, `registerBusiness` 71.5k vs 93.6k). One test's reported gas looks inverted (`test_CreateWithSig_SignatureIsBoundToThisRegistryAndChain`: upstream 204k, Arc 3.08M), but upstream's own trace of that test shows the same 3.2M contract creation, so the 204k is an accounting quirk in upstream's summary number, not an Arc cost. Treat gas figures as indicative: deployment cost still has to come from the live dry run (A6). Remaining differences that a local run cannot show are the ones the README names: block production, finality and hardfork activation.
- [x] **A5. Re-run the backend end-to-end suite on an Arc local node** (done 2026-10-17; record below). `deploy-local.sh` calls `forge` and `cast` by name, so put the Arc tools first on `PATH` under those names for this one shell:
  ```bash
  mkdir -p /tmp/arc-shim && ln -sf "$(command -v arc-forge)" /tmp/arc-shim/forge \
    && ln -sf "$(command -v arc-cast)" /tmp/arc-shim/cast && ln -sf "$(command -v arc-anvil)" /tmp/arc-shim/anvil
  cd backend && cp .env.local /tmp/env.local.bak          # deploy-local.sh OVERWRITES it
  PATH=/tmp/arc-shim:$PATH anvil --network arc --chain-id 5042002 &  ANVIL_PID=$!   # --chain-id is required: arc-anvil defaults to 31337
  PATH=/tmp/arc-shim:$PATH bash scripts/deploy-local.sh
  ./node_modules/.bin/tsx --test test/e2e/*.e2e.ts        # expect 36 pass
  kill $ANVIL_PID; cp /tmp/env.local.bak .env.local
  ```
  Kill by the saved PID only, never by name. Pass criterion: 36 of 36. The node's pre-funded accounts come from a public test mnemonic: they must never hold real funds.
  **A5 result (2026-10-17).** `arc-anvil --network arc --chain-id 5042002` (Arc Foundry `1.7.1-dev`; base fee 20 gwei, gas price 21 gwei, the same fee floor as the live chain), with `forge`/`cast`/`anvil` resolved to the Arc builds through a PATH shim. `deploy-local.sh` deployed `CredentialRegistry`, `MandateRegistry` and `DecisionLog` with `arc-forge create` and `arc-cast`, then `tsx --test test/e2e/*.e2e.ts`: **36 tests, 36 passed, 0 failed, 0 skipped** (18 credential and intent API, 18 treasury API), exit 0. Without `--chain-id 5042002` the node comes up as chain 31337, which the backend's signed transactions would not match. Housekeeping: only the node I started was stopped (by PID), `backend/.env.local` was restored byte for byte, the shim was removed, your upstream Foundry and the three `arc-*` binaries were verified unchanged, and no port stayed open. The dev accounts here come from a public test mnemonic and held only local test balances. Limits: this is a local node, so it exercises Arc's fee rules and execution semantics but not real block production, finality or the live network.
- [x] **A6. Dry run against the live chain** (done 2026-10-17; record below; read-only; `--broadcast` is absent). This is the first time the real RPC's fee and gas numbers are seen:
  ```bash
  cd contracts
  export ARC_TESTNET_RPC=https://rpc.testnet.arc.io      # the `arc_testnet` alias in foundry.toml reads this
  arc-forge script script/DeployTreasury.s.sol:DeployTreasury \
    --rpc-url arc_testnet --account arc-testnet-deployer --sender <DEPLOYER_ADDRESS> \
    --network arc --with-gas-price 40gwei --priority-gas-price 1gwei
  ```
  Expected: "Script ran successfully", the two predicted addresses, an estimated total near 6.5M gas and "Estimated amount required" near 0.26 USDC. **The nonce must not change** (`arc-cast nonce <DEPLOYER_ADDRESS> --rpc-url $ARC_TESTNET_RPC`, before and after).
  **A6 result (2026-10-17).** Deployer `0xe90E61708AE8d6647D987409eb2d649EFd1676b5` (EIP-55 valid, plain account with no code). Live Arc testnet: chain ID 5042002, base fee 20 gwei, gas price 25 gwei, balance **20 USDC**, nonce **0**. Run without `--account`, `--private-key` or `--broadcast` (a dry run signs nothing, so `--sender <address>` is enough and the keystore password is never involved): "Script ran successfully", exit 0, predicted `MandateRegistry` `0x987bf754526d2dAff347f76ed69A9d9bA854deDB` (CREATE, nonce 0, 4,172,564 gas) and `DecisionLog` `0x9C740F76f39a90A1D201cdB0b30b323A30aeB64D` (CREATE, nonce 1, 2,380,320 gas); both addresses re-derived independently with `arc-cast compute-address`. Estimated total **6,552,884 gas** at 40 gwei, **0.26211536 USDC** required. After the run: nonce **0**, balance **20 USDC**, so nothing was sent. The unsigned simulation was saved under `contracts/broadcast/**/dry-run/` and `contracts/cache/` (both git-ignored; contain the transactions, no key). Note: the keystore JSON has no `address` field, as is usual for Foundry keystores, so whether `arc-testnet-deployer` really belongs to this address cannot be checked without the password. The owner confirms that with `cast wallet address --account arc-testnet-deployer` (prompts for the password in their own terminal; prints only the public address). I have not verified how `arc-forge` reacts to a keystore that does not match `--sender`, so do this check before "GO deploy". Predicted addresses depend on the deployer's nonce staying 0: any other transaction from this account first changes them.

## 2a. Pre-deployment review (2026-10-17)

Tooling: Slither and Aderyn are **not installed**; none was installed. `arc-forge test --network arc` and upstream `forge test`: **178 passed** each (the original 174 plus `Eip712Vectors.t.sol`). `arc-forge build` does not take `--network` (it compiles identically as part of the test and script runs, solc 0.8.28, Prague).

**New check, independent of our own Solidity.** `backend/scripts/eip712-vectors.mjs` computes the mandate, revoke and approval EIP-712 digests, the business id and the mandate ids with viem. `contracts/test/Eip712Vectors.t.sol` hard-codes those values, deploys the registry at the same fixed address on chain ID 5042002, and checks that signatures over the **viem** digests are accepted by `createMandateWithSig`, `revokeMandateWithSig` and `consume`, and that a digest of another type is rejected. All pass. The existing signature tests build their digests with helpers that mirror the contract's own encoding, so this is the first test that would catch a shared encoding mistake (for example in the `address[]` hash) that would otherwise make every frontend or backend signature fail.

Manual review (full text in the review summary given to the owner; no critical or high findings):

- **Access control.** No global owner, admin, pause or proxy. Business powers sit with the business owner (`_requireOwner`); `markExpired` and relaying signed requests are permissionless by design. `consume` only for `mandate.agent`; the agent can never be the owner, a recipient, or an approver on its own mandate. `DecisionLog` writes only by the mandate agent (for its own mandate), the owner and registered recorders; a mandate of another business cannot be referenced.
- **Nonces.** One per-signer unordered nonce space shared by creation and revocation, consumed on the direct and signed paths, signer-cancellable. The nonce is inside the signed data. Replays of a consumed nonce revert.
- **Expiry.** One rule (`_validateExpiry`: future, at most 365 days) for every creation path; use is checked against the clock on every call, so a mandate stops working at `expiresAt` even before `markExpired`. Signature and approval deadlines are checked with `<`.
- **Approvals.** Bound to mandate, payment id, recipient, amount and deadline and to this contract and chain; single-use through the payment-id guard; approver status is checked when the payment is consumed, so removing an approver voids outstanding approvals.
- **Findings (all low or informational, none blocks a testnet deployment):** (1) `approvalThreshold` above `perTxLimit` means no payment ever needs approval; this is not rejected at creation (owner's choice, UI should warn). (2) After `acceptBusinessOwner`, recorders and approvers set by the previous owner stay authorised until the new owner removes them. (3) A pending owner proposal cannot be cleared, only replaced (proposing yourself cancels it). (4) Spend windows are fixed buckets: up to 2x a cap across a boundary (already documented). (5) `consume` records a spend; it does not move funds, so a compromised agent key can still send USDC without calling it (already documented, see `PHASE3_PLAN.md`). (6) Nothing here has had a third-party audit.

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
  --network arc --with-gas-price 40gwei --priority-gas-price 1gwei \
  --broadcast --slow
```

`--network arc` makes `forge script` simulate under Arc's rules (it is also auto-selected when the RPC's chain ID is recognised, but the checklist asks for it explicitly). It is an Arc Foundry flag: it was **not** part of the local rehearsal, which used upstream `forge`, so confirm `arc-forge script --help` lists it before the first run.

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
    --network arc --with-gas-price 40gwei --priority-gas-price 1gwei --broadcast --slow
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

Checklist before "GO deploy": decisions 1-5 answered; A1-A6 pass; the owner has approved the section 2a review; keystore created and funded; you are comfortable with the unaudited status. If any item fails or surprises us, we stop there.
