/**
 * AlnawrasPOS — Local Print Proxy (hardened)
 *
 * Bridges the web app to LAN thermal printers over raw TCP (browsers cannot open
 * TCP sockets). Runs on the Cashier device.
 *
 * SECURITY MODEL
 *   Previously this accepted ANY { ip, port } and opened a socket to it — an
 *   unauthenticated SSRF / arbitrary-TCP-write primitive reachable from the whole
 *   LAN. It is now locked down:
 *     - Binds to 127.0.0.1 by default (only this device can reach it). Set
 *       PRINT_PROXY_HOST=0.0.0.0 only if other devices must print via this host,
 *       and keep the printer allowlist + token below when you do.
 *     - Only connects to allowlisted printer IPs (PRINTER_IPS) — or, if none are
 *       configured, only to private/loopback LAN addresses — and only to
 *       allowlisted ports (PRINTER_PORTS, default 9100). Public/Internet targets
 *       are always rejected. This removes the SSRF primitive.
 *     - CORS is limited to the configured app origins (no wildcard).
 *     - Optional shared token (PRINT_PROXY_TOKEN) required via the x-print-token
 *       header.
 *     - Request bodies are size-capped and payloads must be valid hex.
 *
 * Run:  node print-proxy.js
 */

const express = require('express');
const net = require('net');
const cors = require('cors');

const app = express();

const PORT = Number(process.env.PRINT_PROXY_PORT || 3001);
const HOST = process.env.PRINT_PROXY_HOST || '127.0.0.1';
const TOKEN = process.env.PRINT_PROXY_TOKEN || '';
const PRINTER_IPS = (process.env.PRINTER_IPS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const PRINTER_PORTS = (process.env.PRINTER_PORTS || '9100')
  .split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0 && n < 65536);
const ALLOWED_ORIGINS = (process.env.PRINT_PROXY_ORIGINS ||
  'https://amralwaeli.github.io,capacitor://localhost,http://localhost,http://localhost:5173')
  .split(',').map((s) => s.trim()).filter(Boolean);
const MAX_BYTES = 256 * 1024;
const HEX_RE = /^[0-9a-fA-F]+$/;

app.use(cors({
  origin(origin, cb) {
    // Non-browser callers (the APK, curl) may send no Origin — allow those; the
    // printer allowlist + optional token are the real controls. Browser origins
    // must be explicitly allowlisted.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Origin not allowed'));
  },
}));
app.use(express.json({ limit: '300kb' }));

/** True for loopback / RFC1918 / link-local IPv4 — i.e. a LAN-local target. */
function isPrivateIp(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const octets = m.slice(1).map(Number);
  if (octets.some((n) => n > 255)) return false;
  const [a, b] = octets;
  if (a === 127) return true;                        // 127.0.0.0/8
  if (a === 10) return true;                         // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
  if (a === 192 && b === 168) return true;           // 192.168.0.0/16
  if (a === 169 && b === 254) return true;           // 169.254.0.0/16
  return false;
}

function targetAllowed(ip, port) {
  if (!PRINTER_PORTS.includes(port)) return false;
  if (PRINTER_IPS.length) return PRINTER_IPS.includes(ip);
  return isPrivateIp(ip); // no explicit allowlist → restrict to LAN-local
}

app.post('/print', (req, res) => {
  if (TOKEN && req.get('x-print-token') !== TOKEN) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { ip, port, data } = req.body || {};
  const printerPort = Number(port) || PRINTER_PORTS[0];

  if (!ip || typeof ip !== 'string' || !data || typeof data !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing IP or print data' });
  }
  if (!HEX_RE.test(data) || data.length % 2 !== 0) {
    return res.status(400).json({ success: false, error: 'Print data must be a hex string' });
  }
  if (data.length / 2 > MAX_BYTES) {
    return res.status(413).json({ success: false, error: 'Print job too large' });
  }
  if (!targetAllowed(ip, printerPort)) {
    console.warn(`[PrintProxy] Rejected target ${ip}:${printerPort} (not allowlisted)`);
    return res.status(403).json({ success: false, error: 'Printer target not allowed' });
  }

  const client = new net.Socket();
  client.setTimeout(5000);
  client.connect(printerPort, ip, () => {
    client.write(Buffer.from(data, 'hex'), () => {
      client.end();
      res.json({ success: true });
    });
  });
  client.on('error', (err) => {
    console.error(`Printer Error (${ip}):`, err.message);
    if (!res.headersSent) res.status(502).json({ success: false, error: 'Printer unreachable' });
  });
  client.on('timeout', () => {
    client.destroy();
    if (!res.headersSent) res.status(504).json({ success: false, error: 'Printer connection timeout' });
  });
});

app.listen(PORT, HOST, () => {
  console.log('-----------------------------------------');
  console.log('AlnawrasPOS Print Proxy (hardened) running');
  console.log(`Listening:  http://${HOST}:${PORT}`);
  console.log(`Printer IPs: ${PRINTER_IPS.length ? PRINTER_IPS.join(', ') : '(none set → LAN-private IPs only)'}`);
  console.log(`Ports:      ${PRINTER_PORTS.join(', ')}`);
  console.log(`Auth token: ${TOKEN ? 'required' : 'disabled (set PRINT_PROXY_TOKEN to enable)'}`);
  console.log('-----------------------------------------');
});
