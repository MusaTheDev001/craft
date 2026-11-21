import { describe, expect, it } from 'vitest';
import config, { ContractAddresses } from './config';

describe('soroban-defi config', () => {
  it('exposes typed contract addresses', () => {
    const contracts: ContractAddresses = config.contracts;

    expect(contracts).toBeDefined();
    expect(typeof contracts).toBe('object');
  });

  it('accepts optional known contract address fields', () => {
    const contracts: ContractAddresses = {
      liquidityPool: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
      yieldFarm: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
      tokenSwap: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
    };

    expect(contracts.liquidityPool).toBeTypeOf('string');
    expect(contracts.yieldFarm).toBeTypeOf('string');
    expect(contracts.tokenSwap).toBeTypeOf('string');
  });

  it('supports an index signature for additional contract addresses', () => {
    const contracts: ContractAddresses = {
      customContract: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
    };

    expect(contracts.customContract).toBeTypeOf('string');
  });
});
