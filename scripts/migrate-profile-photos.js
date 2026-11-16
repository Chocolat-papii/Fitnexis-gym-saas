import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../src/config/db.js';
import { profilePhotoStorage } from '../src/services/profilePhoto.service.js';

// Only migrate files referenced by this database. Never delete original files.
const apply = process.argv.includes('--apply');
try {
  const { rows } = await db.query("SELECT user_id,gym_id,profile_picture FROM member_profile WHERE profile_picture LIKE '/uploads/profile-pics/%'");
  console.log(`${rows.length} referenced local profile photos found. ${apply ? 'Applying migration.' : 'Preview only; pass --apply to migrate.'}`);
  let migrated = 0, failed = 0;
  if (apply) for (const row of rows) {
    let reference;
    try {
      const filename = row.profile_picture.slice('/uploads/profile-pics/'.length);
      if (!/^[A-Za-z0-9_-]+\.(jpe?g|png|webp)$/i.test(filename)) throw new Error('Invalid local filename.');
      const buffer = await fs.readFile(path.join(process.cwd(), 'public', 'uploads', 'profile-pics', filename));
      reference = await profilePhotoStorage.upload({ buffer }, row.gym_id, row.user_id);
      const updated = await db.query('UPDATE member_profile SET profile_picture=$1,updated_at=NOW() WHERE user_id=$2 AND gym_id=$3 AND profile_picture=$4', [reference, row.user_id, row.gym_id, row.profile_picture]);
      if (updated.rowCount !== 1) throw new Error('Profile changed during migration.');
      migrated++;
    } catch {
      failed++;
      if (reference) {
        try { await profilePhotoStorage.remove(reference, row.gym_id, row.user_id); }
        catch { console.error('Unused migration upload cleanup failed.'); }
      }
    }
  }
  if (apply) console.log(`Migrated ${migrated}; failed ${failed}. Original local files retained.`);
  if (failed) process.exitCode = 1;
} catch (error) {
  console.error('Photo migration failed:', error.code || 'Check database and storage configuration.');
  process.exitCode = 1;
} finally {
  await db.end();
}
