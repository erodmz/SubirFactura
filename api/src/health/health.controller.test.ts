import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('responde ok', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok', service: 'facturard-api' });
  });
});
