import { storage } from "../storage";
import { BUILTIN_PROMPT_TEMPLATES } from "./prompt-template-catalog";
import { clearPromptTemplateCache } from "./prompt-template-runtime";

export async function syncBuiltinPromptTemplates() {
  const existing = await storage.getPromptTemplates();
  const existingNames = new Set(existing.map((t) => t.name));

  let created = 0;
  let updated = 0;

  for (const template of BUILTIN_PROMPT_TEMPLATES) {
    if (existingNames.has(template.name)) {
      const current = existing.find((t) => t.name === template.name);
      if (current?.isDefault && current.template !== template.template) {
        await storage.updatePromptTemplate(current.id, {
          description: template.description,
          category: template.category,
          llmProvider: template.llmProvider,
          template: template.template,
          variables: template.variables || [],
          version: Number(current.version || 1) + 1,
          updatedAt: new Date(),
        } as any);
        updated += 1;
      }
      continue;
    }

    await storage.createPromptTemplate({
      name: template.name,
      description: template.description,
      category: template.category,
      llmProvider: template.llmProvider,
      template: template.template,
      variables: template.variables || [],
      version: 1,
      isActive: true,
      isDefault: true,
      abTestGroup: null,
      abTestWeight: 50,
      createdBy: null,
    } as any);

    created += 1;
  }

  if (created > 0 || updated > 0) {
    clearPromptTemplateCache();
  }

  return {
    totalBuiltin: BUILTIN_PROMPT_TEMPLATES.length,
    created,
    updated,
    skipped: BUILTIN_PROMPT_TEMPLATES.length - created - updated,
  };
}
