"""Stage the Supervisor catalog in a new directory without test fixture apps."""

import argparse
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
APP = Path("addons/home_assistant_material")
FILES = ["config.yaml", "Dockerfile", "ingress.py", "panel.html", "panel.js", "README.md"]


def export(destination: Path) -> None:
    sources = [Path("repository.yaml"), *(APP / name for name in FILES)]
    if any(not (ROOT / path).is_file() for path in sources):
        raise ValueError("Incomplete catalog source")
    destination.mkdir(parents=True, exist_ok=False)
    (destination / APP).mkdir(parents=True)
    for path in sources:
        shutil.copyfile(ROOT / path, destination / path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    export(parser.parse_args().destination)
