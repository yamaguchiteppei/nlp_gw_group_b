from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path


class ImportFailure(Exception):
    pass


MAX_PAGES = 100
MAX_PREVIEW_BYTES = 150 * 1024 * 1024


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    heading: str
    summary: str
    image_path: Path


def run_command(args: list[str], error_message: str, timeout: int = 120) -> str:
    try:
        result = subprocess.run(
            args,
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise ImportFailure(error_message) from exc
    return result.stdout


def extract_pages(
    source_path: Path, source_format: str, workspace: Path
) -> list[ExtractedPage]:
    pdf_path = source_path
    if source_format == "pptx":
        profile = (workspace / "libreoffice-profile").as_uri()
        run_command(
            [
                "soffice",
                f"-env:UserInstallation={profile}",
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(workspace),
                str(source_path),
            ],
            "PPTXをPDFに変換できませんでした",
        )
        pdf_path = workspace / f"{source_path.stem}.pdf"
        if not pdf_path.is_file():
            raise ImportFailure("PPTXをPDFに変換できませんでした")
    elif source_format != "pdf":
        raise ImportFailure("対応していないファイル形式です")

    info = run_command(
        ["pdfinfo", str(pdf_path)], "PDFのページ数を取得できませんでした"
    )
    match = re.search(r"^Pages:\s+(\d+)\s*$", info, re.MULTILINE)
    if match is None or int(match.group(1)) < 1:
        raise ImportFailure("PDFにページがありません")
    page_count = int(match.group(1))
    if page_count > MAX_PAGES:
        raise ImportFailure(f"資料は{MAX_PAGES}ページ以下にしてください")

    text = run_command(
        ["pdftotext", "-layout", "-enc", "UTF-8", str(pdf_path), "-"],
        "PDFからテキストを取得できませんでした",
    )
    preview_paths: dict[int, Path] = {}
    preview_bytes = 0
    for page_number in range(1, page_count + 1):
        preview_prefix = workspace / f"preview-{page_number}"
        run_command(
            [
                "pdftoppm", "-f", str(page_number), "-l", str(page_number),
                "-singlefile", "-png", "-scale-to", "1600",
                str(pdf_path), str(preview_prefix),
            ],
            "PDFのプレビュー画像を生成できませんでした",
            timeout=30,
        )
        image_path = preview_prefix.with_suffix(".png")
        if not image_path.is_file():
            raise ImportFailure("プレビュー画像を生成できませんでした")
        preview_bytes += image_path.stat().st_size
        if preview_bytes > MAX_PREVIEW_BYTES:
            raise ImportFailure("プレビュー画像の合計サイズが上限を超えました")
        preview_paths[page_number] = image_path

    text_pages = text.split("\f")
    pages = []
    for page_number in range(1, page_count + 1):
        lines = [
            line.strip()
            for line in text_pages[page_number - 1].splitlines()
            if line.strip()
        ]
        pages.append(
            ExtractedPage(
                page_number=page_number,
                heading=lines[0][:120] if lines else "",
                summary=" ".join(lines[1:])[:300],
                image_path=preview_paths[page_number],
            )
        )
    return pages
