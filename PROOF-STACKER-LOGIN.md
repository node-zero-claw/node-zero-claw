# Stacker News LNURL-auth Status

Status: **experimental / not verified as a complete login flow in v0.1**.

Earlier notes claimed that Stacker News returned a direct `sn_session` from the LNURL-auth callback. Treat that as stale until re-tested against the current Stacker News flow.

Current working assumption:

1. LNURL-auth can validate the signature for a Lightning pubkey.
2. A separate NextAuth/session flow may be required before authenticated GraphQL/posting works.
3. New accounts may also require funding and/or moderation before posts appear.

Do not advertise Stacker News as fully supported until the repo includes a reproducible script that:

- obtains/uses CSRF state if required,
- completes session establishment,
- verifies authenticated API access,
- documents funding/moderation constraints,
- and passes a smoke test without hardcoded local secrets.

The v0.1 CLI remains useful for Predyx and generic LNURL-auth callback experiments.
