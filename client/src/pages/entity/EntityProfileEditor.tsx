// Entity > Entity Profile Sub-Page
// Edits the entity profile, manages people, links, and notability
// Tier A sub-page 6 of 6

import { useState } from 'react';
import { useCurrentBrand } from '@/hooks/use-brand';
import {
  useEntityProfile,
  useUpdateEntityProfile,
  useEntityPeople,
  useAddEntityPerson,
  useDeleteEntityPerson,
  useEntityLinks,
  useAddEntityLink,
  useDeleteEntityLink,
  useNotabilityAssessment,
  useQuotabilityScore,
} from '@/hooks/use-entity-index';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Award, Plus, Trash2, User, Link as LinkIcon, Sparkles, Save } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';

export default function EntityProfileEditor() {
  const { brandId, isLoading: brandLoading } = useCurrentBrand();
  const { toast } = useToast();

  const { data: profile, isLoading: p1 } = useEntityProfile(brandId);
  const updateProfile = useUpdateEntityProfile();
  const { data: people, isLoading: p2 } = useEntityPeople(brandId);
  const addPerson = useAddEntityPerson();
  const deletePerson = useDeleteEntityPerson();
  const { data: links, isLoading: p3 } = useEntityLinks(brandId);
  const addLink = useAddEntityLink();
  const deleteLink = useDeleteEntityLink();
  const { data: notability, isLoading: p4 } = useNotabilityAssessment(brandId);
  const { data: quotability, isLoading: p5 } = useQuotabilityScore(brandId);

  const [editProfile, setEditProfile] = useState<any>(null);
  const [newPerson, setNewPerson] = useState({ name: '', role: '', wikipedia: '' });
  const [newLink, setNewLink] = useState({ label: '', url: '', category: 'authority' });

  if (brandLoading) return <Skeleton className="h-96 w-full" />;
  if (!brandId) return <div className="p-8 text-center">Create a brand first.</div>;

  const currentProfile = editProfile || profile || {};

  const handleSaveProfile = async () => {
    try {
      await updateProfile.mutateAsync({ brandId, profile: editProfile });
      toast({ title: 'Profile updated' });
      setEditProfile(null);
    } catch (e: any) {
      toast({ title: 'Failed to update', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Entity Profile</h1>
          <p className="text-muted-foreground mt-1">
            The canonical description AI systems should associate with your brand.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/app/entity">← Back</Link>
        </Button>
      </div>

      {/* Profile fields */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-500" />
            <CardTitle>Brand Description</CardTitle>
          </div>
          <CardDescription>One-line description, full description, and aliases</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {p1 ? <Skeleton className="h-32" /> : (
            <>
              <div>
                <Label>Short description (1 sentence)</Label>
                <Input
                  className="mt-1"
                  value={currentProfile.shortDescription || ''}
                  onChange={(e) => setEditProfile({ ...currentProfile, shortDescription: e.target.value })}
                  placeholder="Acme Corp is a B2B SaaS for..."
                />
              </div>
              <div>
                <Label>Full description</Label>
                <Textarea
                  className="mt-1"
                  rows={4}
                  value={currentProfile.description || ''}
                  onChange={(e) => setEditProfile({ ...currentProfile, description: e.target.value })}
                  placeholder="Acme Corp was founded in..."
                />
              </div>
              <div>
                <Label>Aliases (comma-separated)</Label>
                <Input
                  className="mt-1"
                  value={currentProfile.aliases?.join(', ') || ''}
                  onChange={(e) => setEditProfile({ ...currentProfile, aliases: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                  placeholder="Acme, ACME Inc, Acme Co"
                />
              </div>
              <Button onClick={handleSaveProfile} disabled={updateProfile.isPending}>
                <Save className="w-4 h-4 mr-2" /> Save Profile
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* People */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-blue-500" />
            <CardTitle>People (E-E-A-T)</CardTitle>
          </div>
          <CardDescription>Founders, key employees, authors — give them a knowledge graph presence</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="Name"
              value={newPerson.name}
              onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
            />
            <Input
              placeholder="Role (e.g. CEO)"
              value={newPerson.role}
              onChange={(e) => setNewPerson({ ...newPerson, role: e.target.value })}
            />
            <Input
              placeholder="Wikipedia URL (optional)"
              value={newPerson.wikipedia}
              onChange={(e) => setNewPerson({ ...newPerson, wikipedia: e.target.value })}
            />
            <Button
              size="icon"
              onClick={async () => {
                if (!newPerson.name) return;
                await addPerson.mutateAsync({ brandId, person: newPerson });
                setNewPerson({ name: '', role: '', wikipedia: '' });
              }}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {p2 ? <Skeleton className="h-20" /> : (
            <div className="space-y-2">
              {people?.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <span className="font-medium">{p.name}</span>
                    {p.role && <span className="text-sm text-muted-foreground ml-2">— {p.role}</span>}
                    {p.wikipedia && (
                      <a href={p.wikipedia} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-blue-500 hover:underline">
                        Wikipedia
                      </a>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deletePerson.mutate({ brandId, personId: p.id })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Authority Links */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-purple-500" />
            <CardTitle>Authority Links</CardTitle>
          </div>
          <CardDescription>Curated external links reinforcing entity identity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="Label"
              value={newLink.label}
              onChange={(e) => setNewLink({ ...newLink, label: e.target.value })}
            />
            <Input
              placeholder="https://..."
              value={newLink.url}
              onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
            />
            <Button
              size="icon"
              onClick={async () => {
                if (!newLink.url) return;
                await addLink.mutateAsync({ brandId, link: newLink });
                setNewLink({ label: '', url: '', category: 'authority' });
              }}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {p3 ? <Skeleton className="h-20" /> : (
            <div className="space-y-2">
              {links?.map((l: any) => (
                <div key={l.id} className="flex items-center justify-between p-2 border rounded text-sm">
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                    {l.label || l.url}
                  </a>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteLink.mutate({ brandId, linkId: l.id })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notability & Quotability scores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              <CardTitle>Wikipedia Notability</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {p4 ? <Skeleton className="h-20" /> : notability ? (
              <div>
                <div className="text-3xl font-bold">{Math.round(notability.score || 0)}/100</div>
                <p className="text-sm text-muted-foreground mt-1">
                  {notability.eligible ? 'Meets notability threshold' : 'Below notability threshold'}
                </p>
              </div>
            ) : <p className="text-sm text-muted-foreground">No data yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              <CardTitle>Quotability</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {p5 ? <Skeleton className="h-20" /> : quotability ? (
              <div>
                <div className="text-3xl font-bold">{Math.round(quotability.score || 0)}/100</div>
                <p className="text-sm text-muted-foreground mt-1">
                  {quotability.recommendation}
                </p>
              </div>
            ) : <p className="text-sm text-muted-foreground">No data yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}