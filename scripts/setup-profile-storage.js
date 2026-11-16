import 'dotenv/config';
import { createSupabaseAdminClient } from '../src/config/supabaseAdmin.js';
import { MAX_PHOTO_BYTES, PHOTO_MIME_TYPES } from '../src/services/profilePhoto.service.js';

try {
  const client = createSupabaseAdminClient();
  const name = process.env.SUPABASE_STORAGE_BUCKET || 'fitnexis-profile-photos';
  const options = { public: false, fileSizeLimit: MAX_PHOTO_BYTES, allowedMimeTypes: PHOTO_MIME_TYPES };
  const { data, error } = await client.storage.listBuckets();
  if (error) throw error;
  const existing = data.find(bucket => bucket.id === name);
  if (existing?.public) throw new Error('The configured bucket is public. Choose a new, private bucket for member photos.');
  const result = existing
    ? await client.storage.updateBucket(name, options)
    : await client.storage.createBucket(name, options);
  if (result.error) throw result.error;
  console.log(`Private profile-photo bucket configured: ${name} (2 MB, JPG/PNG/WebP).`);
} catch (error) {
  console.error('Storage setup failed:', error.status || error.statusCode || 'Check server credentials and bucket configuration.');
  process.exitCode = 1;
}
