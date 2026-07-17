-- Migration 034: Add intent, difficulty, source, weight to prompts (Tier S1)
-- These columns enable intent-aware visibility scoring and "Score by Intent" Dashboard widget.

ALTER TABLE prompts
ADD COLUMN IF NOT EXISTS intent TEXT DEFAULT 'discovery',  -- discovery|comparison|review|pricing|howto|buying|problem|local|negative|migrate
ADD COLUMN IF NOT EXISTS difficulty INTEGER DEFAULT 3,    -- 1-5 (higher = harder to rank for)
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'llm_generation', -- onboarding|llm_generation|manual|mined_promoted|retrieval_test|disambiguation_test
ADD COLUMN IF NOT EXISTS weight REAL DEFAULT 1.0;        -- admin-tuned multiplier

-- Composite index for "Score by Intent" widget queries
CREATE INDEX IF NOT EXISTS prompts_brand_intent_idx ON prompts(brand_id, intent);

-- Backfill: classify intent from existing prompt text. Use a lightweight regex similar to
-- the in-app classifier. We backfill both intent and weight in one UPDATE per row.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, text FROM prompts WHERE intent IS NULL OR intent = 'discovery'
  LOOP
    UPDATE prompts
    SET
      intent = CASE
        WHEN r.text ~* '\m(buy|sign up|subscribe|pricing|cost|price|cheap|free trial|best deal)\m' THEN 'buying'
        WHEN r.text ~* '\m(vs\.?|versus|alternative|competitor|compared to|or)\m' AND r.text ~* '\m(best|top|recommend)\m' THEN 'comparison'
        WHEN r.text ~* '\m(migrate|switch|replace|instead of|abandon|leaving)\m' THEN 'migrate'
        WHEN r.text ~* '\m(review|opinion|experience|worth it|thoughts|feedback)\m' THEN 'review'
        WHEN r.text ~* '\m(price|cost|cheap|expensive|affordable|subscription|pricing|how much)\m' THEN 'pricing'
        WHEN r.text ~* '\m(how to|tutorial|guide|setup|step.?by.?step|learn|course)\m' THEN 'howto'
        WHEN r.text ~* '\m(problem|issue|broken|error|fix|crash|bug|not working|help)\m' THEN 'problem'
        WHEN r.text ~* '\m(near me|in \w+|local|nearby|city|region|country)\m' THEN 'local'
        WHEN r.text ~* '\m(bad|worst|terrible|avoid|hate|sucks|complaint)\m' THEN 'negative'
        ELSE 'discovery'
      END,
      weight = CASE
        WHEN r.text ~* '\m(buy|sign up|subscribe)\m' THEN 1.5
        WHEN r.text ~* '\m(vs\.?|versus|alternative|competitor)\m' THEN 1.5
        WHEN r.text ~* '\m(migrate|switch|replace)\m' THEN 1.5
        WHEN r.text ~* '\m(price|cost|pricing)\m' THEN 0.9
        WHEN r.text ~* '\m(review|opinion)\m' THEN 0.8
        WHEN r.text ~* '\m(how to|tutorial|guide)\m' THEN 0.6
        WHEN r.text ~* '\m(near me|in \w+|local)\m' THEN 1.3
        WHEN r.text ~* '\m(bad|worst|terrible|avoid)\m' THEN 1.0
        ELSE 0.7
      END
    WHERE id = r.id;
  END LOOP;
END $$;

-- Comments for documentation
COMMENT ON COLUMN prompts.intent IS 'Classified user intent: discovery|comparison|review|pricing|howto|buying|problem|local|negative|migrate';
COMMENT ON COLUMN prompts.difficulty IS '1-5: how hard it is to rank for this prompt. Higher = more competitive. Default 3.';
COMMENT ON COLUMN prompts.source IS 'Origin: onboarding|llm_generation|manual|mined_promoted|retrieval_test|disambiguation_test';
COMMENT ON COLUMN prompts.weight IS 'Admin-tuned weight multiplier for intent-weighted visibility scoring. Default 1.0.';
