import 'dotenv/config';
import { createSupabaseAdminClient } from '../src/config/supabaseAdmin.js';
import { createSupabaseClient } from '../src/config/supabase.js';
import { profilePhotoStorage } from '../src/services/profilePhoto.service.js';

const gym = '00000000-0000-4000-8000-000000000000';
const user = '1';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhS8AAAAASUVORK5CYII=', 'base64');
let reference;
try {
  const name = process.env.SUPABASE_STORAGE_BUCKET || 'fitnexis-profile-photos';
  const { data: bucket, error } = await createSupabaseAdminClient().storage.getBucket(name);
  if (error || bucket.public) throw new Error('Private bucket required.');
  reference = await profilePhotoStorage.upload({ buffer: png, mimetype: 'image/png' }, gym, user);
  const signedUrl = await profilePhotoStorage.signedUrl(reference, gym, user);
  const response = await fetch(signedUrl, { signal: AbortSignal.timeout(15000) });
  if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(png)) throw new Error('Signed download check failed.');
  const object = reference.replace(`supabase://${name}/`, '');
  const publicRead = await createSupabaseClient().storage.from(name).download(object);
  if (!publicRead.error) throw new Error('Unexpected public read access.');
  console.log('Private bucket verified: upload and signed download passed; publishable-key read blocked.');
} catch {
  console.error('Storage check failed. Check server credentials, bucket settings and network access.');
  process.exitCode = 1;
} finally {
  if (reference) {
    try { await profilePhotoStorage.remove(reference, gym, user); console.log('Temporary verification photo deleted.'); }
    catch { console.error('Temporary photo cleanup failed.'); process.exitCode = 1; }
  }
}
