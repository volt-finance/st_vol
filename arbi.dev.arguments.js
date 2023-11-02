// for goerli
const usdc = '0x8FB1E3fC51F3b789dED7557E680551d93Ea9d892';
const oracle = '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C'; // PythContractAddress
const admin = '0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0';
const operator = '0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0';
const operatorVault = '0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0';
const commissionFee = 200; // 2%
const operateRate = 10000; // 100%
const priceId = "0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6"; // ETH/USD
// const priceId = "0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b"; // BTC/USD

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