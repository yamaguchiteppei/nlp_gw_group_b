
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from app.page_extractor import extract_pages


# Dockerコンテナ内の保存先
DATA_DIR = Path("/data")
PAGES_FILE = DATA_DIR / "pages.json"


def load_pages() -> dict[str, dict]:
    """保存済みのページ情報を読み込む。"""

    if not PAGES_FILE.exists():
        return {}

    with PAGES_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_pages(pages: dict[str, dict]) -> None:
    """ページ情報をJSONファイルに保存する。"""

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # 書き込み途中でファイルが壊れることを防ぐため、
    # 一時ファイルに書き込んでから置き換える
    fd, temp_path = tempfile.mkstemp(
        dir=DATA_DIR,
        suffix=".tmp",
    )

    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(
                pages,
                f,
                ensure_ascii=False,
                indent=2,
            )

        os.replace(temp_path, PAGES_FILE)

    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)


from app.page_extractor import extract_pages, generate_previews


def register_document_pages(
    document_id: str,
    file_path: Path,
    document_info: dict,
) -> int:
    extracted_pages = extract_pages(file_path)
    preview_urls = generate_previews(file_path, document_id)

    pages = load_pages()

    for item in extracted_pages:
        page_number = item["pageNumber"]
        text = item["text"]

        page_id = f"{document_id}-page-{page_number:04d}"

        existing_tags = pages.get(page_id, {}).get("tags", [])

        lines = [
            line.strip()
            for line in text.splitlines()
            if line.strip()
        ]

        heading = lines[0][:200] if lines else ""
        summary = text[:500]

        pages[page_id] = {
            "id": page_id,
            "documentId": document_id,
            "pageNumber": page_number,
            "heading": heading,
            "summary": summary,
            "tags": existing_tags,
            "previewUrl": preview_urls.get(page_number),
            "document": document_info,
        }

    save_pages(pages)

    return len(extracted_pages)
