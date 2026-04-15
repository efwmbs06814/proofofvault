// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "./utils/Ownable.sol";
import {ProofOfVaultTypes} from "./libraries/ProofOfVaultTypes.sol";

contract CommitteeRegistry is Ownable {
    error NotAuthorizedController(address caller);
    error InvalidVaultId(uint256 vaultId);
    error InvalidCommitteeMember(address member);
    error DuplicateCommitteeMember(address member);
    error InvalidDeadline();
    error InvalidMinValidCount(uint8 minValidCount);

    struct RuleCommitteeConfig {
        uint8 round;
        uint64 draftDeadline;
        uint64 issueDeadline;
        bool active;
    }

    struct ResolutionCommitteeConfig {
        uint8 round;
        uint64 commitDeadline;
        uint64 revealDeadline;
        uint64 auditDeadline;
        uint64 challengeDeadline;
        uint8 minValidCount;
        bool active;
    }

    mapping(address controller => bool allowed) public authorizedControllers;
    mapping(uint256 vaultId => RuleCommitteeConfig config) private _ruleCommittees;
    mapping(uint256 vaultId => ResolutionCommitteeConfig config) private _resolutionCommittees;
    mapping(uint256 vaultId => address[] members) private _ruleMakers;
    mapping(uint256 vaultId => address[] members) private _ruleVerifiers;
    mapping(uint256 vaultId => address[] members) private _resolutionValidators;
    mapping(uint256 vaultId => address[] members) private _resolutionAuditors;
    mapping(uint256 vaultId => mapping(address member => ProofOfVaultTypes.CommitteeRole role)) private _ruleRoles;
    mapping(uint256 vaultId => mapping(address member => ProofOfVaultTypes.CommitteeRole role))
        private _resolutionRoles;

    event ControllerAuthorizationUpdated(address indexed controller, bool allowed);
    event RuleCommitteeRegistered(
        uint256 indexed vaultId,
        uint8 indexed round,
        address[] makers,
        address[] verifiers,
        uint64 draftDeadline,
        uint64 issueDeadline
    );
    event ResolutionCommitteeRegistered(
        uint256 indexed vaultId,
        uint8 indexed round,
        address[] validators,
        address[] auditors,
        uint64 commitDeadline,
        uint64 revealDeadline,
        uint64 auditDeadline,
        uint64 challengeDeadline,
        uint8 minValidCount
    );
    event RuleCommitteeCleared(uint256 indexed vaultId, uint8 indexed round);
    event ResolutionCommitteeCleared(uint256 indexed vaultId, uint8 indexed round);

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyController() {
        if (!authorizedControllers[msg.sender]) {
            revert NotAuthorizedController(msg.sender);
        }
        _;
    }

    function setAuthorizedController(address controller, bool allowed) external onlyOwner {
        authorizedControllers[controller] = allowed;
        emit ControllerAuthorizationUpdated(controller, allowed);
    }

    function registerRuleCommittee(
        uint256 vaultId,
        uint8 round,
        address[] calldata makers,
        address[] calldata verifiers,
        uint64 draftDeadline,
        uint64 issueDeadline
    ) external onlyController {
        if (vaultId == 0) revert InvalidVaultId(vaultId);
        if (draftDeadline <= block.timestamp || issueDeadline <= draftDeadline) revert InvalidDeadline();

        _clearRuleCommittee(vaultId);

        for (uint256 i = 0; i < makers.length; i++) {
            if (makers[i] == address(0)) revert InvalidCommitteeMember(address(0));
            if (_ruleRoles[vaultId][makers[i]] != ProofOfVaultTypes.CommitteeRole.None) {
                revert DuplicateCommitteeMember(makers[i]);
            }
            _ruleMakers[vaultId].push(makers[i]);
            _ruleRoles[vaultId][makers[i]] = ProofOfVaultTypes.CommitteeRole.RuleMaker;
        }
        for (uint256 i = 0; i < verifiers.length; i++) {
            if (verifiers[i] == address(0)) revert InvalidCommitteeMember(address(0));
            if (_ruleRoles[vaultId][verifiers[i]] != ProofOfVaultTypes.CommitteeRole.None) {
                revert DuplicateCommitteeMember(verifiers[i]);
            }
            _ruleVerifiers[vaultId].push(verifiers[i]);
            _ruleRoles[vaultId][verifiers[i]] = ProofOfVaultTypes.CommitteeRole.RuleVerifier;
        }

        _ruleCommittees[vaultId] = RuleCommitteeConfig({
            round: round,
            draftDeadline: draftDeadline,
            issueDeadline: issueDeadline,
            active: true
        });

        emit RuleCommitteeRegistered(vaultId, round, makers, verifiers, draftDeadline, issueDeadline);
    }

    function clearRuleCommittee(uint256 vaultId) external onlyController {
        _clearRuleCommittee(vaultId);
    }

    function registerResolutionCommittee(
        uint256 vaultId,
        uint8 round,
        address[] calldata validators,
        address[] calldata auditors,
        uint64 commitDeadline,
        uint64 revealDeadline,
        uint64 auditDeadline,
        uint64 challengeDeadline,
        uint8 minValidCount
    ) external onlyController {
        if (vaultId == 0) revert InvalidVaultId(vaultId);
        if (
            commitDeadline <= block.timestamp || revealDeadline <= commitDeadline || auditDeadline <= revealDeadline
                || challengeDeadline <= auditDeadline
        ) revert InvalidDeadline();
        if (minValidCount == 0 || minValidCount > validators.length) revert InvalidMinValidCount(minValidCount);

        _clearResolutionCommittee(vaultId);

        for (uint256 i = 0; i < validators.length; i++) {
            if (validators[i] == address(0)) revert InvalidCommitteeMember(address(0));
            if (_resolutionRoles[vaultId][validators[i]] != ProofOfVaultTypes.CommitteeRole.None) {
                revert DuplicateCommitteeMember(validators[i]);
            }
            _resolutionValidators[vaultId].push(validators[i]);
            _resolutionRoles[vaultId][validators[i]] = ProofOfVaultTypes.CommitteeRole.ResolutionValidator;
        }
        for (uint256 i = 0; i < auditors.length; i++) {
            if (auditors[i] == address(0)) revert InvalidCommitteeMember(address(0));
            if (_resolutionRoles[vaultId][auditors[i]] != ProofOfVaultTypes.CommitteeRole.None) {
                revert DuplicateCommitteeMember(auditors[i]);
            }
            _resolutionAuditors[vaultId].push(auditors[i]);
            _resolutionRoles[vaultId][auditors[i]] = ProofOfVaultTypes.CommitteeRole.ResolutionAuditor;
        }

        _resolutionCommittees[vaultId] = ResolutionCommitteeConfig({
            round: round,
            commitDeadline: commitDeadline,
            revealDeadline: revealDeadline,
            auditDeadline: auditDeadline,
            challengeDeadline: challengeDeadline,
            minValidCount: minValidCount,
            active: true
        });

        emit ResolutionCommitteeRegistered(
            vaultId,
            round,
            validators,
            auditors,
            commitDeadline,
            revealDeadline,
            auditDeadline,
            challengeDeadline,
            minValidCount
        );
    }

    function clearResolutionCommittee(uint256 vaultId) external onlyController {
        _clearResolutionCommittee(vaultId);
    }

    function ruleCommitteeOf(uint256 vaultId) external view returns (RuleCommitteeConfig memory) {
        return _ruleCommittees[vaultId];
    }

    function resolutionCommitteeOf(uint256 vaultId) external view returns (ResolutionCommitteeConfig memory) {
        return _resolutionCommittees[vaultId];
    }

    function ruleRoleOf(uint256 vaultId, address member) external view returns (ProofOfVaultTypes.CommitteeRole) {
        return _ruleRoles[vaultId][member];
    }

    function resolutionRoleOf(uint256 vaultId, address member)
        external
        view
        returns (ProofOfVaultTypes.CommitteeRole)
    {
        return _resolutionRoles[vaultId][member];
    }

    function ruleMakersOf(uint256 vaultId) external view returns (address[] memory) {
        return _ruleMakers[vaultId];
    }

    function ruleVerifiersOf(uint256 vaultId) external view returns (address[] memory) {
        return _ruleVerifiers[vaultId];
    }

    function resolutionValidatorsOf(uint256 vaultId) external view returns (address[] memory) {
        return _resolutionValidators[vaultId];
    }

    function resolutionAuditorsOf(uint256 vaultId) external view returns (address[] memory) {
        return _resolutionAuditors[vaultId];
    }

    function _clearRuleCommittee(uint256 vaultId) internal {
        RuleCommitteeConfig memory config = _ruleCommittees[vaultId];
        address[] storage makers = _ruleMakers[vaultId];
        address[] storage verifiers = _ruleVerifiers[vaultId];

        for (uint256 i = 0; i < makers.length; i++) {
            delete _ruleRoles[vaultId][makers[i]];
        }
        for (uint256 i = 0; i < verifiers.length; i++) {
            delete _ruleRoles[vaultId][verifiers[i]];
        }

        delete _ruleMakers[vaultId];
        delete _ruleVerifiers[vaultId];
        delete _ruleCommittees[vaultId];

        if (config.round != 0) {
            emit RuleCommitteeCleared(vaultId, config.round);
        }
    }

    function _clearResolutionCommittee(uint256 vaultId) internal {
        ResolutionCommitteeConfig memory config = _resolutionCommittees[vaultId];
        address[] storage validators = _resolutionValidators[vaultId];
        address[] storage auditors = _resolutionAuditors[vaultId];

        for (uint256 i = 0; i < validators.length; i++) {
            delete _resolutionRoles[vaultId][validators[i]];
        }
        for (uint256 i = 0; i < auditors.length; i++) {
            delete _resolutionRoles[vaultId][auditors[i]];
        }

        delete _resolutionValidators[vaultId];
        delete _resolutionAuditors[vaultId];
        delete _resolutionCommittees[vaultId];

        if (config.round != 0) {
            emit ResolutionCommitteeCleared(vaultId, config.round);
        }
    }
}
