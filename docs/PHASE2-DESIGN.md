# Phase 2 Design: Private Campaign System

This document outlines the planned features and architecture for Phase 2 of the The Evocation of Events platform.

## Overview

Phase 2 transforms the static blog into a full-featured campaign management system with:

- **Authentication** - Invite-only user accounts
- **Private Notes API** - Campaign-scoped note storage
- **AI Summarization** - Automatic campaign recaps using Claude
- **Access Control** - Role-based content visibility

## Target Users

- **Campaign DMs** - Create and manage campaigns, invite players
- **Players** - View campaign content, add personal notes
- **Public Readers** - Access public blog posts only

## Architecture Evolution

```
Phase 1 (Current):
┌──────────────┐    ┌──────────────┐
│  CloudFront  │───▶│     S3       │
│    (CDN)     │    │  (Static)    │
└──────────────┘    └──────────────┘

Phase 2 (Planned):
┌──────────────┐    ┌──────────────┐
│  CloudFront  │───▶│     S3       │
│    (CDN)     │    │  (Static)    │
└──────────────┘    └──────────────┘
        │                   ▲
        │                   │ Regenerate
        ▼                   │
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ API Gateway  │───▶│   Lambda     │───▶│  DynamoDB    │
│  + Cognito   │    │  Functions   │    │  (Notes)     │
└──────────────┘    └──────────────┘    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Claude API  │
                    │ (Summaries)  │
                    └──────────────┘
```

## Authentication (Cognito)

### User Pool Configuration

```typescript
{
  selfSignUpEnabled: false,  // Invite only
  signInAliases: { email: true },
  passwordPolicy: {
    minLength: 12,
    requireLowercase: true,
    requireUppercase: true,
    requireDigits: true,
    requireSymbols: true
  },
  mfa: MfaConfiguration.OPTIONAL,
  accountRecovery: AccountRecovery.EMAIL_ONLY
}
```

### User Groups

| Group | Permissions |
|-------|------------|
| `admins` | Full access to all campaigns |
| `campaign-{id}` | Access to specific campaign |

### JWT Claims

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "custom:displayName": "Dungeon Master",
  "cognito:groups": ["admins", "campaign-xyz"]
}
```

## Private Notes API

### DynamoDB Single-Table Design

**Primary Key:**
- PK: `campaign#{campaignId}`
- SK: `{noteType}#{timestamp}#{noteId}`

**Global Secondary Indexes:**
- **GSI1** (User Notes): PK=`userId`, SK=`{timestamp}#{noteId}`
- **GSI2** (By Type): PK=`campaign#{campaignId}#{noteType}`, SK=`timestamp`

### Note Types

| Type | Description | Example |
|------|-------------|---------|
| `SESSION` | Game session notes | Session 5 recap |
| `CHARACTER` | Character info | Elara the Wizard |
| `LOCATION` | World locations | The Dark Temple |
| `NPC` | Non-player characters | Lord Blackwood |
| `ITEM` | Magic items | Sword of Truth |
| `QUEST` | Quests and objectives | Rescue the Prince |
| `SUMMARY` | AI-generated summaries | Campaign Arc 1 |

### API Endpoints

```
# Campaigns
POST   /campaigns                Create campaign
GET    /campaigns                List user's campaigns
GET    /campaigns/{id}           Get campaign
PUT    /campaigns/{id}           Update campaign
DELETE /campaigns/{id}           Delete campaign

# Notes
POST   /campaigns/{id}/notes     Create note
GET    /campaigns/{id}/notes     List notes (with filters)
GET    /campaigns/{id}/notes/{noteId}  Get note
PUT    /campaigns/{id}/notes/{noteId}  Update note
DELETE /campaigns/{id}/notes/{noteId}  Delete note

# Summarization
POST   /campaigns/{id}/summarize Trigger AI summary
GET    /campaigns/{id}/summaries List summaries

# Export
POST   /campaigns/{id}/export    Export to blog post
```

## AI Summarization Service

### Trigger Flow

```
New Session Note
      │
      ▼
DynamoDB Stream ──▶ Lambda Trigger
                          │
                          ▼
                    Aggregate Notes
                          │
                          ▼
                    Claude API Call
                          │
                          ▼
                    Store Summary
                          │
                          ▼
                    (Optional) Rebuild Site
```

### Summarization Prompt

```
You are a skilled D&D campaign chronicler. Summarize these session notes
into a narrative blog post suitable for the campaign's private blog.

Requirements:
- Write in third person, past tense
- Highlight key plot developments
- Note character growth and decisions
- Preserve important NPC names and locations
- Include a "What Happened" section and "Looking Forward" teaser
- Keep spoiler-free for players who missed the session
- Aim for 500-1000 words

Session Notes:
{notes}

Previous Summary Context:
{previous_summary}
```

### Claude API Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Model | claude-3-sonnet | Balance of quality and cost |
| Max tokens | 2000 | Sufficient for summary |
| Temperature | 0.7 | Some creativity, but consistent |

## Access Control Matrix

| Content | Public | Authenticated | Campaign Member | Admin |
|---------|--------|---------------|-----------------|-------|
| Public posts | Read | Read | Read | CRUD |
| Private posts | - | Read | Read | CRUD |
| Campaign posts | - | - | Read | CRUD |
| Personal notes | - | Own only | Own only | CRUD |
| Campaign notes | - | - | Read + Create | CRUD |
| User management | - | - | - | CRUD |

## Content Visibility

### In Astro

```typescript
// Filter content based on visibility
const posts = await getCollection('blog', ({ data }) => {
  // Public: always visible
  if (data.visibility === 'public') return true;

  // Private: requires authentication
  if (data.visibility === 'private') {
    return isAuthenticated();
  }

  // Campaign: requires membership
  if (data.visibility === 'campaign') {
    return isCampaignMember(data.campaignId);
  }

  return false;
});
```

### Client-Side Auth Flow

```
1. User visits protected page
2. Check localStorage for token
3. If missing → redirect to /login
4. If present → validate with Cognito
5. If valid → render page
6. If invalid → redirect to /login
```

## Data Migration

### Content Schema Updates

The current schema already includes Phase 2 fields:

```typescript
// These fields exist but default to public behavior
visibility: 'public' | 'private' | 'campaign'  // default: 'public'
campaignId?: string
contributors?: string[]
```

No schema migration needed - just start using the fields.

## Security Considerations

### Data Encryption

- **At rest:** DynamoDB encryption + KMS for note content
- **In transit:** TLS 1.2+ everywhere
- **Secrets:** AWS Secrets Manager for Claude API key

### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| Auth endpoints | 5 | 1 minute |
| API endpoints | 100 | 1 second |
| Summarization | 10 | 1 hour |

### Audit Logging

- All API calls logged to CloudWatch
- User actions tracked with userId
- Admin actions require additional confirmation

## Cost Estimation (Phase 2)

| Service | Estimated Monthly Cost |
|---------|----------------------|
| Cognito | $0.0055/MAU (first 50k free) |
| API Gateway | $1/million requests |
| Lambda | $0.20/million requests |
| DynamoDB | $1.25/GB + $0.25/million reads |
| Claude API | ~$0.01-0.05 per summary |

**Estimated total:** $5-20/month for small campaign groups

## Implementation Phases

### Phase 2a: Authentication

1. Deploy Cognito stack
2. Add login/logout UI
3. Create admin user management
4. Test invite flow

### Phase 2b: Notes API

1. Deploy DynamoDB table
2. Implement Lambda functions
3. Deploy API Gateway
4. Build notes UI components

### Phase 2c: Summarization

1. Configure Claude API access
2. Implement summarization Lambda
3. Set up DynamoDB Streams
4. Build summary review UI

### Phase 2d: Integration

1. Connect everything
2. Update content pipeline
3. Implement campaign pages
4. User acceptance testing

## Open Questions

1. **Offline support?** - Consider PWA for note-taking
2. **Mobile app?** - React Native wrapper feasible
3. **Real-time sync?** - WebSockets for live collaboration
4. **Media uploads?** - S3 presigned URLs for images
