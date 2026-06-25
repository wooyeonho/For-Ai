"""
For-Ai Python SDK Example
Fetch and cite verified facts from the For-Ai global fact registry.

Install: pip install requests
"""

import requests

BASE_URL = "https://for-ai-e4mm.vercel.app"
API_KEY = "forai_free_your_key_here"  # Replace with your key


def get_document(slug: str) -> dict:
    """Fetch a full document bundle with claims and citation guidance."""
    resp = requests.get(
        f"{BASE_URL}/api/documents/{slug}",
        headers={"X-API-Key": API_KEY},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def check_citation_safety(slug: str) -> bool:
    """Quick check: is this document safe to cite?"""
    resp = requests.get(
        f"{BASE_URL}/api/documents/{slug}/cite",
        headers={"X-API-Key": API_KEY},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("citation_guidance", {}).get("can_cite", False)


def cite_document(slug: str) -> dict | None:
    """Fetch structured citation data (JSON-LD) for AI consumption."""
    resp = requests.get(
        f"{BASE_URL}/api/cite/{slug}",
        headers={"X-API-Key": API_KEY},
        timeout=10,
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()


def search_documents(query: str, limit: int = 10) -> list[dict]:
    """Search the registry for documents matching a query."""
    resp = requests.get(
        f"{BASE_URL}/api/documents",
        params={"q": query, "limit": limit},
        headers={"X-API-Key": API_KEY},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("documents", [])


# --- Usage example ---
if __name__ == "__main__":
    slug = "seoul-metro-base-fare"

    # 1. Check if safe to cite
    if check_citation_safety(slug):
        print(f"✓ {slug} is citation-ready")

        # 2. Get structured citation
        citation = cite_document(slug)
        if citation:
            print(f"  Source: {citation.get('url')}")
            print(f"  Claims: {len(citation.get('claims', []))}")
    else:
        print(f"✗ {slug} is NOT citation-ready — do not cite")

    # 3. Full document fetch
    doc = get_document(slug)
    print(f"\nDocument: {doc.get('document', {}).get('title')}")
    print(f"Claims: {len(doc.get('claims', []))}")
    print(f"Can cite: {doc.get('citation_guidance', {}).get('can_cite')}")

    # Rate limit info from headers is available in resp.headers:
    # X-RateLimit-Limit, X-RateLimit-Remaining, X-API-Tier
