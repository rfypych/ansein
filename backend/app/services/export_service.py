"""Export service: STIX 2.1, JSON, and PDF reports."""
from __future__ import annotations

import io
import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.engines.graph import GraphEngine
from app.models.models import (
    AnalysisRun,
    Entity,
    Investigation,
    Relationship,
    Source,
)

log = logging.getLogger(__name__)


def export_json(db: Session, user_id: int, inv_id: int) -> Optional[dict]:
    inv = db.get(Investigation, inv_id)
    if not inv or inv.user_id != user_id:
        return None
    entities = db.execute(select(Entity).where(Entity.investigation_id == inv_id)).scalars().all()
    rels = db.execute(select(Relationship).where(Relationship.investigation_id == inv_id)).scalars().all()
    analysis = db.execute(
        select(AnalysisRun).where(AnalysisRun.investigation_id == inv_id).order_by(AnalysisRun.created_at.desc()).limit(1)
    ).scalar_one_or_none()
    sources = db.execute(select(Source).where(Source.investigation_id == inv_id)).scalars().all()

    return {
        "investigation": {
            "id": inv.id,
            "title": inv.title,
            "description": inv.description,
            "status": inv.status,
            "severity_score": inv.severity_score,
            "tags": inv.tags,
            "created_at": inv.created_at.isoformat(),
            "updated_at": inv.updated_at.isoformat(),
        },
        "sources": [
            {
                "source_type": s.source_type,
                "title": s.title,
                "content": s.content,
                "content_hash": s.content_hash,
                "created_at": s.created_at.isoformat(),
            }
            for s in sources
        ],
        "entities": [
            {
                "id": e.id,
                "entity_type": e.entity_type,
                "value": e.value,
                "confidence": e.confidence,
                "enrichment": e.enrichment,
                "source_method": e.source_method,
            }
            for e in entities
        ],
        "relationships": [
            {
                "source_id": r.source_id,
                "target_id": r.target_id,
                "relation_type": r.relation_type,
                "weight": r.weight,
                "evidence": r.evidence,
            }
            for r in rels
        ],
        "analysis": {
            "narrative": analysis.narrative if analysis else "",
            "actor_hypothesis": analysis.actor_hypothesis if analysis else {},
            "severity_score": analysis.severity_score if analysis else 0,
            "recommendations": analysis.recommendations if analysis else [],
            "admiralty_code": analysis.admiralty_code if analysis else "F6",
            "model_used": analysis.model_used if analysis else "",
            "created_at": analysis.created_at.isoformat() if analysis else None,
        }
        if analysis
        else None,
        "exported_at": datetime.utcnow().isoformat(),
    }


def export_stix(db: Session, user_id: int, inv_id: int) -> Optional[dict]:
    inv = db.get(Investigation, inv_id)
    if not inv or inv.user_id != user_id:
        return None
    entities = db.execute(select(Entity).where(Entity.investigation_id == inv_id)).scalars().all()
    rels = db.execute(select(Relationship).where(Relationship.investigation_id == inv_id)).scalars().all()
    g = GraphEngine()
    g.build_from_db(entities, rels)
    objects = g.to_stix()
    return {
        "type": "bundle",
        "id": f"bundle--ansein-{inv_id}",
        "objects": objects,
    }


def export_pdf(db: Session, user_id: int, inv_id: int) -> Optional[bytes]:
    """Generate a simple PDF report. Returns bytes or None."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate,
            Paragraph,
            Spacer,
            Table,
            TableStyle,
        )
        from reportlab.lib import colors
    except ImportError:
        log.error("reportlab not installed")
        return None

    data = export_json(db, user_id, inv_id)
    if not data:
        return None

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=2 * cm, bottomMargin=2 * cm)
    styles = getSampleStyleSheet()
    h1 = styles["Heading1"]
    h2 = styles["Heading2"]
    body = styles["BodyText"]

    story = []
    inv = data["investigation"]
    story.append(Paragraph(f"AnseIn Threat Intelligence Report", h1))
    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph(f"<b>{inv['title']}</b>", h2))
    story.append(Paragraph(f"Status: {inv['status']} | Severity: {inv['severity_score']:.0f}/100", body))
    story.append(Paragraph(f"Generated: {data['exported_at']}", body))
    story.append(Spacer(1, 0.5 * cm))

    if inv["description"]:
        story.append(Paragraph("Description", h2))
        story.append(Paragraph(inv["description"], body))
        story.append(Spacer(1, 0.3 * cm))

    if data.get("analysis"):
        story.append(Paragraph("Threat Narrative", h2))
        story.append(Paragraph(data["analysis"]["narrative"].replace("\n", "<br/>"), body))
        story.append(Spacer(1, 0.3 * cm))

        story.append(Paragraph("Recommendations", h2))
        for r in data["analysis"]["recommendations"]:
            story.append(Paragraph(f"&bull; {r}", body))
        story.append(Spacer(1, 0.3 * cm))

    story.append(Paragraph("Extracted Entities", h2))
    rows = [["Type", "Value", "Confidence"]]
    for e in data["entities"]:
        rows.append([e["entity_type"], e["value"], f"{e['confidence']:.2f}"])
    tbl = Table(rows[:50], colWidths=[3 * cm, 9 * cm, 3 * cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 0.3 * cm))

    story.append(Paragraph("Relationships", h2))
    if data["relationships"]:
        rows = [["Source ID", "Target ID", "Relation", "Weight"]]
        for r in data["relationships"][:50]:
            rows.append([str(r["source_id"]), str(r["target_id"]), r["relation_type"], f"{r['weight']:.2f}"])
        tbl = Table(rows, colWidths=[3 * cm, 3 * cm, 5 * cm, 4 * cm])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
        ]))
        story.append(tbl)
    else:
        story.append(Paragraph("No relationships extracted.", body))

    doc.build(story)
    return buf.getvalue()
