# Milestone 19 - v1.0 Production Release

- Version on completion: **v1.0.0**
- Status: Not started
- Complexity: **M**

## Objective

Ship v1.0: final QA across the whole surface, polished onboarding, complete docs, demo
environment, and the public release with migration and launch assets.

## User value

A stranger can discover the project, understand it, self-host it, onboard their agency,
and run their desk: without talking to us.

## Features included

- Full-surface regression QA against every milestone's acceptance criteria (the
  criteria in these docs ARE the test plan); bug-fix-only mode (`release/v1.0.0`)
- First-run onboarding: guided setup (workspace basics -> invite team -> pipeline check
  -> import or sample data -> connect email/calendar optional); seedable demo dataset;
  empty states across the app reviewed with helpful actions
- Docs completeness: self-host guide (compose, env matrix, upgrade, backup), user guide
  per feature area, API docs, OpenCATS + Zoho migration guides, contributing guide,
  security policy, license + trademark notes
- Release engineering: `v1.0.0` images published (versioned + latest), signed
  checksums, changelog (aggregated from milestone releases), GitHub release with
  upgrade notes; demo instance with reset-hourly sample data
- Launch assets (repo-side only): README with screenshots/GIFs, comparison page
  (vs OpenCATS, vs Zoho Recruit: factual), roadmap-beyond-1.0 published
- Support surfaces: issue templates triage flow, discussions enabled, security contact

## Database changes

None (freeze except release-blocking fixes).

## Backend/Frontend changes

Bug fixes + onboarding flow + empty states only. Feature freeze enforced.

## API changes

None; v1 API frozen per deprecation policy (M17).

## Dependencies

M18 complete; all milestone DoDs verified.

## Acceptance criteria

1. Clean-machine walkthrough: stranger-test script (install -> onboard -> first
   placement recorded) completes without documentation gaps (tested by someone who
   did not build it).
2. Zero open release-blocking bugs; all known non-blockers triaged to post-1.0
   milestones with owners.
3. All docs pages exist and match shipped behavior (docs audit checklist).
4. Demo instance live with hourly reset; README assets final.
5. Upgrade from v0.19.0 verified; fresh install verified on Linux + Windows (WSL2) +
   macOS compose environments.
6. Tag `v1.0.0`, GitHub release "v1.0 - Production Release" published.

## Testing requirements

- Full regression pass (scripted), stranger-test, docs audit, install matrix.

## Definition of Done

The standard checklist, executed against the entire product, plus the acceptance
criteria above. This milestone's DoD IS the release.

## Estimated complexity

M (coordination-heavy, code-light).

## Explicitly OUT of scope

- Any new feature. Marketing/launch distribution activities beyond repo assets.
  Post-1.0 roadmap execution (client portal, sourcing extension, WhatsApp/SMS,
  multiposting network, booking links, temp back office, custom objects).

## Issue breakdown

1. M19-01 Regression QA sweep + bug burn-down
2. M19-02 Onboarding + empty states + sample data
3. M19-03 Docs completeness + migration guides
4. M19-04 Release engineering + demo instance
5. M19-05 README/comparison/roadmap assets
6. M19-06 Install matrix + stranger test
