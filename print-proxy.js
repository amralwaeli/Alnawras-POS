/**
 * AlnawrasPOS - Local Print Proxy
 * 
 * Run this on the Cashier PC/Android device to bridge the Web App to LAN Printers.
 * This bypasses browser security restrictions for direct TCP printing.
 */

const express = require('express');
const net = require('net');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.post('/print', (req, res) => {
  const { ip, port, data } = req.body;

  if (!ip || !data) {
    return res.status(400).json({ success: false, error: 'Missing IP or print data' });
  }

  const client = new net.Socket();
  const printerPort = port || 9100;

  client.setTimeout(5000);

  client.connect(printerPort, ip, () => {
    // Convert hex string back to buffer
    const buffer = Buffer.from(data, 'hex');
    client.write(buffer, () => {
      client.end();
      res.json({ success: true });
    });
  });

  client.on('error', (err) => {
    console.error(`Printer Error (${ip}):`, err.message);
    res.status(500).json({ success: false, error: err.message });
  });

  client.on('timeout', () => {
    client.destroy();
    res.status(504).json({ success: false, error: 'Printer connection timeout' });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`-----------------------------------------`);
  console.log(`AlnawrasPOS Print Proxy is Running!`);
  console.log(`Port: ${PORT}`);
  console.log(`Status: Listening for print jobs...`);
  console.log(`-----------------------------------------`);
});
