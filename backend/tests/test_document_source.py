import json
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import unquote

import pytest
from fastapi.testclient import TestClient

from app import slide_library_api
from app.main import app


@pytest.fixture
def isolated_uploads(tmp_path, monkeypatch):
    monkeypatch.setattr(slide_library_api, "DATA_DIR", tmp_path)
    monkeypatch.setattr(slide_library_api, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(slide_library_api, "METADATA_FILE", tmp_path / "documents.json")


@pytest.mark.parametrize(
    ("filename", "content", "media_type"),
    [
        ("研究発表.pdf", b"%PDF-1.4\nsource bytes", "application/pdf"),
        (
            "研究発表.pptx",
            b"PK\x03\x04source bytes",
            "application/vnd.openxmlformats-officedocument."
            "presentationml.presentation",
        ),
    ],
)
def test_download_returns_uploaded_source(
    isolated_uploads, filename, content, media_type
) -> None:
    client = TestClient(app)
    upload = client.post(
        "/api/documents",
        data={"title": "研究発表"},
        files={"file": (filename, content, media_type)},
    )

    assert upload.status_code == 202
    response = client.get(f"/api/documents/{upload.json()['id']}/source")

    assert response.status_code == 200
    assert response.content == content
    assert response.headers["content-type"] == media_type
    assert response.headers["content-disposition"].startswith("attachment;")
    encoded_filename = response.headers["content-disposition"].split(
        "filename*=utf-8''", 1
    )[1]
    assert unquote(encoded_filename) == filename


def test_download_returns_404_for_missing_document_or_file(isolated_uploads) -> None:
    client = TestClient(app)

    assert client.get("/api/documents/missing/source").status_code == 404

    upload = client.post(
        "/api/documents",
        data={"title": "資料"},
        files={"file": ("source.pdf", b"%PDF-1.4", "application/pdf")},
    )
    document_id = upload.json()["id"]
    (slide_library_api.UPLOAD_DIR / f"{document_id}.pdf").unlink()

    assert client.get(f"/api/documents/{document_id}/source").status_code == 404


def test_download_rejects_source_outside_uploads(isolated_uploads, tmp_path) -> None:
    client = TestClient(app)
    upload = client.post(
        "/api/documents",
        data={"title": "資料"},
        files={"file": ("source.pdf", b"%PDF-1.4", "application/pdf")},
    )
    document_id = upload.json()["id"]
    outside = tmp_path / "outside.pdf"
    outside.write_bytes(b"%PDF-outside")
    documents = slide_library_api.read_documents()
    documents[document_id]["savedPath"] = str(outside)
    slide_library_api.METADATA_FILE.write_text(
        json.dumps(documents), encoding="utf-8"
    )

    assert client.get(f"/api/documents/{document_id}/source").status_code == 404


@pytest.mark.parametrize(
    "stored_filename", ["../secret.pdf", "C:\\Users\\secret.pdf"]
)
def test_download_uses_only_source_filename(
    isolated_uploads, stored_filename
) -> None:
    client = TestClient(app)
    upload = client.post(
        "/api/documents",
        data={"title": "資料"},
        files={"file": ("source.pdf", b"%PDF-1.4", "application/pdf")},
    )
    document_id = upload.json()["id"]
    documents = slide_library_api.read_documents()
    documents[document_id]["fileName"] = stored_filename
    slide_library_api.write_documents(documents)

    response = client.get(f"/api/documents/{document_id}/source")

    assert response.status_code == 200
    assert 'filename="secret.pdf"' in response.headers["content-disposition"]
    assert "../" not in response.headers["content-disposition"]


def test_download_openapi_uses_binary_response() -> None:
    response = TestClient(app).get("/api/openapi.json")
    content = response.json()["paths"]["/api/documents/{documentId}/source"]["get"][
        "responses"
    ]["200"]["content"]

    assert content["application/octet-stream"]["schema"] == {
        "type": "string",
        "format": "binary",
    }


def test_concurrent_uploads_keep_both_documents(isolated_uploads, monkeypatch) -> None:
    original_read = slide_library_api.read_documents

    def slow_read():
        documents = original_read()
        time.sleep(0.02)
        return documents

    monkeypatch.setattr(slide_library_api, "read_documents", slow_read)

    def upload():
        return TestClient(app).post(
            "/api/documents",
            data={"title": "資料"},
            files={"file": ("source.pdf", b"%PDF-1.4", "application/pdf")},
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: upload(), range(2)))

    assert all(response.status_code == 202 for response in responses)
    assert len(original_read()) == 2
