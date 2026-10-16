# Credentia product demo: narration script

Running time 122.5 s (limit 3:00). Voice: macOS "Daniel" at 176 wpm. Footage: live site + local Envio, recorded through a real browser; cursor drawn from the recorded cursor track.

## D1 (0:00.60 to 0:10.84)

- Spoken: This is Credentia, running live on Monad testnet. An issuer creates a credential, and anyone can verify it from a link, with nothing to install and no account.
- Visual: Live landing page

## D2 (0:11.64 to 0:18.58)

- Spoken: The site walks you through it. Issue a credential, share the link or the QR code, and anyone can check it instantly.
- Visual: Landing page scroll story

## D3 (0:19.38 to 0:31.50)

- Spoken: Issuing starts here. The form asks for a title, a recipient, their wallet address, and an optional expiry. It checks each field as you go, so a malformed address is caught straight away.
- Visual: Real typing in the live issue form, real validation error

## D4 (0:32.30 to 0:45.68)

- Spoken: Issuing is for authorised issuers. The page asks them to sign in with a passkey, and the registry only accepts issuers that pass our testnet identity gate. That gate is a stand-in for a real verifier, and the page says so.
- Visual: Issue page: verified-issuers-only step (passkey sign-in, testnet stand-in) highlighted

## D5 (0:46.48 to 0:56.34)

- Spoken: Now the verifier's side. This is a real credential, issued on Monad testnet. Opening its link reads the registry directly. No account, no wallet.
- Visual: Real verify page: dialog opens, cursor closes it

## D6 (0:57.14 to 1:06.21)

- Spoken: The page shows four checks. The link was read, the credential exists in the registry, the details match the on-chain fingerprint, and it's still active.
- Visual: Four checks, issuer panel scroll

## D7 (1:07.01 to 1:14.77)

- Spoken: It shows who issued it, and the verify button opens the transaction on the Monad explorer, so anyone can confirm it independently.
- Visual: Cursor on "Verify on Monad"

## D8 (1:15.57 to 1:23.02)

- Spoken: Every credential also has a receipt: its status, ID, issuer, the transaction hash, and the network.
- Visual: Receipt page scroll

## D9 (1:23.82 to 1:27.85)

- Spoken: Now change one detail in the link, here, the recipient name.
- Visual: Edit overlay: recipient changed in the link

## D10 (1:29.80 to 1:35.03)

- Spoken: The fingerprint no longer matches, and Credentia tells the verifier not to rely on it.
- Visual: Real result: DETAILS DO NOT MATCH

## D11 (1:36.18 to 1:39.96)

- Spoken: And when an issuer withdraws a credential, the page says revoked.
- Visual: Real result: REVOKED

## D12 (1:40.76 to 1:48.83)

- Spoken: In our local setup, an Envio indexer turns the registry's events into a timeline. The credential was issued, then revoked.
- Visual: Local app + local Envio timeline (labelled LOCAL)

## D13 (1:49.63 to 1:59.85)

- Spoken: That's Credentia. A credential anyone can verify, and nobody can quietly edit. Live on Monad testnet today, with the demo data labelled as such.
- Visual: Live landing page with the live URL
