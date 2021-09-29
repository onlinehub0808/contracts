// Test imports
import { ethers } from "hardhat";
import { expect } from "chai";

// Types
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

// Test utils
import { getContracts } from "../utils/tests/getContracts";
import { forkFrom, impersonate } from "../utils/hardhatFork";
import { chainlinkVars } from "../utils/chainlink";
import linkTokenABi from "../abi/LinkTokenInterface.json";
const { signMetaTxRequest } = require("../../utils/meta-tx/signer");

describe("Open pack", function () {
  // Signers
  let creator: SignerWithAddress;
  let relayer: SignerWithAddress;

  // Contracts
  let pack: Contract;
  let accessNft: Contract;
  let forwarder: Contract;

  // Reward parameterrs
  const packURI: string = "ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/1";
  const rewardURIs: string[] = [
    "ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/1",
    "ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/2",
    "ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/3",
  ];
  const accessURIs = rewardURIs;
  const rewardSupplies: number[] = [5, 25, 60];
  const openStartAndEnd: number = 0;
  const rewardsPerOpen: number = 1;

  // Expected results
  let expectedPackId: number;

  // Fund `Pack` with LINK
  const fundPack = async () => {
    const { linkTokenAddress } = chainlinkVars.rinkeby;

    const linkHolderAddress = "0xa7a82dd06901f29ab14af63faf3358ad101724a8";
    await impersonate(linkHolderAddress);
    const linkHolder = await ethers.getSigner(linkHolderAddress);

    const linkContract = await ethers.getContractAt(linkTokenABi, linkTokenAddress);
    linkContract.connect(linkHolder).transfer(pack.address, ethers.utils.parseEther("1"));
  };

  beforeEach(async () => {
    // Get signers
    const networkName: string = "rinkeby";
    await forkFrom(9075707, "rinkeby");

    const signers: SignerWithAddress[] = await ethers.getSigners();
    [creator, relayer] = signers;

    // Get contracts
    [pack, accessNft, forwarder] = await getContracts(creator, networkName, ["Pack", "AccessNFT", "Forwarder"]);

    // Get expected packId
    expectedPackId = await pack.nextTokenId();

    // Create access packs
    await accessNft
      .connect(creator)
      .createAccessPack(
        pack.address,
        rewardURIs,
        accessURIs,
        rewardSupplies,
        packURI,
        openStartAndEnd,
        openStartAndEnd,
        rewardsPerOpen,
      );

    // Fund `Pack` with LINK
    await fundPack();
  });

  describe("Revert");
  describe("Events");
  describe("Balances");
  describe("Contract state");
});
