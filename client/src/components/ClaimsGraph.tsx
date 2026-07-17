/**
 * Claims Graph Visualization Component
 * 
 * Visualizes the knowledge graph of brand-related claims and their relationships
 */

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Network, TrendingUp, TrendingDown, Minus, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface Claim {
  text: string;
  type: 'factual' | 'opinion' | 'comparison' | 'recommendation';
  subject: string;
  predicate: string;
  confidence: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  evidence: Evidence[];
}

interface Evidence {
  type: 'citation' | 'mention' | 'context';
  source: string;
  snippet: string;
  relevance: number;
}

interface ClaimRelationship {
  from: string;
  to: string;
  type: 'supports' | 'contradicts' | 'elaborates' | 'compares';
  strength: number;
}

interface Entity {
  name: string;
  type: 'brand' | 'product' | 'feature' | 'competitor' | 'person' | 'organization';
  mentions: number;
  sentiment: 'positive' | 'neutral' | 'negative';
}

interface ClaimsGraphProps {
  claims: Claim[];
  relationships: ClaimRelationship[];
  entities: Entity[];
}

const SENTIMENT_COLORS = {
  positive: '#10b981',
  neutral: '#6b7280',
  negative: '#ef4444',
};

const TYPE_COLORS = {
  factual: '#3b82f6',
  opinion: '#8b5cf6',
  comparison: '#f59e0b',
  recommendation: '#ec4899',
};

export default function ClaimsGraph({ claims, relationships, entities }: ClaimsGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply transformations
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Draw graph
    drawGraph(ctx, claims, relationships, canvas.width / zoom, canvas.height / zoom);

    ctx.restore();
  }, [claims, relationships, zoom, pan]);

  const handleZoomIn = () => setZoom(z => Math.min(z * 1.2, 3));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.2, 0.5));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Claims</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{claims.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Relationships</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{relationships.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Entities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{entities.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Confidence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(claims.reduce((sum, c) => sum + c.confidence, 0) / claims.length * 100).toFixed(0)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Graph Visualization */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Claims Knowledge Graph
              </CardTitle>
              <CardDescription>
                Interactive visualization of claims and their relationships
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleZoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <canvas
            ref={canvasRef}
            className="w-full h-96 border rounded-lg cursor-move"
            onMouseDown={(e) => {
              const startX = e.clientX - pan.x;
              const startY = e.clientY - pan.y;

              const handleMouseMove = (e: MouseEvent) => {
                setPan({
                  x: e.clientX - startX,
                  y: e.clientY - startY,
                });
              };

              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };

              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          />
        </CardContent>
      </Card>

      {/* Claims List */}
      <Card>
        <CardHeader>
          <CardTitle>Claims Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {claims.slice(0, 10).map((claim, index) => (
              <div
                key={index}
                className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                onClick={() => setSelectedClaim(claim)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-medium">{claim.text}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {claim.subject} - {claim.predicate}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge style={{ backgroundColor: TYPE_COLORS[claim.type] }}>
                      {claim.type}
                    </Badge>
                    <Badge variant="outline" className="flex items-center gap-1">
                      {claim.sentiment === 'positive' && <TrendingUp className="h-3 w-3" />}
                      {claim.sentiment === 'negative' && <TrendingDown className="h-3 w-3" />}
                      {claim.sentiment === 'neutral' && <Minus className="h-3 w-3" />}
                      {claim.sentiment}
                    </Badge>
                  </div>
                </div>
                {claim.evidence.length > 0 && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    {claim.evidence.length} evidence source(s)
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Entities */}
      <Card>
        <CardHeader>
          <CardTitle>Extracted Entities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {entities.map((entity, index) => (
              <Badge
                key={index}
                variant="outline"
                style={{ borderColor: SENTIMENT_COLORS[entity.sentiment] }}
              >
                {entity.name} ({entity.mentions})
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Draw the graph on canvas
 */
function drawGraph(
  ctx: CanvasRenderingContext2D,
  claims: Claim[],
  relationships: ClaimRelationship[],
  width: number,
  height: number
) {
  // Simple force-directed layout (simplified)
  const nodes = claims.map((claim, index) => ({
    claim,
    x: Math.random() * width,
    y: Math.random() * height,
    vx: 0,
    vy: 0,
  }));

  // Draw relationships
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;

  for (const rel of relationships) {
    const fromNode = nodes.find(n => n.claim.text === rel.from);
    const toNode = nodes.find(n => n.claim.text === rel.to);

    if (fromNode && toNode) {
      ctx.beginPath();
      ctx.moveTo(fromNode.x, fromNode.y);
      ctx.lineTo(toNode.x, toNode.y);
      ctx.stroke();
    }
  }

  // Draw nodes
  for (const node of nodes) {
    const color = SENTIMENT_COLORS[node.claim.sentiment];
    const radius = 8 + (node.claim.confidence * 12);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
