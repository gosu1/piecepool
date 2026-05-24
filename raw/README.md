# Raw Sources

This directory is the immutable source layer for PiecePool.

Rules:
- Raw sources are treated as read-only after ingestion.
- LLM workflows may read these files but should not mutate them.
- Derived summaries, concepts, and relationships belong in `wiki/`, not here.
