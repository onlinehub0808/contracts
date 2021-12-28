import { ethers } from "hardhat";
import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";

// Contract Types
import { LazyMintERC20, ClaimConditionStruct } from "typechain/LazyMintERC20";

// Types
import { BigNumber, BytesLike } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

// Test utils
import { getContracts, Contracts } from "../../../../utils/tests/getContracts";
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";

use(solidity);

describe("Test: claim lazy minted tokens with native tokens", function () {
  // Constants
  const NATIVE_TOKEN_ADDRESS: string = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

  // Signers
  let protocolProvider: SignerWithAddress;
  let protocolAdmin: SignerWithAddress;
  let claimer: SignerWithAddress;

  // Contracts
  let lazyMintERC20: LazyMintERC20;

  // Setting mint conditions default params
  let mintConditions: ClaimConditionStruct[];

  // Claim params
  let proof: BytesLike[];
  let quantityToClaim: BigNumber;
  let totalPrice: BigNumber;

  // Test params
  let targetMintConditionIndex: BigNumber;
  let royaltyTreasury: string;

  // Helper functions

  const timeTravelToMintCondition = async (_conditionIndex: BigNumber) => {
    // Time travel
    const travelTo: string = (await lazyMintERC20.getClaimConditionAtIndex(_conditionIndex)).startTimestamp.toString();
    await ethers.provider.send("evm_mine", [parseInt(travelTo)]);
  };

  before(async () => {
    [protocolProvider, protocolAdmin, claimer] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const contracts: Contracts = await getContracts(protocolProvider, protocolAdmin);
    lazyMintERC20 = contracts.lazyMintERC20;
    royaltyTreasury = contracts.protocolControl.address;

    // Set claim params
    quantityToClaim = BigNumber.from(10);
    totalPrice = quantityToClaim.mul(ethers.utils.parseEther("0.1"));

    // Generate a merkle root for whitelisting
    const leaves = [claimer.address].map(x => keccak256(ethers.utils.solidityPack(["address", "uint256"], [claimer.address, quantityToClaim])));
    const tree = new MerkleTree(leaves, keccak256);
    const whitelist = tree.getRoot();
    proof = tree.getProof(claimer.address);

    // Set mint conditions
    const templateMintCondition: ClaimConditionStruct = {
      startTimestamp: BigNumber.from((await ethers.provider.getBlock("latest")).timestamp).add(100),
      maxClaimableSupply: BigNumber.from(15),
      supplyClaimed: BigNumber.from(0),
      waitTimeInSecondsBetweenClaims: BigNumber.from(100),
      merkleRoot: whitelist,
      pricePerToken: ethers.utils.parseEther("0.1"),
      currency: NATIVE_TOKEN_ADDRESS,
    };

    mintConditions = [...Array(5).keys()]
      .map((val: number) => val * 500)
      .map((val: number) => {
        return {
          ...templateMintCondition,
          startTimestamp: (templateMintCondition.startTimestamp as BigNumber).add(val),
        };
      });

      console.log("1")

    // Set mint conditions
    await lazyMintERC20.connect(protocolAdmin).setClaimConditions(mintConditions);

    console.log("2")

    // Travel to mint condition start
    targetMintConditionIndex = BigNumber.from(0);
    await timeTravelToMintCondition(targetMintConditionIndex);
  });

  describe("Revert cases", function () {
    it("Should revert if quantity wanted is zero", async () => {
      const invalidQty: BigNumber = BigNumber.from(0);
      await expect(lazyMintERC20.connect(claimer).claim(invalidQty, proof, { value: totalPrice })).to.be.revertedWith(
        "invalid quantity claimed.",
      );
    });

    it("Should revert if quantity wanted + current mint supply exceeds max mint supply", async () => {
      let supplyClaimed: BigNumber = BigNumber.from(0);
      const maxClaimableSupply: BigNumber = mintConditions[0].maxClaimableSupply as BigNumber;

      while (supplyClaimed.lt(maxClaimableSupply)) {
        if (supplyClaimed.add(quantityToClaim).gt(maxClaimableSupply)) {
          await expect(
            lazyMintERC20.connect(claimer).claim(quantityToClaim, proof, { value: totalPrice }),
          ).to.be.revertedWith("invalid quantity claimed.");

          break;
        }

        await lazyMintERC20.connect(claimer).claim(quantityToClaim, proof, { value: totalPrice });

        const nextValidTimestampForClaim: BigNumber = await lazyMintERC20.getTimestampForNextValidClaim(
          targetMintConditionIndex,
          claimer.address,
        );

        await ethers.provider.send("evm_mine", [nextValidTimestampForClaim.toNumber()]);

        supplyClaimed = supplyClaimed.add(quantityToClaim);
      }
    });

    it("Should revert if claimer claims before valid timestamp for transaction", async () => {
      await lazyMintERC20.connect(claimer).claim(quantityToClaim, proof, { value: totalPrice });

      await expect(
        lazyMintERC20.connect(claimer).claim(quantityToClaim, proof, { value: totalPrice }),
      ).to.be.revertedWith("cannot claim yet.");
    });

    it("Should revert if claimer is not in the whitelist", async () => {
      await expect(
        lazyMintERC20.connect(protocolAdmin).claim(quantityToClaim, proof, { value: totalPrice }),
      ).to.be.revertedWith("not in whitelist.");
    });

    it("Should revert if caller has not sent enough native token", async () => {
      await expect(lazyMintERC20.connect(claimer).claim(quantityToClaim, proof)).to.be.revertedWith(
        "must send total price.",
      );
    });
  });

  describe("Events", function () {
    it("Should emit ClaimedTokens", async () => {
      await expect(lazyMintERC20.connect(claimer).claim(quantityToClaim, proof, { value: totalPrice }))
        .to.emit(lazyMintERC20, "ClaimedTokens")
        .withArgs(
          ...Object.values({
            mintConditionIndex: targetMintConditionIndex,
            claimer: claimer.address,
            quantityClaimed: quantityToClaim,
          }),
        );
    });
  });

  describe("Balances", function () {
    it("Should increase the claimer's balance of the tokens claimed", async () => {
      const claimerBalBefore: BigNumber = await lazyMintERC20.balanceOf(claimer.address);
      await lazyMintERC20.connect(claimer).claim(quantityToClaim, proof, { value: totalPrice });
      const claimerBalAfter: BigNumber = await lazyMintERC20.balanceOf(claimer.address);

      expect(claimerBalAfter).to.equal(claimerBalBefore.add(quantityToClaim));
    });

    it("Should decrease the currency balance of the claimer", async () => {
      const claimerBalBefore: BigNumber = await ethers.provider.getBalance(claimer.address);

      const gasPrice: BigNumber = ethers.utils.parseUnits("10", "gwei");
      const tx = await lazyMintERC20.connect(claimer).claim(quantityToClaim, proof, { value: totalPrice, gasPrice });
      const gasUsed: BigNumber = (await tx.wait()).gasUsed;
      const gasPaid: BigNumber = gasPrice.mul(gasUsed);

      const claimerBalAfter: BigNumber = await ethers.provider.getBalance(claimer.address);

      expect(claimerBalAfter).to.equal(claimerBalBefore.sub(totalPrice.add(gasPaid)));
    });

    it("Should distribute the sale value to the relevant stakeholders", async () => {
      // Set fees to 5 %
      const MAX_BPS: BigNumber = BigNumber.from(10_000);
      const feeBps: BigNumber = BigNumber.from(500);
      await lazyMintERC20.connect(protocolAdmin).setFeeBps(feeBps);

      const fees: BigNumber = totalPrice.mul(feeBps).div(MAX_BPS);
      const feeRecipient: string = royaltyTreasury;

      const remainder: BigNumber = totalPrice.sub(fees);
      const remainderRecipient: string = protocolAdmin.address;

      const feeRecipientBalBefore: BigNumber = await ethers.provider.getBalance(feeRecipient);
      const remainderRecipientBalBefore: BigNumber = await ethers.provider.getBalance(remainderRecipient);

      await lazyMintERC20.connect(claimer).claim(quantityToClaim, proof, { value: totalPrice });

      const feeRecipientBalAfter: BigNumber = await ethers.provider.getBalance(feeRecipient);
      const remainderRecipientBalAfter: BigNumber = await ethers.provider.getBalance(remainderRecipient);

      expect(feeRecipientBalAfter).to.equal(feeRecipientBalBefore.add(fees));
      expect(remainderRecipientBalAfter).to.equal(remainderRecipientBalBefore.add(remainder));
    });
  });

  describe("Contract state", function () {
    it("Should update the supply minted during the claim condition", async () => {
      const currenMintSupplyBefore = (await lazyMintERC20.getClaimConditionAtIndex(targetMintConditionIndex))
        .supplyClaimed;
      await lazyMintERC20.connect(claimer).claim(quantityToClaim, proof, { value: totalPrice });
      const currenMintSupplyAfter = (await lazyMintERC20.getClaimConditionAtIndex(targetMintConditionIndex))
        .supplyClaimed;

      expect(currenMintSupplyAfter).to.equal(currenMintSupplyBefore.add(quantityToClaim));
    });
    it("Should update the next valid timestamp for claim, for the claimer", async () => {
      const waitBetweenClaims: BigNumber = (await lazyMintERC20.getClaimConditionAtIndex(targetMintConditionIndex))
        .waitTimeInSecondsBetweenClaims;
      await lazyMintERC20.connect(claimer).claim(quantityToClaim, proof, { value: totalPrice });

      const currentTimestamp: BigNumber = BigNumber.from((await ethers.provider.getBlock("latest")).timestamp);
      const expectedNextValidTimestamp: BigNumber = currentTimestamp.add(waitBetweenClaims);

      expect(await lazyMintERC20.getTimestampForNextValidClaim(targetMintConditionIndex, claimer.address)).to.equal(
        expectedNextValidTimestamp,
      );
    });
  });
});
