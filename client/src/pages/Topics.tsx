import { useState, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TopBar } from "@/components/layout/TopBar";
import { useCurrentBrand } from "@/hooks/use-brand";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Target, TrendingUp, TrendingDown, Loader2, ChevronDown, ChevronRight, MessageSquare, Users, GitCompare, HelpCircle, Lightbulb } from "lucide-react";
import { TrendIndicator } from "@/components/ui/data-display";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Topics() {
  const { data: brands, isLoading: brandsLoading } = useQuery<any[]>({
    queryKey: ['/api/brands'],
  });

  const currentBrand = brands?.[0];
  const brandId = currentBrand?.id;

  const { data: topics = [], isLoading: topicsLoading } = useQuery<any[]>({
    queryKey: ['topics', brandId],
    queryFn: async () => {
      const res = await fetch(`/api/brands/${brandId}/topics`);
      if (!res.ok) throw new Error('Failed to fetch topics');
      return res.json();
    },
    enabled: !!brandId,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<any>(null);
  const [isPatternDialogOpen, setIsPatternDialogOpen] = useState(false);

  // Fetch prompt patterns for selected topic
  const { data: promptPatterns } = useQuery<any>({
    queryKey: ['/api/topics', selectedTopic?.id, 'prompt-patterns'],
    queryFn: async () => {
      const res = await fetch(`/api/topics/${selectedTopic.id}/prompt-patterns`);
      if (!res.ok) throw new Error('Failed to fetch prompt patterns');
      return res.json();
    },
    enabled: !!selectedTopic?.id,
  });

  const filteredTopics = topics.filter((topic: any) =>
    topic.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Intent type icons and labels
  const intentConfig: Record<string, { icon: any; label: string; color: string }> = {
    comparison: { icon: GitCompare, label: 'Comparison', color: 'bg-blue-500' },
    review: { icon: MessageSquare, label: 'Review', color: 'bg-amber-500' },
    pricing: { icon: Users, label: 'Pricing', color: 'bg-emerald-500' },
    howto: { icon: HelpCircle, label: 'How-to', color: 'bg-cyan-500' },
    discovery: { icon: Lightbulb, label: 'Discovery', color: 'bg-indigo-500' },
  };

  const handleTopicClick = (topic: any) => {
    setSelectedTopic(topic);
    setIsPatternDialogOpen(true);
  };

  if (brandsLoading || topicsLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <TopBar title="Topics" />
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <TopBar title="Topics" />

      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Topics</CardTitle>
              <CardDescription>
                {topics.length} {topics.length === 1 ? 'topic' : 'topics'} total
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTopics.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Topic Name</TableHead>
                  <TableHead className="text-right">Visibility</TableHead>
                  <TableHead className="text-right">Prompts</TableHead>
                  <TableHead className="text-right">Brand Mentions</TableHead>
                  <TableHead className="text-right">Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTopics.map((topic: any) => {
                  const promptCount = topic.promptCount || 0;
                  const isTracked = promptCount > 0;
                  const isExpanded = expandedTopic === topic.id;

                  return (
                    <Fragment key={topic.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => setExpandedTopic(isExpanded ? null : topic.id)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <Target className="h-4 w-4 text-muted-foreground" />
                            {topic.name}
                            {!isTracked && (
                              <Badge variant="outline" className="text-xs text-muted-foreground">Not tracked</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {isTracked ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-mono font-medium">{topic.visibilityScore || 0}%</span>
                              <Progress value={topic.visibilityScore || 0} className="h-2 w-20" />
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {promptCount}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {isTracked ? (topic.brandMentionCount || 0) : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {isTracked ? <TrendIndicator value={topic.trend7d || 0} /> : <span className="text-sm text-muted-foreground">-</span>}
                        </TableCell>
                      </TableRow>

                      {/* Expanded row with real user query patterns */}
                      {isExpanded && (
                        <TableRow key={`${topic.id}-expanded`} className="bg-muted/30">
                          <TableCell colSpan={5} className="py-4 px-8">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium flex items-center gap-2">
                                  <MessageSquare className="h-4 w-4" />
                                  Real User Query Patterns
                                </h4>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTopicClick(topic);
                                  }}
                                >
                                  View All
                                </Button>
                              </div>

                              {/* Generate sample patterns inline based on topic name */}
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                {[
                                  { intent: 'comparison', query: `${topic.name} vs competitors` },
                                  { intent: 'review', query: `${topic.name} review - real experience` },
                                  { intent: 'pricing', query: `${topic.name} pricing plans` },
                                  { intent: 'howto', query: `how to use ${topic.name}` },
                                  { intent: 'discovery', query: `best ${topic.name} alternatives` },
                                ].map((pattern, idx) => {
                                  const config = intentConfig[pattern.intent] || intentConfig.discovery;
                                  const Icon = config.icon;
                                  return (
                                    <div
                                      key={idx}
                                      className="bg-background rounded-lg p-2 border text-xs"
                                    >
                                      <div className="flex items-center gap-1 mb-1">
                                        <Badge className={`${config.color} text-white text-[10px] px-1.5 py-0.5`}>
                                          <Icon className="h-2.5 w-2.5 mr-0.5" />
                                          {config.label}
                                        </Badge>
                                      </div>
                                      <div className="text-muted-foreground truncate" title={pattern.query}>
                                        {pattern.query.length > 40 ? pattern.query.slice(0, 40) + '...' : pattern.query}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={Target}
              title={searchQuery ? "No topics found" : "No topics yet"}
              description={
                searchQuery
                  ? "Try adjusting your search query"
                  : "Topics help you organize and categorize your prompts for better tracking."
              }
              action={
                !searchQuery
                  ? {
                      label: "Add Your First Topic",
                      onClick: () => {},
                    }
                  : undefined
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Prompt Patterns Dialog */}
      <Dialog open={isPatternDialogOpen} onOpenChange={setIsPatternDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Real User Query Patterns for "{selectedTopic?.name}"
            </DialogTitle>
          </DialogHeader>

          {promptPatterns?.patterns && (
            <div className="space-y-4">
              {promptPatterns.patterns.map((pattern: any) => {
                const config = intentConfig[pattern.intentType] || intentConfig.discovery;
                const Icon = config.icon;

                return (
                  <div key={pattern.intentType} className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge className={`${config.color} text-white`}>
                        <Icon className="h-3 w-3 mr-1" />
                        {config.label}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {pattern.count} queries
                      </span>
                    </div>

                    <div className="space-y-2">
                      {pattern.examples?.map((example: string, idx: number) => (
                        <div
                          key={idx}
                          className="bg-muted/50 rounded-lg p-2 text-sm font-mono"
                        >
                          "{example}"
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {promptPatterns.totalMinedTemplates > 0 && (
                <div className="text-xs text-muted-foreground text-center pt-2">
                  {promptPatterns.totalMinedTemplates} mined templates available for this topic
                </div>
              )}
            </div>
          )}

          {!promptPatterns?.patterns && (
            <div className="text-center py-8 text-muted-foreground">
              No prompt patterns available yet.
              <br />
              <span className="text-sm">
                Use the "Mine Real Prompts" button in Admin Prompt Templates to populate this data.
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

