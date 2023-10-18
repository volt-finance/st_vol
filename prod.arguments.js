// for mainnet
const usdc = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const oracle = '0x4305FB66699C3B2702D4d05CF36551390A4c69C6'; // PythContractAddress
const admin = '0x93072915E6fD257Ca98eD80343D6fbc8e2426C9F';
const operator = '0x5e6c12e083B1Ad5fB7c7bf5582467EB74cD58a66';
const operatorVault = '0xFb6B24942a19F138EF468EC39Ce8653A87500832';
const commissionFee = 200; // 2%
const operateRate = 10000; // 100%
const priceId = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"; // ETH/USD
// const priceId = "0xc96458d393fe9deb7a7d63a0ac41e2898a67a7750dbd166673279e06c868df0a"; // BTC/USD

module.exports = [
    usdc,
    oracle,
    admin,
    operator,
    operatorVault,
    commissionFee,
    operateRate,
    priceId
];