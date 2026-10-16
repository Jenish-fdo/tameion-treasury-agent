# Verification report: Credentia demo video

Prepared 2026-10-13. Everything below was actually run or measured; anything not done is listed under limits.

## Hackathon requirements (checked online)
Source: [monad.xyz/metropolis](https://monad.xyz/metropolis) and [monad.xyz/developers/hackathons](https://monad.xyz/developers/hackathons).
- Submission: a working product with a public project profile, a demo, a short write-up and a code link. Judges "need to be able to verify what you built during the six weeks".
- Deadline: 13 Oct 2026 (no time zone stated on the pages). Judging 14 to 27 Oct.
- **No demo-video length, resolution or format is published** on those pages, so none was assumed. The video is 76.8 s, 1080p MP4.
- Sponsor-bounty rules are on the official application platform, which was not accessible here.

## What the video shows, and the evidence for each claim
| Claim in the video | Evidence |
|---|---|
| A real credential verifies on Monad Testnet | Live site `credentia-monad.netlify.app`, credential `0x6eb689d7...bc59936`; captured in real Chrome; the page read the registry `0x335de448...5113` |
| Editing one detail in the link fails | Real run: link payload edited (recipient "Aarav N." to "Mallory"); the live page returned DETAILS DO NOT MATCH. The edit is shown on screen as an edit |
| A withdrawn credential shows as revoked | Credential `0x453efea5...3bfe62`, revoked by transaction `0x62da602e...3b8ed7`; the live page shows REVOKED |
| Envio indexer timeline "Issued, then revoked" | Captured from the **local** app with the **local** indexer (labelled LOCAL on screen). Not hosted |
| Real transactions | Issue `0xbc9d9a31...ae6841`, issue `0x1d418c64...6174b5`, revoke `0x62da602e...3b8ed7` on Monad Testnet (chain 10143), confirmed by on-chain reads |
| 178 contract tests, 242 web tests | Last runs in this session: Foundry 178 passed, 0 failed; Jest 242 passed, 0 failed (local) |
| "The flow has been backtested with five people" | Stated by the project owner. **No records, results or methodology are in the repository**, so the video states only that fact and says nothing about outcomes |

## Checks completed on the final file
- Specs: 1920x1080, 24 fps, H.264 (yuv420p), AAC 48 kHz stereo, 76.79 s; video 10.3 MB, no-subtitle version 9.1 MB.
- Full decode: no errors. Black frames: none. Audio silence gaps over 1.2 s: none.
- Audio: -15.9 LUFS integrated, peak about -1.1 dBFS (no clipping). Narration pace raised from about 158 to 184 words per minute with shorter pauses (effective about 169 wpm including pauses, previously about 133).
- Subtitles: 28 cues; 25 of 26 detected speech restarts coincide with a caption start (within 0.12 s), and the remaining one is a pause inside a caption. Burned-in and SRT versions use the same cues.
- Frame review: sampled frames from every scene were inspected visually (cards, live captures, overlays, captions).
- Live site: `/`, `/issue`, `/dashboard`, `/payment-check`, both verify links and the receipt returned HTTP 200. Served JavaScript was scanned: no key-shaped strings, no private-key-like values, no localhost references.
- Static holds (the verified dialog, the edit card, the proof card, the honesty card) are intentional.

## Editing-layer additions (not part of the app)
Title cards, captions, highlight boxes, the "Aarav N. to Mallory" card, bottom-left source tags (LIVE SITE / LOCAL), a soft low accent when the edited link fails, and the closing two-note resolve. The "Powered by Netlify" corner badge of the hosting platform was painted out of the captures. No application screen was altered.

## Audio
- Voice: macOS system voice "Daniel" (en-GB) at 184 wpm, generated locally. No API, account or key.
- Music: synthesized from sine waves and noise, so there is no third-party audio to license.
- **Limits:** I could not listen to the audio in this environment. Pronunciation of Credentia, Monad and Envio was steered with phonetic spellings (Cre-den-sha, Moh-nad, Envee-oh) and is unverified by ear. A macOS system voice sounds less human than a professional or premium voice; re-record the narration from `narration-script.md` if you have a better voice.

## Known limits and what is NOT in the video
- **Five-person backtest:** the video says it was done with five people, on the owner's word. No results are shown because none are on record. If the numbers, method and outcomes are provided, an evidence card can replace the plain statement.
- **Mera passkey account, KIMI summary, real Cleanverse:** not demonstrated. The passkey issue flow was not run (the passkey account is not authorized or funded on the registry), the KIMI request returned HTTP 429, and the CVI gate is a testnet stand-in (stated in the video).
- The live site reads the chain directly; the event timeline needs the local indexer, so it is shown from the local run.
- Testnet only.
- The 77 s length was chosen without a published limit; check the submission form before uploading.
- Nothing in `demo-production/` is committed to Git.
