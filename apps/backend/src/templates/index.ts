export interface ContractAddresses {
  liquidityPool?: string;
  yieldFarm?: string;
  tokenSwap?: string;
  [key: string]: string | undefined;
}

export interface SorobanDefiConfig {
  network: string;
  contracts: ContractAddresses;
  [key: string]: unknown;
}

export const sorobanDefiConfig = {
  network: 'testnet',
  // Example:
  // contracts: {
  //   liquidityPool: 'C...',
  //   yieldFarm: 'C...',
  //   tokenSwap: 'C...',
  // },
  contracts: {} as ContractAddresses,
} as const;
