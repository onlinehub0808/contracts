import hre, { ethers } from "hardhat";

// Contract types
import { TWFee } from "typechain/TWFee";
import { TWFactory } from "typechain/TWFactory";

// General Types
import { DropERC721 } from "typechain/DropERC721";
import { DropERC1155 } from "typechain/DropERC1155";
import { TokenERC20 } from "typechain/TokenERC20";
import { TokenERC721 } from "typechain/TokenERC721";
import { TokenERC1155 } from "typechain/TokenERC1155";

async function main() {
  // Constructor args
  const trustedForwarderAddress: string = "0xc82BbE41f2cF04e3a8efA18F7032BDD7f6d98a81";

  // Deploy FeeType
  const options = {
    maxFeePerGas: ethers.utils.parseUnits("7.5", "gwei"),
    maxPriorityFeePerGas: ethers.utils.parseUnits("2.5", "gwei"),
    gasLimit: 10_000_000,
  };

  // Deploy TWRegistry
  const thirdwebRegistry = await (await ethers.getContractFactory("TWRegistry")).deploy(trustedForwarderAddress);
  const deployTxRegistry = thirdwebRegistry.deployTransaction;
  console.log("Deploying TWRegistry at tx: ", deployTxRegistry.hash);
  await thirdwebRegistry.deployed();

  console.log("TWRegistry address: ", thirdwebRegistry.address);

  // Deploy TWFactory and TWRegistry
  const thirdwebFactory = await (await ethers.getContractFactory("TWFactory")).deploy(trustedForwarderAddress, thirdwebRegistry.address, options);
  const deployTxFactory = thirdwebFactory.deployTransaction;
  console.log("Deploying TWFactory and TWRegistry at tx: ", deployTxFactory.hash);
  await thirdwebFactory.deployed();

  console.log("TWFactory address: ", thirdwebFactory.address);

  // Deploy TWFee
  const thirdwebFee: TWFee = (await ethers
    .getContractFactory("TWFee")
    .then(f => f.deploy(trustedForwarderAddress, thirdwebFactory.address, options))) as TWFee;
  const deployTxFee = thirdwebFee.deployTransaction;

  console.log("Deploying TWFee at tx: ", deployTxFee.hash);

  await deployTxFee.wait();

  console.log("TWFee address: ", thirdwebFee.address);

  // Deploy a test implementation: Drop721
  //
  const drop721Factory = await ethers.getContractFactory("DropERC721");
  const drop721: DropERC721 = (await drop721Factory.deploy(thirdwebFee.address, options)) as DropERC721;

  console.log("Deploying Drop721 at tx: ", drop721.deployTransaction.hash);
  await drop721.deployTransaction.wait();

  console.log("Drop721 address: ", drop721.address);

  // Set the deployed `Drop721` as an approved module in TWFactory
  const tx1 = await thirdwebFactory.addImplementation(drop721.address, options);

  console.log("Setting deployed Drop721 as an approved implementation at tx: ", tx1.hash);
  await tx1.wait();

  // Deploy a test implementation: Drop1155
  const drop1155: DropERC1155 = (await ethers
    .getContractFactory("DropERC1155")
    .then(f => f.deploy(thirdwebFee.address, options))) as DropERC1155;

  console.log("Deploying Drop1155 at tx: ", drop1155.deployTransaction.hash);

  console.log("Drop1155 address: ", drop1155.address);

  // Set the deployed `Drop721` as an approved module in TWFactory
  const tx2 = await thirdwebFactory.addImplementation(drop1155.address, options);

  console.log("Setting deployed Drop1155 as an approved implementation at tx: ", tx2.hash);
  await tx2.wait();

  // Deploy a test implementation: TokenERC20
  const tokenERC20: TokenERC20 = (await ethers
    .getContractFactory("TokenERC20")
    .then(f => f.deploy(options))) as TokenERC20;
  console.log("Deploying TokenERC20 at tx: ", tokenERC20.deployTransaction.hash);
  console.log("TokenERC20 address: ", tokenERC20.address);

  // Set the deployed `TokenERC20` as an approved module in TWFactory
  const tx3 = await thirdwebFactory.addImplementation(tokenERC20.address, options);

  console.log("Setting deployed TokenERC20 as an approved implementation at tx: ", tx3.hash);
  await tx3.wait();

  // Deploy a test implementation: TokenERC721
  const tokenERC721: TokenERC721 = (await ethers
    .getContractFactory("TokenERC721")
    .then(f => f.deploy(thirdwebFee.address, options))) as TokenERC721;
  console.log("Deploying TokenERC721 at tx: ", tokenERC721.deployTransaction.hash);
  console.log("TokenERC721 address: ", tokenERC721.address);

  // Set the deployed `TokenERC721` as an approved module in TWFactory
  const tx4 = await thirdwebFactory.addImplementation(tokenERC721.address, options);

  console.log("Setting deployed TokenERC721 as an approved implementation at tx: ", tx4.hash);
  await tx4.wait();

  // Deploy a test implementation: TokenERC1155
  const tokenERC1155: TokenERC1155 = (await ethers
    .getContractFactory("TokenERC1155")
    .then(f => f.deploy(thirdwebFee.address, options))) as TokenERC1155;
  console.log("Deploying TokenERC1155 at tx: ", tokenERC1155.deployTransaction.hash);
  console.log("TokenERC1155 address: ", tokenERC1155.address);

  // Set the deployed `TokenERC1155` as an approved module in TWFactory
  const tx5 = await thirdwebFactory.addImplementation(tokenERC1155.address, options);

  console.log("Setting deployed TokenERC1155 as an approved implementation at tx: ", tx5.hash);
  await tx5.wait();

  console.log("DONE. Now verifying contracts...");

  // Verify deployed contracts.
  await hre.run("verify:verify", {
    address: thirdwebRegistry.address,
    constructorArguments: [trustedForwarderAddress],
  });
  await hre.run("verify:verify", {
    address: thirdwebFactory.address,
    constructorArguments: [trustedForwarderAddress, thirdwebRegistry.address],
  });
  await hre.run("verify:verify", {
    address: thirdwebFee.address,
    constructorArguments: [trustedForwarderAddress, thirdwebFactory.address],
  });
  await hre.run("verify:verify", {
    address: drop721.address,
    constructorArguments: [thirdwebFee.address],
  });
  await hre.run("verify:verify", {
    address: drop1155.address,
    constructorArguments: [thirdwebFee.address],
  });
  await hre.run("verify:verify", {
    address: tokenERC20.address,
    constructorArguments: [],
  });
  await hre.run("verify:verify", {
    address: tokenERC721.address,
    constructorArguments: [thirdwebFee.address],
  });
  await hre.run("verify:verify", {
    address: tokenERC1155.address,
    constructorArguments: [thirdwebFee.address],
  });
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
