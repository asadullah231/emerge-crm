# ADR-0005: Custom fields via metadata table + JSONB values, not runtime DDL

- Status: Accepted
- Date: 2026-08-13

## Decision

`field_definitions` (workspace_id, object_type, key, label, type, options, required,
position) describes custom fields. Values live in a GIN-indexed `custom_fields` JSONB
column on each supporting record. Saved Views (table/kanban + filters + sorts + visible
fields + group-by) are first-class rows, translating to JSONB operators at query time.
Core domain fields (name, email, stage, ...) remain real columns.

## Context

Zoho-class products live and die on per-agency field customization. Twenty solves this
with a full runtime metadata engine: ObjectMetadata/FieldMetadata driving runtime DDL and
runtime GraphQL schema generation. That engine is Twenty's crown jewel and its biggest
complexity tax.

## Alternatives considered

- Twenty-style runtime DDL + generated schema: 10x machinery for the last 10% of
  flexibility (custom objects). Deferred; JSONB fields cover custom _fields_ now, and the
  seam allows a custom-objects engine post-1.0 if demand shows.
- EAV tables (OpenCATS `extra_field`): query complexity explodes, poor indexing.
- No custom fields: not competitive.

## Reason

90% of the customer value at 10% of the complexity, with a clean upgrade path.

## Consequences

Custom fields are weakly typed at the DB level (validated at the API layer with Zod
generated from field definitions); reporting on custom fields uses JSONB extraction;
custom _objects_ are explicitly out of scope for v1.
