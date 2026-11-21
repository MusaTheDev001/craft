/**
 * Soroban DeFi template configuration.
 *
 * Example:
 * ```ts
 * import { config, ContractAddresses } from './templates/soroban-defi';
 *
 * const addresses: ContractAddresses = {
 *   liquidityPool: 'C...',
 *   yieldFarm: 'C...',
 *   tokenSwap: 'C...',
 * };
 * ```
 */

export interface ContractAddresses {
  liquidityPool?: string;
  yieldFarm?: string;
  tokenSwap?: string;
  [contract: string]: string | undefined;
}

export const config = {
  name: 'soroban-defi',
  description: 'Soroban DeFi template with liquidity pool, yield farm and token swap contracts',
  contracts: {
    liquidityPool: 'liquidity_pool',
    yieldFarm: 'yield_farm',
    tokenSwap: 'token_swap',
  } as ContractAddresses,
} as const;
