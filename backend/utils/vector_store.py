import os
import chromadb
from chromadb.config import Settings

# Ensure storage directory exists
CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "..", "storage", "chromadb")
os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)

# Initialize the ChromaDB client
chroma_client = chromadb.PersistentClient(
    path=CHROMA_PERSIST_DIR,
    settings=Settings(allow_reset=False)
)

def _embed(texts: list[str]) -> list[list[float]]:
    """Call OpenAI text-embedding-3-large to embed a list of texts."""
    from openai import OpenAI
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = client.embeddings.create(
        model="text-embedding-3-large",
        input=texts
    )
    return [item.embedding for item in response.data]

def get_or_create_collection(collection_name: str):
    """Create or retrieve a ChromaDB collection (no embedding_function — we embed manually)."""
    return chroma_client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"}
    )

def store_interview_chunk(project_id: str, participant_id: str, question_id: str, text: str):
    """Embed via OpenAI text-embedding-3-large and store in ChromaDB."""
    collection = get_or_create_collection(f"project_{project_id}")
    doc_id = f"{participant_id}_{question_id}_{os.urandom(4).hex()}"
    embedding = _embed([text])[0]
    collection.add(
        documents=[text],
        embeddings=[embedding],
        metadatas=[{
            "participant_id": participant_id,
            "question_id": question_id,
            "chunk_type": "question_answer"
        }],
        ids=[doc_id]
    )
    return doc_id

def search_project_themes(project_id: str, query_text: str, n_results: int = 20) -> dict:
    """Semantic search using OpenAI embeddings across a project's interview corpus."""
    try:
        collection = chroma_client.get_collection(name=f"project_{project_id}")
    except Exception:
        return {}

    count = collection.count()
    if count == 0:
        return {}

    query_embedding = _embed([query_text])[0]
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(n_results, count)
    )
    return results

def delete_project_collection(project_id: str):
    """Remove all embeddings for a project."""
    try:
        chroma_client.delete_collection(name=f"project_{project_id}")
    except Exception:
        pass

def test_embeddings():
    """Quick integration test — call from CLI to verify OpenAI embedding pipeline."""
    print("Testing OpenAI text-embedding-3-large + ChromaDB...")
    store_interview_chunk(
        project_id="test",
        participant_id="p001",
        question_id="q1",
        text="The product was easy to use and the interface was intuitive."
    )
    results = search_project_themes("test", "user experience and usability", n_results=1)
    print("✅ Success:", results.get("documents", []))
    delete_project_collection("test")

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv("../.env")
    test_embeddings()
