import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, MessageSquare } from "lucide-react";
import * as api from "@/lib/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { promptSchema, type PromptFormData } from "@/lib/validation";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

interface AddPromptDialogProps {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const CATEGORIES = [
  { value: "product", label: "Product" },
  { value: "comparison", label: "Comparison" },
  { value: "how-to", label: "How-To" },
  { value: "pricing", label: "Pricing" },
  { value: "features", label: "Features" },
  { value: "alternatives", label: "Alternatives" },
  { value: "reviews", label: "Reviews" },
  { value: "other", label: "Other" },
];

export function AddPromptDialog({ brandId, open, onOpenChange, onSuccess }: AddPromptDialogProps) {
  const { toast } = useToast();
  const [topics, setTopics] = useState<any[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);

  const form = useForm<PromptFormData>({
    resolver: zodResolver(promptSchema),
    defaultValues: {
      text: "",
      category: "other",
      topicId: "",
      isActive: true,
    },
  });

  // Fetch topics when dialog opens
  useEffect(() => {
    if (open && brandId) {
      setLoadingTopics(true);
      api.getTopics(brandId)
        .then((data) => setTopics(data || []))
        .catch((error) => console.error("Failed to fetch topics:", error))
        .finally(() => setLoadingTopics(false));
    }
  }, [open, brandId]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset();
    }
  }, [open, form]);

  const onSubmit = async (data: PromptFormData) => {
    try {
      await api.createPrompt(brandId, {
        text: data.text.trim(),
        category: data.category,
        topicId: data.topicId && data.topicId !== "none" ? data.topicId : null,
        isActive: data.isActive,
      });

      toast({
        title: "Prompt Created",
        description: "Your prompt has been created successfully",
      });

      // Close dialog and trigger refresh
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create prompt",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Add New Prompt
          </DialogTitle>
          <DialogDescription>
            Create a new prompt to monitor your brand's visibility across AI search engines.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prompt Text *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g., What are the best AI visibility tracking tools?"
                      rows={4}
                      className="resize-none"
                      data-testid="input-prompt-text"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Enter the question or query you want to monitor across LLM providers.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-category">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="topicId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Topic (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={loadingTopics}>
                      <FormControl>
                        <SelectTrigger data-testid="select-topic">
                          <SelectValue placeholder={loadingTopics ? "Loading..." : "Select topic"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {topics.map((topic) => (
                          <SelectItem key={topic.id} value={topic.id}>
                            {topic.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Active Status</FormLabel>
                  <div className="flex items-center space-x-2 h-10 px-3 border rounded-md">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-is-active"
                      />
                    </FormControl>
                    <Label className="cursor-pointer">
                      {field.value ? "Active" : "Inactive"}
                    </Label>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={form.formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting} data-testid="btn-create-prompt">
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Create Prompt
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

