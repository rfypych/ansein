import { useEffect, useRef } from "react";
import * as d3 from "d3";

/**
 * D3 force-directed graph for threat intel entities.
 * Nodes coloured by entity_type. Edges labelled with relation_type.
 */
export function GraphView({ data, onNodeClick }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!data || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    if (width < 10 || height < 10) return;

    // Defs (arrow markers)
    const defs = svg.append("defs");
    defs
      .append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 18)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#475569");

    const nodes = (data.nodes || []).map((d) => ({ ...d }));
    const links = (data.edges || []).map((d) => ({ ...d }));

    const sim = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(80)
          .strength(0.5)
      )
      .force("charge", d3.forceManyBody().strength(-180))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(22));

    // Links
    const link = svg
      .append("g")
      .attr("stroke", "#334155")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", (d) => Math.max(1, Math.min(3, d.weight * 2)))
      .attr("marker-end", "url(#arrow)");

    const linkLabel = svg
      .append("g")
      .selectAll("text")
      .data(links)
      .join("text")
      .attr("text-anchor", "middle")
      .attr("font-size", 9)
      .attr("fill", "#64748b")
      .text((d) => d.label || "");

    // Nodes
    const node = svg
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d) => 8 + (d.confidence || 0.5) * 8)
      .attr("fill", (d) => d.color || "#0ea5e9")
      .attr("stroke", "#0f172a")
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("click", (ev, d) => onNodeClick?.(d))
      .call(
        d3
          .drag()
          .on("start", (ev, d) => {
            if (!ev.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (ev, d) => {
            d.fx = ev.x;
            d.fy = ev.y;
          })
          .on("end", (ev, d) => {
            if (!ev.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    node.append("title").text((d) => `[${d.type}] ${d.label}`);

    const label = svg
      .append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .attr("font-size", 10)
      .attr("fill", "#cbd5e1")
      .attr("text-anchor", "middle")
      .attr("dy", 22)
      .text((d) => (d.label.length > 24 ? d.label.slice(0, 24) + "…" : d.label));

    sim.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);
      linkLabel
        .attr("x", (d) => (d.source.x + d.target.x) / 2)
        .attr("y", (d) => (d.source.y + d.target.y) / 2);
      node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
      label.attr("x", (d) => d.x).attr("y", (d) => d.y);
    });

    return () => {
      sim.stop();
    };
  }, [data, onNodeClick]);

  return (
    <svg
      ref={svgRef}
      className="w-full h-full"
      style={{ minHeight: 400, background: "radial-gradient(circle at center, #0f172a 0%, #020617 100%)" }}
    />
  );
}
