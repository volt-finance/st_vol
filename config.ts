export default {
  Address: {
    Usdc: {
      mainnet: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      goerli: "0x456f6b7b1c5126060fe358fb4a5f935b3fbc26ef",
    },
    Oracle: {
      mainnet: "",
      goerli: "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e",
    },
    Admin: {
      mainnet: "",
      goerli: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
    },
    Operator: {
      mainnet: "",
      goerli: "0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0",
    },
  },
  Block: {
    Interval: {
      mainnet: 300,
      goerli: 300,
    },
    Buffer: {
      mainnet: 15,
      goerli: 15,
    },
  },
  Treasury: {
    mainnet: 1000, // 10%
    goerli: 1000, // 10%
  },
  MinParticipateAmount: {
    mainnet: 0.001,
    goerli: 0.001,
  },
  OracleUpdateAllowance: {
    mainnet: 300,
    goerli: 300,
  },
};
