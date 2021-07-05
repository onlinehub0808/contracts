// SPDX-License-Identifier: GPL-3.0 

pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import "./ControlCenter.sol";
import "./Pack.sol";
import "./AssetSafe.sol";

import "./interfaces/RNGInterface.sol";

/**
 * The $PACK Protocol wraps arbitrary assets (ERC20, ERC721, ERC1155 tokens) into ERC 1155 reward tokens. These reward tokens are
 * bundled into ERC 1155 pack tokens. Opening a pack distributes a reward randomly selected from the pack to the opener. Both pack
 * and reward tokens can be airdropped or sold.
 */

contract Handler {

  ControlCenter internal controlCenter;

  string public constant PACK = "PACK";
  string public constant RNG = "RNG";
  string public constant ASSET_SAFE = "ASSET_SAFE";

  struct PackState {
    address rewardContract;
    uint[] rewardTokenIds;
    uint[] rarityNumerators;
  }

  struct RandomnessRequest {
    address packOpener;
    uint packId;
  }

  constructor(address _controlCenter) {
    controlCenter = ControlCenter(_controlCenter);
  }

  /// @dev Pack tokenId => Pack state.
  mapping(uint => PackState) internal packs;

  /// @dev RNG request Id => request state `RandomnessRequest`. 
  mapping(uint => RandomnessRequest) public randomnessRequests;

  /// @dev Creates a pack with rewards.
  function createPack(
    address _rewardContract,
    string calldata _packURI, 
    uint[] calldata _rewardIds, 
    uint[] calldata _amounts
  ) external returns (uint packTokenId) {

    // TODO : Check whether `_rewardContract` is IERC1155.
    require(_rewardIds.length == _amounts.length, "Must specify equal number of IDs and amounts.");
    require(
      IERC1155(_rewardContract).isApprovedForAll(msg.sender, address(this)), 
      "Must approve handler to transer the required reward tokens."
    );

    // Transfer ERC 1155 reward tokens Pack Protocol's asset manager.
    // Will revert if `msg.sender` does not own the given `_amounts` of reward tokens.
    IERC1155(_rewardContract).safeBatchTransferFrom(msg.sender, address(assetSafe()), _rewardIds, _amounts, "");

    // Get pack tokenId
    packTokenId = packToken()._tokenId();

    // Store pack state
    packs[packTokenId] = PackState({
      rewardContract: _rewardContract,
      rewardTokenIds: _rewardIds,
      rarityNumerators: _amounts
    });

    // Mint pack tokens to `msg.sender`
    packToken().mintToken(msg.sender, packTokenId, sumArr(_amounts), _packURI);
  }

  /// @notice Lets a pack token owner open a single pack
  function openPack(uint packId) external {
    require(packToken().balanceOf(msg.sender, packId) > 0, "Sender owns no packs of the given packId.");
    require(packToken().isApprovedForAll(msg.sender, address(this)), "Must approve handler to burn the pack.");

    if(rng().usingExternalService()) {

      // Approve RNG to handle fee amount of fee token.
      (address feeToken, uint feeAmount) = rng().getRequestFee();

      if(feeToken != address(0)) {
        require(
          IERC20(feeToken).approve(address(rng()), feeAmount),
          "Failed to approve rng to handle fee amount of fee token."
        );
      }

      // Request external service for a random number. Store the request ID and lockBlock.
      (uint requestId,) = rng().requestRandomNumber();

      randomnessRequests[requestId] = RandomnessRequest({
        packOpener: msg.sender,
        packId: packId
      });
      
    } else {
      
      (uint randomness,) = rng().getRandomNumber(block.number);
      
      distributeReward(
        msg.sender,
        packId, 
        getRandomReward(packId, randomness)
      );
    }
  }

  /// @dev Called by protocol RNG when using an external random number provider.
  function fulfillRandomness(uint requestId, uint randomness) external {
    require(msg.sender == address(rng()), "Only the appointed RNG can fulfill random number requests.");

    distributeReward(
      randomnessRequests[requestId].packOpener,
      randomnessRequests[requestId].packId,
      getRandomReward(randomnessRequests[requestId].packId, randomness)
    );
  }

  /// @dev returns a random reward tokenId using `randomness` provided by Chainlink VRF.
  function getRandomReward(uint packId, uint randomness) internal returns (uint rewardTokenId) {

    uint prob = randomness % sumArr(packs[packId].rarityNumerators);
    uint step = 0;

    for(uint i = 0; i < packs[packId].rewardTokenIds.length; i++) {
      if(prob < (packs[packId].rarityNumerators[i] + step)) {
        
        rewardTokenId = packs[packId].rewardTokenIds[i];
        packs[packId].rarityNumerators[i] -= 1;

        break;
      } else {
        step += packs[packId].rarityNumerators[i];
      }
    }
  }

  /// @dev Distributes a reward token to the pack opener.
  function distributeReward(address _receiver, uint _packId, uint _rewardId) internal {
    // Burn the opened pack.
    packToken().burn(_receiver, _packId, 1);

    // Mint the appropriate reward token.
    assetSafe().transferERC1155(packs[_packId].rewardContract, _receiver, _rewardId, 1);
  }

  /// @dev Returns pack protocol's reward ERC1155 contract.
  function packToken() internal view returns (Pack) {
    return Pack(controlCenter.getModule(PACK));
  }

  /// @dev Returns pack protocol's RNG.
  function rng() internal view returns (RNGInterface) {
    return RNGInterface(controlCenter.getModule(RNG));
  }

  /// @dev Returns pack protocol's asset manager address.
  function assetSafe() internal view returns (AssetSafe) {
    return AssetSafe(controlCenter.getModule(ASSET_SAFE));
  }

  /// @dev Returns the sum of all elements in the array
  function sumArr(uint[] memory arr) internal pure returns (uint sum) {
    for(uint i = 0; i < arr.length; i++) {
      sum += arr[i];
    }
  }
}