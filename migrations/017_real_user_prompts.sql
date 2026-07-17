-- Migration: 017 - Real User Prompt Library
-- Extends prompt_templates table to store mined real user queries
-- Features: source tracking, intent classification, prompt variations

-- Add new columns for real user prompt mining
ALTER TABLE prompt_templates
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',  -- 'reddit', 'search', 'forum', 'manual'
ADD COLUMN IF NOT EXISTS intent_type TEXT,  -- 'comparison', 'review', 'pricing', 'howto', 'discovery'
ADD COLUMN IF NOT EXISTS prompt_templates JSONB DEFAULT '[]'::jsonb,  -- Array of prompt variations
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_mined_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS mining_status TEXT DEFAULT 'idle';  -- 'idle', 'mining', 'completed', 'failed'

-- Create index for mining queries
CREATE INDEX IF NOT EXISTS idx_prompt_templates_source ON prompt_templates(source);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_intent_type ON prompt_templates(intent_type);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_mining_status ON prompt_templates(mining_status);

-- Comments for documentation
COMMENT ON COLUMN prompt_templates.source IS 'Source of the prompt: reddit, search, forum, manual';
COMMENT ON COLUMN prompt_templates.intent_type IS 'User intent type: comparison, review, pricing, howto, discovery';
COMMENT ON COLUMN prompt_templates.prompt_templates IS 'JSONB array of multiple prompt variations for A/B testing';
COMMENT ON COLUMN prompt_templates.usage_count IS 'How many times this template has been used in analysis';
COMMENT ON COLUMN prompt_templates.last_mined_at IS 'When this prompt was last mined from external sources';
COMMENT ON COLUMN prompt_templates.mining_status IS 'Mining status: idle, mining, completed, failed';