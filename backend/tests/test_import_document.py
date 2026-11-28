import json
import struct
import time
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import slide_library_api
from app.main import app

FIXTURES = Path(__file__).parent / "fixtures"


def test_upload_request_id_prevents_duplicate_documents(isolated_data) -> None:
    client = TestClient(app)
    fixture = FIXTURES / "sample.pdf"
    request_id = str(uuid.uuid4())
    kwargs = {
        "data": {"title": "同じ資料", "requestId": request_id},
        "files": {"file": (fixture.name, fixture.read_bytes())},
    }
    first = client.post("/api/documents", **kwargs)
    second = client.post("/api/documents", **kwargs)

    assert first.status_code == second.status_code == 202
    assert first.json()["id"] == second.json()["id"]
    assert len(slide_library_api.read_documents()) == 1

    changed = client.post(
        "/api/documents",
        data={"title": "別の資料", "requestId": request_id},
        files=kwargs["files"],
    )
    assert changed.status_code == 409


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
        data={
            "title": "合成研究発表",
            "authors": "研究者",
            "folderPath": "論文読み会",
        },
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
    stored = json.loads(slide_library_api.PAGE_METADATA_FILE.read_text())
    assert page_id in stored
    preview = client.get(f"/api/pages/{page_id}/preview")
    assert preview.status_code == 200
    assert preview.headers["content-type"] == "image/png"
    assert preview.content.startswith(b"\x89PNG")
    assert max(struct.unpack(">II", preview.content[16:24])) <= 1600

    # 新しいAPIクライアントからもファイル上のページ情報を読める。
    another_client = TestClient(app)
    assert another_client.get(f"/api/pages/{page_id}").status_code == 200
    search = another_client.post(
        "/api/pages/search", json={"query": "研究背景"}
    ).json()
    assert [page["id"] for page in search["items"]] == [page_id]
    combined = another_client.post(
        "/api/pages/search", json={"query": "背景　研究者"}
    ).json()
    assert [page["id"] for page in combined["items"]] == [page_id]

    tags = another_client.put(
        f"/api/pages/{page_id}/tags", json={"tags": ["背景"]}
    )
    assert tags.status_code == 200
    assert TestClient(app).get(f"/api/pages/{page_id}").json()["tags"] == ["背景"]
    tagged_search = TestClient(app).post(
        "/api/pages/search", json={"filters": {"tag": "背景"}}
    ).json()
    assert [page["id"] for page in tagged_search["items"]] == [page_id]

    by_author = TestClient(app).post(
        "/api/pages/search",
        json={
            "query": "研究背景",
            "filters": {
                "author": "研究者",
                "tag": "背景",
                "folderPath": "論文読み会",
            },
        },
    ).json()
    assert [page["id"] for page in by_author["items"]] == [page_id]
    missing_author = TestClient(app).post(
        "/api/pages/search", json={"filters": {"author": "別の著者"}}
    ).json()
    assert missing_author["total"] == 0


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


def test_pending_import_resumes_after_restart(isolated_data) -> None:
    document_id = "recover-pdf"
    slide_library_api.UPLOAD_DIR.mkdir()
    source_path = slide_library_api.UPLOAD_DIR / f"{document_id}.pdf"
    source_path.write_bytes((FIXTURES / "sample.pdf").read_bytes())
    slide_library_api.write_documents({
        document_id: {
            "id": document_id,
            "status": "pending",
            "pageCount": None,
            "error": None,
            "title": "再開する資料",
            "authors": [],
            "folderPath": [],
            "fileName": "sample.pdf",
            "format": "pdf",
            "savedPath": str(source_path),
        }
    })

    with TestClient(app) as client:
        for _ in range(30):
            status = client.get(f"/api/documents/{document_id}").json()
            if status["status"] == "ready":
                break
            time.sleep(0.1)

        assert status["status"] == "ready"
        assert client.get(f"/api/documents/{document_id}/pages").json()["total"] == 2


def test_failed_status_hides_stored_pages(isolated_data) -> None:
    client = TestClient(app)
    fixture = FIXTURES / "sample.pdf"
    upload = client.post(
        "/api/documents",
        data={"title": "資料"},
        files={"file": (fixture.name, fixture.read_bytes())},
    )
    document_id = upload.json()["id"]
    page_id = client.get(f"/api/documents/{document_id}/pages").json()["items"][0]["id"]

    slide_library_api.set_document_result(document_id, "failed", error="保存に失敗")

    assert client.get(f"/api/documents/{document_id}/pages").json()["total"] == 0
    assert client.get(f"/api/pages/{page_id}").status_code == 404
    assert client.get(f"/api/pages/{page_id}/preview").status_code == 404
