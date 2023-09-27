export default {
  Address: {
    Usdc: {
      mainnet: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      arbitrum: "",
      arbitrum_goerli: "0x8FB1E3fC51F3b789dED7557E680551d93Ea9d892",
      goerli: "0x456f6b7b1c5126060fe358fb4a5f935b3fbc26ef",
    },
    Oracle: {
      mainnet: "",
      arbitrum: "",
      arbitrum_goerli: "",
      goerli: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C", // PythContractAddress
    },
    // Oracle: {
    //   mainnet: "",
    //   arbitrum: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", // ChainLink: ETH/USD
    //   arbitrum_goerli: "0x62CAe0FA2da220f43a51F86Db2EDb36DcA9A5A08", // ChainLink: ETH/USD
    //   // goerli: "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e", // ChainLink: ETH/USD
    //   goerli: "0x779877A7B0D9E8603169DdbD7836e478b4624789", // ChainLink: BTC/USD
    // },
    Admin: {
      mainnet: "",
      arbitrum: "",
      arbitrum_goerli: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
      goerli: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
    },
    Operator: {
      mainnet: "",
      arbitrum: "",
      arbitrum_goerli: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
      goerli: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
    },
    ParticipantVault: {
      mainnet: "",
      arbitrum: "",
      arbitrum_goerli: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
      goerli: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
    },
  },
  PythPriceId: {
    mainnet: {
      BTC_USD: "",
      ETH_USD: "",
    },
    arbitrum: {
      BTC_USD: "",
      ETH_USD: "",
    },
    arbitrum_goerli: {
      BTC_USD: "",
      ETH_USD: "",
    },
    goerli: {
      BTC_USD: "0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b",
      ETH_USD: "0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6",
    }
  },
  CommissionFee: {
    mainnet: 200, // 2%
    goerli: 200, // 2%
    arbitrum: 200, // 2%
    arbitrum_goerli: 200 // 2%
  },
  OperateRate: {
    mainnet: 3000, // 30%
    goerli: 3000, // 30%
    arbitrum: 3000, // 30%
    arbitrum_goerli: 3000 // 30%
  },
  ParticipantRate: {
    mainnet: 7000, // 70%
    goerli: 7000, // 70%
    arbitrum: 7000, // 70%
    arbitrum_goerli: 7000 // 70%
  },
};
