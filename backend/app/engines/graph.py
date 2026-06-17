"""
In-memory knowledge graph built on NetworkX. Production deployments can
swap this for Neo4j by implementing the same interface.

The graph is rebuilt from `entities` + `relationships` tables on demand —
we don't persist a NetworkX pickle to avoid version-skew bugs.
"""
from __future__ import annotations

import logging
from typing import Optional

import networkx as nx

log = logging.getLogger(__name__)

# Colour palette per entity type — used by the frontend
COLOR_MAP = {
    "threat_actor": "#dc2626",  # red
    "malware": "#7c3aed",       # purple
    "tool": "#2563eb",          # blue
    "technique": "#0891b2",     # cyan
    "vulnerability": "#ea580c", # orange
    "ioc_ip": "#16a34a",        # green
    "ioc_domain": "#65a30d",    # lime
    "ioc_url": "#9333ea",       # violet
    "ioc_hash": "#0d9488",      # teal
    "ioc_wallet": "#a16207",    # amber
    "target": "#db2777",        # pink
    "location": "#475569",      # slate
    "identity": "#64748b",      # slate-2
}

ICON_MAP = {
    "threat_actor": "users",
    "malware": "bug",
    "tool": "wrench",
    "technique": "code",
    "vulnerability": "shield",
    "ioc_ip": "globe",
    "ioc_domain": "link",
    "ioc_url": "external-link",
    "ioc_hash": "hash",
    "ioc_wallet": "credit-card",
    "target": "crosshair",
    "location": "map-pin",
    "identity": "user",
}


class GraphEngine:
    """Build / query / export an in-memory NetworkX graph."""

    def __init__(self) -> None:
        self.graph: nx.MultiDiGraph = nx.MultiDiGraph()

    # ----------------------------------------------------- build
    def add_entity(self, entity_id: int, entity_type: str, value: str, **attrs) -> None:
        self.graph.add_node(
            entity_id,
            entity_type=entity_type,
            value=value,
            color=COLOR_MAP.get(entity_type, "#64748b"),
            icon=ICON_MAP.get(entity_type, "circle"),
            **attrs,
        )

    def add_relationship(
        self,
        rel_id: int,
        source_id: int,
        target_id: int,
        relation_type: str,
        weight: float = 1.0,
        evidence: str = "",
    ) -> None:
        self.graph.add_edge(
            source_id,
            target_id,
            key=rel_id,
            relation_type=relation_type,
            weight=weight,
            evidence=evidence,
        )

    def build_from_db(self, entities: list, relationships: list) -> None:
        """Rebuild from ORM rows."""
        self.graph = nx.MultiDiGraph()
        for e in entities:
            self.add_entity(
                e.id,
                e.entity_type,
                e.value,
                confidence=e.confidence,
                enrichment=e.enrichment or {},
                source_method=e.source_method,
                normalized=e.normalized,
            )
        for r in relationships:
            self.add_relationship(
                r.id,
                r.source_id,
                r.target_id,
                r.relation_type,
                r.weight,
                r.evidence,
            )

    # ----------------------------------------------------- query
    def neighbors(self, node_id: int, depth: int = 1) -> list[int]:
        if node_id not in self.graph:
            return []
        return list(nx.single_source_shortest_path_length(self.graph, node_id, cutoff=depth).keys())

    def shortest_path(self, src: int, dst: int) -> list[int]:
        try:
            return nx.shortest_path(self.graph, src, dst)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return []

    def centrality(self) -> dict[int, float]:
        """Degree centrality — quick proxy for "most connected" entities."""
        return nx.degree_centrality(self.graph)

    def subgraph_around(self, node_id: int, depth: int = 2) -> "GraphEngine":
        nodes = self.neighbors(node_id, depth=depth)
        sub = GraphEngine()
        sub.graph = self.graph.subgraph(nodes).copy()
        return sub

    # ----------------------------------------------------- export
    def to_d3_json(self, max_nodes: int = 500) -> dict:
        """Serialise for D3/force-directed rendering."""
        nodes = []
        for n, attrs in self.graph.nodes(data=True):
            nodes.append(
                {
                    "id": n,
                    "label": attrs.get("value", ""),
                    "type": attrs.get("entity_type", "unknown"),
                    "color": attrs.get("color", "#64748b"),
                    "icon": attrs.get("icon", "circle"),
                    "confidence": attrs.get("confidence", 0.5),
                    "enrichment": bool(attrs.get("enrichment")),
                }
            )
        if len(nodes) > max_nodes:
            # Keep top-degree nodes only
            deg = nx.degree_centrality(self.graph)
            nodes.sort(key=lambda n: deg.get(n["id"], 0), reverse=True)
            keep = {n["id"] for n in nodes[:max_nodes]}
            nodes = [n for n in nodes if n["id"] in keep]
        else:
            keep = set(self.graph.nodes())

        edges = []
        for u, v, key, attrs in self.graph.edges(data=True, keys=True):
            if u not in keep or v not in keep:
                continue
            edges.append(
                {
                    "source": u,
                    "target": v,
                    "label": attrs.get("relation_type", ""),
                    "weight": attrs.get("weight", 1.0),
                    "evidence": attrs.get("evidence", "")[:200],
                }
            )

        return {"nodes": nodes, "edges": edges}

    def to_stix(self, entities_map: Optional[dict] = None) -> list[dict]:
        """
        Lightweight STIX 2.1 export (JSON-LD-ish list of SDOs).
        `entities_map` is id→entity_type for resolving IDs.
        """
        import uuid

        def stix_id(prefix: str, int_id: int) -> str:
            """Deterministic STIX ID (UUID v5 from a namespace + int)."""
            ns = uuid.UUID("a6f3c4d2-1b5e-4f8a-9c0b-7d2e3f5a8b9c")
            return f"{prefix}--{uuid.uuid5(ns, str(int_id))}"

        try:
            from stix2 import (  # type: ignore
                Indicator,
                Malware,
                ThreatActor,
                Identity,
                Relationship as StixRel,
            )
        except ImportError:
            log.warning("stix2 library not installed — returning raw JSON")
            return self._to_stix_raw()

        # Map entity_id → stix_id (so relationships can reference them)
        id_to_stix: dict[int, str] = {}
        objects = []
        for n, attrs in self.graph.nodes(data=True):
            etype = attrs.get("entity_type", "")
            val = attrs.get("value", "")
            if etype.startswith("ioc_"):
                pattern_map = {
                    "ioc_ip": f"[ipv4-addr:value = '{val}']",
                    "ioc_domain": f"[domain-name:value = '{val}']",
                    "ioc_url": f"[url:value = '{val}']",
                    "ioc_hash": f"[file:hashes.'SHA-256' = '{val}']",
                }
                pattern = pattern_map.get(etype, f"[x-ansein:value = '{val}']")
                obj = Indicator(name=val, pattern_type="stix", pattern=pattern)
                prefix = "indicator"
            elif etype == "malware":
                obj = Malware(name=val, is_family=False)
                prefix = "malware"
            elif etype == "threat_actor":
                obj = ThreatActor(name=val)
                prefix = "threat-actor"
            elif etype in ("target", "identity"):
                obj = Identity(name=val, identity_class="organization")
                prefix = "identity"
            else:
                obj = Indicator(
                    name=val, pattern_type="stix", pattern=f"[x-ansein:{etype} = '{val}']"
                )
                prefix = "indicator"
            sid = stix_id(prefix, n)
            id_to_stix[n] = sid
            # Override the auto-generated id with our deterministic one
            import json as _json
            obj_dict = _json.loads(obj.serialize())
            obj_dict["id"] = sid
            objects.append(obj_dict)

        for u, v, key, attrs in self.graph.edges(data=True, keys=True):
            rel = StixRel(
                relationship_type=attrs.get("relation_type", "related-to"),
                source_ref=id_to_stix.get(u, f"indicator--{u}"),
                target_ref=id_to_stix.get(v, f"indicator--{v}"),
            )
            import json as _json2
            objects.append(_json2.loads(rel.serialize()))

        return objects

    def _to_stix_raw(self) -> list[dict]:
        out = []
        for n, attrs in self.graph.nodes(data=True):
            out.append({"type": "indicator", "id": str(n), **{k: v for k, v in attrs.items() if isinstance(v, (str, int, float, bool))}})
        for u, v, key, attrs in self.graph.edges(data=True, keys=True):
            out.append({"type": "relationship", "source": u, "target": v, **{k: v for k, v in attrs.items() if isinstance(v, (str, int, float, bool))}})
        return out
