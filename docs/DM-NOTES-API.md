# DM Notes API

The DM Notes API provides a secure interface for the Dungeon Master to upload, review, browse, and manage session notes. Notes are stored in S3 with YAML frontmatter for metadata.

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   dm-notes.astro│────▶│  API Gateway     │────▶│   Lambda    │
│   (Frontend)    │     │  (HTTP API)      │     │  Functions  │
└─────────────────┘     └──────────────────┘     └──────┬──────┘
                                                        │
                        ┌──────────────────┐            │
                        │   SSM Parameter  │◀───────────┤
                        │   Store (Auth)   │            │
                        └──────────────────┘            │
                                                        ▼
                        ┌──────────────────┐     ┌─────────────┐
                        │   S3 Bucket      │◀────│   Bedrock   │
                        │   (dm-notes/)    │     │ (AI Review) │
                        └──────────────────┘     └─────────────┘
```

## Authentication

All endpoints require the `X-DM-Token` header with a valid token.

### Token Setup

The token is stored in AWS SSM Parameter Store:

```bash
# Set the DM notes token (SecureString)
aws ssm put-parameter \
  --name "/dndblog/dm-notes-token" \
  --value "your-secret-token-here" \
  --type SecureString \
  --overwrite

# Verify it's set
aws ssm get-parameter \
  --name "/dndblog/dm-notes-token" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text
```

### Using the Token

Pass the token in requests:
```bash
curl -H "X-DM-Token: your-token" https://api.../notes
```

Or via URL parameter on the frontend:
```
https://chronicles.mawframe.ninja/dm-notes?token=your-token
```

### Client-Side Auth Module

The frontend uses `@lib/auth.ts` for Cognito authentication with automatic token refresh.

**Available Functions:**

| Function | Description |
|----------|-------------|
| `getAuthState()` | Get current auth state (synchronous) |
| `ensureValidAuth()` | Refresh tokens if needed before API calls (async) |
| `setAuthState(auth)` | Save auth to localStorage |
| `clearAuth()` | Clear auth state (logout) |
| `getAuthHeaders()` | Get `Authorization: Bearer` header for API calls |
| `getLoginUrl(returnUrl?)` | Get Cognito hosted UI login URL |
| `getLogoutUrl(returnPath?)` | Get Cognito logout URL |
| `getPasskeyRegistrationUrl()` | Get URL to register a passkey |
| `upgradeToPasskeySession()` | Upgrade session to 30 days after passkey registration |
| `exchangeCodeForTokens(code)` | Exchange OAuth code for tokens (callback page) |

**Auth State Structure:**

```typescript
interface AuthState {
  method: 'cognito';
  roles: {
    isDm: boolean;
    isPlayer: boolean;
  };
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresAt?: number;           // Access token expiry
  sessionExpiresAt?: number;    // Session expiry (30d passkey, 1d password)
  hasPasskey?: boolean;         // True if authenticated with passkey
  userId?: string;
  email?: string;
  characterSlug?: string;       // Player's assigned character
}
```

**Usage Example:**

```typescript
import { getAuthState, ensureValidAuth, getAuthHeaders, getLoginUrl } from '@lib/auth';

// Check if user is logged in
const auth = getAuthState();
if (!auth) {
  window.location.href = getLoginUrl('/campaign');
  return;
}

// Check roles
if (auth.roles.isDm) {
  // Show DM features
}

// Make authenticated API call (ensures token is fresh)
const validAuth = await ensureValidAuth();
if (!validAuth) {
  // Session expired, redirect to login
  window.location.href = getLoginUrl();
  return;
}
const response = await fetch(`${API_URL}/player/drafts`, {
  headers: getAuthHeaders(),
});
```

**Session Duration by Auth Method:**

- **Passkey authentication**: 30-day sessions with automatic token refresh
- **Password authentication**: 1-day sessions with automatic token refresh
- Access tokens are refreshed automatically 5 minutes before expiry
- When session expires, user must re-authenticate

## API Endpoints

### POST /upload-url

Get a pre-signed S3 URL for uploading notes.

**Request:**
```bash
curl -X GET "https://api.../upload-url?filename=session-10.md" \
  -H "X-DM-Token: your-token"
```

**Response:**
```json
{
  "uploadUrl": "https://bucket.s3.amazonaws.com/dm-notes/session-10.md?...",
  "key": "dm-notes/session-10.md"
}
```

**Frontend Usage:**
After getting the URL, upload directly to S3:
```javascript
await fetch(data.uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'text/markdown' },
  body: markdownContent
});
```

### POST /review

Submit notes for AI review (powered by Amazon Bedrock).

**Request:**
```bash
curl -X POST "https://api.../review" \
  -H "X-DM-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{"content": "# Session 10\n\n..."}'
```

**Response:**
```json
{
  "score": 85,
  "summary": "Good session notes with clear structure.",
  "suggestions": [
    "Consider adding more detail about NPC motivations",
    "Include a summary of key plot developments"
  ],
  "canPublish": true
}
```

**Configuration:**
AI review can be disabled via SSM parameter:
```bash
aws ssm put-parameter \
  --name "/dndblog/ai-review-enabled" \
  --value "false" \
  --type String \
  --overwrite
```

When disabled, the endpoint returns:
```json
{
  "disabled": true,
  "message": "AI review is temporarily disabled"
}
```

### GET /notes

List all notes with metadata.

**Request:**
```bash
curl -X GET "https://api.../notes" \
  -H "X-DM-Token: your-token"
```

**Response:**
```json
{
  "notes": [
    {
      "key": "dm-notes/session-10-2024-01-14.md",
      "title": "Session 10: The Dragon's Lair",
      "date": "2024-01-14T20:30:00.000Z",
      "draft": true,
      "size": 4523,
      "lastModified": "2024-01-14T20:45:00.000Z"
    }
  ],
  "count": 1
}
```

Metadata is parsed from YAML frontmatter in each file:
```yaml
---
title: "Session 10: The Dragon's Lair"
date: "2024-01-14T20:30:00.000Z"
draft: true
---
```

### GET /notes/{key}

Get a specific note's content.

**Request:**
```bash
curl -X GET "https://api.../notes/dm-notes%2Fsession-10.md" \
  -H "X-DM-Token: your-token"
```

**Response:**
```json
{
  "key": "dm-notes/session-10.md",
  "title": "Session 10: The Dragon's Lair",
  "date": "2024-01-14T20:30:00.000Z",
  "draft": true,
  "content": "# Session Summary\n\nThe party ventured into...",
  "rawContent": "---\ntitle: \"Session 10\"\n---\n\n# Session Summary..."
}
```

### DELETE /notes/{key}

Delete a note from S3.

**Request:**
```bash
curl -X DELETE "https://api.../notes/dm-notes%2Fsession-10.md" \
  -H "X-DM-Token: your-token"
```

**Response:**
```json
{
  "success": true,
  "message": "Note deleted successfully"
}
```

## S3 Bucket Structure

```
dndblog-dm-notes-bucket/
└── dm-notes/
    ├── session-1-2024-01-01.md
    ├── session-2-2024-01-08.md
    └── session-3-2024-01-15.md
```

All notes are stored with the `dm-notes/` prefix for security isolation.

## Lambda Functions

### UploadUrlFunction
- **Purpose:** Generate pre-signed S3 PUT URLs
- **Timeout:** 10 seconds
- **Memory:** 256 MB
- **Permissions:** S3 PutObject on `dm-notes/*`

### ReviewFunction
- **Purpose:** AI-powered notes review via Bedrock
- **Timeout:** 60 seconds (AI processing)
- **Memory:** 512 MB
- **Permissions:** Bedrock InvokeModel, SSM GetParameter

### NotesBrowserFunction
- **Purpose:** List, read, and delete notes
- **Timeout:** 30 seconds
- **Memory:** 512 MB
- **Permissions:** S3 GetObject, ListObjects, DeleteObject on `dm-notes/*`

## Rate Limiting

API Gateway throttling is configured:
- **Burst limit:** 10 requests
- **Rate limit:** 5 requests/second

This is appropriate for single-user DM access.

## CORS Configuration

CORS is handled by each Lambda function to support dynamic origins (localhost for development):

```typescript
// Lambda CORS helper
function getCorsOrigin(event) {
  const origin = event.headers?.origin || '';
  const allowed = process.env.ALLOWED_ORIGIN;
  // Allow localhost for development
  if (origin.startsWith('http://localhost:')) {
    return origin;
  }
  return allowed;
}

// Response headers include:
{
  'Access-Control-Allow-Origin': corsOrigin,
  'Access-Control-Allow-Headers': 'Content-Type, X-DM-Token',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
}
```

Each route also accepts OPTIONS requests for preflight handling.

## CloudWatch Monitoring

Each Lambda function has a CloudWatch alarm for errors:
- Threshold: 1 error
- Period: 5 minutes
- Evaluation: 1 period

Dashboard metrics available:
- Invocations
- Errors
- Duration (Average, P99)
- Throttles

## Security Considerations

1. **Token-based authentication:** All requests validated against SSM SecureString
2. **Path validation:** Keys must start with `dm-notes/` prefix
3. **CORS restrictions:** Only allowed origin can make requests (plus localhost for dev)
4. **Pre-signed URLs:** S3 upload URLs expire after 5 minutes
5. **Rate limiting:** Prevents abuse via API Gateway throttling
6. **XSS protection:** Frontend uses DOMPurify for markdown rendering
7. **CSP compliance:** Site CSP must allow:
   - `connect-src`: S3 (`*.s3.us-east-1.amazonaws.com`) and API Gateway (`*.execute-api.us-east-1.amazonaws.com`)
   - `script-src`: CDNs for marked.js, highlight.js, dompurify (`cdnjs.cloudflare.com`, `unpkg.com`)

## Frontend Integration

The dm-notes page (`packages/site/src/pages/dm-notes.astro`) provides:

1. **Editor Tab:**
   - EasyMDE markdown editor
   - Auto-save to localStorage
   - Rich text paste support (Google Docs, Word)
   - AI review integration
   - Publish to S3

2. **Browser Tab:**
   - Grid view of all notes
   - Search by title
   - Sort by date/title
   - View modal with rendered markdown
   - Download as .md file
   - Delete with confirmation

## Deployment

The DM Notes infrastructure is deployed via CDK:

```bash
cd packages/infra
npx cdk deploy DmNotesStack
```

After deployment, the API URL is output and should be set in the site's environment:
```bash
PUBLIC_DM_NOTES_API_URL=https://xxx.execute-api.us-east-1.amazonaws.com
```

---

## Entity Staging API

The staging API allows the DM to create, edit, and publish campaign entities (characters, items, locations, enemies, factions) through a branch-based workflow.

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  entities.astro │────▶│  API Gateway     │────▶│   Lambda    │
│  (DM Editor)    │     │  (HTTP API)      │     │  Functions  │
└─────────────────┘     └──────────────────┘     └──────┬──────┘
                                                        │
                        ┌──────────────────┐            │
                        │   S3 Bucket      │◀───────────┤
                        │   (staging/)     │            │
                        └──────────────────┘            │
                                                        ▼
                        ┌──────────────────┐     ┌─────────────┐
                        │   GitHub API     │◀────│  Publish    │
                        │   (PR creation)  │     │  Lambda     │
                        └──────────────────┘     └─────────────┘
```

### Staging Workflow

1. **Create Branch**: DM creates a staging branch for a group of related edits
2. **Add/Edit Entities**: DM adds or modifies entities within the branch
3. **Review**: DM reviews all pending changes
4. **Publish**: Creates a GitHub PR with the changes
5. **Merge**: PR triggers site rebuild when merged

### Staging Endpoints

All staging endpoints require `X-DM-Token` header.

#### GET /staging/branches

List all staging branches.

**Response:**
```json
{
  "branches": [
    {
      "name": "session-42-entities",
      "displayName": "Session 42 Entities",
      "createdAt": "2026-01-15T10:00:00Z",
      "entityCount": 3
    }
  ]
}
```

#### POST /staging/branches

Create a new staging branch.

**Request:**
```json
{
  "name": "session-42-entities",
  "displayName": "Session 42 Entities"
}
```

#### GET /staging/branches/{name}

Get branch details including all entities.

**Response:**
```json
{
  "name": "session-42-entities",
  "displayName": "Session 42 Entities",
  "createdAt": "2026-01-15T10:00:00Z",
  "entities": [
    {
      "slug": "new-character",
      "entityType": "character",
      "frontmatter": { "name": "New Character", ... }
    }
  ]
}
```

#### DELETE /staging/branches/{name}

Delete a staging branch and all its entities.

#### POST /staging/branches/{name}/entities

Add a new entity to a branch.

**Request:**
```json
{
  "slug": "new-character",
  "entityType": "character",
  "frontmatter": {
    "name": "New Character",
    "description": "A mysterious stranger",
    "status": "active"
  }
}
```

#### PUT /staging/branches/{name}/entities/{type}/{slug}

Update an existing entity.

**Request:**
```json
{
  "frontmatter": {
    "name": "Updated Name",
    "description": "Updated description"
  }
}
```

#### DELETE /staging/branches/{name}/entities/{type}/{slug}

Remove an entity from a branch.

#### POST /staging/branches/{name}/publish

Publish all entities in the branch to GitHub.

**Response:**
```json
{
  "success": true,
  "prUrl": "https://github.com/org/repo/pull/123",
  "entitiesPublished": 3
}
```

### Entity Types

Valid entity types and their fields:

| Type | Required Fields | Optional Fields |
|------|-----------------|-----------------|
| `character` | name, status | description, subtype, tags |
| `item` | name, itemType | rarity, attunement, status, description |
| `location` | name, status | locationType, region, description |
| `enemy` | name, status | subtype, cr, baseMonster, description |
| `faction` | name, status | factionType, alignment, description |

---

## Player Hub & Session Tracker API

The Player Hub and Session Tracker use per-character authentication. Each player has their own token associated with their character, providing personalized access to the player hub and session tracker.

### Per-Character Authentication

Each player has their own token stored in SSM:

```bash
# Set per-character token
aws ssm put-parameter \
  --name "/dndblog/player-token/rudiger" \
  --value "rudigers-secret-token" \
  --type SecureString \
  --overwrite
```

### Endpoints

#### POST /validate-character-token

Validate a character-specific token and return which character can be edited.

**Request Headers:**
```
X-Player-Token: rudigers-secret-token
```

**Response:**
```json
{
  "valid": true,
  "characterSlug": "rudiger"
}
```

#### GET /player/drafts/{slug}

Load a player's draft session data.

**Request Headers:**
```
X-Player-Token: character-token
```

**Response:**
```json
{
  "characterSlug": "rudiger",
  "combat": {
    "hp": 45,
    "tempHp": 5
  },
  "spellSlots": [
    { "level": 1, "expended": 2 },
    { "level": 2, "expended": 1 }
  ],
  "activeConditions": [
    { "name": "Poisoned", "duration": "1 hour" }
  ],
  "savedAt": "2026-01-15T20:00:00Z"
}
```

#### PUT /player/drafts/{slug}

Save session data as a draft.

**Request:**
```json
{
  "combat": { "hp": 45, "tempHp": 5 },
  "spellSlots": [...],
  "activeConditions": [...]
}
```

#### DELETE /player/drafts/{slug}

Discard a draft.

### Draft Approval Flow (DM)

Pending player drafts can be approved by the DM to publish to the site.

#### GET /player/drafts (DM only)

List all pending player drafts.

**Request Headers:**
```
X-DM-Token: dm-token
```

**Response:**
```json
{
  "drafts": [
    {
      "characterSlug": "rudiger",
      "characterName": "Rudiger",
      "savedAt": "2026-01-15T20:00:00Z",
      "changes": ["HP: 52 → 45", "Added condition: Poisoned"]
    }
  ]
}
```

#### POST /player/drafts/{slug}/approve (DM only)

Approve and publish a player's draft changes.

#### POST /player/drafts/{slug}/reject (DM only)

Reject a player's draft changes.

---

## Frontend Pages

| Page | Purpose | Auth |
|------|---------|------|
| `/dm` | DM Dashboard - notes, entities, drafts | DM Token |
| `/dm/entities` | Entity editor with staging branches | DM Token |
| `/party` | Party Hub - party resources | Character Token |
| `/party/session/{slug}` | Session Tracker for a character | Character Token |
