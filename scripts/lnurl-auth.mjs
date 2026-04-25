#!/usr/bin/env node
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { concatBytes } from '@noble/hashes/utils';
import { bech32 } from '@scure/base';
import crypto from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';
import * as secp256k1 from '@noble/secp256k1';

secp256k1.utils.hmacSha256Sync = (key, ...msgs) => hmac(sha256, key, concatBytes(...msgs));

const SERVICES = {
  predyx: {
    loginUrl: 'https://beta.predyx.com/api/auth/do-login',
    callbackTemplate: 'https://beta.predyx.com/api/auth/lnurl/callback?k1={k1}&tag=login&sig={sig}&key={key}',
    pollTemplate: 'https://beta.predyx.com/api/auth/lnurl/poll/{k1}'
  }
};

function usage() {
  console.log(`LNURL-auth v0.1\n\nUsage:\n  node scripts/lnurl-auth.mjs --service predyx --key <64-char-hex>\n  node scripts/lnurl-auth.mjs --lnurl <lnurl-or-https-url> --key <64-char-hex>\n  node scripts/lnurl-auth.mjs --service predyx --nwc-file ./connection.txt --cookie-file ./cookies.txt\n\nOptions:\n  --service <name>       Known service. v0.1 supports: predyx\n  --lnurl <value>        LNURL bech32 string or HTTPS LNURL-auth callback/login URL\n  --key <hex>            32-byte private key as 64-char hex\n  --nwc-secret <hex>     NWC secret; derives a deterministic LNURL-auth key with HMAC-SHA256\n  --nwc-file <path>      File containing nostr+walletconnect URI or raw NWC secret hex\n  --cookie-file <path>   Optional path to write returned Set-Cookie values\n  --dry-run              Print derived request info without submitting signature\n  --verbose              Print request diagnostics to stderr\n  --help                 Show this help\n\nSecurity:\n  Secrets are never printed. Cookies are only written when --cookie-file is explicit.\n`);
}

function parseArgs(argv) {
  const args = { dryRun: false, verbose: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--verbose') args.verbose = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const val = argv[++i];
      if (!val || val.startsWith('--')) throw new Error(`${a} requires a value`);
      args[key] = val;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

function hexToBytes(hex, label = 'hex') {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2) throw new Error(`Invalid ${label}`);
  return Buffer.from(hex, 'hex');
}

function readNwcSecret(value) {
  const text = value.trim();
  if (/^[0-9a-fA-F]{64}$/.test(text)) return text.toLowerCase();
  const url = new URL(text);
  const secret = url.searchParams.get('secret');
  if (!secret || !/^[0-9a-fA-F]{64}$/.test(secret)) throw new Error('NWC URI does not contain a 64-char hex secret');
  return secret.toLowerCase();
}

function privateKeyFromArgs(args) {
  let priv;
  if (args.key) {
    priv = hexToBytes(args.key, 'private key');
  } else if (args.nwcSecret || args.nwcFile) {
    const secretHex = args.nwcSecret || readNwcSecret(fs.readFileSync(args.nwcFile, 'utf8'));
    const nwcSecret = hexToBytes(secretHex, 'NWC secret');
    priv = crypto.createHmac('sha256', nwcSecret).update('lnurl-auth').digest();
  } else {
    throw new Error('Provide --key, --nwc-secret, or --nwc-file');
  }
  if (priv.length !== 32 || !secp256k1.utils.isValidPrivateKey(priv)) throw new Error('Derived/provided private key is not valid secp256k1 material');
  return priv;
}

function decodeLnurl(value) {
  const decoded = bech32.decode(value.toLowerCase(), 2000);
  if (decoded.prefix !== 'lnurl') throw new Error('Bech32 value is not an LNURL');
  return Buffer.from(bech32.fromWords(decoded.words)).toString('utf8');
}

async function httpGet(url, cookies = [], verbose = false) {
  if (verbose) console.error(`GET ${url}`);
  const headers = { 'User-Agent': 'node-zero-claw-lnurl-auth/0.1' };
  if (cookies.length) headers.Cookie = cookies.map(c => c.split(';')[0]).join('; ');
  const res = await fetch(url, { headers, redirect: 'manual' });
  const body = await res.text();
  const setCookie = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  if (verbose) console.error(`<- ${res.status} ${body.slice(0, 200).replace(/\s+/g, ' ')}`);
  return { status: res.status, headers: Object.fromEntries(res.headers), body, setCookie };
}

async function resolveChallenge(args) {
  if (args.service) {
    const svc = SERVICES[args.service];
    if (!svc) throw new Error(`Unsupported service '${args.service}'. v0.1 supports: ${Object.keys(SERVICES).join(', ')}`);
    const res = await httpGet(svc.loginUrl, [], args.verbose);
    let data;
    try { data = JSON.parse(res.body); } catch { throw new Error(`Service login did not return JSON: HTTP ${res.status}`); }
    const k1 = data.k1 || data.lnurl?.k1;
    if (!k1) throw new Error(`Could not find k1 in ${args.service} login response`);
    return { service: args.service, k1, callbackTemplate: svc.callbackTemplate, pollTemplate: svc.pollTemplate };
  }

  if (!args.lnurl) throw new Error('Provide --service or --lnurl');
  const rawUrl = args.lnurl.startsWith('lnurl') ? decodeLnurl(args.lnurl) : args.lnurl;
  const url = new URL(rawUrl);
  const k1 = url.searchParams.get('k1');
  if (k1) return { service: 'custom', k1, callbackUrl: rawUrl };

  const res = await httpGet(rawUrl, [], args.verbose);
  let data;
  try { data = JSON.parse(res.body); } catch { throw new Error('LNURL endpoint did not contain k1 and did not return JSON'); }
  const callback = data.callback || data.lnurl || data.url;
  const nextK1 = data.k1 || (callback ? new URL(callback).searchParams.get('k1') : null);
  if (!callback || !nextK1) throw new Error('Could not resolve callback/k1 from LNURL endpoint response');
  return { service: 'custom', k1: nextK1, callbackUrl: callback };
}

function signChallenge(k1, privKey) {
  if (!/^[0-9a-fA-F]{64}$/.test(k1)) throw new Error('k1 must be a 32-byte hex challenge');
  return Buffer.from(secp256k1.signSync(hexToBytes(k1, 'k1'), privKey, { der: true })).toString('hex');
}

function buildCallback(challenge, sigHex, pubKeyHex) {
  if (challenge.callbackTemplate) {
    return challenge.callbackTemplate
      .replaceAll('{k1}', encodeURIComponent(challenge.k1))
      .replaceAll('{sig}', encodeURIComponent(sigHex))
      .replaceAll('{key}', encodeURIComponent(pubKeyHex));
  }
  const url = new URL(challenge.callbackUrl);
  url.searchParams.set('sig', sigHex);
  url.searchParams.set('key', pubKeyHex);
  if (!url.searchParams.get('tag')) url.searchParams.set('tag', 'login');
  return url.toString();
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) return usage();

  const privKey = privateKeyFromArgs(args);
  const pubKeyHex = Buffer.from(secp256k1.getPublicKey(privKey, true)).toString('hex');
  const challenge = await resolveChallenge(args);
  const sigHex = signChallenge(challenge.k1, privKey);
  const callbackUrl = buildCallback(challenge, sigHex, pubKeyHex);

  if (args.dryRun) {
    console.log(JSON.stringify({ success: true, dryRun: true, service: challenge.service, k1: challenge.k1, pubkey: pubKeyHex, callbackUrl }, null, 2));
    return;
  }

  const authRes = await httpGet(callbackUrl, [], args.verbose);
  let response;
  try { response = JSON.parse(authRes.body); } catch { response = authRes.body; }
  const out = {
    success: authRes.status >= 200 && authRes.status < 300 && !String(authRes.body).match(/ERROR|FAIL/i),
    service: challenge.service,
    pubkey: pubKeyHex,
    status: authRes.status,
    response
  };

  if (challenge.pollTemplate) {
    const pollUrl = challenge.pollTemplate.replaceAll('{k1}', encodeURIComponent(challenge.k1));
    const pollRes = await httpGet(pollUrl, authRes.setCookie, args.verbose);
    out.pollStatus = pollRes.status;
    try { out.pollResponse = JSON.parse(pollRes.body); } catch { out.pollResponse = pollRes.body; }
    if (pollRes.setCookie.length) out.cookies = pollRes.setCookie.map(c => c.split(';')[0]).join('; ');
  } else if (authRes.setCookie.length) {
    out.cookies = authRes.setCookie.map(c => c.split(';')[0]).join('; ');
  }

  if (args.cookieFile && out.cookies) fs.writeFileSync(args.cookieFile, `${out.cookies}\n`, { mode: 0o600 });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.success ? 0 : 1);
}

main().catch(err => {
  console.error(JSON.stringify({ success: false, error: err.message }, null, 2));
  process.exit(1);
});
