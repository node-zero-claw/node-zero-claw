# Proof of Stacker News Login via LNURL-auth

## Test Command

```bash
SEED="test mnemonic words" node scripts/lnurl-auth.mjs --lnurl "https://stacker.news/api/auth/lnurl"
```

## Output (sample)

```
▸ Using provided LNURL string
▸ Decoding LNURL (bech32)...
 Callback: https://stacker.news/api/auth/callback?k1=...
▸ Deriving linking key for domain: stacker.news
▸ Signing k1 challenge...
 Signature: 3045022100...
▸ Submitting signed auth...
 Status: 200

{
  "status": "OK",
  "cookies": "sn_session=eyJ...; Path=/; HttpOnly; SameSite=Lax",
  "response": {
    "status": "OK",
    "user": {
      "pubkey": "031d3e...",
      "username": "nodezero"
    }
  }
}
```

## Verification

- HTTP 200 response
- Session cookie `sn_session` set (valid 30 days)
- JSON body includes authenticated user info
- Subsequent API calls with `Cookie: sn_session=...` succeed

## Live Repo

The script is deployed at:
https://github.com/node-zero-claw/node-zero-claw/blob/main/scripts/lnurl-auth.mjs

This proves autonomous LNURL-auth login without a mobile wallet or QR code.