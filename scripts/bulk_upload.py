
from pathlib import Path
import argparse
import mimetypes
import time

import requests


def upload_files(directory: Path, api_url: str):
    files = sorted(
        p for p in directory.rglob("*")
        if p.is_file() and p.suffix.lower() in {".pdf", ".pptx"}
    )

    print(f"対象ファイル数: {len(files)}")

    success = 0
    failed = 0

    for index, path in enumerate(files, start=1):
        print(f"[{index}/{len(files)}] {path.name}")

        mime_type = (
            "application/pdf"
            if path.suffix.lower() == ".pdf"
            else "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        )

        relative_folder = path.parent.relative_to(directory)
        folder_parts = list(relative_folder.parts)

        try:
            with path.open("rb") as f:
                response = requests.post(
                    api_url,
                    files={
                        "file": (path.name, f, mime_type)
                    },
                    data=[
                        ("title", path.stem),
                        *[
                            ("folderPath", part)
                            for part in folder_parts
                        ],
                    ],
                    timeout=120,
                )

            response.raise_for_status()
            result = response.json()
            print(f"  登録成功: {result['id']}")
            success += 1

        except (requests.RequestException, ValueError) as e:
            print(f"  登録失敗: {e}")
            failed += 1

        time.sleep(0.2)

    print(f"\n完了: 成功 {success}件 / 失敗 {failed}件")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument(
        "--api-url",
        default="http://localhost:3000/api/documents",
    )
    args = parser.parse_args()

    if not args.directory.is_dir():
        parser.error("指定したディレクトリが存在しません")

    upload_files(args.directory, args.api_url)
