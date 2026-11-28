from pathlib import Path

import pytest

from app import importer

FIXTURE = Path(__file__).parent / "fixtures" / "sample.pdf"


def test_import_rejects_excessive_page_count(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(importer, "MAX_PAGES", 1)

    with pytest.raises(importer.ImportFailure, match="1ページ以下"):
        importer.extract_pages(FIXTURE, "pdf", tmp_path)


def test_import_rejects_excessive_preview_bytes(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(importer, "MAX_PREVIEW_BYTES", 1)

    with pytest.raises(importer.ImportFailure, match="合計サイズ"):
        importer.extract_pages(FIXTURE, "pdf", tmp_path)
