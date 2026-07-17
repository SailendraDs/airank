import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Database, ExternalLink, Tag, FileText, Globe, Link as LinkIcon, CheckCircle, XCircle,
} from "lucide-react";

interface EntityFactsPanelProps {
  wikidata: {
    found: boolean;
    entity_id?: string;
    label?: string;
    description?: string;
    confidence?: string;
    sitelinks?: number;
    website?: string;
    wikipedia_url?: string;
  };
}

export function EntityFactsPanel({ wikidata }: EntityFactsPanelProps) {
  if (!wikidata.found) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-blue-600" />
            <div>
              <CardTitle>Entity Facts</CardTitle>
              <CardDescription>Wikidata knowledge graph information</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
              <Database className="w-8 h-8 text-gray-400" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">No Entity Found</h3>
              <p className="text-sm text-gray-600 mb-4">
                This brand doesn't have a Wikidata entity or wasn't found in our search.
              </p>
              <ul className="text-xs text-gray-600 space-y-1 text-left max-w-xs mx-auto">
                <li>• Create a Wikidata entity for your brand</li>
                <li>• Add structured data to your website</li>
                <li>• Ensure consistent brand information across platforms</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-blue-600" />
            <div>
              <CardTitle>Entity Facts</CardTitle>
              <CardDescription>Wikidata knowledge graph information</CardDescription>
            </div>
          </div>
          {wikidata.entity_id && (
            <a
              href={`https://www.wikidata.org/wiki/${wikidata.entity_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Badges row */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          <Badge variant="default" className="text-xs">
            <Globe className="w-3 h-3 mr-1" />
            Entity Found
          </Badge>
          {wikidata.entity_id && (
            <Badge variant="outline" className="text-xs font-mono">
              {wikidata.entity_id}
            </Badge>
          )}
          {wikidata.confidence && (
            <Badge
              variant={
                wikidata.confidence === "high"
                  ? "default"
                  : wikidata.confidence === "medium"
                  ? "secondary"
                  : "outline"
              }
              className="text-xs"
            >
              {wikidata.confidence} confidence
            </Badge>
          )}
          {wikidata.sitelinks !== undefined && (
            <Badge variant="outline" className="text-xs">
              {wikidata.sitelinks} sitelinks
            </Badge>
          )}
        </div>

        {/* Label */}
        {wikidata.label && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Tag className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Label</span>
            </div>
            <p className="text-gray-900 font-medium pl-6">{wikidata.label}</p>
          </div>
        )}

        {/* Description */}
        {wikidata.description && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Description</span>
            </div>
            <p className="text-gray-600 pl-6">{wikidata.description}</p>
          </div>
        )}

        {/* Website / Wikipedia links */}
        {(wikidata.website || wikidata.wikipedia_url) && (
          <div className="space-y-3">
            {wikidata.website && (
              <a href={wikidata.website} target="_blank" rel="noopener noreferrer" className="block">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <LinkIcon className="w-4 h-4 text-purple-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">Official Website</div>
                    <div className="text-sm text-gray-600 truncate">{wikidata.website}</div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </div>
              </a>
            )}
            {wikidata.wikipedia_url && (
              <a href={wikidata.wikipedia_url} target="_blank" rel="noopener noreferrer" className="block">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <Globe className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">Wikipedia</div>
                    <div className="text-sm text-gray-600 truncate">{wikidata.wikipedia_url}</div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </div>
              </a>
            )}
          </div>
        )}

        {/* Data Quality Grid */}
        <div className="space-y-3">
          <h4 className="font-medium text-gray-900">Data Quality</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-blue-50 rounded-lg text-center">
              <div className="text-lg font-bold text-blue-600">{wikidata.label ? "Yes" : "No"}</div>
              <div className="text-xs text-blue-600">Has Label</div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-center">
              <div className="text-lg font-bold text-green-600">
                {wikidata.description ? "Yes" : "No"}
              </div>
              <div className="text-xs text-green-600">Has Description</div>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg text-center">
              <div className="text-lg font-bold text-purple-600">
                {wikidata.wikipedia_url ? "Yes" : "No"}
              </div>
              <div className="text-xs text-purple-600">Wikipedia Page</div>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg text-center">
              <div className="text-lg font-bold text-orange-600">{wikidata.sitelinks ?? 0}</div>
              <div className="text-xs text-orange-600">Sitelinks</div>
            </div>
          </div>
        </div>

        {/* Optimization tips */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">Optimization Tips</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            {!wikidata.description && (
              <li>• Add a comprehensive description to your Wikidata entity</li>
            )}
            {!wikidata.wikipedia_url && (
              <li>• Create a Wikipedia article linked to your Wikidata entity</li>
            )}
            {(wikidata.sitelinks ?? 0) < 5 && (
              <li>• Add more structured properties (website, industry, location, etc.)</li>
            )}
            <li>• Keep information up-to-date and accurate</li>
            <li>• Add references and citations for claims</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
