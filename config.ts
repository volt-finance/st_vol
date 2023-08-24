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
      arbitrum: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", // ETH/USD
      arbitrum_goerli: "0x62CAe0FA2da220f43a51F86Db2EDb36DcA9A5A08", // ETH/USD
      goerli: "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e",
    },
    Pyth: {
      mainnet: "",
      arbitrum: "", // ETH/USD
      arbitrum_goerli: "", // ETH/USD
      goerli: "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e",
    },
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
  Block: {
    Interval: {
      mainnet: 300,
      goerli: 300,
      arbitrum: 300,
      arbitrum_goerli: 300
    },
    Buffer: {
      mainnet: 15,
      goerli: 15,
      arbitrum: 15,
      arbitrum_goerli: 15
    },
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
  MinParticipateAmount: {
    mainnet: 1000000, // 1 USDC
    goerli: 1000000, // 1 USDC
    arbitrum: 1000000, // 1 USDC
    arbitrum_goerli: 1000000, // 1 USDC
  },
  OracleUpdateAllowance: {
    mainnet: 300,
    goerli: 300,
    arbitrum: 300,
    arbitrum_goerli: 300
  },
};
