import { ethers, network, run } from "hardhat";

const main = async () => {
  // Get network data from Hardhat config.
  const networkName = network.name;

  // Check if the network is supported.
  console.log(`Deploying to ${networkName} network...`);

  // Compile contracts.
  await run("compile");
  console.log("Compiled contracts. Deploying...");

  // Deploy contracts.
  const pythContract = "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C";
  const priceId = "0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6";

  const PythTest = await ethers.getContractFactory("PythTest");
  const contract = await PythTest.deploy(pythContract, priceId);

  // Wait for the contract to be deployed before exiting the script.
  await contract.deployed();
  console.log(`Deployed to ${contract.address}`);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
