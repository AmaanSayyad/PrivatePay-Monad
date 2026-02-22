// Monad branding
export const MONAD_LOGO_PRIMARY = "/monad.jpg";
export const MONAD_LOGO_ICON = "/monad.jpg";

// Display-only: Monad Testnet
export const DISPLAY_CHAINS = [
  { id: "monad", name: "Monad", imageUrl: MONAD_LOGO_ICON, isTestnet: true },
];


// Legacy export (used by AuthProvider / Web3Provider when present)
const DEFAULT_CONTRACT_ADDRESS = "0x6b84f47Ef5c73AA8A9bc0D7Ff18ba3487aA5C1D3";
const envContractAddress = import.meta.env.VITE_SQUIDL_STEALTHSIGNER_CONTRACT_ADDRESS;
export const CONTRACT_ADDRESS =
  (envContractAddress && envContractAddress.startsWith("0x")) ? envContractAddress : DEFAULT_CONTRACT_ADDRESS;

// Monad Testnet Config (only chain)
export const monadTestnet = {
  id: 10143,
  name: "Monad Testnet",
  network: "monad-testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Monad",
    symbol: "MON",
  },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz/"] },
    public: { http: ["https://testnet-rpc.monad.xyz/"] },
  },
  blockExplorers: {
    default: { name: "MonadExplorer", url: "https://testnet.monadexplorer.com/" },
  },
  testnet: true,
};

export const CHAINS = [monadTestnet];
export const MAINNET_CHAINS = [];
export const TESTNET_CHAINS = [monadTestnet];
export const customEvmNetworks = [monadTestnet];

