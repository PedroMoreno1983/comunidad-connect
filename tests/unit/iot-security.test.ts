import { describe, expect, it } from 'vitest';
import { bindIotPayloadToCommunity, requireCommunityIotSecret } from '@/lib/iot/security';

describe('IoT tenant security', () => {
    it('overwrites a caller supplied community with the authenticated tenant', () => {
        const result = bindIotPayloadToCommunity(
            { sensor_id: 'sensor-a', community_id: 'tenant-b' },
            'tenant-a',
        );

        expect(result.community_id).toBe('tenant-a');
        expect(result.sensor_id).toBe('sensor-a');
    });

    it('rejects non-object payloads', () => {
        expect(() => bindIotPayloadToCommunity(['event'], 'tenant-a')).toThrow();
        expect(() => bindIotPayloadToCommunity(null, 'tenant-a')).toThrow();
    });

    it('requires a tenant-specific secret', () => {
        expect(requireCommunityIotSecret(' tenant-secret ')).toBe('tenant-secret');
        expect(() => requireCommunityIotSecret(undefined)).toThrow();
        expect(() => requireCommunityIotSecret('   ')).toThrow();
    });
});
