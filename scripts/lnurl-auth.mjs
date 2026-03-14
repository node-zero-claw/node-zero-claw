import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import secp256k1 from 'secp256k1';
import https from 'https';
import fs from 'fs';

// Parse NWC connection string to extract the secret
const nwcUri = fs.readFileSync('/home/ops/.alby-cli/connection-secret.key', 'utf8').trim();
const nwcSecret = hexToBytes(new URL(nwcUri).searchParams.get('secret'));

// Derive LNURL-auth linking key: HMAC-SHA256(nwc_secret, "lnurl-auth")
const privKey = hmac(sha256, nwcSecret, Buffer.from('lnurl-auth', 'utf8'));
const pubKeyObj = secp256k1.publicKeyCreate(privKey, true); // compressed
const pubKeyHex = bytesToHex(pubKeyObj);
console.log('Linking pubkey:', pubKeyHex);

// Helper: HTTPS GET with optional cookies
function httpsGet(hostname, path, cookies = []) {
  return new Promise((resolve, reject) => {
    const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
    const headers = {};
    if (cookieStr) headers['Cookie'] = cookieStr;
    https.get({ hostname, port: 443, path, headers }, (res) => {
      const setCookies = res.headers['set-cookie'] || [];
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: data,
        setCookies: Array.isArray(setCookies) ? setCookies : [setCookies].filter(Boolean)
      }));
    }).on('error', reject);
  });
}

async function main() {
  // Step 1: Get login LNURL from Predyx
  console.log('\n--- Step 1: Fetching login LNURL ---');
  const loginRes = await httpsGet('beta.predyx.com', '/api/auth/do-login');
  const loginData = JSON.parse(loginRes.body);
  const k1 = loginData.k1;
  console.log('k1:', k1);

  // Step 2: Sign k1 with ECDSA (DER-encoded)
  console.log('\n--- Step 2: Signing k1 ---');
  const k1Buf = Buffer.from(k1, 'hex');
  const sigObj = secp256k1.ecdsaSign(k1Buf, privKey);
  const sigDer = secp256k1.signatureExport(sigObj.signature);
  const sigHex = bytesToHex(sigDer);
  console.log('Signature (DER):', sigHex);

  // Step 3: Submit signature to callback
  console.log('\n--- Step 3: Submitting to callback ---');
  const callbackPath = `/api/auth/lnurl/callback?k1=${k1}&tag=login&sig=${sigHex}&key=${pubKeyHex}`;
  const callbackRes = await httpsGet('beta.predyx.com', callbackPath);
  console.log('Status:', callbackRes.statusCode);
  console.log('Response:', callbackRes.body);

  if (callbackRes.body.includes('"OK"')) {
    // Step 4: Poll for auth result and session cookies
    console.log('\n--- Step 4: Polling for session ---');
    const pollRes = await httpsGet('beta.predyx.com', `/api/auth/lnurl/poll/${k1}`);
    console.log('Status:', pollRes.statusCode);
    console.log('Response:', pollRes.body);

    if (pollRes.setCookies.length > 0) {
      console.log('\n✅ Session cookies received:');
      pollRes.setCookies.forEach(c => console.log('  ', c.split(';')[0]));
      fs.writeFileSync('/home/ops/.openclaw/workspace/predyx-cookies.txt',
        pollRes.setCookies.map(c => c.split(';')[0]).join('; '));
      console.log('Saved to predyx-cookies.txt');

      // Step 5: Verify we're logged in
      console.log('\n--- Step 5: Verifying login ---');
      const meRes = await httpsGet('beta.predyx.com', '/api/auth/me', pollRes.setCookies);
      console.log('User:', meRes.body);
    } else {
      console.log('\n⚠️  No session cookies in poll response');
    }
  } else {
    console.log('\n❌ Callback failed');
  }
}

main().catch(e => console.error('Fatal:', e));
