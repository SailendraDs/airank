import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Target } from "lucide-react";
import * as api from "@/lib/api";

interface AddTopicDialogProps {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const CATEGORIES = [
  { value: "product", label: "Product" },
  { value: "service", label: "Service" },
  { value: "industry", label: "Industry" },
  { value: "technology", label: "Technology" },
  { value: "market", label: "Market" },
  { value: "other", label: "Other" },
];

const IMPORTANCE_LEVELS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export function AddTopicDialog({ brandId, open, onOpenChange, onSuccess }: AddTopicDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("product");
  const [importance, setImportance] = useState("medium");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a topic name",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await api.createTopic(brandId, {
        name: name.trim(),
        category,
        importance,
      });

      toast({
        title: "Topic Created",
        description: "Your topic has been created successfully",
      });

      // Reset form
      setName("");
      setCategory("product");
      setImportance("medium");

      // Close dialog and trigger refresh
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create topic",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Add New Topic
          </DialogTitle>
          <DialogDescription>
            Create a new topic to organize your prompts and track performance by category.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="topic-name">Topic Name *</Label>
            <Input
              id="topic-name"
              placeholder="e.g., AI Tools, Marketing Software, Cloud Services"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-topic-name"
            />
            <p className="text-xs text-muted-foreground">
              Enter a descriptive name for this topic cluster.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category" data-testid="select-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="importance">Importance</Label>
              <Select value={importance} onValueChange={setImportance}>
                <SelectTrigger id="importance" data-testid="select-importance">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMPORTANCE_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} data-testid="btn-create-topic">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Target className="h-4 w-4 mr-2" />
                  Create Topic
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

