BEGIN;

CREATE TABLE IF NOT EXISTS course_modules (
  module_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  module_title TEXT NOT NULL,
  module_description TEXT,
  order_index INTEGER NOT NULL DEFAULT 1,
  estimated_duration_min INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS module_id TEXT REFERENCES course_modules(module_id) ON DELETE SET NULL;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS estimated_duration_min INTEGER;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS learning_objectives JSONB;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS content_versions (
  content_version_id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(lesson_id) ON DELETE CASCADE,
  version_label TEXT NOT NULL DEFAULT 'v1',
  version_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'published',
  source_type TEXT NOT NULL DEFAULT 'legacy',
  source_url TEXT,
  source_filename TEXT,
  semantic_extraction_status TEXT NOT NULL DEFAULT 'not_started',
  metadata_json JSONB,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lesson_activities (
  activity_id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(lesson_id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 1,
  estimated_duration_min INTEGER,
  tracking_enabled BOOLEAN NOT NULL DEFAULT true,
  tracking_mode TEXT NOT NULL DEFAULT 'gaze',
  content_version_id TEXT REFERENCES content_versions(content_version_id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  metadata_json JSONB
);

CREATE TABLE IF NOT EXISTS content_stimuli (
  stimulus_id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES lesson_activities(activity_id) ON DELETE CASCADE,
  content_version_id TEXT REFERENCES content_versions(content_version_id) ON DELETE SET NULL,
  stimulus_type TEXT NOT NULL,
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 1,
  visual_url TEXT,
  width INTEGER,
  height INTEGER,
  notes TEXT,
  tracking_enabled BOOLEAN NOT NULL DEFAULT true,
  metadata_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stimulus_elements (
  element_id TEXT PRIMARY KEY,
  stimulus_id TEXT NOT NULL REFERENCES content_stimuli(stimulus_id) ON DELETE CASCADE,
  element_type TEXT NOT NULL,
  text_content TEXT,
  x_normalized DOUBLE PRECISION,
  y_normalized DOUBLE PRECISION,
  width_normalized DOUBLE PRECISION,
  height_normalized DOUBLE PRECISION,
  reading_order INTEGER,
  semantic_label TEXT,
  source_element_id TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_imports (
  import_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  lesson_id TEXT REFERENCES lessons(lesson_id) ON DELETE SET NULL,
  uploaded_by TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  source_filename TEXT NOT NULL,
  source_mime_type TEXT,
  source_size_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  adapter_key TEXT,
  error_message TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS course_id TEXT REFERENCES courses(course_id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS module_id TEXT REFERENCES course_modules(module_id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS activity_id TEXT REFERENCES lesson_activities(activity_id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS content_version_id TEXT REFERENCES content_versions(content_version_id) ON DELETE SET NULL;

ALTER TABLE aoi_definitions ADD COLUMN IF NOT EXISTS content_version_id TEXT REFERENCES content_versions(content_version_id) ON DELETE SET NULL;
ALTER TABLE aoi_definitions ADD COLUMN IF NOT EXISTS stimulus_id TEXT REFERENCES content_stimuli(stimulus_id) ON DELETE SET NULL;
ALTER TABLE aoi_definitions ADD COLUMN IF NOT EXISTS semantic_type TEXT;
ALTER TABLE aoi_definitions ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE aoi_definitions ADD COLUMN IF NOT EXISTS x_normalized DOUBLE PRECISION;
ALTER TABLE aoi_definitions ADD COLUMN IF NOT EXISTS y_normalized DOUBLE PRECISION;
ALTER TABLE aoi_definitions ADD COLUMN IF NOT EXISTS width_normalized DOUBLE PRECISION;
ALTER TABLE aoi_definitions ADD COLUMN IF NOT EXISTS height_normalized DOUBLE PRECISION;
ALTER TABLE aoi_definitions ADD COLUMN IF NOT EXISTS order_index INTEGER;

ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS course_id TEXT REFERENCES courses(course_id) ON DELETE SET NULL;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS module_id TEXT REFERENCES course_modules(module_id) ON DELETE SET NULL;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS activity_id TEXT REFERENCES lesson_activities(activity_id) ON DELETE SET NULL;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS content_version_id TEXT REFERENCES content_versions(content_version_id) ON DELETE SET NULL;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS stimulus_id TEXT REFERENCES content_stimuli(stimulus_id) ON DELETE SET NULL;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS stimulus_x_norm DOUBLE PRECISION;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS stimulus_y_norm DOUBLE PRECISION;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS stimulus_left DOUBLE PRECISION;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS stimulus_top DOUBLE PRECISION;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS stimulus_width DOUBLE PRECISION;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS stimulus_height DOUBLE PRECISION;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS tracking_quality TEXT;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS screen_x DOUBLE PRECISION;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS screen_y DOUBLE PRECISION;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS viewport_width INTEGER;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS viewport_height INTEGER;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS device_pixel_ratio DOUBLE PRECISION;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS zoom DOUBLE PRECISION;
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS fullscreen BOOLEAN;

ALTER TABLE learning_events ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE learning_events ADD COLUMN IF NOT EXISTS course_id TEXT REFERENCES courses(course_id) ON DELETE SET NULL;
ALTER TABLE learning_events ADD COLUMN IF NOT EXISTS module_id TEXT REFERENCES course_modules(module_id) ON DELETE SET NULL;
ALTER TABLE learning_events ADD COLUMN IF NOT EXISTS lesson_id TEXT REFERENCES lessons(lesson_id) ON DELETE SET NULL;
ALTER TABLE learning_events ADD COLUMN IF NOT EXISTS activity_id TEXT REFERENCES lesson_activities(activity_id) ON DELETE SET NULL;
ALTER TABLE learning_events ADD COLUMN IF NOT EXISTS content_version_id TEXT REFERENCES content_versions(content_version_id) ON DELETE SET NULL;
ALTER TABLE learning_events ADD COLUMN IF NOT EXISTS stimulus_id TEXT REFERENCES content_stimuli(stimulus_id) ON DELETE SET NULL;
ALTER TABLE learning_events ADD COLUMN IF NOT EXISTS client_timestamp_ms BIGINT;
ALTER TABLE learning_events ADD COLUMN IF NOT EXISTS server_timestamp TIMESTAMPTZ DEFAULT now();
ALTER TABLE learning_events ADD COLUMN IF NOT EXISTS sequence_number INTEGER;
ALTER TABLE learning_events ADD COLUMN IF NOT EXISTS metadata_json JSONB;

CREATE TABLE IF NOT EXISTS aoi_visits (
  visit_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  aoi_id TEXT REFERENCES aoi_definitions(aoi_id) ON DELETE SET NULL,
  course_id TEXT REFERENCES courses(course_id) ON DELETE SET NULL,
  module_id TEXT REFERENCES course_modules(module_id) ON DELETE SET NULL,
  lesson_id TEXT REFERENCES lessons(lesson_id) ON DELETE SET NULL,
  activity_id TEXT REFERENCES lesson_activities(activity_id) ON DELETE SET NULL,
  content_version_id TEXT REFERENCES content_versions(content_version_id) ON DELETE SET NULL,
  stimulus_id TEXT REFERENCES content_stimuli(stimulus_id) ON DELETE SET NULL,
  started_at_ms BIGINT NOT NULL,
  ended_at_ms BIGINT NOT NULL,
  dwell_time_ms BIGINT NOT NULL,
  fixation_count INTEGER NOT NULL DEFAULT 0,
  metadata_json JSONB,
  calculated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aoi_transitions (
  transition_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  from_aoi_id TEXT REFERENCES aoi_definitions(aoi_id) ON DELETE SET NULL,
  to_aoi_id TEXT REFERENCES aoi_definitions(aoi_id) ON DELETE SET NULL,
  course_id TEXT REFERENCES courses(course_id) ON DELETE SET NULL,
  module_id TEXT REFERENCES course_modules(module_id) ON DELETE SET NULL,
  lesson_id TEXT REFERENCES lessons(lesson_id) ON DELETE SET NULL,
  activity_id TEXT REFERENCES lesson_activities(activity_id) ON DELETE SET NULL,
  content_version_id TEXT REFERENCES content_versions(content_version_id) ON DELETE SET NULL,
  stimulus_id TEXT REFERENCES content_stimuli(stimulus_id) ON DELETE SET NULL,
  occurred_at_ms BIGINT NOT NULL,
  transition_order INTEGER,
  metadata_json JSONB,
  calculated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO course_modules (module_id, course_id, module_title, module_description, order_index, estimated_duration_min)
SELECT 'MOD_' || course_id || '_DEFAULT', course_id, 'Nội dung chính', course_description, 1, NULL
FROM courses
ON CONFLICT (module_id) DO NOTHING;

UPDATE lessons
SET module_id = 'MOD_' || course_id || '_DEFAULT',
    estimated_duration_min = COALESCE(estimated_duration_min, 20),
    published_at = COALESCE(published_at, created_at, now()),
    updated_at = COALESCE(updated_at, now())
WHERE course_id IS NOT NULL
  AND module_id IS NULL;

INSERT INTO content_versions (
  content_version_id,
  lesson_id,
  version_label,
  version_number,
  status,
  source_type,
  semantic_extraction_status,
  published_at,
  metadata_json
)
SELECT
  'CV_' || lesson_id || '_v1',
  lesson_id,
  'v1',
  1,
  'published',
  CASE WHEN lesson_id = 'L002' THEN 'pdf' ELSE 'legacy_slide_deck' END,
  CASE WHEN lesson_id = 'L002' THEN 'pending' ELSE 'manual' END,
  COALESCE(published_at, created_at, now()),
  jsonb_build_object('legacy_lesson_id', lesson_id)
FROM lessons
ON CONFLICT (content_version_id) DO NOTHING;

INSERT INTO lesson_activities (
  activity_id,
  lesson_id,
  activity_type,
  title,
  description,
  order_index,
  estimated_duration_min,
  tracking_enabled,
  tracking_mode,
  content_version_id,
  published_at,
  metadata_json
)
SELECT
  'ACT_' || lesson_id || '_slide_deck',
  lesson_id,
  'SLIDE_DECK',
  lesson_title,
  lesson_description,
  1,
  COALESCE(estimated_duration_min, 20),
  true,
  'gaze_slide',
  'CV_' || lesson_id || '_v1',
  COALESCE(published_at, created_at, now()),
  jsonb_build_object('legacy_adapter', true)
FROM lessons
ON CONFLICT (activity_id) DO NOTHING;

INSERT INTO content_stimuli (
  stimulus_id,
  activity_id,
  content_version_id,
  stimulus_type,
  title,
  order_index,
  visual_url,
  width,
  height,
  tracking_enabled,
  metadata_json
)
SELECT
  'STIM_L001_' || gs::text,
  'ACT_L001_slide_deck',
  'CV_L001_v1',
  'slide',
  'Slide ' || gs::text,
  gs,
  NULL,
  1920,
  1080,
  true,
  jsonb_build_object('slide_id', 'l001-' || gs::text)
FROM generate_series(1, 8) AS gs
WHERE EXISTS (SELECT 1 FROM lessons WHERE lesson_id = 'L001')
ON CONFLICT (stimulus_id) DO NOTHING;

INSERT INTO content_stimuli (
  stimulus_id,
  activity_id,
  content_version_id,
  stimulus_type,
  title,
  order_index,
  visual_url,
  width,
  height,
  tracking_enabled,
  metadata_json
)
SELECT
  'STIM_L002_' || lpad(gs::text, 2, '0'),
  'ACT_L002_slide_deck',
  'CV_L002_v1',
  'pdf_page',
  'Trang ' || gs::text,
  gs,
  '/lesson-assets/mlops-data/slide-' || lpad(gs::text, 2, '0') || '.png',
  1600,
  1200,
  true,
  jsonb_build_object('source_page', gs)
FROM generate_series(1, 54) AS gs
WHERE EXISTS (SELECT 1 FROM lessons WHERE lesson_id = 'L002')
ON CONFLICT (stimulus_id) DO NOTHING;

UPDATE sessions s
SET course_id = COALESCE(s.course_id, l.course_id),
    module_id = COALESCE(s.module_id, l.module_id),
    activity_id = COALESCE(s.activity_id, 'ACT_' || s.lesson_id || '_slide_deck'),
    content_version_id = COALESCE(s.content_version_id, 'CV_' || s.lesson_id || '_v1')
FROM lessons l
WHERE s.lesson_id = l.lesson_id;

COMMIT;
