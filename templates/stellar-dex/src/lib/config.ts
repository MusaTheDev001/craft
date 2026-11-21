export interface StellarNetworkConfig {
  network: "testnet" | "mainnet";
  horizonUrl: string;
  networkPassphrase: string;
}

const NETWORK_CONFIGS: Record<"testnet" | "mainnet", StellarNetworkConfig> = {
  testnet: {
    network: "testnet",
    horizonUrl: "https://horizon-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  },
  mainnet: {
    network: "mainnet",
    horizonUrl: "https://horizon.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
  },
};

/**
 * Resolve the Stellar network configuration for the given network name.
 *
 * Inlined locally so the generated template has no dependency on the
 * private `@craft/stellar` workspace package.
 */
export function resolveStellarNetworkConfig(
  network: string | undefined = process.env.NEXT_PUBLIC_STELLAR_NETWORK,
): StellarNetworkConfig {
  const normalized = (network ?? "testnet").toLowerCase();
  if (normalized === "mainnet" || normalized === "public") {
    return NETWORK_CONFIGS.mainnet;
  }
  return NETWORK_CONFIGS.testnet;
}
