/**
 * Soroban DeFi template configuration.
 *
 * Example:
 * ```ts
 * import { config, ContractAddresses } from './config';
 *
 * const contracts: ContractAddresses = config.contracts;
 * contracts.liquidityPool; // string | undefined
 * contracts.yieldFarm;     // string | undefined
 * contracts.tokenSwap;     // string | undefined
 * ```
 */

/**
 * Addresses of the Soroban contracts used by the DeFi template.
 * All fields are optional so partially deployed environments remain valid,
 * and the index signature allows additional named contracts.
 */
export interface ContractAddresses {
  liquidityPool?: string;
  yieldFarm?: string;
  tokenSwap?: string;
  [contractName: string]: string | undefined;
}

export const config = {
  network: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  contracts: {
    liquidityPool: '',
    yieldFarm: '',
    tokenSwap: '',
  } as ContractAddresses,
} as const;
