// for goerli
const usdc = '0x456f6b7b1c5126060fe358fb4a5f935b3fbc26ef';
// const oracle = '0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e'; // ETH/USD
const oracle = '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C'; // PythContractAddress
const admin = '0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0';
const operator = '0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0';
const participantVault = '0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0';
const interval = 3600; // 60*60= 1hour
const buffer = 300; // 60*5= 5min
const commissionFee = 200;
const operateRate = 3000;
const participantRate = 7000;
const strategyRate = 100; // 0:none, 100: 1%
const priceId = "0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6"; // ETH/USD

module.exports = [
    usdc,
    oracle,
    admin,
    operator,
    participantVault,
    interval,
    buffer,
    commissionFee,
    operateRate,
    participantRate,
    strategyRate,
    priceId
];