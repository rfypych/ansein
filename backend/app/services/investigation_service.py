"""Investigation service: orchestrates extract → enrich → analyze pipeline."""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import session_scope
from app.engines.analysis import AnalysisEngine
from app.engines.enrichment import EnrichmentEngine
from app.engines.extraction import ExtractionEngine, infer_relationships
from app.engines.graph import GraphEngine
from app.models.models import (
    AnalysisRun,
    Entity,
    Investigation,
    Relationship,
    Source,
)
from app.schemas.schemas import (
    AnalysisOut,
    EntityOut,
    GraphData,
    InvestigationCreate,
    InvestigationOut,
    InvestigationUpdate,
    RelationshipOut,
    SourceCreate,
    SourceOut,
)
from app.services.user_service import get_user_keys

log = logging.getLogger(__name__)


# ----------------------------------------------------- investigations
def create_investigation(db: Session, user_id: int, payload: InvestigationCreate) -> Investigation:
    inv = Investigation(
        user_id=user_id,
        title=payload.title,
        description=payload.description,
        tags=payload.tags,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


def get_investigation(db: Session, user_id: int, inv_id: int) -> Optional[Investigation]:
    inv = db.get(Investigation, inv_id)
    if not inv or inv.user_id != user_id:
        return None
    return inv


def list_investigations(
    db: Session, user_id: int, *, page: int = 1, page_size: int = 20, status: Optional[str] = None
) -> tuple[list[InvestigationOut], int]:
    q = select(Investigation).where(Investigation.user_id == user_id)
    if status:
        q = q.where(Investigation.status == status)
    q = q.order_by(Investigation.updated_at.desc())

    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.execute(q.offset((page - 1) * page_size).limit(page_size)).scalars().all()

    out = []
    for inv in rows:
        out.append(_inv_to_out(inv, db))
    return out, total


def update_investigation(
    db: Session, user_id: int, inv_id: int, payload: InvestigationUpdate
) -> Optional[Investigation]:
    inv = get_investigation(db, user_id, inv_id)
    if not inv:
        return None
    if payload.title is not None:
        inv.title = payload.title
    if payload.description is not None:
        inv.description = payload.description
    if payload.tags is not None:
        inv.tags = payload.tags
    if payload.status is not None:
        inv.status = payload.status
    db.commit()
    db.refresh(inv)
    return inv


def delete_investigation(db: Session, user_id: int, inv_id: int) -> bool:
    inv = get_investigation(db, user_id, inv_id)
    if not inv:
        return False
    db.delete(inv)
    db.commit()
    return True


# ----------------------------------------------------- sources
def add_source(
    db: Session, user_id: int, inv_id: int, payload: SourceCreate
) -> Optional[Source]:
    inv = get_investigation(db, user_id, inv_id)
    if not inv:
        return None
    src = Source(
        investigation_id=inv_id,
        source_type=payload.source_type,
        title=payload.title,
        content=payload.content,
        mime_type=payload.mime_type,
        size_bytes=len(payload.content.encode("utf-8")),
        content_hash=hashlib.sha256(payload.content.encode("utf-8")).hexdigest(),
    )
    db.add(src)
    db.commit()
    db.refresh(src)
    return src


def list_sources(db: Session, user_id: int, inv_id: int) -> Optional[list[SourceOut]]:
    inv = get_investigation(db, user_id, inv_id)
    if not inv:
        return None
    rows = db.execute(
        select(Source).where(Source.investigation_id == inv_id).order_by(Source.created_at.desc())
    ).scalars().all()
    return [SourceOut.model_validate(r) for r in rows]


# ----------------------------------------------------- pipeline
def run_pipeline(db: Session, user_id: int, inv_id: int) -> Optional[Investigation]:
    """
    Full pipeline: extract → enrich → infer relationships → analyze.
    Idempotent: wipes existing entities/relationships/analysis first.
    """
    inv = get_investigation(db, user_id, inv_id)
    if not inv:
        return None

    user_keys = get_user_keys(db, user_id)

    # Mark as extracting
    inv.status = "extracting"
    db.commit()

    try:
        # 1) Gather source text
        sources = db.execute(
            select(Source).where(Source.investigation_id == inv_id)
        ).scalars().all()
        text = "\n\n".join(s.content for s in sources)
        if not text.strip():
            inv.status = "pending"
            db.commit()
            return inv

        # 2) Wipe previous extraction artifacts
        db.execute(
            Entity.__table__.delete().where(Entity.investigation_id == inv_id)
        )
        db.execute(
            Relationship.__table__.delete().where(Relationship.investigation_id == inv_id)
        )
        db.commit()

        # 3) Extract
        extractor = ExtractionEngine(use_gliner=False, use_llm=True)
        extracted = extractor.extract(text, user_keys=user_keys)

        # 4) Persist entities
        entity_value_to_id: dict[str, int] = {}
        for e in extracted:
            ent = Entity(
                investigation_id=inv_id,
                entity_type=e.entity_type,
                value=e.value,
                normalized=e.normalized,
                confidence=e.confidence,
                source_method=e.source_method,
                enrichment={},
            )
            db.add(ent)
            db.flush()
            entity_value_to_id[e.normalized.lower()] = ent.id

        # 5) Enrich (mark as enriching)
        inv.status = "enriching"
        db.commit()
        enricher = EnrichmentEngine(user_keys=user_keys)
        for ent in db.execute(
            select(Entity).where(Entity.investigation_id == inv_id)
        ).scalars().all():
            if ent.entity_type.startswith("ioc_") or ent.entity_type == "ioc_wallet":
                ent.enrichment = enricher.enrich(ent.entity_type, ent.value)

        # 6) Infer relationships
        rels = infer_relationships(extracted, text)
        for r in rels:
            src_id = entity_value_to_id.get(r["source"].lower())
            tgt_id = entity_value_to_id.get(r["target"].lower())
            if not src_id or not tgt_id or src_id == tgt_id:
                continue
            db.add(
                Relationship(
                    investigation_id=inv_id,
                    source_id=src_id,
                    target_id=tgt_id,
                    relation_type=r["relation_type"],
                    weight=r["weight"],
                    evidence=r["evidence"],
                )
            )
        db.commit()

        # 7) Analyze (mark as analyzing)
        inv.status = "analyzing"
        db.commit()
        entities_orm = db.execute(
            select(Entity).where(Entity.investigation_id == inv_id)
        ).scalars().all()
        entities_dicts = [
            {
                "entity_type": e.entity_type,
                "value": e.value,
                "confidence": e.confidence,
            }
            for e in entities_orm
        ]
        merged_enrichment = {}
        for e in entities_orm:
            for k, v in (e.enrichment or {}).items():
                if k == "mock":
                    continue
                merged_enrichment.setdefault(k, []).append(v)

        analyzer = AnalysisEngine()
        result = analyzer.analyze(
            entities_dicts, merged_enrichment, user_keys=user_keys, source_text=text[:4000]
        )

        run = AnalysisRun(
            investigation_id=inv_id,
            narrative=result.get("narrative", ""),
            actor_hypothesis=result.get("actor_hypothesis", {}),
            severity_score=result.get("severity_score", 0.0),
            recommendations=result.get("recommendations", []),
            admiralty_code=result.get("admiralty_code", "F6"),
            confidence=result.get("confidence", 0.5),
            model_used=result.get("model_used", ""),
            tokens_used=result.get("tokens_used", 0),
        )
        db.add(run)
        inv.severity_score = run.severity_score
        inv.status = "completed"
        db.commit()
        db.refresh(inv)
        return inv

    except Exception as e:
        log.exception("Pipeline failed for investigation %s: %s", inv_id, e)
        inv.status = "failed"
        db.commit()
        return inv


# ----------------------------------------------------- read helpers
def list_entities(db: Session, user_id: int, inv_id: int) -> Optional[list[EntityOut]]:
    inv = get_investigation(db, user_id, inv_id)
    if not inv:
        return None
    rows = db.execute(
        select(Entity).where(Entity.investigation_id == inv_id).order_by(Entity.confidence.desc())
    ).scalars().all()
    return [EntityOut.model_validate(r) for r in rows]


def list_relationships(db: Session, user_id: int, inv_id: int) -> Optional[list[RelationshipOut]]:
    inv = get_investigation(db, user_id, inv_id)
    if not inv:
        return None
    rows = db.execute(
        select(Relationship).where(Relationship.investigation_id == inv_id)
    ).scalars().all()
    return [RelationshipOut.model_validate(r) for r in rows]


def get_graph(db: Session, user_id: int, inv_id: int) -> Optional[GraphData]:
    inv = get_investigation(db, user_id, inv_id)
    if not inv:
        return None
    entities = db.execute(
        select(Entity).where(Entity.investigation_id == inv_id)
    ).scalars().all()
    rels = db.execute(
        select(Relationship).where(Relationship.investigation_id == inv_id)
    ).scalars().all()

    g = GraphEngine()
    g.build_from_db(entities, rels)
    data = g.to_d3_json()
    return GraphData(**data)


def get_latest_analysis(db: Session, user_id: int, inv_id: int) -> Optional[AnalysisOut]:
    inv = get_investigation(db, user_id, inv_id)
    if not inv:
        return None
    run = db.execute(
        select(AnalysisRun)
        .where(AnalysisRun.investigation_id == inv_id)
        .order_by(AnalysisRun.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if not run:
        return None
    return AnalysisOut.model_validate(run)


# ----------------------------------------------------- helpers
def _inv_to_out(inv: Investigation, db: Session) -> InvestigationOut:
    src_count = db.scalar(
        select(func.count()).select_from(
            select(Source.id).where(Source.investigation_id == inv.id).subquery()
        )
    ) or 0
    ent_count = db.scalar(
        select(func.count()).select_from(
            select(Entity.id).where(Entity.investigation_id == inv.id).subquery()
        )
    ) or 0
    rel_count = db.scalar(
        select(func.count()).select_from(
            select(Relationship.id).where(Relationship.investigation_id == inv.id).subquery()
        )
    ) or 0
    return InvestigationOut(
        id=inv.id,
        title=inv.title,
        description=inv.description,
        status=inv.status,
        severity_score=inv.severity_score,
        tags=inv.tags or [],
        created_at=inv.created_at,
        updated_at=inv.updated_at,
        source_count=src_count,
        entity_count=ent_count,
        relationship_count=rel_count,
    )
