---
name: lnurl-auth
description: Authenticate an agent to LNURL-auth/LUD-05 services from the command line, especially Predyx-first workflows; use when a user asks for Lightning login, LNURL-auth, LUD-05, or QR-less agent login.
---

# LNURL-auth

Use this skill to complete LNURL-auth (LUD-05) without a mobile wallet or QR scan.

Current scope: **v0.1 Predyx-first**. The CLI also accepts raw LNURL-auth callback/login URLs, but only Predyx is treated as verified in this repo. Do not claim universal service support unless you have tested the specific service.

## Files

- `scripts/lnurl-auth.mjs` — CLI implementation.
- `package.json` — Node dependencies and smoke script.

## Install

```bash
npm install
npm run smoke
```

## Safe usage

Prefer explicit secret inputs. Do not hardcode local machine paths into the script.

```bash
# Deterministic test/private key path
node scripts/lnurl-auth.mjs --service predyx --key <64-char-hex>

# NWC secret derived path; file may contain raw secret hex or nostr+walletconnect URI
node scripts/lnurl-auth.mjs --service predyx --nwc-file ./connection.txt

# Generic LNURL-auth callback/login URL
node scripts/lnurl-auth.mjs --lnurl "lnurl1..." --key <64-char-hex>
node scripts/lnurl-auth.mjs --lnurl "https://example.com/lnurl-auth?k1=...&tag=login" --key <64-char-hex>
```

## Options

- `--service predyx` — fetch Predyx login challenge, sign it, submit callback, then poll for session.
- `--lnurl <value>` — bech32 LNURL or HTTPS LNURL-auth endpoint/callback.
- `--key <hex>` — 32-byte secp256k1 private key as 64-char hex.
- `--nwc-secret <hex>` — 32-byte NWC secret; CLI derives `HMAC-SHA256(nwc_secret, "lnurl-auth")`.
- `--nwc-file <path>` — file containing raw NWC secret hex or a `nostr+walletconnect:` URI with `secret=`.
- `--cookie-file <path>` — optional. Writes returned cookies only when explicitly requested.
- `--dry-run` — resolve challenge and print callback URL without submitting.
- `--verbose` — print HTTP diagnostics to stderr.

## Security rules

- Never commit keys, NWC secrets, seed phrases, cookies, or bearer tokens.
- Do not write cookies into shared workspace paths unless the user explicitly asks.
- Treat NWC-derived LNURL-auth keys as agent identity keys, not as a wallet-standard BIP39 derivation.
- Use `--cookie-file` only for temporary local workflows and chmod 600 outputs.

## Service notes

### Predyx

Verified target for v0.1.

Flow:
1. `GET https://beta.predyx.com/api/auth/do-login` to receive `k1`.
2. Sign `k1` with DER ECDSA.
3. Submit `https://beta.predyx.com/api/auth/lnurl/callback?...`.
4. Poll `/api/auth/lnurl/poll/{k1}` for session result/cookies.

### Stacker News

Experimental / not complete in this repo. Stacker News may validate LNURL-auth but still require a separate NextAuth/session, account funding, and moderation path before posting. Do not document Stacker News as “verified login” until the full current flow is scripted and tested.

## Output

JSON is written to stdout. Example shape:

```json
{
  "success": true,
  "service": "predyx",
  "pubkey": "02...",
  "status": 200,
  "response": { "status": "OK" },
  "pollStatus": 200,
  "pollResponse": {},
  "cookies": "optional=session"
}
```

Non-zero exit means authentication failed or input was invalid.
