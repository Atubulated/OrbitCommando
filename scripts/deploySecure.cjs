const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const backendSigner = process.env.BACKEND_SIGNER_ADDRESS;

  if (!backendSigner) {
    throw new Error("Missing BACKEND_SIGNER_ADDRESS in .env file");
  }

  console.log("Deploying CommandoOrbitSecure to Monad Testnet...");
  console.log("Backend Signer Address:", backendSigner);

  const CommandoOrbit = await hre.ethers.getContractFactory("CommandoOrbitSecure");
  const contract = await CommandoOrbit.deploy(backendSigner);

  await contract.waitForDeployment();

  console.log(`\n✅ SECURE VAULT DEPLOYED SUCCESSFULLY!`);
  console.log(`📡 Contract Address: ${await contract.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});