// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "./interfaces/IERC20.sol";
import {Ownable} from "./utils/Ownable.sol";
import {SafeTransferLib} from "./utils/SafeTransferLib.sol";
import {ProofOfVaultTypes} from "./libraries/ProofOfVaultTypes.sol";

contract FeeManager is Ownable {
    using SafeTransferLib for IERC20;

    error InvalidFeeBps(uint16 feeBps);
    error InvalidCollector(address collector);
    error InvalidAmount();
    error InvalidRole();
    error InvalidTokenTransfer(uint256 received, uint256 expected);

    uint16 public constant MAX_BPS = 10_000;

    address public treasury;
    address public burnAddress;
    address public proofFeeToken;

    uint16 public creationFeeBps;
    uint16 public settlementFeeBps;
    uint256 public proofSubmissionFee;

    /// @notice Minimum native OKB setup deposit required when a setter creates a V2 vault request.
    uint256 public setupDepositAmount;
    uint256 public resolutionRewardDepositAmount;
    uint256 public challengeBondAmount;
    uint256 public ruleMakerBondAmount;
    uint256 public ruleVerifierBondAmount;
    uint256 public resolutionValidatorBondAmount;
    uint256 public resolutionAuditorBondAmount;

    uint256 public ruleMakerBaseReward;
    uint256 public ruleMakerApprovalBonusReward;
    uint256 public validatorBaseReward;
    uint256 public validatorQualityReward;
    uint256 public validatorConsensusReward;
    uint256 public validatorQuestionableReward;
    uint256 public auditorBaseReward;
    uint256 public auditorHighValueReward;
    uint256 public challengerSuccessReward;
    uint16 public challengeFailureSlashBps;

    mapping(ProofOfVaultTypes.IssueSeverity severity => uint256 amount) private _ruleVerifierRewards;
    mapping(address collector => bool allowed) public authorizedCollectors;

    event TreasuryUpdated(address indexed treasury);
    event BurnAddressUpdated(address indexed burnAddress);
    event ProofFeeTokenUpdated(address indexed token);
    event CreationFeeUpdated(uint16 feeBps);
    event SettlementFeeUpdated(uint16 feeBps);
    event ProofSubmissionFeeUpdated(uint256 fee);
    event V2DepositConfigUpdated(uint256 minimumSetupDeposit, uint256 resolutionRewardDeposit, uint256 challengeBond);
    event V2BondConfigUpdated(
        uint256 ruleMakerBond, uint256 ruleVerifierBond, uint256 resolutionValidatorBond, uint256 resolutionAuditorBond
    );
    event V2RewardConfigUpdated(
        uint256 ruleMakerBase,
        uint256 ruleMakerApprovalBonus,
        uint256 validatorBase,
        uint256 validatorQuality,
        uint256 validatorConsensus,
        uint256 validatorQuestionable,
        uint256 auditorBase,
        uint256 auditorHighValue,
        uint256 challengerSuccess,
        uint16 challengeFailureSlashBps
    );
    event RuleVerifierRewardUpdated(ProofOfVaultTypes.IssueSeverity indexed severity, uint256 amount);
    event CollectorAuthorizationUpdated(address indexed collector, bool allowed);
    event ProofFeeCollected(address indexed payer, address indexed token, uint256 amount);

    constructor(
        address initialOwner,
        address treasury_,
        address burnAddress_,
        address proofFeeToken_,
        uint16 creationFeeBps_,
        uint16 settlementFeeBps_,
        uint256 proofSubmissionFee_
    ) Ownable(initialOwner) {
        _setTreasury(treasury_);
        _setBurnAddress(burnAddress_);
        _setProofFeeToken(proofFeeToken_);
        _setCreationFeeBps(creationFeeBps_);
        _setSettlementFeeBps(settlementFeeBps_);
        proofSubmissionFee = proofSubmissionFee_;
        emit ProofSubmissionFeeUpdated(proofSubmissionFee_);
    }

    modifier onlyCollector() {
        if (!authorizedCollectors[msg.sender]) {
            revert InvalidCollector(msg.sender);
        }
        _;
    }

    function setTreasury(address treasury_) external onlyOwner {
        _setTreasury(treasury_);
    }

    function setBurnAddress(address burnAddress_) external onlyOwner {
        _setBurnAddress(burnAddress_);
    }

    function setProofFeeToken(address proofFeeToken_) external onlyOwner {
        _setProofFeeToken(proofFeeToken_);
    }

    function setCreationFeeBps(uint16 creationFeeBps_) external onlyOwner {
        _setCreationFeeBps(creationFeeBps_);
    }

    function setSettlementFeeBps(uint16 settlementFeeBps_) external onlyOwner {
        _setSettlementFeeBps(settlementFeeBps_);
    }

    function setProofSubmissionFee(uint256 proofSubmissionFee_) external onlyOwner {
        proofSubmissionFee = proofSubmissionFee_;
        emit ProofSubmissionFeeUpdated(proofSubmissionFee_);
    }

    function setV2DepositConfig(
        uint256 setupDepositAmount_,
        uint256 resolutionRewardDepositAmount_,
        uint256 challengeBondAmount_
    ) external onlyOwner {
        if (setupDepositAmount_ == 0 || resolutionRewardDepositAmount_ == 0 || challengeBondAmount_ == 0) {
            revert InvalidAmount();
        }

        setupDepositAmount = setupDepositAmount_;
        resolutionRewardDepositAmount = resolutionRewardDepositAmount_;
        challengeBondAmount = challengeBondAmount_;

        emit V2DepositConfigUpdated(setupDepositAmount_, resolutionRewardDepositAmount_, challengeBondAmount_);
    }

    function setV2BondConfig(
        uint256 ruleMakerBondAmount_,
        uint256 ruleVerifierBondAmount_,
        uint256 resolutionValidatorBondAmount_,
        uint256 resolutionAuditorBondAmount_
    ) external onlyOwner {
        if (
            ruleMakerBondAmount_ == 0 || ruleVerifierBondAmount_ == 0 || resolutionValidatorBondAmount_ == 0
                || resolutionAuditorBondAmount_ == 0
        ) {
            revert InvalidAmount();
        }

        ruleMakerBondAmount = ruleMakerBondAmount_;
        ruleVerifierBondAmount = ruleVerifierBondAmount_;
        resolutionValidatorBondAmount = resolutionValidatorBondAmount_;
        resolutionAuditorBondAmount = resolutionAuditorBondAmount_;

        emit V2BondConfigUpdated(
            ruleMakerBondAmount_, ruleVerifierBondAmount_, resolutionValidatorBondAmount_, resolutionAuditorBondAmount_
        );
    }

    function setV2RewardConfig(
        uint256 ruleMakerBaseReward_,
        uint256 ruleMakerApprovalBonusReward_,
        uint256 validatorBaseReward_,
        uint256 validatorQualityReward_,
        uint256 validatorConsensusReward_,
        uint256 validatorQuestionableReward_,
        uint256 auditorBaseReward_,
        uint256 auditorHighValueReward_,
        uint256 challengerSuccessReward_,
        uint16 challengeFailureSlashBps_
    ) external onlyOwner {
        if (
            ruleMakerBaseReward_ == 0 || validatorBaseReward_ == 0 || auditorBaseReward_ == 0
                || challengerSuccessReward_ == 0 || challengeFailureSlashBps_ > MAX_BPS
        ) {
            revert InvalidAmount();
        }

        ruleMakerBaseReward = ruleMakerBaseReward_;
        ruleMakerApprovalBonusReward = ruleMakerApprovalBonusReward_;
        validatorBaseReward = validatorBaseReward_;
        validatorQualityReward = validatorQualityReward_;
        validatorConsensusReward = validatorConsensusReward_;
        validatorQuestionableReward = validatorQuestionableReward_;
        auditorBaseReward = auditorBaseReward_;
        auditorHighValueReward = auditorHighValueReward_;
        challengerSuccessReward = challengerSuccessReward_;
        challengeFailureSlashBps = challengeFailureSlashBps_;

        emit V2RewardConfigUpdated(
            ruleMakerBaseReward_,
            ruleMakerApprovalBonusReward_,
            validatorBaseReward_,
            validatorQualityReward_,
            validatorConsensusReward_,
            validatorQuestionableReward_,
            auditorBaseReward_,
            auditorHighValueReward_,
            challengerSuccessReward_,
            challengeFailureSlashBps_
        );
    }

    function setRuleVerifierRewards(uint256 low, uint256 medium, uint256 high, uint256 critical) external onlyOwner {
        if (low == 0 || medium == 0 || high == 0 || critical == 0) {
            revert InvalidAmount();
        }

        _ruleVerifierRewards[ProofOfVaultTypes.IssueSeverity.Low] = low;
        _ruleVerifierRewards[ProofOfVaultTypes.IssueSeverity.Medium] = medium;
        _ruleVerifierRewards[ProofOfVaultTypes.IssueSeverity.High] = high;
        _ruleVerifierRewards[ProofOfVaultTypes.IssueSeverity.Critical] = critical;

        emit RuleVerifierRewardUpdated(ProofOfVaultTypes.IssueSeverity.Low, low);
        emit RuleVerifierRewardUpdated(ProofOfVaultTypes.IssueSeverity.Medium, medium);
        emit RuleVerifierRewardUpdated(ProofOfVaultTypes.IssueSeverity.High, high);
        emit RuleVerifierRewardUpdated(ProofOfVaultTypes.IssueSeverity.Critical, critical);
    }

    function setCollector(address collector, bool allowed) external onlyOwner {
        if (collector == address(0)) {
            revert InvalidCollector(address(0));
        }

        authorizedCollectors[collector] = allowed;
        emit CollectorAuthorizationUpdated(collector, allowed);
    }

    function setProofFeeCollector(address collector, bool allowed) external onlyOwner {
        if (collector == address(0)) {
            revert InvalidCollector(address(0));
        }

        authorizedCollectors[collector] = allowed;
        emit CollectorAuthorizationUpdated(collector, allowed);
    }

    function previewCreationFee(uint256 collateralAmount) public view returns (uint256) {
        return _bps(collateralAmount, creationFeeBps);
    }

    function previewSettlementFee(uint256 collateralAmount) public view returns (uint256) {
        return _bps(collateralAmount, settlementFeeBps);
    }

    function previewSetupDeposit() external view returns (uint256) {
        return setupDepositAmount;
    }

    function previewResolutionRewardDeposit() external view returns (uint256) {
        return resolutionRewardDepositAmount;
    }

    function previewChallengeBond() external view returns (uint256) {
        return challengeBondAmount;
    }

    function bondForRole(ProofOfVaultTypes.CommitteeRole role) external view returns (uint256) {
        if (role == ProofOfVaultTypes.CommitteeRole.RuleMaker) {
            return ruleMakerBondAmount;
        }
        if (role == ProofOfVaultTypes.CommitteeRole.RuleVerifier) {
            return ruleVerifierBondAmount;
        }
        if (role == ProofOfVaultTypes.CommitteeRole.ResolutionValidator) {
            return resolutionValidatorBondAmount;
        }
        if (role == ProofOfVaultTypes.CommitteeRole.ResolutionAuditor) {
            return resolutionAuditorBondAmount;
        }
        revert InvalidRole();
    }

    function ruleVerifierReward(ProofOfVaultTypes.IssueSeverity severity) external view returns (uint256) {
        return _ruleVerifierRewards[severity];
    }

    function collectProofFee(address payer) external onlyCollector returns (uint256 collected) {
        collected = proofSubmissionFee;
        if (collected == 0) {
            return 0;
        }

        IERC20 token = IERC20(proofFeeToken);
        uint256 burnBalanceBefore = token.balanceOf(burnAddress);
        token.safeTransferFrom(payer, burnAddress, collected);
        uint256 received = token.balanceOf(burnAddress) - burnBalanceBefore;
        if (received != collected) revert InvalidTokenTransfer(received, collected);
        emit ProofFeeCollected(payer, proofFeeToken, collected);
    }

    function _setTreasury(address treasury_) internal {
        if (treasury_ == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }

        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function _setBurnAddress(address burnAddress_) internal {
        if (burnAddress_ == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }

        burnAddress = burnAddress_;
        emit BurnAddressUpdated(burnAddress_);
    }

    function _setProofFeeToken(address proofFeeToken_) internal {
        if (proofFeeToken_ == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }

        proofFeeToken = proofFeeToken_;
        emit ProofFeeTokenUpdated(proofFeeToken_);
    }

    function _setCreationFeeBps(uint16 creationFeeBps_) internal {
        if (creationFeeBps_ > MAX_BPS) {
            revert InvalidFeeBps(creationFeeBps_);
        }

        creationFeeBps = creationFeeBps_;
        emit CreationFeeUpdated(creationFeeBps_);
    }

    function _setSettlementFeeBps(uint16 settlementFeeBps_) internal {
        if (settlementFeeBps_ > MAX_BPS) {
            revert InvalidFeeBps(settlementFeeBps_);
        }

        settlementFeeBps = settlementFeeBps_;
        emit SettlementFeeUpdated(settlementFeeBps_);
    }

    function _bps(uint256 amount, uint16 feeBps) internal pure returns (uint256) {
        return (amount * feeBps) / MAX_BPS;
    }
}
