-- Prompt Vault Schema
-- Run with: dolt sql < schema/schema.sql
--
-- Design principles:
-- - Every entity has version tracking via version counters plus changelog audit entries
-- - Status lifecycle: draft → active → deprecated → archived
-- - Executions/feedback enable the quality feedback loop
-- - Collections provide logical grouping without hierarchy
--
-- Schema Version: 9
-- Changelog:
--   v9: Add optional execution output capture with explicit privacy mode
--   v8: Enforce one feedback row per execution via schema-level uniqueness
--   v7: Add owner_company + visibility_companies governance boundary for prompts and skills
--   v6: Remove free-form tags from prompts and skills; keep only facets + controlled_vocabulary
--   v5: Add controlled_vocabulary JSON for governed retrieval/orchestration metadata
--   v4: Add export_to_pi publishing flag for selective pi prompt export
--   v3: Hard-cut prompt ontology facets (artifact_kind, control_mode, formalization_level)
--   v2: Add loop template type for phase-gated iteration patterns
--   v1: Initial schema with schema_version table
--   v0: Pre-versioning (no schema_version table)

-- Schema version tracking for migrations
-- Each row represents a migration applied
CREATE TABLE IF NOT EXISTS schema_version (
    id INT AUTO_INCREMENT PRIMARY KEY,
    version INT NOT NULL,                     -- schema version number
    description VARCHAR(255),                 -- what changed
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_version (version)
);

-- Insert initial version if not exists
INSERT IGNORE INTO schema_version (version, description) VALUES (9, 'Add optional execution output capture with explicit privacy mode');

-- Core entity: reusable prompt templates
-- Variables use pi syntax: $1, $2, $@, ${@:N}, ${@:N:M} (N and M must be positive integers)
-- Prompt ontology is modeled as orthogonal facets, not a single overloaded type axis.
CREATE TABLE IF NOT EXISTS prompt_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL UNIQUE,         -- kebab-case identifier
    description VARCHAR(1024),                -- shown in listings
    content TEXT NOT NULL,                    -- the actual prompt
    artifact_kind ENUM('cognitive', 'procedure', 'session') NOT NULL DEFAULT 'procedure',
    control_mode ENUM('one_shot', 'router', 'loop') NOT NULL DEFAULT 'one_shot',
    formalization_level ENUM('napkin', 'bounded', 'structured', 'workflow') NOT NULL DEFAULT 'structured',
    owner_company ENUM('core', 'software', 'finance', 'house', 'health', 'teaching', 'holding') NOT NULL DEFAULT 'core',
    visibility_companies JSON NOT NULL,       -- governed query visibility boundary
    variables JSON,                           -- extracted ["$1", "$@"]
    controlled_vocabulary JSON,               -- governed retrieval/orchestration metadata
    version INT DEFAULT 1,                    -- increments on edit
    parent_id INT,                            -- reserved for future immutable row-chain versioning
    status ENUM('draft', 'active', 'deprecated', 'archived') DEFAULT 'draft',
    export_to_pi BOOLEAN NOT NULL DEFAULT FALSE, -- explicit pi publishing switch
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_status (status),
    INDEX idx_export_to_pi (export_to_pi),
    INDEX idx_owner_company (owner_company),
    INDEX idx_artifact_kind (artifact_kind),
    INDEX idx_control_mode (control_mode),
    INDEX idx_formalization_level (formalization_level)
);

-- Complex multi-file capabilities (Agent Skills spec)
-- Assets stored separately in skill_assets table
CREATE TABLE IF NOT EXISTS skills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL UNIQUE,         -- must match Agent Skills spec
    description VARCHAR(1024) NOT NULL,       -- max 1024 chars per spec
    readme TEXT NOT NULL,                     -- full SKILL.md content
    compatibility VARCHAR(500),               -- environment requirements
    license VARCHAR(100),
    metadata JSON,
    owner_company ENUM('core', 'software', 'finance', 'house', 'health', 'teaching', 'holding') NOT NULL DEFAULT 'core',
    visibility_companies JSON NOT NULL,
    version INT DEFAULT 1,
    parent_id INT,                            -- reserved for future immutable row-chain versioning
    status ENUM('draft', 'active', 'deprecated', 'archived') DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_status (status)
);

-- Supporting files for skills (scripts, references, assets)
-- Binary files base64-encoded in binary_content
CREATE TABLE IF NOT EXISTS skill_assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    skill_id INT NOT NULL,
    path VARCHAR(255) NOT NULL,               -- relative: scripts/foo.sh
    content LONGTEXT,                         -- text content
    binary_content BLOB,                      -- for images, binaries
    is_binary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
    UNIQUE KEY unique_skill_path (skill_id, path)
);

-- Execution tracking: every template/skill invocation
-- This is the "measure" in the feedback loop
CREATE TABLE IF NOT EXISTS executions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entity_type ENUM('template', 'skill') NOT NULL,
    entity_id INT NOT NULL,
    entity_version INT,                       -- which version was used
    input_args TEXT,                          -- JSON: ["arg1", "arg2"]
    input_context TEXT,                       -- truncated context snapshot
    output_tokens INT,
    input_tokens INT,
    latency_ms INT,                           -- wall-clock time
    model VARCHAR(100),                       -- claude-3-sonnet, gpt-4, etc
    output_capture_mode ENUM('none', 'private', 'public') NOT NULL DEFAULT 'none',
    output_text LONGTEXT,                     -- optional captured execution output when policy allows
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_created (created_at)
);

-- Human judgment: the "learn" in the feedback loop
-- High ratings → keep. Low ratings → iterate.
CREATE TABLE IF NOT EXISTS feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    execution_id INT NOT NULL,
    rating TINYINT,                           -- 1-5 stars
    notes TEXT,                               -- freeform explanation
    issues JSON,                              -- ["hallucination", "too-verbose"]
    would_use_again BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE,
    UNIQUE KEY unique_feedback_execution (execution_id),
    INDEX idx_rating (rating)
);

-- Audit trail: who changed what when
-- Redundant with Dolt history but queryable without dolt CLI
CREATE TABLE IF NOT EXISTS changelog (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entity_type ENUM('template', 'skill') NOT NULL,
    entity_id INT NOT NULL,
    old_version INT,
    new_version INT,
    change_type ENUM('create', 'update', 'deprecate', 'archive', 'reactivate') NOT NULL,
    summary VARCHAR(255),
    dolt_commit_hash CHAR(32),                -- link to Dolt commit
    author VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entity (entity_type, entity_id)
);

-- Logical grouping without hierarchy
-- Example: "security-prompts" collection with related templates
CREATE TABLE IF NOT EXISTS collections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    template_ids JSON,                        -- [1, 5, 12]
    skill_ids JSON,                           -- [2, 7]
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
