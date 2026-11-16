import { randomUUID } from 'node:crypto';
import { createSupabaseAdminClient } from '../config/supabaseAdmin.js';

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const unavailable = () => Object.assign(new Error('Photo storage is temporarily unavailable. Please try again.'), { status: 503 });
const invalid = () => Object.assign(new Error('Choose a JPG, PNG or WebP image no larger than 2 MB.'), { status: 400 });

export function photoType(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_PHOTO_BYTES) throw invalid();
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return { mime: 'image/jpeg', extension: 'jpg' };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: 'image/png', extension: 'png' };
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', extension: 'webp' };
  throw invalid();
}

function scope(gymId, userId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(gymId)) || !/^[1-9]\d*$/.test(String(userId))) {
    throw Object.assign(new Error('Invalid photo ownership.'), { status: 403 });
  }
  return `${gymId}/${userId}/`;
}

export function profilePhotoUrl(reference, userId) {
  return reference?.startsWith('supabase://')
    ? `/member/profile-photo/${userId}?v=${encodeURIComponent(reference.split('/').at(-1))}`
    : reference;
}

export function createProfilePhotoStorage({ env = process.env, client } = {}) {
  const bucket = () => env.SUPABASE_STORAGE_BUCKET || 'fitnexis-profile-photos';
  const storage = () => (client || createSupabaseAdminClient({ env })).storage.from(bucket());
  function objectPath(reference, gymId, userId) {
    const prefix = `supabase://${bucket()}/`;
    if (!reference?.startsWith(prefix)) throw Object.assign(new Error('Photo not found.'), { status: 404 });
    const path = reference.slice(prefix.length);
    const owner = scope(gymId, userId);
    if (!path.startsWith(owner) || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(path.slice(owner.length))) {
      throw Object.assign(new Error('Photo not found.'), { status: 404 });
    }
    return path;
  }
  return {
    async upload(file, gymId, userId) {
      const type = photoType(file.buffer);
      if (file.mimetype && type.mime !== file.mimetype) throw invalid();
      const path = `${scope(gymId, userId)}${randomUUID()}.${type.extension}`;
      try {
        const { error } = await storage().upload(path, file.buffer, { contentType: type.mime, cacheControl: '60', upsert: false });
        if (error) throw unavailable();
        return `supabase://${bucket()}/${path}`;
      } catch { throw unavailable(); }
    },
    async signedUrl(reference, gymId, userId) {
      const path = objectPath(reference, gymId, userId);
      try {
        const { data, error } = await storage().createSignedUrl(path, 60);
        if (error || !data?.signedUrl) throw unavailable();
        return data.signedUrl;
      } catch { throw unavailable(); }
    },
    async remove(reference, gymId, userId) {
      const path = objectPath(reference, gymId, userId);
      try {
        const { error } = await storage().remove([path]);
        if (error) throw unavailable();
      } catch { throw unavailable(); }
    },
  };
}

export const profilePhotoStorage = createProfilePhotoStorage();
