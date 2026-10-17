import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileService } from '../../server/application/profileService.js';

test('profile preference PATCH merges keys instead of replacing other preferences', async () => {
  let profile = {
    id: 'profile',
    prefs: { cardSize: 76, density: 'normal', equipped: { melee: 'copy-1' } },
  };
  const service = createProfileService({
    profileRepo: {
      ensure: () => profile,
      update: (patch) => {
        profile = { ...profile, ...patch };
        return profile;
      },
    },
  });

  const updated = await service.update({ prefs: { cardSize: 92 } });
  assert.deepEqual(updated.prefs, {
    cardSize: 92,
    density: 'normal',
    equipped: { melee: 'copy-1' },
  });
});

test('profile preference PATCH rejects arrays', async () => {
  const service = createProfileService({
    profileRepo: { ensure: () => ({ prefs: {} }), update: (patch) => patch },
  });
  await assert.rejects(() => service.update({ prefs: [] }), /prefs debe ser un objeto/);
});
