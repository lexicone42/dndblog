# Session Tracker MVP - Backlog Items

## Pending Tasks

### 1. Update entity card preview on accordion collapse
When an entity card is collapsed after editing, the card summary (name, description displayed in the header) should reflect any changes made in the expanded form. Currently the preview shows the original values until page refresh.

**Location**: `packages/site/src/pages/dm/entities.astro`
**Implementation**: In `toggleCardExpand()`, when collapsing, update the `.entity-card__name` and `.entity-card__desc` elements with current form values.

### 2. Create approve/reject endpoints for DM approval flow
Add API endpoints for DM to approve or reject player draft submissions:
- `POST /player/drafts/{slug}/approve` - Approve and publish to GitHub
- `POST /player/drafts/{slug}/reject` - Reject and optionally notify player

**Location**: `packages/infra/lib/constructs/dm-notes-api.ts`

### 3. Review and update documentation
Ensure all documentation is current with implemented features:
- Session tracker usage
- Player token setup
- DM entity editing workflow
- API endpoints

## Completed (Recent)
- ✅ Entity autosave on text field blur
- ✅ DM edit button on entity reference pages
- ✅ Player hub layout fix (nested anchor HTML)
- ✅ Entity update API URL fix
- ✅ Color accessibility WCAG AA compliance
