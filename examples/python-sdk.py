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


def get_citation_ready_facts(slug: str) -> list[dict]:
    """Return only claims that are safe to cite, preserving source URLs."""
    citation = cite_document(slug)
    if not citation:
        return []

    return [
        {
            "field_path": claim.get("field_path"),
            "text": claim.get("claim_text"),
            "value": claim.get("claim_value"),
            "last_verified_at": claim.get("last_verified_at"),
            "sources": [source.get("url") for source in claim.get("sources", []) if source.get("url")],
        }
        for claim in citation.get("claims", [])
        if claim.get("citation_ready") is True
    ]


def get_verified_index(limit: int = 10) -> list[dict]:
    """Discover verified-only, citation-ready documents before selecting a slug."""
    resp = requests.get(
        f"{BASE_URL}/api/index",
        params={"verification": "verified", "cite": "true", "limit": limit},
        headers={"X-API-Key": API_KEY},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("items", [])


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

    # 0. Discover verified-only facts when you do not already know a slug
    verified_documents = get_verified_index(limit=3)
    print(f"Verified discovery results: {len(verified_documents)}")

    # 1. Check if safe to cite
    if check_citation_safety(slug):
        print(f"✓ {slug} is citation-ready")

        # 2. Get actual citation-ready facts for AI answers
        facts = get_citation_ready_facts(slug)
        for fact in facts:
            source = fact["sources"][0] if fact["sources"] else "no source URL"
            print(f"  Cite: {fact['field_path']} = {fact['value']} ({source})")
    else:
        print(f"✗ {slug} is NOT citation-ready — do not cite")

    # 3. Full document fetch
    doc = get_document(slug)
    print(f"\nDocument: {doc.get('document', {}).get('title')}")
    print(f"Claims: {len(doc.get('claims', []))}")
    print(f"Can cite: {doc.get('citation_guidance', {}).get('can_cite')}")

    # Rate limit info from headers is available in resp.headers:
    # X-RateLimit-Limit, X-RateLimit-Remaining, X-API-Tier
