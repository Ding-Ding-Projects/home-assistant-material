"""Test make-offline-pack.py against the Supervisor's own manifest reader.

Run with: python -m unittest scripts/ci/test_make_offline_pack.py
"""
import hashlib
import importlib.util
import json
import pathlib
import tempfile
import unittest
import zipfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


maker = load("make_offline_pack", HERE / "make-offline-pack.py")
reader = load("offline_pack", ROOT / "supervisor/supervisor/os/offline_pack.py")


class MakeOfflinePackTest(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))
        self.bundle = self.tmp / "haos_ova-13.0.7.raucb"
        self.bundle.write_bytes(b"bundle" * 100)
        self.sup = self.tmp / "sup.tar"
        self.sup.write_bytes(b"supervisor image")
        self.out = self.tmp / "out"

    def args(self, *extra):
        return ["--out", str(self.out), "--build", "7", "--board", "ova",
                "--os-bundle", str(self.bundle), *extra]

    def test_os_only_pack_lists_other_parts_unavailable(self):
        folder = maker.build_pack(self._parse(self.args("--core-version", "2026.1.7")))
        manifest = reader.parse_manifest((folder / "manifest.json").read_bytes())
        reader.verify_pack(folder, manifest)
        self.assertEqual(folder.name, "ham-offline-pack-7")
        self.assertTrue(reader.RE_PACK_FOLDER.match(folder.name))
        by_kind = {part.kind.value: part for part in manifest.parts}
        self.assertFalse(by_kind["supervisor"].available)
        self.assertFalse(by_kind["core"].available)
        self.assertEqual(by_kind["core"].version, "2026.1.7")
        self.assertEqual(by_kind["os"].version, "13.0.7")
        self.assertEqual(by_kind["os"].sha256, hashlib.sha256(self.bundle.read_bytes()).hexdigest())

    def test_all_parts_and_zip(self):
        archive = self.tmp / "pack.zip"
        folder = maker.build_pack(self._parse(self.args(
            "--supervisor-image", str(self.sup), "--supervisor-version", "2026.1.7",
            "--zip", str(archive))))
        manifest = reader.parse_manifest((folder / "manifest.json").read_bytes())
        reader.verify_pack(folder, manifest)
        with zipfile.ZipFile(archive) as z:
            self.assertEqual(sorted(z.namelist()), sorted(
                f"ham-offline-pack-7/{p.name}" for p in folder.iterdir()))

    def test_refuses_mismatched_bundle_board(self):
        with self.assertRaises(SystemExit):
            maker.build_pack(self._parse(
                ["--out", str(self.out), "--build", "7", "--board", "rpi4-64",
                 "--os-bundle", str(self.bundle)]))

    def test_refuses_existing_folder(self):
        maker.build_pack(self._parse(self.args()))
        with self.assertRaises(SystemExit):
            maker.build_pack(self._parse(self.args()))

    def test_manifest_is_valid_json_with_format(self):
        folder = maker.build_pack(self._parse(self.args()))
        self.assertEqual(json.loads((folder / "manifest.json").read_text())["format"], 1)

    @staticmethod
    def _parse(argv):
        import argparse
        parser = argparse.ArgumentParser()
        for name in ("out", "build", "board", "os-bundle", "supervisor-image",
                     "supervisor-version", "core-image", "core-version", "zip"):
            parser.add_argument("--" + name)
        return parser.parse_args(argv)


if __name__ == "__main__":
    unittest.main()
