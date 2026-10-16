# Credentia: Monad Metropolis submission kit

Copy each block into the matching field at hackathon.monad.xyz (the form is behind GitHub/Google/Discord sign-in, so it has to be filled by you).
I could not see the form's exact field names, so the blocks are grouped by length and topic. Nothing here has been submitted.

## Check first
- **Deadline.** The pages I could read say the build window ends on 13 Oct (no time zone) while the site showed intake as "Open". Today is 14 Oct. Open the form and see whether it still accepts submissions.
- **Code link.** `main` is still the initial commit; the product lives on the `feat/credential-flow` branch. Either merge it into `main` (see the end of this file) or paste the branch link below. Do not paste the bare repo link while `main` is empty.
- **Six-week rule.** The repository was created on 9 Oct 2026 and its history starts there. Do not claim six weeks of commits. If part of the work existed earlier (outside this repo), say so truthfully in the write-up.

## Project name
Credentia

## Track
Trust, Identity & AI Infrastructure

## One-liner (about 90 characters)
Verify the credential, not the claim: tamper-evident credentials anyone can check on Monad.

## Short description (about 280 characters)
Credentia lets an issuer anchor a fingerprint of a credential on Monad. Anyone with the link checks it against the on-chain registry: edit one detail and the check fails, revoke it and the page says so. Live on Monad Testnet with real transactions.

## Full description (7,5xx characters, fits an 8,000-character box)
See `submission-description-8000.txt` in this folder; paste its contents.

## Medium description (about 900 characters)
Anyone can make a certificate look real: PDFs get edited, screenshots get faked, links get swapped. Credentia makes a credential checkable instead of believable. An issuer anchors a fingerprint (hash) of the credential on Monad. The share link carries the details; a verifier's browser recomputes the fingerprint and compares it with the on-chain record. If one detail in the link is edited, the page shows DETAILS DO NOT MATCH. If the issuer revokes the credential, it shows REVOKED. Each check is spelled out (link read, registry checked, details match, still active). An Envio indexer turns the registry's events into a credential timeline (Issued, Revoked). The app runs against a real CredentialRegistry on Monad Testnet; the demo credentials, issuance and revocation are real transactions. It is a testnet demo with clearly labelled demo data.

## Long write-up
**Problem.** A credential is only as trustworthy as the way you check it. A PDF can be edited, a screenshot can be faked, and a link can be quietly swapped, so a verifier ends up trusting the sender.

**What we built.**
- `CredentialRegistry` (Solidity, EIP-712 credentials, issuer authorisation, revocation) and a testnet CVI-attestation gate that issuers must pass before issuing.
- A Next.js web app: issue, share (link and QR code), verify, receipt and an issuer dashboard. Verification needs no wallet and no backend: the browser reads the registry directly and recomputes the credential's fingerprint and ID.
- A tamper check: edit one detail of the share link and verification fails with a clear explanation.
- An Envio HyperIndex indexer (CredentialIssued, CredentialRevoked, attestation events) that drives the credential timeline and an issuer reputation figure.
- A server-side AI "credential copilot" route (KIMI/Moonshot API) with a safe fallback message. It has not produced a live answer yet (the provider returned HTTP 429), so we do not claim it.
- A Mera passkey-account component in the issuing flow (see limits).

**What is verifiably real.** Registry `0x335de4487bfcc2Aa3D0E68ad67759616DFD25113` and oracle `0x1C825e31a873e227dE77Ec184fd17C25B36508B0` on Monad Testnet (chain 10143). Transactions: issue `0xbc9d9a319fe09bdffa856a2733382e82620cd082fc1d61b6af9390e426ae6841`, issue `0x1d418c64722f9533346c8281ef277271e54b765564f8b513e3a36a84006174b5`, revoke `0x62da602e821f5ab5d3d10599b43f2c1635d3359003cb6474010d1d17d23b8ed7`. 178 Foundry tests and 242 web tests pass locally. The flow has been backtested with five people.

**Honest limits.** Testnet only; demo data is labelled TESTNET DEMO DATA. The CVI gate is an internal testnet stand-in, not a Cleanverse integration, and not identity verification. The Envio indexer runs locally in the demo; the hosted site reads the chain directly. The Mera passkey sign-in and the KIMI copilot were not demonstrated end to end. Details are in the README and docs.

## Links
- **Live demo:** https://credentia-monad.netlify.app
- **Code (use until `main` is updated):** https://github.com/jenish1345/Credentia/tree/feat/credential-flow
- **Demo video file:** `demo-production/credentia-demo.mp4` (76.8 s). Most forms want a hosted link, so upload it to YouTube (unlisted) or similar and paste that URL.
- **Contracts:** https://testnet.monadvision.com/address/0x335de4487bfcc2Aa3D0E68ad67759616DFD25113 and https://testnet.monadvision.com/address/0x1C825e31a873e227dE77Ec184fd17C25B36508B0
- **Transactions:** https://testnet.monadvision.com/tx/0xbc9d9a319fe09bdffa856a2733382e82620cd082fc1d61b6af9390e426ae6841 , https://testnet.monadvision.com/tx/0x1d418c64722f9533346c8281ef277271e54b765564f8b513e3a36a84006174b5 , https://testnet.monadvision.com/tx/0x62da602e821f5ab5d3d10599b43f2c1635d3359003cb6474010d1d17d23b8ed7

## How judges can test it (about 30 seconds)
1. Open the verified credential (expect VERIFIED, four checks passing):
   https://credentia-monad.netlify.app/verify/0x6eb689d7f0ea651e81480e20450d44971b7affdf3da04f782dc38d649bc59936?d=eyJ2IjoxLCJ0aXRsZSI6Ik1vbmFkIE1ldHJvcG9saXMgQnVpbGRlciBDcmVkZW50aWFsIiwicmVjaXBpZW50TmFtZSI6IkFhcmF2IE4uIiwiZGVzY3JpcHRpb24iOiJBd2FyZGVkIGZvciBjb21wbGV0aW5nIHRoZSBNb25hZCBNZXRyb3BvbGlzIGJ1aWxkZXIgd29ya3Nob3AgYW5kIHNoaXBwaW5nIGEgdmVyaWZpYWJsZSB0ZXN0bmV0IHByb2R1Y3QuIiwic2FsdCI6IjB4NmQ2NTc0NzI2ZjcwNmY2YzY5NzMyZDYyNzU2OTZjNjQiLCJpc3N1ZXIiOiIweGY2ZmI2QjU3NjNjMDk4ODI0OUU2RTgwNjEwOTJlMDUwNkY4QTM5MzQiLCJob2xkZXIiOiIweGU4MjkzYjUzODRmY2E2Qjk2NTcwOWMzNGQ5NGRFNjA2ZUJDZDI1MkQiLCJleHBpcnkiOjAsImlzc3VlZEF0IjoxNzkxODgxOTQzLCJ0eCI6IjB4YmM5ZDlhMzE5ZmUwOWJkZmZhODU2YTI3MzMzODJlODI2MjBjZDA4MmZjMWQ2MWI2YWY5MzkwZTQyNmFlNjg0MSJ9
2. Open the revoked credential (expect REVOKED):
   https://credentia-monad.netlify.app/verify/0x453efea52959cd47db0f0438647603bf78710b3444e8f82b2d5860e2ef3bfe62?d=eyJ2IjoxLCJ0aXRsZSI6Ik1vbmFkIFdvcmtzaG9wIEF0dGVuZGFuY2UgQ3JlZGVudGlhbCAoc2FtcGxlKSIsInJlY2lwaWVudE5hbWUiOiJBYXJhdiBOLiIsImRlc2NyaXB0aW9uIjoiVEVTVE5FVCBERU1PIERBVEEuIFNhbXBsZSBjcmVkZW50aWFsIGlzc3VlZCBpbiBlcnJvciB0byBkZW1vbnN0cmF0ZSByZXZvY2F0aW9uLiIsInNhbHQiOiIweDczNjE2ZDcwNmM2NTJkNzI2NTc2NmY2YjY1MmQzMDMxIiwiaXNzdWVyIjoiMHhmNmZiNkI1NzYzYzA5ODgyNDlFNkU4MDYxMDkyZTA1MDZGOEEzOTM0IiwiaG9sZGVyIjoiMHhlODI5M2I1Mzg0ZmNhNkI5NjU3MDljMzRkOTRkRTYwNmVCQ2QyNTJEIiwiZXhwaXJ5IjowLCJpc3N1ZWRBdCI6MTc5MTg4MjAyMCwidHgiOiIweDFkNDE4YzY0NzIyZjk1MzMzNDZjODI4MWVmMjc3MjcxZTU0Yjc2NTU2NGY4YjUxM2UzYTM2YTg0MDA2MTc0YjUifQ
3. Open the same credential with the recipient edited from "Aarav N." to "Mallory" (expect DETAILS DO NOT MATCH):
   https://credentia-monad.netlify.app/verify/0x6eb689d7f0ea651e81480e20450d44971b7affdf3da04f782dc38d649bc59936?d=eyJ2IjoxLCJ0aXRsZSI6Ik1vbmFkIE1ldHJvcG9saXMgQnVpbGRlciBDcmVkZW50aWFsIiwicmVjaXBpZW50TmFtZSI6Ik1hbGxvcnkiLCJkZXNjcmlwdGlvbiI6IkF3YXJkZWQgZm9yIGNvbXBsZXRpbmcgdGhlIE1vbmFkIE1ldHJvcG9saXMgYnVpbGRlciB3b3Jrc2hvcCBhbmQgc2hpcHBpbmcgYSB2ZXJpZmlhYmxlIHRlc3RuZXQgcHJvZHVjdC4iLCJzYWx0IjoiMHg2ZDY1NzQ3MjZmNzA2ZjZjNjk3MzJkNjI3NTY5NmM2NCIsImlzc3VlciI6IjB4ZjZmYjZCNTc2M2MwOTg4MjQ5RTZFODA2MTA5MmUwNTA2RjhBMzkzNCIsImhvbGRlciI6IjB4ZTgyOTNiNTM4NGZjYTZCOTY1NzA5YzM0ZDk0ZEU2MDZlQkNkMjUyRCIsImV4cGlyeSI6MCwiaXNzdWVkQXQiOjE3OTE4ODE5NDMsInR4IjoiMHhiYzlkOWEzMTlmZTA5YmRmZmE4NTZhMjczMzM4MmU4MjYyMGNkMDgyZmMxZDYxYjZhZjkzOTBlNDI2YWU2ODQxIn0

## Tech stack
Solidity 0.8.24 and Foundry; Next.js 14, React, Tailwind, viem and wagmi; Envio HyperIndex; Mera passkey SDK; KIMI (Moonshot) API route; Netlify.

## Bounties: what to select, honestly
- **Track prize (Trust, Identity & AI Infrastructure):** yes.
- **Best Use of Envio:** reasonable. An indexer is configured, tested against the deployed contracts and drives the on-chain-record timeline and reputation figure in the app. Say it ran locally.
- **Best Mera-Powered UX:** weak. Mera is in the code as the account layer but the passkey flow was not demonstrated and the live registry only authorises one issuer. Select only if you can show it working.
- **Best Integration of Cleanverse (CVI/CVA):** do not select. The gate is a testnet stand-in, not a Cleanverse integration.
- **Best Builds Powered by KIMI:** do not select yet. The KIMI request returned HTTP 429 and no live answer was produced.

## Team
Fill in your own name(s), role(s) and contact. These were not provided to me, so I did not invent them.

## Make the code link point at a working main (needs your approval)
`feat/credential-flow` is a fast-forward of `main`, so this publishes the product on the default branch:
`git push origin feat/credential-flow:main`
It changes the public repository, so I have not run it.
