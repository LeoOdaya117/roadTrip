import { Filesystem } from '@capacitor/filesystem';

export async function checkPublicStoragePermission() {
  try {
    return await Filesystem.checkPermissions();
  } catch (e) {
    return null;
  }
}
