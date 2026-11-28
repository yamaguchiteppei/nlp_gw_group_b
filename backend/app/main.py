import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI

from app.slide_library_api import process_document, read_documents
from app.slide_library_api import router as slide_library_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    async def resume_pending() -> None:
        try:
            pending = [
                document_id for document_id, document in read_documents().items()
                if document.get("status") == "pending"
            ]
            for document_id in pending:
                await asyncio.to_thread(process_document, document_id)
        except Exception:
            logger.exception("Failed to resume pending imports")

    recovery = asyncio.create_task(resume_pending())
    try:
        yield
    finally:
        recovery.cancel()
        with suppress(asyncio.CancelledError):
            await recovery

app = FastAPI(
    title="Slide Library API",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
    lifespan=lifespan,
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

app.include_router(slide_library_router)
