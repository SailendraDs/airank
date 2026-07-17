ALTER TABLE admin_ops_tasks
ADD COLUMN IF NOT EXISTS checklist_items jsonb DEFAULT '[]'::jsonb;
