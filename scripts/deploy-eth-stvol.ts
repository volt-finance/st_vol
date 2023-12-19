import { ethers, network, run } from "hardhat";
import config from "../config";

const main = async () => {
  // Get network data from Hardhat config (see hardhat.config.ts).
  const networkName = network.name;
  const STVOL_NAME = "StVol3PerUp";

  // Check if the network is supported.
  if (networkName === "goerli"
    || networkName === "mainnet"
    || networkName === "arbitrum"
    || networkName === "arbitrum_goerli"
    || networkName === "arbitrum_sepolia"
    || networkName === "sepolia"
  ) {
    console.log(`Deploying to ${networkName} network...`);

    // Check if the addresses in the config are set.
    if (
      config.Address.Usdc[networkName] === ethers.constants.AddressZero ||
      config.Address.Oracle[networkName] === ethers.constants.AddressZero ||
      config.Address.Admin[networkName] === ethers.constants.AddressZero ||
      config.Address.Operator[networkName] === ethers.constants.AddressZero ||
      config.Address.OperatorVault[networkName] === ethers.constants.AddressZero
    ) {
      throw new Error("Missing addresses (Pyth Oracle and/or Admin/Operator)");
    }

    // Compile contracts.
    await run("compile");
    console.log("Compiled contracts...");

    console.log("===========================================");
    console.log("USDC: %s", config.Address.Usdc[networkName]);
    console.log("Oracle: %s", config.Address.Oracle[networkName]);
    console.log("Admin: %s", config.Address.Admin[networkName]);
    console.log("Operator: %s", config.Address.Operator[networkName]);
    console.log("Operator Vault: %s", config.Address.OperatorVault[networkName]);
    console.log("CommissionFee: %s", config.CommissionFee[networkName]);
    console.log("===========================================");

    // Deploy contracts.
    const StVol = await ethers.getContractFactory(STVOL_NAME);
    const stVolContract = await StVol.deploy(
      config.Address.Usdc[networkName],
      config.Address.Oracle[networkName],
      config.Address.Admin[networkName],
      config.Address.Operator[networkName],
      config.Address.OperatorVault[networkName],
      config.CommissionFee[networkName],
      config.PythPriceId[networkName]['ETH_USD'],
    );

    await stVolContract.deployed();
    console.log(`🍣 ${STVOL_NAME} Contract deployed at ${stVolContract.address}`);

    await run("verify:verify", {
      address: stVolContract.address,
      network: ethers.provider.network,
      contract: `contracts/${STVOL_NAME}.sol:${STVOL_NAME}`,
      constructorArguments: [
        config.Address.Usdc[networkName],
        config.Address.Oracle[networkName],
        config.Address.Admin[networkName],
        config.Address.Operator[networkName],
        config.Address.OperatorVault[networkName],
        config.CommissionFee[networkName],
        config.PythPriceId[networkName]['ETH_USD']
      ]
    });
    console.log('verify the contractAction done');
  } else {
    console.log(`Deploying to ${networkName} network is not supported...`);
  }
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

