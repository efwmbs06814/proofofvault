// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ProofOfVaultTypes} from "../libraries/ProofOfVaultTypes.sol";

interface IAgentStaking {
    function isActiveAgent(address agent) external view returns (bool);
    function freeStakeOf(address agent) external view returns (uint256);
    function creditRewardStake(address agent, uint256 amount) external;
    function taskBondOf(address agent, uint256 vaultId, ProofOfVaultTypes.CommitteeRole role)
        external
        view
        returns (ProofOfVaultTypes.TaskBondRecord memory);
    function lockTaskBond(address agent, uint256 vaultId, ProofOfVaultTypes.CommitteeRole role, uint256 amount) external;
    function releaseTaskBond(address agent, uint256 vaultId, ProofOfVaultTypes.CommitteeRole role) external;
    function slashTaskBond(
        address agent,
        uint256 vaultId,
        ProofOfVaultTypes.CommitteeRole role,
        uint256 amount,
        ProofOfVaultTypes.SlashReasonCode reasonCode,
        address receiver,
        bytes32 incidentHash
    ) external;
}
