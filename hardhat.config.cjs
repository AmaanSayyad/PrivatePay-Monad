/** @type import('hardhat/config').HardhatUserConfig */
require("dotenv").config();

const MONAD_RPC = process.env.VITE_MONAD_RPC_URL || process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz/";
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.VITE_TREASURY_PRIVATE_KEY || "";

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      chainId: 10143,
    },
    monad: {
      url: MONAD_RPC.trim(),
      chainId: 10143,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY.replace(/^0x/, "")] : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./contracts-test",
  },
};
