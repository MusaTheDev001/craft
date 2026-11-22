/**
 * Snapshot Regression Tests for Stellar Network Configuration
 *
 * Captures and diffs Stellar network configuration outputs to catch unintended
 * changes in network passphrase handling, RPC endpoint resolution, and config
 * serialization.
 *
 * Issue: #540
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getNetworkConfig,
    resolveStellarNetworkConfig,
    getNetworkPassphrase,
    validateNetworkPassphrase,
    NETWORK_PASSPHRASES,
    HORIZON_URLS,
    SOROBAN_RPC_URLS,
} from './config';

describe('Stellar Config — Snapshot Regression Tests (#540)', () => {
    describe('getNetworkConfig — testnet', () => {
        it('should match snapshot for testnet configuration', () => {
            const config = getNetworkConfig('testnet');
            expect(config).toMatchSnapshot();
        });

        it('should have correct network passphrase for testnet', () => {
            const config = getNetworkConfig('testnet');
            expect(config.networkPassphrase).toBe(NETWORK_PASSPHRASES.testnet);
            expect(config.networkPassphrase).toMatchSnapshot();
        });

        it('should have correct Horizon URL for testnet', () => {
            const config = getNetworkConfig('testnet');
            expect(config.horizonUrl).toBe(HORIZON_URLS.testnet);
            expect(config.horizonUrl).toMatchSnapshot();
        });

        it('should have correct Soroban RPC URL for testnet', () => {
            const config = getNetworkConfig('testnet');
            expect(config.sorobanRpcUrl).toBe(SOROBAN_RPC_URLS.testnet);
            expect(config.sorobanRpcUrl).toMatchSnapshot();
        });

        it('should have network field set to testnet', () => {
            const config = getNetworkConfig('testnet');
            expect(config.network).toBe('testnet');
            expect(config.network).toMatchSnapshot();
        });
    });

    describe('getNetworkConfig — mainnet', () => {
        it('should match snapshot for mainnet configuration', () => {
            const config = getNetworkConfig('mainnet');
            expect(config).toMatchSnapshot();
        });

        it('should have correct network passphrase for mainnet', () => {
            const config = getNetworkConfig('mainnet');
            expect(config.networkPassphrase).toBe(NETWORK_PASSPHRASES.mainnet);
            expect(config.networkPassphrase).toMatchSnapshot();
        });

        it('should have correct Horizon URL for mainnet', () => {
            const config = getNetworkConfig('mainnet');
            expect(config.horizonUrl).toBe(HORIZON_URLS.mainnet);
            expect(config.horizonUrl).toMatchSnapshot();
        });

        it('should have correct Soroban RPC URL for mainnet', () => {
            const config = getNetworkConfig('mainnet');
            expect(config.sorobanRpcUrl).toBe(SOROBAN_RPC_URLS.mainnet);
            expect(config.sorobanRpcUrl).toMatchSnapshot();
        });

        it('should have network field set to mainnet', () => {
            const config = getNetworkConfig('mainnet');
            expect(config.network).toBe('mainnet');
            expect(config.network).toMatchSnapshot();
        });
    });

    describe('getNetworkConfig — env overrides (#1416)', () => {
        const originalHorizon = process.env.NEXT_PUBLIC_HORIZON_URL;
        const originalRpc = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;

        beforeEach(() => {
            delete process.env.NEXT_PUBLIC_HORIZON_URL;
            delete process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;
        });

        afterEach(() => {
            if (originalHorizon === undefined) {
                delete process.env.NEXT_PUBLIC_HORIZON_URL;
            } else {
                process.env.NEXT_PUBLIC_HORIZON_URL = originalHorizon;
            }
            if (originalRpc === undefined) {
                delete process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;
            } else {
                process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = originalRpc;
            }
        });

        it('should fall back to defaults when overrides are unset', () => {
            const config = getNetworkConfig('testnet');
            expect(config.horizonUrl).toBe(HORIZON_URLS.testnet);
            expect(config.sorobanRpcUrl).toBe(SOROBAN_RPC_URLS.testnet);
        });

        it('should use NEXT_PUBLIC_HORIZON_URL override when set', () => {
            process.env.NEXT_PUBLIC_HORIZON_URL = 'https://horizon.example.com';
            const config = getNetworkConfig('testnet');
            expect(config.horizonUrl).toBe('https://horizon.example.com');
        });

        it('should use NEXT_PUBLIC_SOROBAN_RPC_URL override when set', () => {
            process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = 'https://rpc.example.com';
            const config = getNetworkConfig('testnet');
            expect(config.sorobanRpcUrl).toBe('https://rpc.example.com');
        });

        it('should apply both overrides together', () => {
            process.env.NEXT_PUBLIC_HORIZON_URL = 'https://horizon.example.com';
            process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = 'https://rpc.example.com';
            const config = getNetworkConfig('mainnet');
            expect(config.horizonUrl).toBe('https://horizon.example.com');
            expect(config.sorobanRpcUrl).toBe('https://rpc.example.com');
        });

        it('should ignore non-https Horizon override and fall back to default', () => {
            process.env.NEXT_PUBLIC_HORIZON_URL = 'http://horizon.example.com';
            const config = getNetworkConfig('testnet');
            expect(config.horizonUrl).toBe(HORIZON_URLS.testnet);
        });

        it('should ignore non-https Soroban RPC override and fall back to default', () => {
            process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = 'http://rpc.example.com';
            const config = getNetworkConfig('testnet');
            expect(config.sorobanRpcUrl).toBe(SOROBAN_RPC_URLS.testnet);
        });
    });

    describe('NEXT_PUBLIC_SOROBAN_RPC_URL override handling (#1500)', () => {
        const originalRpc = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;

        beforeEach(() => {
            delete process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;
        });

        afterEach(() => {
            if (originalRpc === undefined) {
                delete process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;
            } else {
                process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = originalRpc;
            }
        });

        const networks = ['testnet', 'mainnet'] as const;

        const cases: Array<{
            label: string;
            value: string | undefined;
            expectOverride: boolean;
        }> = [
            { label: 'https override', value: 'https://rpc.example.com', expectOverride: true },
            { label: 'unset override', value: undefined, expectOverride: false },
            { label: 'empty string override', value: '', expectOverride: false },
            { label: 'whitespace-only override', value: '   ', expectOverride: false },
            { label: 'non-https override', value: 'http://rpc.example.com', expectOverride: false },
        ];

        it.each(
            networks.flatMap((network) =>
                cases.map((testCase) => [network, testCase.label, testCase] as const)
            )
        )('should resolve Soroban RPC URL for %s with %s', (network, _label, testCase) => {
            if (testCase.value === undefined) {
                delete process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;
            } else {
                process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = testCase.value;
            }

            const config = getNetworkConfig(network);
            const expected = testCase.expectOverride
                ? testCase.value
                : SOROBAN_RPC_URLS[network];

            expect(config.sorobanRpcUrl).toBe(expected);
        });

        it.each(networks)(
            'should resolve Soroban RPC URL via resolveStellarNetworkConfig for %s',
            (network) => {
                process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = 'https://rpc.example.com';
                const overridden = resolveStellarNetworkConfig(network);
                expect(overridden.sorobanRpcUrl).toBe('https://rpc.example.com');

                delete process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;
                const fallback = resolveStellarNetworkConfig(network);
                expect(fallback.sorobanRpcUrl).toBe(SOROBAN_RPC_URLS[network]);
            }
        );
    });

    describe('network passphrase override (#1417)', () => {
        const originalPassphrase = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE;
        const customPassphrase = 'Custom Network ; 2024';

        beforeEach(() => {
            delete process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE;
        });

        afterEach(() => {
            if (originalPassphrase === undefined) {
                delete process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE;
            } else {
                process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE = originalPassphrase;
            }
        });

        it('should fall back to constants when override is unset', () => {
            expect(getNetworkPassphrase('testnet')).toBe(NETWORK_PASSPHRASES.testnet);
            expect(getNetworkPassphrase('mainnet')).toBe(NETWORK_PASSPHRASES.mainnet);
        });

        it('should use NEXT_PUBLIC_NETWORK_PASSPHRASE override in getNetworkPassphrase', () => {
            process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE = customPassphrase;
            expect(getNetworkPassphrase('testnet')).toBe(customPassphrase);
            expect(getNetworkPassphrase('mainnet')).toBe(customPassphrase);
        });

        it('should accept only the configured passphrase in validateNetworkPassphrase', () => {
            process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE = customPassphrase;
            expect(validateNetworkPassphrase(customPassphrase, 'testnet')).toBe(true);
            expect(validateNetworkPassphrase(NETWORK_PASSPHRASES.testnet, 'testnet')).toBe(false);
            expect(validateNetworkPassphrase(NETWORK_PASSPHRASES.mainnet, 'mainnet')).toBe(false);
        });

        it('should validate against constants when override is unset', () => {
            expect(validateNetworkPassphrase(NETWORK_PASSPHRASES.testnet, 'testnet')).toBe(true);
            expect(validateNetworkPassphrase(NETWORK_PASSPHRASES.mainnet, 'testnet')).toBe(false);
        });
    });

    describe('Network Configuration Constants', () => {
        it('should match snapshot for NETWORK_PASSPHRASES', () => {
            expect(NETWORK_PASSPHRASES).toMatchSnapshot();
        });

        it('should match snapshot for HORIZON_URLS', () => {
            expect(HORIZON_URLS).toMatchSnapshot();
        });

        it('should match snapshot for SOROBAN_RPC_URLS', () => {
            expect(SOROBAN_RPC_URLS).toMatchSnapshot();
        });

        it('should have all required networks in NETWORK_PASSPHRASES', () => {
            expect(Object.keys(NETWORK_PASSPHRASES).sort()).toMatchSnapshot();
        });

        it('should have all required networks in HORIZON_URLS', () => {
            expect(Object.keys(HORIZON_URLS).sort()).toMatchSnapshot();
        });

        it('should have all required networks in SOROBAN_RPC_URLS', () => {
            expect(Object.keys(SOROBAN_RPC_URLS).sort()).toMatchSnapshot();
        });
    });

    describe('Configuration Consistency', () => {
        it('should have matching network keys across all config objects', () => {
            const passphraseKeys = Object.keys(NETWORK_PASSPHRASES).sort();
            const horizonKeys = Object.keys(HORIZON_URLS).sort();
            const sorobanKeys = Object.keys(SOROBAN_RPC_URLS).sort();

            expect(passphraseKeys).toEqual(horizonKeys);
            expect(horizonKeys).toEqual(sorobanKeys);
            expect(passphraseKeys).toMatchSnapshot();
        });

        it('should return consistent config shape for all networks', () => {
            const testnetConfig = getNetworkConfig('testnet');
            const mainnetConfig = getNetworkConfig('mainnet');

            expect(Object.keys(testnetConfig).sort()).toEqual(Object.keys(mainnetConfig).sort());
            expect(Object.keys(testnetConfig).sort()).toMatchSnapshot();
        });

        it('should have all required fields in config output', () => {
            const config = getNetworkConfig('testnet');
            expect(Object.keys(config).sort()).toMatchSnapshot();
        });
    });
});
