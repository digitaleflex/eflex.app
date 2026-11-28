/**
 * Environnement de test : désactive l'enforcement 2FA admin par défaut.
 *
 * La double authentification obligatoire est un comportement de production
 * testé explicitement dans `portail/src/lib/admin.test.ts` (via
 * `vi.stubEnv('ADMIN_2FA_ENFORCE_AFTER', …)`). Les autres suites vérifient la
 * logique métier (validation, filtres, quotas…) et ne doivent pas recevoir un
 * 403 « 2FA requise » faute de `twoFactorEnabled` sur leur session factice.
 */
process.env.ADMIN_2FA_ENFORCE_AFTER = 'never'
