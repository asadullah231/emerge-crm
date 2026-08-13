# ADR-0007: Domain events via transactional outbox + BullMQ consumers

- Status: Accepted
- Date: 2026-08-13

## Decision

Every meaningful domain mutation (record created, stage changed, email received, ...)
writes an event row in the same transaction (outbox). A worker relays events to BullMQ;
consumers include: activity timeline, notifications, stage automations, sequences,
webhooks, analytics counters.

## Context

Timeline, notifications, automation, and webhooks all need the same stream of facts.
Building each on ad-hoc hooks creates drift and missed events (an OpenCATS weakness:
history is scattered and inconsistent).

## Alternatives considered

- Direct in-process emits: lost events on crash; no replay.
- Kafka/NATS: operationally heavy for self-hosters; Postgres outbox is enough.
- DB triggers: logic hidden from the codebase; hard to test.

## Reason

Exactly-once-ish delivery with replay, zero extra infrastructure, one mental model:
"everything is an event, features are consumers."

## Consequences

Event schema discipline needed from M6 onward (typed event catalog in packages/core);
outbox table needs pruning/archival policy.
