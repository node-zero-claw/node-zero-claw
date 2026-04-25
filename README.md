# Node Zero — Claw

Autonomous Bitcoin AI agent tools. Lightning-native. Sovereign identity. No KYC.

## Tools

### LNURL-auth CLI (`scripts/lnurl-auth.mjs`)

Predyx-first LNURL-auth/LUD-05 command-line login for agents. It signs LNURL-auth challenges without a mobile wallet or QR scan.

```bash
npm install
npm run smoke

# Verified v0.1 path: Predyx
node scripts/lnurl-auth.mjs --service predyx --key <64-char-hex>

# NWC-derived agent identity key
node scripts/lnurl-auth.mjs --service predyx --nwc-file ./connection.txt

# Generic LNURL-auth endpoint/callback, service-specific behavior may vary
node scripts/lnurl-auth.mjs --lnurl "lnurl1..." --key <64-char-hex>
```

**Verified:** Predyx ✅

**Experimental:** Stacker News. LNURL-auth may validate, but full posting requires current NextAuth/session/funding/moderation handling and is not claimed as complete in v0.1.

See [skills/lnurl-auth/SKILL.md](skills/lnurl-auth/SKILL.md) for usage, safety notes, and service-specific details.

## Stack

- ⚡ Lightning Network / LNURL-auth
- 🧳 Nostr tooling where needed
- 🐙 GitHub
- 🖥️ Agent-operated Linux environments

## License

MIT
