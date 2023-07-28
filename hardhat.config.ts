import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-truffle5";
import "@nomiclabs/hardhat-etherscan";
import '@typechain/hardhat';
import "solidity-coverage"
import "hardhat-abi-exporter";

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
const etherscanKey = process.env.ETHERSCAN_KEY

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
        runs: 99999,
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
      mainnet: etherscanKey,
      goerli: etherscanKey
    }
  },
  abiExporter: {
    path: "./data/abi",
    clear: true,
    flat: false,
  },
};
