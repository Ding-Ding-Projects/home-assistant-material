"""Synthetic partition validation; no VM, device, mount or real backup is used."""
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest
import zlib

spec = importlib.util.spec_from_file_location('bootstrap_prepare', Path(__file__).with_name('prepare.py'))
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


def image_bytes():
    disk = bytearray(2 * 1024**2)
    entries = bytearray(128 * 4)
    entries[:16] = b'\x01' * 16
    struct.pack_into('<QQ', entries, 32, 2048, 4094)
    name = 'hassos-data'.encode('utf-16-le')
    entries[56:56 + len(name)] = name
    disk[1024:1024 + len(entries)] = entries
    header = bytearray(512)
    header[:8] = b'EFI PART'
    struct.pack_into('<II', header, 8, 0x10000, 92)
    struct.pack_into('<QIII', header, 72, 2, 4, 128, zlib.crc32(entries))
    struct.pack_into('<I', header, 16, zlib.crc32(header[:92]))
    disk[512:1024] = header
    start = 2048 * 512 + 1024
    disk[start + 56:start + 58] = b'\x53\xef'
    disk[start + 120:start + 131] = b'hassos-data'
    return disk


class PartitionValidation(unittest.TestCase):
    def read_partition(self, data):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'synthetic.img'
            file.write_bytes(data)
            return prepare.data_partition(file)

    def test_valid_data_partition_bounds(self):
        self.assertEqual(self.read_partition(image_bytes()), (2048 * 512, (4094 - 2048 + 1) * 512))

    def test_modified_header_is_rejected(self):
        disk = image_bytes()
        disk[512 + 40] ^= 1
        with self.assertRaisesRegex(ValueError, 'invalid_gpt_crc'):
            self.read_partition(disk)

    def test_modified_partition_table_is_rejected(self):
        disk = image_bytes()
        disk[1024 + 40] ^= 1
        with self.assertRaisesRegex(ValueError, 'invalid_gpt_entries_crc'):
            self.read_partition(disk)

    def test_non_data_filesystem_is_rejected(self):
        disk = image_bytes()
        disk[2048 * 512 + 1024 + 120] = ord('x')
        with self.assertRaisesRegex(ValueError, 'data_filesystem_mismatch'):
            self.read_partition(disk)

    def test_mbr_primary_data_partition(self):
        disk = image_bytes()
        disk[512:1536] = bytes(1024)
        disk[510:512] = b'\x55\xaa'
        disk[446 + 4] = 0x83
        struct.pack_into('<II', disk, 446 + 8, 2048, 2047)
        self.assertEqual(self.read_partition(disk), (2048 * 512, 2047 * 512))

    def test_damaged_gpt_never_falls_back_to_protective_mbr(self):
        disk = image_bytes()
        disk[512:520] = bytes(8)
        disk[510:512] = b'\x55\xaa'
        disk[446 + 4] = 0xee
        struct.pack_into('<II', disk, 446 + 8, 1, 4095)
        with self.assertRaisesRegex(ValueError, 'invalid_protective_gpt'):
            self.read_partition(disk)


if __name__ == '__main__':
    unittest.main()
