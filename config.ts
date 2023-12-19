export default {
  Address: {
    Usdc: {
      mainnet: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      arbitrum_goerli: "0x8FB1E3fC51F3b789dED7557E680551d93Ea9d892",
      arbitrum_sepolia: "0xf3C3351D6Bd0098EEb33ca8f830FAf2a141Ea2E1",
      sepolia: "0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0",
      goerli: "0x456f6b7b1c5126060fe358fb4a5f935b3fbc26ef",
    },
    Oracle: {
      mainnet: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6",
      goerli: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C", // PythContractAddress
      arbitrum: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C",
      arbitrum_goerli: "0x939C0e902FF5B3F7BA666Cc8F6aC75EE76d3f900",
      arbitrum_sepolia: "0x4374e5a8b9c22271e9eb878a2aa31de97df15daf",
      sepolia: "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21",
    },
    // Oracle: {
    //   mainnet: "",
    //   arbitrum: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", // ChainLink: ETH/USD
    //   arbitrum_goerli: "0x62CAe0FA2da220f43a51F86Db2EDb36DcA9A5A08", // ChainLink: ETH/USD
    //   // goerli: "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e", // ChainLink: ETH/USD
    //   goerli: "0x779877A7B0D9E8603169DdbD7836e478b4624789", // ChainLink: BTC/USD
    // },
    Admin: {
      mainnet: "0x93072915E6fD257Ca98eD80343D6fbc8e2426C9F",
      arbitrum: "0x93072915E6fD257Ca98eD80343D6fbc8e2426C9F",
      arbitrum_goerli: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
      arbitrum_sepolia: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
      sepolia: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
      goerli: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
    },
    Operator: {
      mainnet: "0x5e6c12e083B1Ad5fB7c7bf5582467EB74cD58a66",
      arbitrum: "0x5e6c12e083B1Ad5fB7c7bf5582467EB74cD58a66",
      arbitrum_goerli: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
      arbitrum_sepolia: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
      sepolia: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
      goerli: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
    },
    OperatorVault: {
      mainnet: "0xFb6B24942a19F138EF468EC39Ce8653A87500832",
      arbitrum: "0xFb6B24942a19F138EF468EC39Ce8653A87500832",
      arbitrum_goerli: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
      arbitrum_sepolia: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
      sepolia: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
      goerli: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
    }
  },
  PythPriceId: {
    mainnet: {
      BTC_USD: "0xc96458d393fe9deb7a7d63a0ac41e2898a67a7750dbd166673279e06c868df0a",
      ETH_USD: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    },
    arbitrum: {
      BTC_USD: "0xc96458d393fe9deb7a7d63a0ac41e2898a67a7750dbd166673279e06c868df0a",
      ETH_USD: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    },
    sepolia: {
      BTC_USD: "0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b",
      ETH_USD: "0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6",
    },
    arbitrum_sepolia: {
      BTC_USD: "0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b",
      ETH_USD: "0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6",
    },
    arbitrum_goerli: {
      BTC_USD: "0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b",
      ETH_USD: "0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6",
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
    sepolia: 200, // 2%
    arbitrum_sepolia: 200, // 2%
    arbitrum_goerli: 200 // 2%
  },
};
