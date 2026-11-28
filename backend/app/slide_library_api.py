
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from threading import Lock
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api", tags=["Slide Library"])

DATA_DIR = Path("/data")
UPLOAD_DIR = DATA_DIR / "uploads"
METADATA_FILE = DATA_DIR / "documents.json"
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MiB
DOCUMENTS_LOCK = Lock()


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


# 仮データ。DB導入時にリポジトリ層へ置き換える。
PAGES: dict[str, Page] = {
    "page-001": Page(
        id="page-001",
        documentId="document-001",
        pageNumber=2,
        heading="研究背景",
        summary="研究課題を説明するサンプルページ",
        tags=["背景"],
        previewUrl=None,
        document=DocumentDetail(
            id="document-001",
            title="サンプル発表資料",
            authors=["サンプル著者"],
            folderPath=["論文読み会", "2025"],
            fileName="sample.pdf",
            format="pdf",
        ),
    )
}


def validate_pagination(limit: int, offset: int) -> None:
    if not 1 <= limit <= 100 or offset < 0:
        raise HTTPException(
            status_code=400,
            detail="limit must be 1-100 and offset must be >= 0",
        )


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
    return list_result(list(PAGES.values()), limit, offset)


@router.post("/pages/search", response_model=PageSummaryList)
def search_pages(request: SearchRequest):
    validate_pagination(request.limit, request.offset)
    matched = []

    for page in PAGES.values():
        doc = page.document
        searchable = " ".join(
            [doc.title, *doc.authors, page.heading, page.summary]
        )

        if request.query.casefold() not in searchable.casefold():
            continue

        if request.filters.tag is not None:
            if request.filters.tag not in page.tags:
                continue

        if request.filters.folderPath is not None:
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
    page = PAGES.get(pageId)
    if page is None:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.put("/pages/{pageId}/tags", response_model=Page)
def update_tags(pageId: str, request: TagsRequest):
    page = PAGES.get(pageId)
    if page is None:
        raise HTTPException(status_code=404, detail="Page not found")

    tags = [tag.strip() for tag in request.tags]
    if any(not tag for tag in tags) or len(tags) != len(set(tags)):
        raise HTTPException(
            status_code=400,
            detail="Tags must be nonempty and unique",
        )

    page.tags = tags
    return page


def read_documents() -> dict:
    if not METADATA_FILE.exists():
        return {}
    return json.loads(METADATA_FILE.read_text(encoding="utf-8"))


def write_documents(documents: dict) -> None:
    temporary_path = DATA_DIR / f".documents-{uuid.uuid4().hex}.tmp"
    try:
        temporary_path.write_text(
            json.dumps(documents, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(temporary_path, METADATA_FILE)
    finally:
        temporary_path.unlink(missing_ok=True)


def safe_filename(filename: str) -> str:
    return filename.replace("\\", "/").rsplit("/", 1)[-1]


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
    filename = safe_filename(file.filename or "")
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

    with DOCUMENTS_LOCK:
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

        write_documents(documents)

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


@router.get(
    "/documents/{documentId}/source",
    response_class=FileResponse,
    responses={
        200: {
            "content": {
                "application/octet-stream": {
                    "schema": {"type": "string", "format": "binary"}
                }
            }
        },
        404: {"description": "Document or source file not found"},
    },
)
def download_document_source(documentId: str) -> FileResponse:
    document = read_documents().get(documentId)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    source_format = document.get("format")
    media_types = {
        "pdf": "application/pdf",
        "pptx": (
            "application/vnd.openxmlformats-officedocument."
            "presentationml.presentation"
        ),
    }
    saved_path = document.get("savedPath")
    if source_format not in media_types or not saved_path:
        raise HTTPException(status_code=404, detail="Source file not found")

    source_path = Path(saved_path).resolve()
    if (
        not source_path.is_relative_to(UPLOAD_DIR.resolve())
        or not source_path.is_file()
    ):
        raise HTTPException(status_code=404, detail="Source file not found")

    return FileResponse(
        source_path,
        media_type=media_types[source_format],
        filename=safe_filename(document["fileName"]),
        content_disposition_type="attachment",
    )
