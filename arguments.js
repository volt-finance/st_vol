// for goerli
const usdc = '0x456f6b7b1c5126060fe358fb4a5f935b3fbc26ef';
const oracle = '0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e';
const admin = '0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0';
const operator = '0xC61042a7e9a6fe7E738550f24030D37Ecb296DC0';
const participantVault = '0x8487A533517E77D2dcb9E1980271077d58a5c3C0';
const interval = 300;
const buffer = 15;
const minParticipantAmount = 1000000;
const oracleUpdateAllowance = 300;
const commissionFee = 200;
const operateRate = 3000;
const participantRate = 7000;

module.exports = [
    usdc,
    oracle,
    admin,
    operator,
    participantVault,
    interval,
    buffer,
    minParticipantAmount,
    oracleUpdateAllowance,
    commissionFee,
    operateRate,
    participantRate
];