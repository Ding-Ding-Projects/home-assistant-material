'use strict';
const dns = require('node:dns').promises;
const net = require('node:net');
const { fail } = require('./backup-archive');
const privateV4 = (address) => typeof address === 'string' && net.isIPv4(address) && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
function validateAddresses(addresses) {
  if (!Array.isArray(addresses) || addresses.length > 16 || addresses.some((address) => !privateV4(address))) throw fail('invalid_pi_addresses');
  return [...new Set(addresses)];
}
async function discoverPi({ addresses = [], transport, signal, wait, lookup = dns.lookup, timeoutMs = 30 * 60000, onWaiting }) {
  const explicit = validateAddresses(addresses);
  const candidates = async () => {
    if (signal?.aborted) throw fail('cancelled');
    if (explicit.length) return explicit;
    let timeout;
    try {
      const rows = await Promise.race([lookup('homeassistant.local', { all: true, family: 4 }), new Promise((resolve) => { timeout = setTimeout(() => resolve([]), 5000); })]);
      if (signal?.aborted) throw fail('cancelled');
      if (rows.length > 16) throw fail('bootstrap_candidates_invalid');
      return rows.map((row) => row.address).filter(privateV4);
    } catch (error) { if (error.code === 'cancelled' || error.code === 'bootstrap_candidates_invalid') throw error; return []; }
    finally { clearTimeout(timeout); }
  };
  const waitForIdentity = wait || require('./backup-bootstrap').waitForOwnedAppliance;
  return waitForIdentity({ candidates, transport, signal, timeoutMs, onWaiting });
}
module.exports = { discoverPi, validateAddresses, privateV4 };
