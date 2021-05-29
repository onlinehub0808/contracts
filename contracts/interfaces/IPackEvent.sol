// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

interface IPackEvent {
  event PackCreated(address indexed creator, uint indexed tokenId, string tokenUri, uint maxSupply);
  event RewardAdded(address indexed creator, uint indexed packId, uint rewardTokenId, string rewardTokenUri);
  event PackOpened(address indexed owner, uint indexed tokenId);
  event RewardDistributed(address indexed receiver, uint indexed packID, uint indexed rewardTokenId);

  event TransferSinglePack(address indexed from, address indexed to, uint indexed tokenId, uint amount);
  event TransferSingleReward(address indexed from, address indexed to, uint indexed tokenId, uint amount);
  event TransferBatchPacks(address indexed from, address indexed to, uint[] ids, uint[] values);
  event TransferBatchRewards(address indexed from, address indexed to, uint[] ids, uint[] values); 
}
