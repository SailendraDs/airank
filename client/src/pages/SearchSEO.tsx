import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, Search, ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function SearchConsolePage() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <TopBar title="Search Console Integration" showTimeSelector={false} />

      <Card className="glass-card border-l-4 border-l-emerald-500">
          <CardContent className="flex items-center justify-between p-6">
              <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600">
                      <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                      <h3 className="font-bold text-lg">Google Search Console Connected</h3>
                      <p className="text-sm text-muted-foreground">Last synced 2 hours ago. Tracking 1,540 queries.</p>
                  </div>
              </div>
              <Button variant="outline">Manage Connection</Button>
          </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
          <Card className="glass-card md:col-span-2">
              <CardHeader>
                  <CardTitle>Top Organic Queries</CardTitle>
                  <CardDescription>Correlated with AI prompt visibility.</CardDescription>
              </CardHeader>
              <CardContent>
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>Query</TableHead>
                              <TableHead className="text-center">Clicks</TableHead>
                              <TableHead className="text-center">Position</TableHead>
                              <TableHead className="text-center">AI Overlap</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {[
                              { q: "enterprise widget software", clicks: 1240, pos: 2.1, overlap: "High" },
                              { q: "best widget platforms", clicks: 850, pos: 3.4, overlap: "Medium" },
                              { q: "widget automation tools", clicks: 620, pos: 1.8, overlap: "High" },
                              { q: "acme corp pricing", clicks: 450, pos: 1.0, overlap: "Low" },
                          ].map((row, i) => (
                              <TableRow key={i}>
                                  <TableCell className="font-medium">{row.q}</TableCell>
                                  <TableCell className="text-center font-mono">{row.clicks}</TableCell>
                                  <TableCell className="text-center font-mono">{row.pos}</TableCell>
                                  <TableCell className="text-center">
                                      <Badge variant={row.overlap === 'High' ? 'default' : row.overlap === 'Medium' ? 'secondary' : 'outline'}>
                                          {row.overlap}
                                      </Badge>
                                  </TableCell>
                              </TableRow>
                          ))}
                      </TableBody>
                  </Table>
              </CardContent>
          </Card>

          <Card className="glass-card">
              <CardHeader>
                  <CardTitle>Diagnostics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="flex items-start gap-3 p-3 rounded bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                          <h4 className="font-semibold text-sm text-amber-900 dark:text-amber-500">Missing Sitemap</h4>
                          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                              Your sitemap hasn't been crawled in 5 days. This may affect new content indexing.
                          </p>
                      </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
                      <Search className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                          <h4 className="font-semibold text-sm text-blue-900 dark:text-blue-500">New Keywords Detected</h4>
                          <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                              +15 new ranking keywords found this week.
                          </p>
                      </div>
                  </div>
              </CardContent>
          </Card>
      </div>
    </div>
  );
}
