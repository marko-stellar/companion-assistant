---
name: HEIC photo normalization
description: Compatibility rule for iPhone HEIC/HEIF uploads in the photo gallery.
---

## Rule

Normalize HEIC and HEIF uploads to JPEG on the server after the browser's
presigned upload and before a photo record is created.

**Why:** HEIC is not rendered consistently by gallery/tablet browsers and is
not a dependable input format for future vision providers. Converting the
private object preserves the direct-to-storage design while making each saved
photo broadly usable.

**How to apply:** Keep HEIC/HEIF detection based on both MIME type and filename
because iPhone/browser uploads can omit or misreport the MIME type. Use a
temporary, non-persistent conversion workspace and keep conversion failures
visible to the admin rather than registering an unusable photo.