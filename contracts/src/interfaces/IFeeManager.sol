// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ProofOfVaultTypes} from "../libraries/ProofOfVaultTypes.sol";

interface IFeeManager {
    function treasury() external view returns (address);
    function burnAddress() external view returns (address);
    function proofFeeToken() external view returns (address);
    function proofSubmissionFee() external view returns (uint256);
    function previewCreationFee(uint256 collateralAmount) external view returns (uint256);
    function previewSettlementFee(uint256 collateralAmount) external view returns (uint256);
    function previewSetupDeposit() external view returns (uint256);
    function previewResolutionRewardDeposit() external view returns (uint256);
    function previewChallengeBond() external view returns (uint256);
    function bondForRole(ProofOfVaultTypes.CommitteeRole role) external view returns (uint256);
    function ruleMakerBaseReward() external view returns (uint256);
    function ruleMakerApprovalBonusReward() external view returns (uint256);
    function ruleVerifierReward(ProofOfVaultTypes.IssueSeverity severity) external view returns (uint256);
    function validatorBaseReward() external view returns (uint256);
    function validatorQualityReward() external view returns (uint256);
    function validatorConsensusReward() external view returns (uint256);
    function validatorQuestionableReward() external view returns (uint256);
    function auditorBaseReward() external view returns (uint256);
    function auditorHighValueReward() external view returns (uint256);
    function challengerSuccessReward() external view returns (uint256);
    function challengeFailureSlashBps() external view returns (uint16);
    function collectProofFee(address payer) external returns (uint256);
}
