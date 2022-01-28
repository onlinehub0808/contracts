// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

interface IThirdwebRestrictedTransfer {
    /// @dev Returns whether transfers on tokens are restricted.
    function isTransferRestricted() external view returns (bool);

    /// @dev Lets a module admin restrict token transfers.
    function setRestrictedTransfer(bool _toRestrictTransfer) external;
}

