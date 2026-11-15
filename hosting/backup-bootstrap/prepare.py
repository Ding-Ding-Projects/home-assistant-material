"""Seed TLS into an unused HAOS data partition without mounts or host devices."""
import hashlib
import json
import lzma
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tarfile
import zipfile
import zlib

LIMIT = 64 * 1024**3
CHUNK = 1024**2
OUTPUT = Path('/output')
SOURCE = Path('/input/base')


def command(args):
    result = subprocess.run(args, capture_output=True, timeout=1800, check=False)
    if result.returncode:
        raise ValueError('image_tool_failed')
    return result.stdout


def copy_bounded(source, target, count=LIMIT):
    total = 0
    while data := source.read(min(CHUNK, count - total + 1)):
        total += len(data)
        if total > count:
            raise ValueError('image_size_limit')
        target.write(data)
    return total


def digest(file):
    value = hashlib.sha256()
    with file.open('rb') as handle:
        while data := handle.read(CHUNK):
            value.update(data)
    return value.hexdigest()


def extract_image(name):
    disk = OUTPUT / 'source-disk'
    if name.endswith('.img.xz'):
        with lzma.open(SOURCE, 'rb') as source, disk.open('xb') as target:
            copy_bounded(source, target)
        return disk, 'raw'
    if name.endswith('.vdi.zip'):
        with zipfile.ZipFile(SOURCE) as archive:
            entries = archive.infolist()
            if len(entries) > 100 or any(e.flag_bits & 1 for e in entries):
                raise ValueError('invalid_archive')
            disks = [e for e in entries if e.filename.endswith('.vdi') and not e.is_dir()]
            if len(disks) != 1 or disks[0].file_size > LIMIT:
                raise ValueError('invalid_archive')
            with archive.open(disks[0]) as source, disk.open('xb') as target:
                copy_bounded(source, target)
        return disk, 'vdi'
    if name.endswith('.ova'):
        with tarfile.open(SOURCE, 'r:') as archive:
            disks = []
            for index, entry in enumerate(archive):
                if index >= 100 or not (entry.isfile() or entry.isdir()) or entry.size > LIMIT:
                    raise ValueError('invalid_archive')
                if entry.name.endswith('.vmdk') and entry.isfile():
                    disks.append(entry)
            if len(disks) != 1:
                raise ValueError('invalid_archive')
            with archive.extractfile(disks[0]) as source, disk.open('xb') as target:
                copy_bounded(source, target)
        return disk, 'vmdk'
    raise ValueError('unsupported_image_format')


def data_partition(file):
    size = file.stat().st_size
    if size > LIMIT or size < 1024**2:
        raise ValueError('invalid_image_size')
    with file.open('rb') as disk:
        disk.seek(512)
        header = bytearray(disk.read(512))
        if header[:8] != b'EFI PART':
            return mbr_data_partition(disk, size)
        header_size, expected_crc = struct.unpack_from('<II', header, 12)
        if not 92 <= header_size <= 512:
            raise ValueError('invalid_gpt')
        struct.pack_into('<I', header, 16, 0)
        if zlib.crc32(header[:header_size]) != expected_crc:
            raise ValueError('invalid_gpt_crc')
        entries_lba, count, entry_size, entries_crc = struct.unpack_from('<QIII', header, 72)
        if count > 256 or entry_size != 128 or entries_lba < 2:
            raise ValueError('invalid_gpt_entries')
        disk.seek(entries_lba * 512)
        entries = disk.read(count * entry_size)
        if len(entries) != count * entry_size or zlib.crc32(entries) != entries_crc:
            raise ValueError('invalid_gpt_entries_crc')
        partitions = []
        for offset in range(0, len(entries), entry_size):
            entry = entries[offset:offset + entry_size]
            if entry[:16] == bytes(16):
                continue
            first, last = struct.unpack_from('<QQ', entry, 32)
            if first < 34 or first > last or (last + 1) * 512 > size:
                raise ValueError('invalid_partition_bounds')
            partitions.append((first * 512, (last - first + 1) * 512, entry[56:128].decode('utf-16-le').rstrip('\0')))
        ordered = sorted(partitions)
        if any(a[0] + a[1] > b[0] for a, b in zip(ordered, ordered[1:])):
            raise ValueError('overlapping_partitions')
        matches = [p for p in partitions if p[2] == 'hassos-data']
        if len(matches) != 1:
            raise ValueError('data_partition_missing')
        start, length, _ = matches[0]
        disk.seek(start + 1024)
        superblock = disk.read(1024)
        if superblock[56:58] != b'\x53\xef' or superblock[120:136].rstrip(b'\0') != b'hassos-data':
            raise ValueError('data_filesystem_mismatch')
        return start, length


def mbr_data_partition(disk, size):
    # HAOS MBR layouts place hassos-data in a forced primary partition. Never
    # descend into an extended partition or guess from a partition's number.
    disk.seek(0)
    mbr = disk.read(512)
    if mbr[510:512] != b'\x55\xaa':
        raise ValueError('partition_table_required')
    partitions = []
    candidates = []
    for offset in range(446, 510, 16):
        kind = mbr[offset + 4]
        first, sectors = struct.unpack_from('<II', mbr, offset + 8)
        if kind == 0:
            if first or sectors:
                raise ValueError('invalid_mbr')
            continue
        if kind == 0xee:
            raise ValueError('invalid_protective_gpt')
        start, length = first * 512, sectors * 512
        if first < 1 or not sectors or start + length > size:
            raise ValueError('invalid_partition_bounds')
        partitions.append((start, length))
        if kind == 0x83 and length >= 2048:
            disk.seek(start + 1024)
            block = disk.read(1024)
            if block[56:58] == b'\x53\xef' and block[120:136].rstrip(b'\0') == b'hassos-data':
                candidates.append((start, length))
    ordered = sorted(partitions)
    if any(a[0] + a[1] > b[0] for a, b in zip(ordered, ordered[1:])):
        raise ValueError('overlapping_partitions')
    if len(candidates) != 1:
        raise ValueError('data_partition_missing')
    return candidates[0]


def debug(partition, text, writable=False):
    args = ['debugfs'] + (['-w'] if writable else []) + ['-R', text, str(partition)]
    # debugfs sometimes returns zero for a failed command. Callers verify actual file bytes.
    return command(args)


def exists(partition, guest_path):
    return b'Inode:' in debug(partition, 'stat ' + guest_path)


def seed(raw, request):
    start, length = data_partition(raw)
    partition = OUTPUT / 'data.ext4'
    with raw.open('rb') as source, partition.open('xb') as target:
        source.seek(start)
        remaining = length
        while remaining:
            data = source.read(min(CHUNK, remaining))
            if not data:
                raise ValueError('truncated_data_partition')
            target.write(data)
            remaining -= len(data)
    # Reject all existing configurations, not merely an existing login database.
    for item in ['/supervisor/homeassistant', '/supervisor/homeassistant.json', '/supervisor/backup', '/supervisor/.backup-bootstrap']:
        if exists(partition, item):
            raise ValueError('fresh_image_required')
    if not exists(partition, '/supervisor'):
        raise ValueError('supervisor_data_missing')
    for directory in ['/supervisor/homeassistant', '/supervisor/homeassistant/.backup-bootstrap']:
        debug(partition, 'mkdir ' + directory, True)
        if not exists(partition, directory):
            raise ValueError('data_directory_creation_failed')
    config = 'default_config:\n\nhttp:\n  server_port: 8123\n  ssl_certificate: /config/.backup-bootstrap/cert.pem\n  ssl_key: /config/.backup-bootstrap/key.pem\n'
    content = {'configuration.yaml': config, '.backup-bootstrap/cert.pem': request['cert'], '.backup-bootstrap/key.pem': request['key']}
    for index, (name, value) in enumerate(content.items()):
        temporary = Path('/tmp') / ('seed-' + str(index))
        temporary.write_text(value, encoding='utf-8')
        os.chmod(temporary, 0o600)
        destination = '/supervisor/homeassistant/' + name
        debug(partition, 'write ' + str(temporary) + ' ' + destination, True)
        debug(partition, 'set_inode_field ' + destination + ' mode 0100600', True)
        # Verify each write, including the private key, without printing its contents.
        if debug(partition, 'cat ' + destination) != value.encode():
            raise ValueError('bootstrap_write_verification_failed')
        temporary.unlink()
    command(['e2fsck', '-f', '-n', str(partition)])
    with raw.open('r+b') as target, partition.open('rb') as source:
        target.seek(start)
        copy_bounded(source, target, length)
    partition.unlink()


def main():
    raw_input = sys.stdin.buffer.read(65537)
    if len(raw_input) > 65536:
        raise ValueError('request_too_large')
    request = json.loads(raw_input)
    if request.get('version') != 1 or not re.fullmatch(r'[a-f0-9-]{36}', request.get('jobId', '')) or request.get('format') not in ['raw', 'vdi', 'vmdk']:
        raise ValueError('invalid_request')
    if not isinstance(request.get('cert'), str) or not isinstance(request.get('key'), str) or len(request['cert']) > 16384 or len(request['key']) > 16384:
        raise ValueError('invalid_tls_identity')
    if digest(SOURCE) != request.get('sourceSha256'):
        raise ValueError('source_hash_mismatch')
    if any(OUTPUT.iterdir()):
        raise ValueError('fresh_output_required')
    # Conversion and partition copies need bounded spare capacity on the private volume.
    if shutil.disk_usage(OUTPUT).free < 2 * SOURCE.stat().st_size + 1024**3:
        raise ValueError('insufficient_image_workspace')
    disk, source_format = extract_image(request['source'])
    info = json.loads(command(['qemu-img', 'info', '--output=json', '-f', source_format, str(disk)]))
    if info.get('backing-filename') or not 1024**2 <= info.get('virtual-size', 0) <= LIMIT:
        raise ValueError('external_or_oversized_image')
    if shutil.disk_usage(OUTPUT).free < 3 * info['virtual-size']:
        raise ValueError('insufficient_image_workspace')
    raw = OUTPUT / 'working.img'
    command(['qemu-img', 'convert', '-f', source_format, '-O', 'raw', str(disk), str(raw)])
    disk.unlink()
    seed(raw, request)
    destination = OUTPUT / ('appliance.' + ('img' if request['format'] == 'raw' else request['format']))
    if request['format'] == 'raw':
        raw.rename(destination)
    else:
        command(['qemu-img', 'convert', '-f', 'raw', '-O', request['format'], str(raw), str(destination)])
        raw.unlink()
    os.chmod(destination, 0o600)
    print(json.dumps({'version': 1, 'state': 'prepared', 'sha256': digest(destination)}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Tool output and exception text can contain private input. Never forward either.
        print('{"state":"failed","code":"bootstrap_preparation_failed"}', file=sys.stderr)
        sys.exit(1)
