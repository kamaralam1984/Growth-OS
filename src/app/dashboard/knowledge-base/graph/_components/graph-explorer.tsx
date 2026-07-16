"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, MarkerType, useNodesState, useEdgesState, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getNeighborhoodAction,
  rebuildGraphAction,
  searchGraphNodesAction,
  type GraphNodeSummary,
  type GraphRelationshipSummary,
} from "../actions";
import { GraphCanvasNode, ENTITY_TYPE_META, type GraphCanvasNodeType } from "./graph-node";
import type { GraphEntityType } from "@/generated/prisma/client";

const nodeTypes = { graphNode: GraphCanvasNode };

const ENTITY_TYPE_OPTIONS: GraphEntityType[] = [
  "DEAL",
  "COMPANY",
  "CLIENT",
  "PROJECT",
  "EMPLOYEE",
  "MEETING",
  "TASK",
  "KNOWLEDGE_ARTICLE",
  "DOCUMENT",
  "EMAIL",
  "AI_DECISION",
];

const EDGE_COLOR = "var(--muted-foreground)";
// Radial ring spacing in canvas px per hop of real graph distance.
const RING_SPACING = 220;

/**
 * Real BFS-by-hop-distance radial layout, computed locally. @xyflow/react
 * ships no auto-layout — and a full force-directed layout would be overkill
 * for a focused, capped (<=200 node, see builder.ts's MAX_NEIGHBORHOOD_NODES)
 * neighborhood view. The center node sits at the origin; every other real
 * node is ringed at a radius proportional to its real hop distance from the
 * center (derived from the actual Relationship edges returned by
 * getNodeNeighborhood), spread evenly by angle within its own ring.
 */
function computeRadialLayout(
  centerNodeId: string,
  nodes: GraphNodeSummary[],
  relationships: GraphRelationshipSummary[],
): Map<string, { x: number; y: number }> {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const relationship of relationships) {
    adjacency.get(relationship.fromNodeId)?.push(relationship.toNodeId);
    adjacency.get(relationship.toNodeId)?.push(relationship.fromNodeId);
  }

  const distances = new Map<string, number>([[centerNodeId, 0]]);
  let frontier = [centerNodeId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighborId of adjacency.get(id) ?? []) {
        if (!distances.has(neighborId)) {
          distances.set(neighborId, (distances.get(id) ?? 0) + 1);
          next.push(neighborId);
        }
      }
    }
    frontier = next;
  }

  const nodesByDistance = new Map<number, string[]>();
  for (const node of nodes) {
    const distance = distances.get(node.id) ?? 1;
    nodesByDistance.set(distance, [...(nodesByDistance.get(distance) ?? []), node.id]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [distance, ids] of nodesByDistance) {
    if (distance === 0) {
      positions.set(ids[0], { x: 0, y: 0 });
      continue;
    }
    const radius = distance * RING_SPACING;
    ids.forEach((id, index) => {
      const angle = (2 * Math.PI * index) / ids.length;
      positions.set(id, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
    });
  }
  return positions;
}

function buildFlowNodes(centerNodeId: string, nodes: GraphNodeSummary[], relationships: GraphRelationshipSummary[]): GraphCanvasNodeType[] {
  const positions = computeRadialLayout(centerNodeId, nodes, relationships);
  return nodes.map((node) => ({
    id: node.id,
    type: "graphNode",
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: { entityType: node.entityType, label: node.label, isCenter: node.id === centerNodeId },
  }));
}

function buildFlowEdges(relationships: GraphRelationshipSummary[]): Edge[] {
  return relationships.map((relationship) => ({
    id: relationship.id,
    source: relationship.fromNodeId,
    target: relationship.toNodeId,
    label: relationship.type.replaceAll("_", " ").toLowerCase(),
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR },
    style: { stroke: EDGE_COLOR, strokeWidth: 1.5 },
    labelStyle: { fill: "var(--muted-foreground)", fontSize: 10 },
  }));
}

interface GraphCanvasInnerProps {
  centerNodeId: string;
  nodesData: GraphNodeSummary[];
  relationshipsData: GraphRelationshipSummary[];
}

function GraphCanvasInner({ centerNodeId, nodesData, relationshipsData }: GraphCanvasInnerProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState<GraphCanvasNodeType>(buildFlowNodes(centerNodeId, nodesData, relationshipsData));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(buildFlowEdges(relationshipsData));

  // Re-sync local xyflow state whenever a new real neighborhood arrives
  // (new center node picked, or depth changed) — adjusted during render per
  // React's documented pattern, matching workflow-canvas.tsx's convention.
  const key = `${centerNodeId}:${nodesData.length}:${relationshipsData.length}`;
  const [prevKey, setPrevKey] = React.useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setNodes(buildFlowNodes(centerNodeId, nodesData, relationshipsData));
    setEdges(buildFlowEdges(relationshipsData));
  }

  const colorMode = mounted && resolvedTheme === "light" ? "light" : "dark";

  return (
    <div className="glass-panel h-[60vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        colorMode={colorMode}
        nodesDraggable
        nodesConnectable={false}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="var(--primary)" maskColor="color-mix(in srgb, var(--background) 70%, transparent)" />
      </ReactFlow>
    </div>
  );
}

export function GraphExplorer({ canRebuild }: { canRebuild: boolean }) {
  const [pending, startTransition] = React.useTransition();
  const [rebuildPending, startRebuildTransition] = React.useTransition();

  const [entityTypeFilter, setEntityTypeFilter] = React.useState<GraphEntityType | "">("");
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<GraphNodeSummary[]>([]);
  const [searched, setSearched] = React.useState(false);

  const [selectedNode, setSelectedNode] = React.useState<GraphNodeSummary | null>(null);
  const [depth, setDepth] = React.useState(1);
  const [neighborhood, setNeighborhood] = React.useState<{ nodes: GraphNodeSummary[]; relationships: GraphRelationshipSummary[] } | null>(null);

  const runSearch = React.useCallback(() => {
    startTransition(async () => {
      const result = await searchGraphNodesAction(query, entityTypeFilter || undefined);
      setSearched(true);
      if (!result.ok) {
        toast.error(result.error ?? "Could not search the graph.");
        setResults([]);
        return;
      }
      setResults(result.nodes ?? []);
    });
  }, [query, entityTypeFilter, startTransition]);

  // Load an initial, unfiltered page of real nodes on mount so there's
  // always something clickable without requiring a search first.
  React.useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadNeighborhood = React.useCallback(
    (node: GraphNodeSummary, requestedDepth: number) => {
      setSelectedNode(node);
      startTransition(async () => {
        const result = await getNeighborhoodAction(node.entityType, node.entityId, requestedDepth);
        if (!result.ok) {
          toast.error(result.error ?? "Could not load this node's neighborhood.");
          return;
        }
        setNeighborhood({ nodes: result.nodes ?? [], relationships: result.relationships ?? [] });
      });
    },
    [startTransition],
  );

  const handleRebuild = React.useCallback(() => {
    startRebuildTransition(async () => {
      const result = await rebuildGraphAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not rebuild the graph.");
        return;
      }
      toast.success(`Graph rebuilt — ${result.nodesCreated ?? 0} new node(s), ${result.relationshipsCreated ?? 0} new relationship(s).`);
      runSearch();
      if (selectedNode) loadNeighborhood(selectedNode, depth);
    });
  }, [runSearch, selectedNode, depth, loadNeighborhood]);

  return (
    <div className="flex flex-col gap-6">
      <Card glass>
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="graph-entity-type">
                Entity type
              </label>
              <Select
                id="graph-entity-type"
                value={entityTypeFilter}
                onChange={(e) => setEntityTypeFilter(e.target.value as GraphEntityType | "")}
                className="w-48"
              >
                <option value="">All types</option>
                {ENTITY_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {ENTITY_TYPE_META[type].label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="graph-search">
                Search by label
              </label>
              <Input
                id="graph-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch();
                }}
                placeholder="e.g. Acme Corp, Website Redesign…"
              />
            </div>
            <Button type="button" onClick={runSearch} disabled={pending} variant="secondary">
              <Search className="size-4" />
              Search
            </Button>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="graph-depth">
                Depth
              </label>
              <Select
                id="graph-depth"
                value={String(depth)}
                onChange={(e) => {
                  const nextDepth = Number(e.target.value);
                  setDepth(nextDepth);
                  if (selectedNode) loadNeighborhood(selectedNode, nextDepth);
                }}
                className="w-24"
              >
                <option value="1">1 hop</option>
                <option value="2">2 hops</option>
                <option value="3">3 hops</option>
              </Select>
            </div>
            {canRebuild && (
              <Button type="button" onClick={handleRebuild} disabled={rebuildPending} variant="outline">
                <RefreshCw className={rebuildPending ? "size-4 animate-spin" : "size-4"} />
                {rebuildPending ? "Rebuilding…" : "Rebuild graph"}
              </Button>
            )}
          </div>

          {results.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {results.map((node) => (
                <button key={node.id} type="button" onClick={() => loadNeighborhood(node, depth)}>
                  <Badge variant={selectedNode?.id === node.id ? "accent" : "outline"} className="cursor-pointer">
                    {node.label}
                  </Badge>
                </button>
              ))}
            </div>
          ) : searched && !pending ? (
            <p className="text-sm text-muted-foreground">No graph nodes match yet. Try &ldquo;Rebuild graph&rdquo; or a different search.</p>
          ) : null}
        </CardContent>
      </Card>

      {selectedNode && neighborhood ? (
        <ReactFlowProvider>
          <GraphCanvasInner centerNodeId={selectedNode.id} nodesData={neighborhood.nodes} relationshipsData={neighborhood.relationships} />
        </ReactFlowProvider>
      ) : (
        <Card glass>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <p className="text-sm text-muted-foreground">Pick a node above to render its real neighborhood.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
