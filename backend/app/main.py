from fastapi import FastAPI
from app.slide_library_api import router as slide_library_router

app = FastAPI(
    title="Slide Library API",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

app.include_router(slide_library_router)