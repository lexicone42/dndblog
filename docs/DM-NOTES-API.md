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
PUBLIC_DM_NOTES_API_URL=https://xxx.execute-api.us-west-2.amazonaws.com
```
