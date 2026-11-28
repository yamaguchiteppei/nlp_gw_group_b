from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import slide_library_api
from app.main import app

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(slide_library_api, "DATA_DIR", tmp_path)
    monkeypatch.setattr(slide_library_api, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(slide_library_api, "PREVIEW_DIR", tmp_path / "previews")
    monkeypatch.setattr(slide_library_api, "METADATA_FILE", tmp_path / "documents.json")
    monkeypatch.setattr(
        slide_library_api, "PAGE_METADATA_FILE", tmp_path / "pages.json"
    )
    monkeypatch.setattr(slide_library_api, "PAGES", {})


@pytest.mark.parametrize("format", ["pdf", "pptx"])
def test_registered_document_has_persistent_pages_and_previews(
    isolated_data, format
) -> None:
    client = TestClient(app)
    fixture = FIXTURES / f"sample.{format}"
    upload = client.post(
        "/api/documents",
        data={"title": "合成研究発表", "authors": "研究者"},
        files={"file": (fixture.name, fixture.read_bytes())},
    )

    assert upload.status_code == 202
    document_id = upload.json()["id"]
    status = client.get(f"/api/documents/{document_id}").json()
    assert status["status"] == "ready"
    assert status["pageCount"] == 2
    assert status["error"] is None

    listing = client.get(f"/api/documents/{document_id}/pages").json()
    assert listing["total"] == 2
    assert [page["pageNumber"] for page in listing["items"]] == [1, 2]
    assert [page["heading"] for page in listing["items"]] == [
        "研究背景",
        "提案手法",
    ]
    page_id = listing["items"][0]["id"]
    preview = client.get(f"/api/pages/{page_id}/preview")
    assert preview.status_code == 200
    assert preview.headers["content-type"] == "image/png"
    assert preview.content.startswith(b"\x89PNG")

    # 新しいAPIクライアントからもファイル上のページ情報を読める。
    another_client = TestClient(app)
    assert another_client.get(f"/api/pages/{page_id}").status_code == 200
    search = another_client.post(
        "/api/pages/search", json={"query": "研究背景"}
    ).json()
    assert any(page["id"] == page_id for page in search["items"])

    tags = another_client.put(
        f"/api/pages/{page_id}/tags", json={"tags": ["背景"]}
    )
    assert tags.status_code == 200
    assert TestClient(app).get(f"/api/pages/{page_id}").json()["tags"] == ["背景"]
    tagged_search = TestClient(app).post(
        "/api/pages/search", json={"filters": {"tag": "背景"}}
    ).json()
    assert any(page["id"] == page_id for page in tagged_search["items"])


@pytest.mark.parametrize("filename, content", [
    ("invalid.pdf", b"%PDF-invalid"),
    ("invalid.pptx", b"PK-invalid"),
])
def test_failed_import_updates_status(isolated_data, filename, content) -> None:
    client = TestClient(app)
    upload = client.post(
        "/api/documents",
        data={"title": "壊れた資料"},
        files={"file": (filename, content)},
    )

    assert upload.status_code == 202
    document_id = upload.json()["id"]
    status = client.get(f"/api/documents/{document_id}").json()
    assert status["status"] == "failed"
    assert status["pageCount"] is None
    assert status["error"]
    assert client.get(f"/api/documents/{document_id}/pages").json()["total"] == 0
    assert client.get("/api/pages/missing/preview").status_code == 404
