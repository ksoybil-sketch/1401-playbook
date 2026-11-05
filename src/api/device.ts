import { Preferences } from '@capacitor/preferences';
import type { DeviceCreds } from './backend';

/**
 * Mağaza telefonunun kalıcı kimliği. Eşleştirme kodu bir kez girilir;
 * telefona özel hesap bilgisi burada saklanır ve uygulama her açılışta ve
 * her barista çıkışında bununla "mağaza moduna" döner.
 *
 * Android'de Capacitor Preferences (uygulamaya özel depolama), web'de localStorage.
 */
const KEY = 'playbook.device.v2';

export type StoredDevice = DeviceCreds;

export async function loadDevice(): Promise<StoredDevice | null> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    const d = value ? (JSON.parse(value) as StoredDevice) : null;
    return d && d.email && d.password && d.uid ? d : null;
  } catch {
    return null;
  }
}

export async function saveDevice(d: StoredDevice): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(d) });
}

export async function clearDevice(): Promise<void> {
  await Preferences.remove({ key: KEY });
}
