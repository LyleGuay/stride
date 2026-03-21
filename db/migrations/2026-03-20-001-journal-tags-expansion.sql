-- Add new emotion tags and condition tags to the journal_tag enum.
-- Emotions: well_rested, hopeful, proud, confused, tired, stressed, annoyed, lonely, sick
-- Conditions: stomach_ache, nausea, brain_fog, fatigue

ALTER TYPE journal_tag ADD VALUE IF NOT EXISTS 'well_rested';
ALTER TYPE journal_tag ADD VALUE IF NOT EXISTS 'hopeful';
ALTER TYPE journal_tag ADD VALUE IF NOT EXISTS 'proud';
ALTER TYPE journal_tag ADD VALUE IF NOT EXISTS 'confused';
ALTER TYPE journal_tag ADD VALUE IF NOT EXISTS 'tired';
ALTER TYPE journal_tag ADD VALUE IF NOT EXISTS 'stressed';
ALTER TYPE journal_tag ADD VALUE IF NOT EXISTS 'annoyed';
ALTER TYPE journal_tag ADD VALUE IF NOT EXISTS 'lonely';
ALTER TYPE journal_tag ADD VALUE IF NOT EXISTS 'sick';
ALTER TYPE journal_tag ADD VALUE IF NOT EXISTS 'stomach_ache';
ALTER TYPE journal_tag ADD VALUE IF NOT EXISTS 'nausea';
ALTER TYPE journal_tag ADD VALUE IF NOT EXISTS 'brain_fog';
ALTER TYPE journal_tag ADD VALUE IF NOT EXISTS 'fatigue';
