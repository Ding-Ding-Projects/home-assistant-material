'use strict';
const fs = require('node:fs');
const MAX_BYTES = 64 * 1024 ** 3;
const RESERVE = 1024 ** 3;
const capacityError = (code) => Object.assign(new Error(code), { code });

// All reservations are synchronous so concurrent requests cannot pass the same free-space check.
class UploadCapacity {
  constructor(dir, { statfs = fs.statfsSync, slots = 2, perOwner = 1, maximumBytes = 256 * 1024 ** 3 } = {}) {
    this.dir = dir; this.statfs = statfs; this.slots = slots; this.perOwner = perOwner; this.maximumBytes = maximumBytes; this.reservations = new Set();
  }
  reserve(owner, size) {
    const bytes = size * 3 + Math.min(MAX_BYTES, Math.max(1024 * 1024, size * 200));
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES) throw capacityError('invalid_upload');
    if (this.reservations.size >= this.slots || [...this.reservations].filter((r) => r.owner === owner).length >= this.perOwner) throw capacityError('upload_capacity');
    const reserved = [...this.reservations].reduce((sum, r) => sum + r.bytes, 0);
    const free = this.statfs(this.dir);
    if (reserved + bytes > this.maximumBytes || free.bavail * free.bsize < reserved + bytes + RESERVE) throw capacityError('insufficient_storage');
    const reservation = { owner, bytes, released: false, release: () => { if (!reservation.released) { reservation.released = true; this.reservations.delete(reservation); } } };
    this.reservations.add(reservation); return reservation;
  }
}
module.exports = { UploadCapacity };
