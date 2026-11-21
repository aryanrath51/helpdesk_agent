from pathlib import Path
from pypdf import PdfReader
from docx import Document as DocxDocument


def load_policy_document(file_path: str | Path) -> list[dict]:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Policy file not found: {path}")

    suffix = path.suffix.lower()
    records: list[dict] = []

    if suffix == ".txt":
        text = path.read_text(encoding="utf-8")
        current_section = "General"
        buffer: list[str] = []

        for line in text.splitlines():
            stripped = line.strip()
            if stripped.lower().startswith("section "):
                if buffer:
                    records.append({
                        "text": "\n".join(buffer).strip(),
                        "source": path.name,
                        "section": current_section,
                        "page": None,
                    })
                    buffer = []
                current_section = stripped
            buffer.append(line)

        if buffer:
            records.append({
                "text": "\n".join(buffer).strip(),
                "source": path.name,
                "section": current_section,
                "page": None,
            })

    elif suffix == ".pdf":
        reader = PdfReader(str(path))
        for idx, page in enumerate(reader.pages, start=1):
            content = (page.extract_text() or "").strip()
            if content:
                records.append({
                    "text": content,
                    "source": path.name,
                    "section": f"Page {idx}",
                    "page": idx,
                })

    elif suffix == ".docx":
        doc = DocxDocument(str(path))
        current_section = "General"
        buffer = []
        for para in doc.paragraphs:
            txt = para.text.strip()
            if not txt:
                continue
            if txt.lower().startswith("section "):
                if buffer:
                    records.append({
                        "text": "\n".join(buffer).strip(),
                        "source": path.name,
                        "section": current_section,
                        "page": None,
                    })
                    buffer = []
                current_section = txt
            buffer.append(txt)
        if buffer:
            records.append({
                "text": "\n".join(buffer).strip(),
                "source": path.name,
                "section": current_section,
                "page": None,
            })
    else:
        raise ValueError(f"Unsupported file format: {suffix}. Allowed: .txt, .pdf, .docx")

    return [r for r in records if r["text"]]