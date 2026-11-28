
from __future__ import annotations

import fcntl
import json
import logging
import os
import shutil
import tempfile
import uuid
from contextlib import contextmanager
from pathlib import Path
from threading import Lock
from typing import Annotated, Literal

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.importer import ImportFailure, extract_pages

router = APIRouter(prefix="/api", tags=["Slide Library"])
logger = logging.getLogger(__name__)

DATA_DIR = Path("/data")
UPLOAD_DIR = DATA_DIR / "uploads"
PREVIEW_DIR = DATA_DIR / "previews"
METADATA_FILE = DATA_DIR / "documents.json"
PAGE_METADATA_FILE = DATA_DIR / "pages.json"
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MiB
DOCUMENTS_LOCK = Lock()
PAGES_LOCK = Lock()


@contextmanager
def metadata_file_lock():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with (DATA_DIR / ".metadata.lock").open("a+b") as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock_file, fcntl.LOCK_UN)


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


# テストでは差し替え可能。通常のページは pages.json に保存する。
PAGES: dict[str, Page] = {}


def read_pages() -> dict[str, Page]:
    pages = dict(PAGES)
    if PAGE_METADATA_FILE.exists():
        stored = json.loads(PAGE_METADATA_FILE.read_text(encoding="utf-8"))
        pages.update(
            {page_id: Page.model_validate(value) for page_id, value in stored.items()}
        )
    return pages


def visible_pages() -> dict[str, Page]:
    documents = read_documents()
    return {
        page_id: page for page_id, page in read_pages().items()
        if documents.get(page.documentId, {}).get("status") == "ready"
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
    return list_result(list(visible_pages().values()), limit, offset)


@router.post("/pages/search", response_model=PageSummaryList)
def search_pages(request: SearchRequest):
    validate_pagination(request.limit, request.offset)
    matched = []

    for page in visible_pages().values():
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
    page = visible_pages().get(pageId)
    if page is None:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.get(
    "/pages/{pageId}/preview",
    response_class=FileResponse,
    responses={
        200: {
            "content": {"image/png": {"schema": {"type": "string", "format": "binary"}}}
        }
    },
)
def get_page_preview(pageId: str) -> FileResponse:
    page = visible_pages().get(pageId)
    if page is None:
        raise HTTPException(status_code=404, detail="Page not found")

    preview_path = (PREVIEW_DIR / page.documentId / f"{page.pageNumber}.png").resolve()
    if (
        not preview_path.is_relative_to(PREVIEW_DIR.resolve())
        or not preview_path.is_file()
    ):
        raise HTTPException(status_code=404, detail="Preview not found")
    return FileResponse(preview_path, media_type="image/png")


@router.put("/pages/{pageId}/tags", response_model=Page)
def update_tags(pageId: str, request: TagsRequest):
    tags = [tag.strip() for tag in request.tags]
    if any(not tag for tag in tags) or len(tags) != len(set(tags)):
        raise HTTPException(
            status_code=400,
            detail="Tags must be nonempty and unique",
        )

    with PAGES_LOCK, metadata_file_lock():
        pages = read_pages()
        page = pages.get(pageId)
        if (
            page is None
            or read_documents().get(page.documentId, {}).get("status") != "ready"
        ):
            raise HTTPException(status_code=404, detail="Page not found")
        page.tags = tags
        write_pages(pages)
        return page


def read_documents() -> dict:
    if not METADATA_FILE.exists():
        return {}
    return json.loads(METADATA_FILE.read_text(encoding="utf-8"))


def write_documents(documents: dict) -> None:
    write_json(METADATA_FILE, documents)


def write_pages(pages: dict[str, Page]) -> None:
    write_json(
        PAGE_METADATA_FILE,
        {page_id: page.model_dump() for page_id, page in pages.items()},
    )


def write_json(path: Path, value: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temporary_path = DATA_DIR / f".{path.stem}-{uuid.uuid4().hex}.tmp"
    try:
        temporary_path.write_text(
            json.dumps(value, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(temporary_path, path)
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
    background_tasks: BackgroundTasks,
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

    with DOCUMENTS_LOCK, metadata_file_lock():
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

    background_tasks.add_task(process_document, document_id)
    return DocumentAccepted(id=document_id)


def set_document_result(
    document_id: str, status: Literal["ready", "failed"],
    page_count: int | None = None, error: str | None = None,
) -> None:
    with DOCUMENTS_LOCK, metadata_file_lock():
        documents = read_documents()
        document = documents.get(document_id)
        if document is None:
            return
        document.update(status=status, pageCount=page_count, error=error)
        write_documents(documents)


def process_document(document_id: str) -> None:
    preview_dir = PREVIEW_DIR / document_id
    try:
        document = read_documents().get(document_id)
        if document is None:
            return
        source_path = Path(document["savedPath"]).resolve()
        if (
            not source_path.is_relative_to(UPLOAD_DIR.resolve())
            or not source_path.is_file()
        ):
            raise ImportFailure("元ファイルが見つかりません")

        with tempfile.TemporaryDirectory(prefix="slide-import-", dir=DATA_DIR) as name:
            workspace = Path(name)
            extracted = extract_pages(source_path, document["format"], workspace)
            staged_previews = workspace / "previews"
            staged_previews.mkdir()

            detail = DocumentDetail(
                id=document_id,
                title=document["title"],
                authors=document["authors"],
                folderPath=document["folderPath"],
                fileName=document["fileName"],
                format=document["format"],
            )
            new_pages = {}
            for extracted_page in extracted:
                page_id = str(uuid.uuid4())
                shutil.copy2(
                    extracted_page.image_path,
                    staged_previews / f"{extracted_page.page_number}.png",
                )
                new_pages[page_id] = Page(
                    id=page_id,
                    documentId=document_id,
                    pageNumber=extracted_page.page_number,
                    heading=extracted_page.heading,
                    summary=extracted_page.summary,
                    tags=[],
                    previewUrl=f"/api/pages/{page_id}/preview",
                    document=detail,
                )

            PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
            if preview_dir.exists():
                shutil.rmtree(preview_dir)
            staged_previews.rename(preview_dir)
            with PAGES_LOCK, metadata_file_lock():
                pages = read_pages()
                pages = {
                    page_id: page for page_id, page in pages.items()
                    if page.documentId != document_id
                }
                pages.update(new_pages)
                write_pages(pages)

        set_document_result(document_id, "ready", page_count=len(new_pages))
    except ImportFailure as exc:
        error = str(exc)
    except Exception:
        logger.exception("Failed to import document %s", document_id)
        error = "資料を解析できませんでした"
    else:
        return

    try:
        set_document_result(document_id, "failed", error=error)
    except Exception:
        logger.exception("Failed to update import status for %s", document_id)


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


@router.get("/documents/{documentId}/pages", response_model=PageSummaryList)
def list_document_pages(
    documentId: str,
    limit: int = Query(20),
    offset: int = Query(0),
):
    validate_pagination(limit, offset)
    if documentId not in read_documents():
        raise HTTPException(status_code=404, detail="Document not found")

    pages = [page for page in visible_pages().values() if page.documentId == documentId]
    pages.sort(key=lambda page: (page.pageNumber, page.id))
    return PageSummaryList(
        items=[to_summary(page) for page in pages[offset:offset + limit]],
        total=len(pages),
        limit=limit,
        offset=offset,
    )
