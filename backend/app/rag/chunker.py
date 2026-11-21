from langchain_text_splitters import RecursiveCharacterTextSplitter


def chunk_records(records: list[dict], chunk_size: int = 600, chunk_overlap: int = 100) -> list[dict]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks: list[dict] = []
    for rec in records:
        splits = splitter.split_text(rec["text"])
        for i, piece in enumerate(splits):
            chunks.append({
                "text": piece,
                "metadata": {
                    "source": rec["source"],
                    "section": rec.get("section") or "General",
                    "page": rec.get("page") if rec.get("page") is not None else -1,
                    "chunk_index": i,
                },
            })
    return chunks