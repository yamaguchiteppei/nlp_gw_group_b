
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from app.page_registry import (
    load_pages,
    save_pages,
    register_document_pages,
)
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api", tags=["Slide Library"])

DATA_DIR = Path("/data")
UPLOAD_DIR = DATA_DIR / "uploads"
PREVIEW_DIR = DATA_DIR / "previews"
METADATA_FILE = DATA_DIR / "documents.json"
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MiB


class DocumentSummary(BaseModel):
    id: str
    title: str
    authors: list[str]
    folderPath: list[str]


class DocumentDetail(DocumentSummary):
    fileName: str
    format: str


class PageSummary(BaseModel):
    id: str
    documentId: str
    pageNumber: int
    heading: str
    summary: str
    tags: list[str]
    previewUrl: str | None
    document: DocumentSummary


class Page(PageSummary):
    document: DocumentDetail


class PageSummaryList(BaseModel):
    items: list[PageSummary]
    total: int
    limit: int
    offset: int


class SearchFilters(BaseModel):
    tag: str | None = None
    folderPath: str | None = None


class SearchRequest(BaseModel):
    query: str = ""
    filters: SearchFilters = Field(default_factory=SearchFilters)
    limit: int = 20
    offset: int = 0


class TagsRequest(BaseModel):
    tags: list[str]


class DocumentAccepted(BaseModel):
    id: str
    status: Literal["pending"] = "pending"


class DocumentStatus(BaseModel):
    id: str
    status: Literal["pending", "ready", "failed"]
    pageCount: int | None = None
    error: str | None = None


def validate_pagination(limit: int, offset: int) -> None:
    if not 1 <= limit <= 100 or offset < 0:
        raise HTTPException(
            status_code=400,
            detail="limit must be 1-100 and offset must be >= 0",
        )

def get_all_pages() -> dict[str, Page]:
    raw_pages = load_pages()

    return {
        page_id: Page.model_validate(data)
        for page_id, data in raw_pages.items()
    }

def to_summary(page: Page) -> PageSummary:
    return PageSummary.model_validate(page.model_dump())


def list_result(
    pages: list[Page], limit: int, offset: int
) -> PageSummaryList:
    pages = sorted(pages, key=lambda p: p.id)
    return PageSummaryList(
        items=[to_summary(p) for p in pages[offset:offset + limit]],
        total=len(pages),
        limit=limit,
        offset=offset,
    )


@router.get("/pages", response_model=PageSummaryList)
def list_pages(
    limit: int = Query(20),
    offset: int = Query(0),
):
    validate_pagination(limit, offset)

    pages = get_all_pages()

    return list_result(list(pages.values()), limit, offset)


@router.post("/pages/search", response_model=PageSummaryList)
def search_pages(request: SearchRequest):
    validate_pagination(request.limit, request.offset)
    matched = []

    for page in get_all_pages().values():
        doc = page.document
        searchable = " ".join(
            [doc.title, *doc.authors, page.heading, page.summary]
        )

        if request.query.casefold() not in searchable.casefold():
            continue

        if request.filters.tag:
            if request.filters.tag not in page.tags:
                continue

        if request.filters.folderPath:
            folder = "/".join(doc.folderPath)
            prefix = request.filters.folderPath.strip("/")
            if not (
                folder == prefix or folder.startswith(prefix + "/")
            ):
                continue

        matched.append(page)

    return list_result(matched, request.limit, request.offset)


@router.get("/pages/{pageId}", response_model=Page)
def get_page(pageId: str):
    page = get_all_pages().get(pageId)

    if page is None:
        raise HTTPException(
            status_code=404,
            detail="Page not found",
        )

    return page


@router.put("/pages/{pageId}/tags", response_model=Page)
def update_tags(pageId: str, request: TagsRequest):
    pages = load_pages()

    if pageId not in pages:
        raise HTTPException(
            status_code=404,
            detail="Page not found",
        )

    tags = [tag.strip() for tag in request.tags]

    if any(not tag for tag in tags) or len(tags) != len(set(tags)):
        raise HTTPException(
            status_code=400,
            detail="Tags must be nonempty and unique",
        )

    pages[pageId]["tags"] = tags

    save_pages(pages)

    return Page.model_validate(pages[pageId])


def read_documents() -> dict:
    if not METADATA_FILE.exists():
        return {}
    return json.loads(METADATA_FILE.read_text(encoding="utf-8"))


@router.post(
    "/documents",
    status_code=202,
    response_model=DocumentAccepted,
)
async def upload_document(
    file: Annotated[UploadFile, File()],
    title: Annotated[str, Form()],
    authors: Annotated[list[str] | None, Form()] = None,
    folderPath: Annotated[list[str] | None, Form()] = None,
):
    filename = Path(file.filename or "").name
    suffix = Path(filename).suffix.lower()

    if suffix not in {".pdf", ".pptx"} or not title.strip():
        raise HTTPException(
            status_code=400,
            detail="A title and PDF/PPTX file are required",
        )

    content = await file.read(MAX_FILE_SIZE + 1)
    await file.close()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large")

    # 簡易的なファイル署名検証
    if suffix == ".pdf" and not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Invalid PDF")

    if suffix == ".pptx" and not content.startswith(b"PK"):
        raise HTTPException(status_code=400, detail="Invalid PPTX")

    document_id = str(uuid.uuid4())
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    saved_path = UPLOAD_DIR / f"{document_id}{suffix}"
    saved_path.write_bytes(content)

    documents = read_documents()
    documents[document_id] = {
        "id": document_id,
        "status": "pending",
        "pageCount": None,
        "error": None,
        "title": title.strip(),
        "authors": authors or [],
        "folderPath": folderPath or [],
        "fileName": filename,
        "format": suffix.lstrip("."),
        "savedPath": str(saved_path),
    }

    METADATA_FILE.write_text(
        json.dumps(documents, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return DocumentAccepted(id=document_id)


@router.get(
    "/documents/{documentId}",
    response_model=DocumentStatus,
)
def get_document_status(documentId: str):
    document = read_documents().get(documentId)

    if document is None:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    return DocumentStatus.model_validate(document)

@router.get("/previews/{documentId}/{fileName}")
def get_preview(documentId: str, fileName: str):
    try:
        uuid.UUID(documentId)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid document ID",
        )

    if (
        not fileName.endswith(".png")
        or not fileName[:-4].isdigit()
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid preview filename",
        )

    path = PREVIEW_DIR / documentId / fileName

    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Preview not found",
        )

    return FileResponse(path, media_type="image/png")
