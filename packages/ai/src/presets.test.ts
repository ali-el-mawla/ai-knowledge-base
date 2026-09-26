import { describe, expect, it } from 'vitest';
import { CUSTOM_PRESET, getPreset, PRESET_NAMES, PROVIDER_PRESETS } from './presets.js';

describe('provider presets', () => {
  const presets = [...Object.entries(PROVIDER_PRESETS), ['custom', CUSTOM_PRESET] as const];

  it.each(presets)('%s has consistent capability data', (key, preset) => {
    expect(preset.name).toBe(key);
    expect(getPreset(key)).toBe(preset);
    if (preset.chat) {
      const [min, max] = preset.chat.temperatureRange;
      expect(min).toBeLessThanOrEqual(max);
    }
    if (preset.embeddings) {
      expect(Number.isInteger(preset.embeddings.maxBatch)).toBe(true);
      expect(preset.embeddings.maxBatch).toBeGreaterThan(0);
    }
    expect(preset.docs).toMatch(/^https:\/\//);
  });

  it('lists every preset name plus custom', () => {
    expect(PRESET_NAMES).toEqual([...Object.keys(PROVIDER_PRESETS), 'custom']);
    expect(getPreset('nope')).toBeUndefined();
  });
});
