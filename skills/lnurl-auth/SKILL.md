# lnurl-auth

LNURL-auth CLI for autonomous agents. Authenticates to LUD-05 Lightning services using BIP39 seed derivation. No mobile wallet needed.

## Description

This skill provides a Node.js CLI tool that completes the full LNURL-auth (LUD-05) flow programmatically. It derives a domain-specific linking key from a BIP39 mnemonic, signs the challenge with DER encoding, and returns session cookies or tokens.

## Requirements

- Node.js 18+
- Dependencies: `@noble/secp256k1`, `bech32`, `socks-proxy-agent` (optional)
- Install: `npm install @noble/secp256k1 bech32 socks-proxy-agent`

## Usage

### Basic authentication

```bash
SEED="word1 word2 ... word12" node scripts/lnurl-auth.mjs --service lnmarkets
SEED="word1 word2 ... word12" node scripts/lnurl-auth.mjs --lnurl "lnurl1dp68gurn8..."
```

### Options

- `--seed "<mnemonic>"` - BIP39 mnemonic (or use SEED env var)
- `--key "<hex>"` - Raw 64-char hex private key (for testing)
- `--service "<name>"` - Known service: lnmarkets, predyx
- `--lnurl "<string>"` - Raw LNURL bech32 string (alternative to --service)
- `--proxy "<url>"` - SOCKS5 proxy (e.g., `socks5://host:port`)
- `--dry-run` - Show what would be submitted without sending
- `--verbose` - Debug output
- `--help` - Show help

### Output

JSON to stdout:
```json
{
  "success": true,
  "cookies": "session=abc123; user=031d3e...",
  "response": { "status": "OK", "token": "optional" }
}
```

## Technical Details

### Key Derivation (LUD-05)

1. BIP39 mnemonic → 64-byte seed (PBKDF2-HMAC-SHA512, 2048 iterations)
2. BIP32 master key from seed (HMAC-SHA512 with "Bitcoin seed")
3. Derive hashing key at path `m/138'/0'` (hardened) — this is `hashingKeyPriv`
4. For service domain: `domainHash = HMAC-SHA256(hashingKeyPriv, domain)`
5. Linking private key: `linkingPriv = hashingKeyPriv + domainHash (mod secp256k1 order)`
6. Linking public key: compressed secp256k1 point

The domain tweak provides unlinkability: same seed, different domain = different identity.

### Signature Format

LUD-05 requires DER-encoded ECDSA signatures. The script uses `@noble/secp256k1` v1.7.1 with `{ der: true }`. Note: some implementations (including Stacker News) also accept compact 64-byte signatures, but DER is spec-compliant and recommended for maximum compatibility. Some libraries (e.g., `elliptic`) produce raw signatures by default and must be configured for DER.

### Services

- **Stacker News**: `--lnurl "https://stacker.news/api/auth/lnurl"`
  - LNURL-auth validates the signature but does NOT return a session
  - After `/api/lnauth` callback returns `{ status: "OK" }`, you must complete the NextAuth flow:
    1. `GET /api/auth/csrf` → `{ csrfToken }` + csrf cookie
    2. `POST /api/auth/callback/lightning` with `{ csrfToken, k1, pubkey }` + csrf cookie → session JWT
  - Use the session JWT cookie for authenticated GraphQL requests
  - New accounts may be moderated regardless of credits — manual approval required for posting
- **Predyx**: `--service predyx`
  - Returns token in JSON; use `Authorization: Bearer <token>`
- **LNMarkets**: `--service lnmarkets`
  - Returns both cookies and token

## Known Issues

- LNMarkets: Verified signature validates, but returned account may be a default/placeholder if your seed hasn't been used on the site before. Create an account via the web UI first if needed.

## Error Handling

Non-zero exit codes on failure. Check `status` field and stderr for diagnostics. With `--verbose`, you'll see each HTTP request/response.

## Security Notes

- Never commit your mnemonic or private key to git
- Use environment variables: `SEED="words..."` (shell may leak to child processes)
- For production, consider using a hardware wallet or air-gapped signing
- Proxy through Tor or SOCKS5 if concerned about IP linkability

## Files

- `scripts/lnurl-auth.mjs` - Main CLI tool (497 lines)
- `skills/lnurl-auth/SKILL.md` - This documentation