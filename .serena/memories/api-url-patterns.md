# DM Notes API URL Patterns

## Correct Staging Branch URL Pattern

The staging branch API follows this pattern:
```
/staging/branches/{branchName}/...
```

### Specific endpoints:
- **Get branch**: `GET /staging/branches/{name}`
- **Delete branch**: `DELETE /staging/branches/{name}`
- **Add entity**: `POST /staging/branches/{name}/entities`
- **Update entity**: `PUT /staging/branches/{name}/entities/{type}/{slug}`
- **Delete entity**: `DELETE /staging/branches/{name}/entities/{type}/{slug}`
- **Publish branch**: `POST /staging/branches/{name}/publish`

## Common Bug Pattern

Incorrect URL pattern (missing "branches"):
```javascript
// WRONG
apiUrl + '/staging/entities/' + branchName + '/' + entityType + '/' + slug

// CORRECT
apiUrl + '/staging/branches/' + encodeURIComponent(branchName) + '/entities/' + encodeURIComponent(entityType) + '/' + encodeURIComponent(slug)
```

## Authentication

All staging endpoints require `X-DM-Token` header with the DM authentication token.

## Entity Types

Valid entity types: `character`, `item`, `location`, `enemy`, `faction`
