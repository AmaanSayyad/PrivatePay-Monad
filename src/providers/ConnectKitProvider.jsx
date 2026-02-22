import { WagmiProvider, createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider as FamilyConnectKitProvider } from "connectkit";

const monadTestnet = {
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
        default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com/" },
    },
};

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "3fcc6bba6f1de962d911bb5b5c3dba68";

const config = createConfig({
    chains: [monadTestnet],
    connectors: [
        injected(),
        walletConnect({ projectId }),
    ],
    transports: {
        [monadTestnet.id]: http("https://testnet-rpc.monad.xyz/"),
    },
});

const queryClient = new QueryClient();

export function ConnectKitProvider({ children }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <FamilyConnectKitProvider
                    theme="auto"
                    mode="light"
                    customTheme={{
                        "--ck-font-family": "Athletics, sans-serif",
                        "--ck-border-radius": "24px",
                        "--ck-primary-button-border-radius": "16px",
                        "--ck-secondary-button-border-radius": "16px",
                        "--ck-overlay-background": "rgba(0, 0, 0, 0.4)",
                        "--ck-overlay-backdrop-filter": "blur(8px)",
                    }}
                >
                    {children}
                </FamilyConnectKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
