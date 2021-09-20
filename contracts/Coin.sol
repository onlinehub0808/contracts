// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.0;

// Token + Access Control
import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

// Protocol control center.
import { ProtocolControl } from "./ProtocolControl.sol";

// Meta transactions
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { Forwarder } from "./Forwarder.sol";

contract Coin is ERC20PresetMinterPauser, ERC2771Context {
    /// @dev The protocol control center.
    ProtocolControl internal controlCenter;

    /// @dev Collection level metadata.
    string public _contractURI;

    /// @dev Checks whether the protocol is paused.
    modifier onlyProtocolAdmin() {
        require(
            controlCenter.hasRole(controlCenter.PROTOCOL_ADMIN(), _msgSender()),
            "Pack: only a protocol admin can call this function."
        );
        _;
    }

    constructor(
        address _controlCenter,
        string memory _name,
        string memory _symbol,
        address _trustedForwarder,
        string memory _uri
    ) ERC20PresetMinterPauser(_name, _symbol) ERC2771Context(_trustedForwarder) {
        // Set the protocol control center
        controlCenter = ProtocolControl(_controlCenter);

        // Set contract URI
        _contractURI = _uri;
    }

    /// @dev Returns the URI for the storefront-level metadata of the contract.
    function contractURI() public view returns (string memory) {
        return _contractURI;
    }

    /// @dev Sets contract URI for the storefront-level metadata of the contract.
    function setContractURI(string calldata _URI) external onlyProtocolAdmin {
        _contractURI = _URI;
    }

    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}