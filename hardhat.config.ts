import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-truffle5";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import '@typechain/hardhat';
import "solidity-coverage";
import "hardhat-abi-exporter";
import "hardhat-gas-reporter";

import * as fs from 'fs';
import * as dotenv from 'dotenv'

dotenv.config()

const mnemonic = fs.existsSync('.secret')
  ? fs
    .readFileSync('.secret')
    .toString()
    .trim()
  : "test test test test test test test test test test test junk"

const infuraKey = process.env.INFURA_KEY

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
export default {
  networks: {
    hardhat: {
      // forking: {
      //   url: `https://mainnet.infura.io/v3/${infuraKey}`,
      //   enabled: true,
      // },
      chainId: 31337,
    },
    localhost: {
      chainId: 31337,
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${infuraKey}`,
      accounts: {
        mnemonic,
      },
      saveDeployments: true,
      chainId: 1,
    },
    arbitrum: {
      url: `https://arbitrum-mainnet.infura.io/v3/${infuraKey}`,
      gas: 22000000,
      allowUnlimitedContractSize: true,
      accounts: {
        mnemonic,
      },
      chainId: 42161,
    },
    arbitrum_goerli: {
      url: `https://arbitrum-goerli.infura.io/v3/${infuraKey}`,
      gas: 22000000,
      allowUnlimitedContractSize: true,
      accounts: {
        mnemonic,
      },
      chainId: 421613,
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${infuraKey}`,
      gas: 22000000,
      allowUnlimitedContractSize: true,
      accounts: {
        mnemonic,
      },
      chainId: 5,
    },
  },
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5',
  },
  contractSizer: {
    alphaSort: true,
  },
  defaultNetwork: "hardhat",
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_KEY,
      goerli: process.env.ETHERSCAN_KEY,
      arbitrumOne: process.env.ARBITRUM_ETHERSCAN_KEY,
      arbitrumGoerli: process.env.ARBITRUM_ETHERSCAN_KEY,
    }
  },
  abiExporter: {
    path: "./data/abi",
    clear: true,
    flat: false,
  },
};
