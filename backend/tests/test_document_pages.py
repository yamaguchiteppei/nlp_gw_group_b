from fastapi.testclient import TestClient

from app import slide_library_api
from app.main import app


def test_document_pages_are_ordered_and_paginated(monkeypatch) -> None:
    sample = slide_library_api.PAGES["page-001"]
    pages = {
        page.id: page
        for page in [
            sample.model_copy(update={"id": "page-c", "pageNumber": 2}),
            sample.model_copy(update={"id": "page-b", "pageNumber": 2}),
            sample.model_copy(update={"id": "page-a", "pageNumber": 1}),
            sample.model_copy(
                update={
                    "id": "unrelated",
                    "documentId": "another-document",
                }
            ),
        ]
    }
    monkeypatch.setattr(slide_library_api, "PAGES", pages)
    monkeypatch.setattr(
        slide_library_api,
        "read_documents",
        lambda: {"document-001": {"status": "ready"}},
    )

    response = TestClient(app).get(
        "/api/documents/document-001/pages?limit=2&offset=1"
    )

    assert response.status_code == 200
    assert response.json()["total"] == 3
    assert response.json()["limit"] == 2
    assert response.json()["offset"] == 1
    assert [item["id"] for item in response.json()["items"]] == ["page-b", "page-c"]


def test_document_pages_are_empty_before_generation(monkeypatch) -> None:
    monkeypatch.setattr(slide_library_api, "PAGES", {})
    monkeypatch.setattr(
        slide_library_api,
        "read_documents",
        lambda: {"pending-document": {"status": "pending"}},
    )

    response = TestClient(app).get("/api/documents/pending-document/pages")

    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0, "limit": 20, "offset": 0}


def test_document_pages_reject_unknown_document_and_bad_pagination(
    monkeypatch,
) -> None:
    monkeypatch.setattr(slide_library_api, "PAGES", {})
    monkeypatch.setattr(slide_library_api, "read_documents", lambda: {})
    client = TestClient(app)

    assert client.get("/api/documents/missing/pages").status_code == 404
    assert client.get("/api/documents/missing/pages?limit=0").status_code == 400
    assert client.get("/api/documents/missing/pages?limit=101").status_code == 400
    assert client.get("/api/documents/missing/pages?offset=-1").status_code == 400


def test_document_pages_reject_orphaned_pages(monkeypatch) -> None:
    monkeypatch.setattr(slide_library_api, "read_documents", lambda: {})

    response = TestClient(app).get("/api/documents/document-001/pages")

    assert response.status_code == 404
