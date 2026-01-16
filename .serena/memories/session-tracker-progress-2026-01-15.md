# Session Tracker MVP Progress - January 15, 2026

## Completed Features

### Infrastructure (packages/infra/lib/constructs/dm-notes-api.ts)

1. **Per-Character Token Validation** (`/validate-character-token`)
   - Validates tokens stored at `/dndblog/player-token/{character-slug}`
   - Returns `{ valid: true, characterSlug: "rudiger" }` on success

2. **Player Draft Endpoints**
   - `GET /player/drafts/{slug}` - Load draft
   - `PUT /player/drafts/{slug}` - Save draft
   - `DELETE /player/drafts/{slug}` - Discard draft
   - `GET /player/drafts` (DM only) - List all pending drafts

3. **Draft Approval Endpoints** (DM only)
   - `POST /player/drafts/{slug}/approve` - Creates GitHub PR with changes
   - `POST /player/drafts/{slug}/reject` - Deletes draft from S3
   - **Requires**: `/dndblog/github-pat` SSM parameter (NOT YET CONFIGURED)

### Frontend Pages

1. **Player Hub** (`/player/index.astro`)
   - Per-character authentication (no more shared player token)
   - Highlights logged-in player's character card
   - Session Tracker button on each character

2. **Session Tracker** (`/player/session/[slug].astro`)
   - HP management with +/- buttons
   - Temp HP tracking
   - Spell slot pips (click to toggle)
   - Condition manager with D&D 5e conditions
   - Rest buttons (short/long rest)
   - Save draft to S3

### Removed

- Generic `/validate-player-token` endpoint
- `/dndblog/player-notes-token` SSM parameter

## Pending Work (Deferred)

**GitHub PAT for PR Creation** - Not configured yet. When ready:
```bash
aws ssm put-parameter \
  --name "/dndblog/github-pat" \
  --value "ghp_your_token_here" \
  --type SecureString \
  --overwrite
```
Token needs `repo` scope. Until configured, approve will error but reject works.

2. **DM Dashboard UI** - Section to view/approve pending player drafts

## API Summary

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/validate-character-token` | POST | X-Player-Token | Validate + return character slug |
| `/player/drafts/{slug}` | GET | X-Player-Token | Load draft |
| `/player/drafts/{slug}` | PUT | X-Player-Token | Save draft |
| `/player/drafts/{slug}` | DELETE | X-Player-Token | Discard draft |
| `/player/drafts` | GET | X-DM-Token | List all pending drafts |
| `/player/drafts/{slug}/approve` | POST | X-DM-Token | Approve → GitHub PR |
| `/player/drafts/{slug}/reject` | POST | X-DM-Token | Reject → delete draft |

## Key Files

- `packages/infra/lib/constructs/dm-notes-api.ts` - All Lambda functions
- `packages/site/src/pages/player/index.astro` - Player hub
- `packages/site/src/pages/player/session/[slug].astro` - Session tracker
- `packages/site/src/lib/auth.ts` - Auth utilities
- `docs/DM-NOTES-API.md` - API documentation
