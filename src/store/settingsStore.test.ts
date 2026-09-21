import { useSettingsStore } from './settingsStore';

beforeEach(() => {
  useSettingsStore.setState({ audioQuality: 'high', notificationsEnabled: true, downloadOnWifiOnly: true });
});

describe('settingsStore', () => {
  it('cicla la calidad de audio en orden y da la vuelta', () => {
    useSettingsStore.setState({ audioQuality: 'normal' });
    useSettingsStore.getState().cycleAudioQuality();
    expect(useSettingsStore.getState().audioQuality).toBe('high');

    useSettingsStore.getState().cycleAudioQuality();
    expect(useSettingsStore.getState().audioQuality).toBe('very_high');

    useSettingsStore.getState().cycleAudioQuality();
    expect(useSettingsStore.getState().audioQuality).toBe('normal');
  });

  it('alterna notificaciones y descargas sólo por WiFi', () => {
    useSettingsStore.getState().toggleNotifications();
    expect(useSettingsStore.getState().notificationsEnabled).toBe(false);

    useSettingsStore.getState().toggleDownloadOnWifiOnly();
    expect(useSettingsStore.getState().downloadOnWifiOnly).toBe(false);
  });
});
