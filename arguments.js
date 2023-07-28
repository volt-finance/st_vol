// for goerli

const usdc= '0x456f6b7b1c5126060fe358fb4a5f935b3fbc26ef';
const oracle= '0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e';
const admin= '0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0';
const operator= '0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0';
const interval= 300;
const buffer= 15;
const betAmount= 1000000000000000;
const oracleUpdateAllowance= 300;
const treasury= 1000;

module.exports = [
    usdc, 
    oracle,
    admin,
    operator,
    interval,
    buffer,
    betAmount,
    oracleUpdateAllowance,
    treasury
];