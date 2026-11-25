
from __future__ import annotations

from pathlib import Path

import pymupdf
from pptx import Presentation


def extract_pdf_pages(file_path: Path) -> list[dict]:
    """
    PDFファイルからページ単位でテキストを抽出する。

    Args:
        file_path: PDFファイルのパス

    Returns:
        ページ番号とテキストを含む辞書のリスト
    """
    pages = []

    with pymupdf.open(str(file_path)) as document:
        for page_number, page in enumerate(document, start=1):
            text = page.get_text("text")

            pages.append({
                "pageNumber": page_number,
                "text": text.strip(),
            })

    return pages


def extract_pptx_pages(file_path: Path) -> list[dict]:
    """
    PowerPointファイルからスライド単位でテキストを抽出する。

    Args:
        file_path: PPTXファイルのパス

    Returns:
        スライド番号とテキストを含む辞書のリスト
    """
    presentation = Presentation(str(file_path))
    pages = []

    for page_number, slide in enumerate(
        presentation.slides,
        start=1,
    ):
        texts = []

        for shape in slide.shapes:

            # テキストボックス・プレースホルダー
            if shape.has_text_frame:
                text = shape.text.strip()

                if text:
                    texts.append(text)

            # 表に含まれるテキスト
            if shape.has_table:
                for row in shape.table.rows:
                    for cell in row.cells:
                        text = cell.text.strip()

                        if text:
                            texts.append(text)

        pages.append({
            "pageNumber": page_number,
            "text": "\n".join(texts),
        })

    return pages


def extract_pages(file_path: Path) -> list[dict]:
    """
    PDF・PPTXを判定し、ページ単位でテキストを抽出する。

    Args:
        file_path: 対象ファイルのパス

    Returns:
        ページ情報のリスト
    """
    file_path = Path(file_path)
    suffix = file_path.suffix.lower()

    if suffix == ".pdf":
        return extract_pdf_pages(file_path)

    if suffix == ".pptx":
        return extract_pptx_pages(file_path)

    raise ValueError(
        f"Unsupported file format: {suffix}"
    )

def generate_pdf_previews(
    file_path: Path,
    document_id: str,
) -> list[str]:
    preview_dir = Path("/data/previews") / document_id
    preview_dir.mkdir(parents=True, exist_ok=True)

    urls = []

    with pymupdf.open(str(file_path)) as document:
        for page_number, page in enumerate(document, start=1):
            output_path = preview_dir / f"{page_number:04d}.png"

            pixmap = page.get_pixmap(
                matrix=pymupdf.Matrix(1.5, 1.5),
                alpha=False,
            )
            pixmap.save(str(output_path))

            urls.append(
                f"/api/previews/{document_id}/{page_number:04d}.png"
            )

    return urls

import subprocess
import tempfile

PREVIEW_DIR = Path("/data/previews")


def generate_previews(
    file_path: Path,
    document_id: str,
) -> dict[int, str]:
    """PDF/PPTXからページごとのPNG画像を生成する。"""

    file_path = Path(file_path)
    output_dir = PREVIEW_DIR / document_id
    output_dir.mkdir(parents=True, exist_ok=True)

    if file_path.suffix.lower() == ".pdf":
        return _render_pdf(file_path, output_dir, document_id)

    if file_path.suffix.lower() == ".pptx":
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            result = subprocess.run(
                [
                    "libreoffice",
                    "-env:UserInstallation=file:///tmp/lo_slide_library",
                    "--headless",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(temp_path),
                    str(file_path),
                ],
                capture_output=True,
                text=True,
                timeout=300,
            )

            pdf_path = temp_path / f"{file_path.stem}.pdf"

            if result.returncode != 0 or not pdf_path.is_file():
                raise RuntimeError(
                    f"PPTX conversion failed: {result.stderr}"
                )

            return _render_pdf(pdf_path, output_dir, document_id)

    raise ValueError("Unsupported file format")


def _render_pdf(
    pdf_path: Path,
    output_dir: Path,
    document_id: str,
) -> dict[int, str]:
    urls = {}

    with pymupdf.open(str(pdf_path)) as document:
        for page_number, page in enumerate(document, start=1):
            filename = f"{page_number:04d}.png"
            output_path = output_dir / filename

            if not output_path.exists():
                pixmap = page.get_pixmap(
                    matrix=pymupdf.Matrix(1.5, 1.5),
                    alpha=False,
                )
                pixmap.save(str(output_path))

            urls[page_number] = (
                f"/api/previews/{document_id}/{filename}"
            )

    return urls