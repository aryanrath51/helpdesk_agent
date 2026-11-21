import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "backend"))

from app.rag.loader import load_policy_document
from app.rag.chunker import chunk_records
from app.rag.vectorstore import ingest_chunks


def ingest_all():
    policies_dir = Path(__file__).resolve().parents[1] / "documents" / "sample_policies"
    files = [p for p in policies_dir.iterdir() if p.is_file() and p.suffix.lower() in {".txt", ".pdf", ".docx"}]

    if not files:
        print("No policy documents found in documents/sample_policies.")
        return

    for file_path in files:
        records = load_policy_document(file_path)
        chunks = chunk_records(records)
        count = ingest_chunks(file_path.name, chunks)
        print(f"Ingested {count} chunks from {file_path.name}")


if __name__ == "__main__":
    ingest_all()