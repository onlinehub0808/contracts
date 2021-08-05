// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IProtocolControl {
  /// @dev Returns whether the pack protocol is paused.
  function systemPaused() external view returns (bool);
}

interface IListingAsset {
  function creator(uint _tokenId) external view returns (address _creator);
}

contract Market is IERC1155Receiver, ReentrancyGuard {

  /// @dev The pack protocol admin contract.
  IProtocolControl internal controlCenter;

  /// @dev Pack protocol module names.
  string public constant PACK = "PACK";

  /// @dev Pack protocol fee constants.
  uint public constant MAX_BPS = 10000; // 100%
  uint public protocolFeeBps = 500; // 5%
  uint public creatorFeeBps = 500; // 5%

  struct Listing {
    address seller;

    address assetContract;
    uint tokenId;

    uint quantity;
    address currency;
    uint pricePerToken;

    uint saleStart;
    uint saleEnd;
  }

  /// @dev seller address => total number of listings.
  mapping(address => uint) public totalListings;

  /// @dev seller address => listingId => listing info.
  mapping(address => mapping(uint => Listing)) public listings;

  /// @dev Events
  event NewListing(address indexed assetContract, address indexed seller, Listing listing);
  event ListingUpdate(address indexed seller, uint indexed listingId, Listing lisitng);
  event NewSale(address indexed assetContract, address indexed seller, uint indexed listingId, address buyer, Listing listing);

  /// @dev Checks whether Pack protocol is paused.
  modifier onlyUnpausedProtocol() {
    require(!controlCenter.systemPaused(), "Market: The pack protocol is paused.");
    _;
  }

  /// @dev Check whether the listing exists.
  modifier onlyExistingListing(address _seller, uint _listingId) {
    require(listings[_seller][_listingId].seller != address(0), "Market: The listing does not exist.");
    _;
  }

  constructor(address _controlCenter) {
    controlCenter = IProtocolControl(_controlCenter);
  }

  /**
  *   ERC 1155 Receiver functions.
  **/

  function onERC1155Received(address, address, uint256, uint256, bytes memory) public virtual override returns (bytes4) {
    return this.onERC1155Received.selector;
  }

  function onERC1155BatchReceived(address, address, uint256[] memory, uint256[] memory, bytes memory) public virtual override returns (bytes4) {
    return this.onERC1155BatchReceived.selector;
  }

  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == type(IERC1155Receiver).interfaceId;
  }

  /**
  *   External functions.
  **/

  /// @notice List a given amount of pack or reward tokens for sale.
  function list(
    address _assetContract, 
    uint _tokenId,

    address _currency,
    uint _pricePerToken,
    uint _quantity,

    uint _secondsUntilStart,
    uint _secondsUntilEnd
  ) external onlyUnpausedProtocol {

    require(_quantity > 0, "Market: must list at least one token.");
    require(
      IERC1155(_assetContract).isApprovedForAll(msg.sender, address(this)),
      "Market: must approve the market to transfer tokens being listed."
    );

    // Transfer tokens being listed to Pack Protocol's asset safe.
    IERC1155(_assetContract).safeTransferFrom(
      msg.sender,
      address(this),
      _tokenId,
      _quantity,
      ""
    );

    // Get listing ID.
    uint listingId = totalListings[msg.sender];
    totalListings[msg.sender] += 1;

    // Create listing.
    Listing memory newListing = Listing({
      seller: msg.sender,
      assetContract: _assetContract,
      tokenId: _tokenId,
      currency: _currency,
      pricePerToken: _pricePerToken,
      quantity: _quantity,
      saleStart: block.timestamp + _secondsUntilStart,
      saleEnd: _secondsUntilEnd == 0 ? type(uint256).max : block.timestamp + _secondsUntilEnd
    });

    listings[msg.sender][listingId] = newListing;

    emit NewListing(_assetContract, msg.sender, newListing);
  }

  /// @notice Unlist `_quantity` amount of tokens.
  function unlist(uint _listingId, uint _quantity) external onlyExistingListing(msg.sender, _listingId) {

    Listing memory listing = listings[msg.sender][_listingId];

    require(listing.quantity >= _quantity, "Market: cannot unlist more tokens than are listed.");

    // Transfer way tokens being unlisted.
    IERC1155(listing.assetContract).safeTransferFrom(address(this), msg.sender, listing.tokenId, _quantity, "");

    // Update listing info.
    listing.quantity -= _quantity;
    listings[msg.sender][_listingId] = listing;

    emit ListingUpdate(msg.sender, _listingId, listing);
  }

  /// @notice Lets a seller add tokens to an existing listing.
  function addToListing(uint _listingId, uint _quantity) external onlyUnpausedProtocol onlyExistingListing(msg.sender, _listingId) {
    
    Listing memory listing = listings[msg.sender][_listingId];

    require(_quantity > 0, "Market: must add at least one token.");
    require(
      IERC1155(listing.assetContract).isApprovedForAll(msg.sender, address(this)),
      "Market: must approve the market to transfer tokens being added."
    );

    // Transfer tokens being listed to Pack Protocol's asset manager.
    IERC1155(listing.assetContract).safeTransferFrom(
      msg.sender,
      address(this),
      listing.tokenId,
      _quantity,
      ""
    );

    // Update listing info.
    listing.quantity += _quantity;
    listings[msg.sender][_listingId] = listing;

    emit ListingUpdate(msg.sender, _listingId, listing);
  }

  /// @notice Lets a seller change the currency or price of a listing.
  function updateListingParams(
    uint _listingId, 
    uint _pricePerToken, 
    address _currency, 
    uint _secondsUntilStart, 
    uint _secondsUntilEnd
  ) external onlyExistingListing(msg.sender, _listingId) {

    Listing memory listing = listings[msg.sender][_listingId];

    // Update listing info.
    listing.pricePerToken = _pricePerToken;
    listing.currency = _currency;
    listing.saleStart = _secondsUntilStart;
    listing.saleEnd = _secondsUntilEnd;

    listings[msg.sender][_listingId] = listing;

    emit ListingUpdate(msg.sender, _listingId, listing);
  }

  /// @notice Lets buyer buy a given amount of tokens listed for sale.
  function buy(address _seller, uint _listingId, uint _quantity) external nonReentrant onlyExistingListing(_seller, _listingId) {

    // Get listing
    Listing memory listing = listings[_seller][_listingId];

    require(_quantity > 0 && _quantity <= listing.quantity, "Market: must buy an appropriate amount of tokens.");
    require(
      block.timestamp <= listing.saleEnd && block.timestamp >= listing.saleStart,
      "Market: the sale has either not started or closed."
    );

    // Transfer tokens being bought to buyer.
    IERC1155(listing.assetContract).safeTransferFrom(address(this), msg.sender, listing.tokenId, _quantity, "");

    // Update listing info.
    listing.quantity -= _quantity;
    listings[_seller][_listingId] = listing;

    // Get token creator.
    address creator = IListingAsset(listing.assetContract).creator(listing.tokenId);

    // Get value distribution parameters.
    uint totalPrice = listing.pricePerToken * _quantity;
    require(
      IERC20(listing.currency).allowance(msg.sender, address(this)) >= totalPrice, 
      "Market: must approve Market to transfer price to pay."
    );

    uint protocolCut = (totalPrice * protocolFeeBps) / MAX_BPS;
    uint creatorCut = _seller == creator ? 0 : (totalPrice * creatorFeeBps) / MAX_BPS;
    uint sellerCut = totalPrice - protocolCut - creatorCut;

    // Distribute relveant shares of sale value to seller, creator and protocol.
    require(IERC20(listing.currency).transferFrom(msg.sender, address(controlCenter), protocolCut), "Market: failed to transfer protocol cut.");
    require(IERC20(listing.currency).transferFrom(msg.sender, _seller, sellerCut), "Market: failed to transfer seller cut.");
    require(IERC20(listing.currency).transferFrom(msg.sender, creator, creatorCut), "Market: failed to transfer creator cut.");

    emit NewSale(listing.assetContract, _seller, _listingId,  msg.sender, listing);
  }

  /// @notice Returns the total number of listings created by seller.
  function getTotalNumOfListings(address _seller) external view returns (uint numOfListings) {
    numOfListings = totalListings[_seller];
  }

  /// @notice Returns the listing for the given seller and Listing ID.
  function getListing(address _seller, uint _listingId) external view returns (Listing memory listing) {
    listing = listings[_seller][_listingId];
  }
}