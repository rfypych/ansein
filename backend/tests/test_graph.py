"""Tests for the graph engine."""
from __future__ import annotations

from app.engines.graph import GraphEngine


class TestGraphConstruction:
    def test_empty_graph(self):
        g = GraphEngine()
        data = g.to_d3_json()
        assert data == {"nodes": [], "edges": []}

    def test_add_entities(self):
        g = GraphEngine()
        g.add_entity(1, "ioc_ip", "1.1.1.1")
        g.add_entity(2, "ioc_domain", "bad.com")
        data = g.to_d3_json()
        assert len(data["nodes"]) == 2

    def test_add_relationship(self):
        g = GraphEngine()
        g.add_entity(1, "ioc_ip", "1.1.1.1")
        g.add_entity(2, "ioc_domain", "bad.com")
        g.add_relationship(1, 1, 2, "communicates_with", 0.7, "evidence text")
        data = g.to_d3_json()
        assert len(data["edges"]) == 1
        assert data["edges"][0]["label"] == "communicates_with"
        assert data["edges"][0]["weight"] == 0.7

    def test_colors_assigned_by_type(self):
        g = GraphEngine()
        g.add_entity(1, "threat_actor", "APT29")
        g.add_entity(2, "malware", "CozyDuke")
        g.add_entity(3, "ioc_ip", "1.1.1.1")
        data = g.to_d3_json()
        colors = {n["type"]: n["color"] for n in data["nodes"]}
        assert colors["threat_actor"] == "#dc2626"  # red
        assert colors["malware"] == "#7c3aed"  # purple
        assert colors["ioc_ip"] == "#16a34a"  # green


class TestGraphQueries:
    def test_neighbors(self):
        g = GraphEngine()
        g.add_entity(1, "ioc_ip", "1.1.1.1")
        g.add_entity(2, "ioc_domain", "a.com")
        g.add_entity(3, "ioc_domain", "b.com")
        g.add_relationship(1, 1, 2, "communicates_with")
        g.add_relationship(2, 1, 3, "communicates_with")
        # Node 1 has neighbors {1, 2, 3}
        nbrs = set(g.neighbors(1))
        assert nbrs == {1, 2, 3}

    def test_neighbors_unknown_node(self):
        g = GraphEngine()
        assert g.neighbors(999) == []

    def test_shortest_path(self):
        g = GraphEngine()
        g.add_entity(1, "x", "a")
        g.add_entity(2, "x", "b")
        g.add_entity(3, "x", "c")
        g.add_relationship(1, 1, 2, "r")
        g.add_relationship(2, 2, 3, "r")
        path = g.shortest_path(1, 3)
        assert path == [1, 2, 3]

    def test_shortest_path_no_path(self):
        g = GraphEngine()
        g.add_entity(1, "x", "a")
        g.add_entity(2, "x", "b")
        path = g.shortest_path(1, 2)
        assert path == []

    def test_centrality(self):
        g = GraphEngine()
        g.add_entity(1, "x", "hub")
        g.add_entity(2, "x", "a")
        g.add_entity(3, "x", "b")
        g.add_relationship(1, 1, 2, "r")
        g.add_relationship(2, 1, 3, "r")
        cent = g.centrality()
        # Node 1 has degree 2 (out), should have highest centrality
        assert cent[1] >= cent[2]
        assert cent[1] >= cent[3]


class TestStixExport:
    def test_stix_export_returns_list(self):
        g = GraphEngine()
        g.add_entity(1, "ioc_ip", "1.1.1.1")
        g.add_entity(2, "malware", "CozyDuke")
        g.add_relationship(1, 1, 2, "delivers")
        objects = g.to_stix()
        assert isinstance(objects, list)
        assert len(objects) >= 2  # at least the entities

    def test_stix_export_empty_graph(self):
        g = GraphEngine()
        objects = g.to_stix()
        assert objects == []

    def test_stix_export_with_threat_actor(self):
        g = GraphEngine()
        g.add_entity(1, "threat_actor", "APT29")
        objects = g.to_stix()
        # Should have at least one object with type threat-actor
        types = [o.get("type") for o in objects]
        assert "threat-actor" in types


class TestD3JsonTruncation:
    def test_d3_limits_large_graphs(self):
        g = GraphEngine()
        for i in range(100):
            g.add_entity(i, "ioc_ip", f"10.0.0.{i}")
        for i in range(99):
            g.add_relationship(i, i, i + 1, "r")
        data = g.to_d3_json(max_nodes=10)
        assert len(data["nodes"]) == 10
        # Edges should only include pairs where both endpoints are in keep set
        kept_ids = {n["id"] for n in data["nodes"]}
        for e in data["edges"]:
            assert e["source"] in kept_ids
            assert e["target"] in kept_ids
