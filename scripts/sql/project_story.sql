\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on
\pset format unaligned

-- Usage:
--   cat scripts/sql/project_story.sql | docker exec -i supabase_db_desert-services-hub psql -U postgres -d postgres \
--     -v project_id='103' \
--     -v email_id='' \
--     -v subject='FW: DPX8 - Site Surrender Project' \
--     -v query='' \
--     -v since='' \
--     -v timeline_limit='30'

WITH input AS (
  SELECT
    NULLIF(:'project_id', '')::bigint AS project_id_input,
    NULLIF(:'email_id', '')::bigint AS email_id_input,
    NULLIF(:'subject', '')::text AS subject_input,
    NULLIF(:'query', '')::text AS query_input,
    COALESCE(NULLIF(:'timeline_limit', '')::int, 30) AS timeline_limit_input,
    NULLIF(:'since', '')::timestamptz AS since_input
),
email_anchor AS (
  SELECT
    e.id AS email_id,
    e.subject AS email_subject,
    e.project_id AS email_project_id,
    e.from_email,
    e.received_at
  FROM input i
  JOIN emails e ON e.id = i.email_id_input
),
resolved_input AS (
  SELECT
    i.project_id_input,
    i.email_id_input,
    i.timeline_limit_input,
    COALESCE(i.since_input, now() - interval '90 days') AS since_ts,
    COALESCE(i.subject_input, ea.email_subject) AS subject_hint,
    COALESCE(i.project_id_input, ea.email_project_id) AS project_id_hint,
    COALESCE(
      i.query_input,
      NULLIF(
        regexp_replace(COALESCE(i.subject_input, ea.email_subject, ''), '^\s*(re|fw|fwd):\s*', '', 'i'),
        ''
      )
    ) AS query_hint
  FROM input i
  LEFT JOIN email_anchor ea ON true
),
resolved_input_normalized AS (
  SELECT
    ri.*,
    NULLIF(regexp_replace(COALESCE(ri.query_hint, ''), '[^[:alnum:]@._]+', ' ', 'g'), '') AS query_hint_search,
    NULLIF(regexp_replace(COALESCE(ri.subject_hint, ''), '[^[:alnum:]@._]+', ' ', 'g'), '') AS subject_hint_search,
    NULLIF(lower(regexp_replace(COALESCE(ri.query_hint, ''), '[^[:alnum:]]+', '', 'g')), '') AS query_hint_compact,
    NULLIF(lower(regexp_replace(COALESCE(ri.subject_hint, ''), '[^[:alnum:]]+', '', 'g')), '') AS subject_hint_compact
  FROM resolved_input ri
),
project_candidates AS (
  SELECT
    p.id AS project_id,
    p.name,
    p.contractor,
    p.outlook_folder,
    p.updated_at,
    (
      CASE WHEN ri.project_id_hint IS NOT NULL AND p.id = ri.project_id_hint THEN 1000 ELSE 0 END
      + CASE
          WHEN COALESCE(ri.query_hint_search, '') <> '' AND (
            to_tsvector(
              'simple',
              concat_ws(
                ' ',
                COALESCE(p.name, ''),
                COALESCE(p.contractor, ''),
                COALESCE(p.outlook_folder, ''),
                COALESCE(p.project_number, '')
              )
            ) @@ plainto_tsquery('simple', ri.query_hint_search)
          ) THEN 250 ELSE 0
        END
      + CASE WHEN COALESCE(ri.subject_hint, '') <> '' AND p.name ILIKE '%' || ri.subject_hint || '%' THEN 150 ELSE 0 END
      + CASE WHEN COALESCE(ri.query_hint, '') <> '' AND p.name ILIKE '%' || ri.query_hint || '%' THEN 130 ELSE 0 END
      + CASE WHEN COALESCE(ri.query_hint, '') <> '' AND COALESCE(p.contractor, '') ILIKE '%' || ri.query_hint || '%' THEN 80 ELSE 0 END
      + CASE WHEN COALESCE(ri.query_hint, '') <> '' AND COALESCE(p.outlook_folder, '') ILIKE '%' || ri.query_hint || '%' THEN 90 ELSE 0 END
      + CASE
          WHEN COALESCE(ri.query_hint_compact, '') <> ''
            AND COALESCE(p.normalized_name, '') <> ''
            AND POSITION(COALESCE(p.normalized_name, '') IN ri.query_hint_compact) > 0
          THEN 200 ELSE 0
        END
      + CASE
          WHEN COALESCE(ri.subject_hint_compact, '') <> ''
            AND COALESCE(p.normalized_name, '') <> ''
            AND POSITION(COALESCE(p.normalized_name, '') IN ri.subject_hint_compact) > 0
          THEN 180 ELSE 0
        END
    )::int AS score
  FROM resolved_input_normalized ri
  JOIN projects p ON (
    (ri.project_id_hint IS NOT NULL AND p.id = ri.project_id_hint)
    OR (
      COALESCE(ri.query_hint_search, '') <> ''
      AND (
        to_tsvector(
          'simple',
          concat_ws(
            ' ',
            COALESCE(p.name, ''),
            COALESCE(p.contractor, ''),
            COALESCE(p.outlook_folder, ''),
            COALESCE(p.project_number, '')
          )
        ) @@ plainto_tsquery('simple', ri.query_hint_search)
        OR p.name ILIKE '%' || ri.query_hint || '%'
        OR COALESCE(p.contractor, '') ILIKE '%' || ri.query_hint || '%'
        OR COALESCE(p.outlook_folder, '') ILIKE '%' || ri.query_hint || '%'
        OR (
          COALESCE(ri.query_hint_compact, '') <> ''
          AND COALESCE(p.normalized_name, '') <> ''
          AND POSITION(COALESCE(p.normalized_name, '') IN ri.query_hint_compact) > 0
        )
      )
    )
    OR (
      COALESCE(ri.subject_hint, '') <> ''
      AND (
        p.name ILIKE '%' || ri.subject_hint || '%'
        OR COALESCE(p.outlook_folder, '') ILIKE '%' || ri.subject_hint || '%'
        OR (
          COALESCE(ri.subject_hint_compact, '') <> ''
          AND COALESCE(p.normalized_name, '') <> ''
          AND POSITION(COALESCE(p.normalized_name, '') IN ri.subject_hint_compact) > 0
        )
      )
    )
  )
),
best_project AS (
  SELECT pc.*
  FROM project_candidates pc
  ORDER BY pc.score DESC, pc.updated_at DESC
  LIMIT 1
),
anchor AS (
  SELECT
    bp.project_id,
    bp.score AS project_score,
    COALESCE(NULLIF(ri.subject_hint, ''), bp.name, NULLIF(ri.query_hint, '')) AS anchor_text,
    ri.query_hint,
    NULLIF(
      regexp_replace(
        COALESCE(NULLIF(ri.subject_hint, ''), bp.name, NULLIF(ri.query_hint, ''), ''),
        '[^[:alnum:]@._]+',
        ' ',
        'g'
      ),
      ''
    ) AS anchor_text_search,
    ri.query_hint_search,
    ri.since_ts,
    GREATEST(1, LEAST(200, ri.timeline_limit_input)) AS timeline_limit
  FROM resolved_input_normalized ri
  LEFT JOIN best_project bp ON true
),
candidate_json AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'projectId', project_id,
          'name', name,
          'contractor', contractor,
          'outlookFolder', outlook_folder,
          'score', score,
          'updatedAt', updated_at
        )
        ORDER BY score DESC, updated_at DESC
      ),
      '[]'::jsonb
    ) AS value
  FROM (
    SELECT *
    FROM project_candidates
    ORDER BY score DESC, updated_at DESC
    LIMIT 5
  ) ranked
),
project_json AS (
  SELECT
    CASE
      WHEN bp.project_id IS NULL THEN NULL::jsonb
      ELSE to_jsonb(p.*)
    END AS value
  FROM best_project bp
  LEFT JOIN projects p ON p.id = bp.project_id
),
story_rows AS (
  SELECT
    e.id,
    e.received_at,
    e.subject,
    e.from_email,
    e.from_domain,
    e.mailbox_id,
    m.email AS mailbox,
    e.project_id,
    e.has_attachments,
    e.attachment_names,
    COALESCE(NULLIF(e.internet_message_id, ''), e.message_id) AS message_key
  FROM anchor a
  JOIN emails e ON true
  JOIN mailboxes m ON m.id = e.mailbox_id
  WHERE COALESCE(e.is_excluded, 0) = 0
    AND e.received_at >= a.since_ts
    AND (
      (a.project_id IS NOT NULL AND e.project_id = a.project_id)
      OR (
        COALESCE(a.anchor_text, '') <> ''
        AND (
          e.subject ILIKE '%' || a.anchor_text || '%'
          OR (
            COALESCE(a.anchor_text_search, '') <> ''
            AND e.search_document @@ plainto_tsquery('english', a.anchor_text_search)
          )
        )
      )
      OR (
        a.project_id IS NULL
        AND COALESCE(a.query_hint_search, '') <> ''
        AND (
          e.subject ILIKE '%' || a.query_hint || '%'
          OR e.search_document @@ plainto_tsquery('english', a.query_hint_search)
        )
      )
    )
),
deduped AS (
  SELECT
    sr.*,
    ROW_NUMBER() OVER (
      PARTITION BY
        CASE
          WHEN (
            sr.from_domain = ANY (
              ARRAY[
                'buildingconnected.com',
                'planhub.com',
                'cyberhoot.com',
                'texturacorp.com',
                'worklio.com',
                'avanan-mail.net'
              ]
            )
            OR sr.from_domain ILIKE '%bidmail.com'
            OR sr.from_domain ILIKE '%procoretech.com'
          ) THEN
            COALESCE(sr.subject, '') || '|' || COALESCE(sr.from_email, '') || '|' ||
            FLOOR(EXTRACT(EPOCH FROM TIMEZONE('UTC', sr.received_at)) / 3600)::bigint::text
          ELSE COALESCE(sr.message_key, sr.id::text)
        END
      ORDER BY sr.id
    ) AS rn
  FROM story_rows sr
),
timeline AS (
  SELECT d.*
  FROM deduped d
  WHERE d.rn = 1
  ORDER BY d.received_at DESC
  LIMIT (SELECT timeline_limit FROM anchor)
),
counts AS (
  SELECT
    COUNT(*)::int AS story_rows_total,
    COUNT(*) FILTER (WHERE project_id IS NOT NULL)::int AS story_rows_with_project,
    COUNT(*) FILTER (WHERE has_attachments = 1)::int AS story_rows_with_attachments,
    MIN(received_at) AS first_seen,
    MAX(received_at) AS last_seen
  FROM story_rows
),
linkage_counts AS (
  SELECT
    COUNT(*) FILTER (WHERE sr.project_id = a.project_id)::int AS linked_to_project,
    COUNT(*) FILTER (WHERE sr.project_id IS NULL)::int AS unlinked_rows
  FROM story_rows sr
  CROSS JOIN anchor a
),
unlinked_mailboxes AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'mailbox', mailbox,
          'rows', rows,
          'firstSeen', first_seen,
          'lastSeen', last_seen
        )
        ORDER BY rows DESC, mailbox ASC
      ),
      '[]'::jsonb
    ) AS value
  FROM (
    SELECT
      sr.mailbox,
      COUNT(*)::int AS rows,
      MIN(sr.received_at) AS first_seen,
      MAX(sr.received_at) AS last_seen
    FROM story_rows sr
    WHERE sr.project_id IS NULL
    GROUP BY sr.mailbox
    ORDER BY rows DESC, sr.mailbox ASC
    LIMIT 10
  ) t
),
estimates_json AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'estimateId', est.id,
          'estimateNumber', est.estimate_number,
          'name', est.name,
          'contractor', est.contractor,
          'bidStatus', est.bid_status,
          'updatedAt', est.updated_at
        )
        ORDER BY est.updated_at DESC
      ),
      '[]'::jsonb
    ) AS value
  FROM anchor a
  LEFT JOIN project_estimates pe ON pe.project_id = a.project_id
  LEFT JOIN estimates est ON est.id = pe.estimate_id
  WHERE a.project_id IS NOT NULL
),
attachment_doc_json AS (
  SELECT
    CASE
      WHEN an.project_id IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object(
        'attachments',
        (
          SELECT jsonb_build_object(
            'total', COUNT(*)::int,
            'success', COUNT(*) FILTER (WHERE a.extraction_status = 'success')::int,
            'failed', COUNT(*) FILTER (WHERE a.extraction_status = 'failed')::int,
            'pending', COUNT(*) FILTER (WHERE a.extraction_status = 'pending')::int
          )
          FROM attachments a
          JOIN emails e ON e.id = a.email_id
          WHERE e.project_id = an.project_id
        ),
        'documents',
        (
          SELECT jsonb_build_object(
            'total', COUNT(*)::int,
            'success', COUNT(*) FILTER (WHERE d.extraction_status = 'success')::int,
            'failed', COUNT(*) FILTER (WHERE d.extraction_status = 'failed')::int,
            'pending', COUNT(*) FILTER (WHERE d.extraction_status = 'pending')::int
          )
          FROM documents d
          WHERE d.project_id = an.project_id
        )
      )
    END AS value
  FROM anchor an
),
timeline_json AS (
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'receivedAt', received_at,
          'mailbox', mailbox,
          'fromEmail', from_email,
          'subject', subject,
          'projectId', project_id,
          'hasAttachments', has_attachments,
          'attachmentNames', attachment_names
        )
        ORDER BY received_at DESC
      ),
      '[]'::jsonb
    ) AS value
  FROM timeline
),
resolution AS (
  SELECT
    jsonb_build_object(
      'resolvedProjectId', a.project_id,
      'projectMatchScore', a.project_score,
      'anchorText', a.anchor_text,
      'queryHint', a.query_hint,
      'since', a.since_ts,
      'timelineLimit', a.timeline_limit,
      'candidates', cj.value
    ) AS value
  FROM anchor a
  CROSS JOIN candidate_json cj
)
SELECT jsonb_pretty(
  jsonb_build_object(
    'inputs',
    jsonb_build_object(
      'projectId', (SELECT project_id_input FROM input),
      'emailId', (SELECT email_id_input FROM input),
      'subject', (SELECT subject_input FROM input),
      'query', (SELECT query_input FROM input),
      'since', (SELECT since_input FROM input)
    ),
    'resolution', (SELECT value FROM resolution),
    'project', (SELECT value FROM project_json),
    'counts', to_jsonb((SELECT c FROM counts c)),
    'linkage', to_jsonb((SELECT lc FROM linkage_counts lc)),
    'unlinkedByMailbox', (SELECT value FROM unlinked_mailboxes),
    'estimates', (SELECT value FROM estimates_json),
    'artifactSummary', COALESCE((SELECT value FROM attachment_doc_json), '{}'::jsonb),
    'timeline', (SELECT value FROM timeline_json)
  )
);
