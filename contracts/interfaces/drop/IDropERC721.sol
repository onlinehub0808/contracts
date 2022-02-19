// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import "../IThirdwebContract.sol";
import "../IThirdwebPlatformFee.sol";
import "../IThirdwebPrimarySale.sol";
import "../IThirdwebRoyalty.sol";
import "../IThirdwebOwnable.sol";

/**
 *  `LazyMintERC721` is an ERC 721 contract.
 *
 *  It takes in a base URI for every `n` tokens lazy minted at once. The URI
 *  for each of the `n` tokens lazy minted is the provided baseURI + `${tokenId}`
 *  (e.g. "ipsf://Qmece.../1").
 *
 *  The module admin can create claim conditions with non-overlapping time windows,
 *  and accounts can claim the tokens, in a given time window, according to restrictions
 *  defined in that time window's claim conditions.
 */

interface IDropERC721 is
    IThirdwebContract,
    IThirdwebOwnable,
    IThirdwebRoyalty,
    IThirdwebPrimarySale,
    IThirdwebPlatformFee
{
    /**
     *  @notice The restrictions that make up a claim condition.
     *
     *  @param startTimestamp                 The unix timestamp after which the claim condition applies.
     *                                        The same claim condition applies until the `startTimestamp`
     *                                        of the next claim condition.
     *
     *  @param maxClaimableSupply             The maximum number of tokens that can
     *                                        be claimed under the claim condition.
     *
     *  @param supplyClaimed                  At any given point, the number of tokens that have been claimed.
     *
     *  @param quantityLimitPerTransaction    The maximum number of tokens a single account can
     *                                        claim in a single transaction.
     *
     *  @param waitTimeInSecondsBetweenClaims The least number of seconds an account must wait
     *                                        after claiming tokens, to be able to claim again.
     *
     *  @param merkleRoot                     Only accounts whitelisted by `merkleRoot` can claim tokens
     *                                        under the claim condition.
     *
     *  @param pricePerToken                  The price per token that can be claimed.
     *
     *  @param currency                       The currency in which `pricePerToken` must be paid.
     */
    struct ClaimCondition {
        uint256 startTimestamp;
        uint256 maxClaimableSupply;
        uint256 supplyClaimed;
        uint256 quantityLimitPerTransaction;
        uint256 waitTimeInSecondsBetweenClaims;
        bytes32 merkleRoot;
        uint256 pricePerToken;
        address currency;
    }

    /**
     *  @notice The set of all claim conditionsl, at any given moment.
     *
     *  @param totalConditionCount        Acts as the uid for each claim condition. Incremented
     *                                    by one every time a claim condition is created.
     *
     *  @param claimConditionAtIndex      The claim conditions at a given uid. Claim conditions
     *                                    are ordered in an ascending order by their `startTimestamp`.
     *
     *  @param timestampOfLastClaim       Account => uid for a claim condition => the last timestamp at
     *                                    which the account claimed tokens.
     */
    struct ClaimConditions {
        uint256 totalConditionCount;
        uint256 timstampLimitIndex;
        mapping(uint256 => ClaimCondition) claimConditionAtIndex;
        mapping(address => mapping(uint256 => uint256)) timestampOfLastClaim;
    }

    /// @dev Emitted when tokens are claimed.
    event ClaimedTokens(
        uint256 indexed claimConditionIndex,
        address indexed claimer,
        address indexed receiver,
        uint256 startTokenId,
        uint256 quantityClaimed
    );

    /// @dev Emitted when tokens are lazy minted.
    event LazyMintedTokens(uint256 startTokenId, uint256 endTokenId, string baseURI, bytes encryptedBaseURI);

    /// @dev Emitted when the URI for a batch of NFTs is revealed.
    event RevealedNFT(uint256 endTokenId, string revealedURI);

    /// @dev Emitted when new mint conditions are set for a token.
    event NewClaimConditions(ClaimCondition[] claimConditions);

    /// @dev Emitted when a new sale recipient is set.
    event NewPrimarySaleRecipient(address indexed recipient);

    /// @dev Emitted when fee on primary sales is updated.
    event PlatformFeeUpdates(address platformFeeRecipient, uint256 platformFeeBps);

    /// @dev Emitted when a new Owner is set.
    event NewOwner(address prevOwner, address newOwner);

    /// @dev Emitted when a max total supply is set for a token.
    event MaxTotalSupplyUpdated(uint256 maxTotalSupply);

    /// @dev Emitted when a wallet claim count is updated.
    event WalletClaimCountUpdated(address indexed wallet, uint256 count);

    /// @dev Emitted when the max wallet claim count is updated.
    event MaxWalletClaimCountUpdated(uint256 count);

    /**
     *  @notice Lets an account with `MINTER_ROLE` mint tokens of ID from `nextTokenIdToMint`
     *          to `nextTokenIdToMint + _amount - 1`. The URIs for these tokenIds is baseURI + `${tokenId}`.
     *
     *  @param _amount The amount of tokens (each with a unique tokenId) to lazy mint.
     *  @param _baseURIForTokens The URI for the tokenIds of NFTs minted is baseURI + `${tokenId}`.
     *  @param _encryptedBaseURI Optional -- for delayed-reveal NFTs.
     */
    function lazyMint(
        uint256 _amount,
        string calldata _baseURIForTokens,
        bytes calldata _encryptedBaseURI
    ) external;

    /**
     *  @notice Lets an account claim a given quantity of tokens.
     *
     *  @param receiver The receiver of the NFTs to claim.
     *  @param _quantity The quantity of tokens to claim.
     *  @param _currency The currency in which to pay for the claim.
     *  @param _pricePerToken The price per token to pay for the claim.
     *  @param _proofs The proof required to prove the account's inclusion in the merkle root whitelist
     *                 of the mint conditions that apply.
     *  @param _proofMaxQuantityPerTransaction The maximum claim quantity per transactions that included in the merkle proof.
     */
    function claim(
        address _receiver,
        uint256 _quantity,
        address _currency,
        uint256 _pricePerToken,
        bytes32[] calldata _proofs,
        uint256 _proofMaxQuantityPerTransaction
    ) external payable;

    /**
     *  @notice Lets a module admin (account with `DEFAULT_ADMIN_ROLE`) set claim conditions.
     *
     *  @param _conditions Mint conditions in ascending order by `startTimestamp`.
     */
    function setClaimConditions(ClaimCondition[] calldata _conditions, bool _resetRestriction) external;
}
