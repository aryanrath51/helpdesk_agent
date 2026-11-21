from pathlib import Path
import chromadb
from google import genai
from google.genai import types
from app.config import ROOT_DIR, settings

COLLECTION_NAME = "hr_it_policies"
_genai_client: genai.Client | None = None


def get_genai_client() -> genai.Client:
    global _genai_client
    if _genai_client is None:
        _genai_client = genai.Client(
            api_key=settings.google_api_key,
            http_options=types.HttpOptions(timeout=10_000),
        )
    return _genai_client


def embed_texts(texts: list[str]) -> list[list[float]]:
    client = get_genai_client()
    res = client.models.embed_content(
        model=settings.gemini_embedding_model,
        contents=texts,
    )
    return [e.values for e in res.embeddings]


def get_chroma_collection():
    persist_path = Path(settings.chroma_persist_dir)
    if not persist_path.is_absolute():
        persist_path = ROOT_DIR / persist_path
    persist_path.mkdir(parents=True, exist_ok=True)
    chroma_client = chromadb.PersistentClient(path=str(persist_path))
    return chroma_client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def ingest_chunks(source_filename: str, chunks: list[dict]) -> int:
    if not chunks:
        return 0
    collection = get_chroma_collection()

    existing = collection.get(where={"source": source_filename})
    if existing and existing.get("ids"):
        collection.delete(ids=existing["ids"])

    texts = [c["content"] for c in chunks]
    metadatas = [c["metadata"] for c in chunks]
    ids = [f"{source_filename}::chunk_{i}" for i in range(len(chunks))]
    vectors = embed_texts(texts)

    collection.upsert(
        ids=ids,
        documents=texts,
        metadatas=metadatas,
        embeddings=vectors,
    )
    return len(chunks)


def search_policies(query: str, top_k: int = 4, max_distance: float = 0.65) -> list[dict]:
    collection = get_chroma_collection()
    if collection.count() == 0:
        return []

    query_vector = embed_texts([query])[0]
    results = collection.query(
        query_embeddings=[query_vector],
        n_results=min(top_k, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    docs = (results.get("documents") or [[]])[0]
    metas = (results.get("metadatas") or [[]])[0]
    dists = (results.get("distances") or [[]])[0]

    matches: list[dict] = []
    for doc, meta, dist in zip(docs, metas, dists):
        if dist is not None and dist <= max_distance:
            source = (meta or {}).get("source", "Unknown Document")
            page = (meta or {}).get("page")
            section = (meta or {}).get("section")
            citation = f"{source}"
            if page is not None and page > 0:
                citation += f" (Page {page})"
            elif section:
                citation += f" ({section})"

            matches.append(
                {
                    "content": doc,
                    "metadata": meta or {},
                    "distance": round(float(dist), 4),
                    "citation": citation,
                }
            )
    return matches