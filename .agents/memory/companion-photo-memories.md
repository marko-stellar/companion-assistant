---
name: COMPANION Photo Memories
description: Architecture and lessons for the Photo Memories feature (object storage, show_photo tool, vision analysis, context injection, tablet overlay).
---

## How Photo Memories Works

### Upload flow (two-step presigned — bytes never hit the API server)
1. Admin: `POST /api/admin/photos/upload-url` → presigned PUT URL + objectPath
2. Admin browser PUTs file bytes directly to GCS via presigned URL
3. Admin: `POST /api/admin/users/:userId/photos` with objectPath + metadata → DB record created, async vision analysis fires (fire-and-forget)

### Object storage paths
- `objectPath` stored in DB looks like `/objects/uploads/<uuid>` (normalized by `normalizeObjectEntityPath`)
- `getObjectEntityReadURL(objectPath, ttlSec)` added to `ObjectStorageService` — generates a signed GET URL via the Replit sidecar
- The `signObjectURL` sidecar call returns `{ signed_url }` — must cast `response.json() as { signed_url: string }` (not typed by default)

### Vision analysis (photo-vision.service.ts)
- Downloads image via signed read URL (15 min TTL)
- Sends as `data:<contentType>;base64,<data>` to `llmProvider.analyzeImage()`
- IDENTITY RULE hardcoded in prompt: never name/identify people from appearance
- Stores result in `photos.visionDescription`

### show_photo tool
- LLM gets `AVAILABLE PHOTOS` list in system prompt (IDs + title/date/location)
- Tool executor verifies photo ownership (userId from session, never from args)
- Returns `{ photoUrl, photoId }` in `ToolCallSuccess.data`
- Conversation route captures `data.photoUrl` and `data.photoId`, includes in JSON response

### Context injection (conversation-context.service.ts)
- `activePhotoContext?` param: photo record + photo memories → injected as "PHOTO CURRENTLY ON SCREEN" section
- `availablePhotos?` param: short list → injected as "AVAILABLE PHOTOS" section
- Identity rule repeated in photo section of system prompt

### Memory linking
- `extractFromTurn({ photoId })` → memories stored with `type: "PHOTO_MEMORY"` and `photoId` FK
- When activePhotoCtx is present or show_photo was called, photoId is passed through

### Tablet photo overlay
- `pendingPhotoUrl` + `clearPendingPhoto` in DeviceContext
- `activePhotoId` tracked in DeviceContext, sent in every converse request body
- Fullscreen fixed overlay in home.tsx, dismissed by button (keeps activePhotoId for conversation context continuity)

## Key constraints
- Identity safety rule must appear in: (1) vision analysis prompt, (2) system prompt photo section, (3) show_photo tool description
- `lib/db` must be rebuilt with `pnpm --filter @workspace/db exec tsc --build` after schema changes to update `.d.ts` files in `lib/db/dist/`
- DB migration for new columns: use a `tsx src/migrate-photos.ts` script (top-level await in `tsx -e` inline doesn't work with CJS)
