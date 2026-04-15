// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";

import {AgentStaking} from "../../src/AgentStaking.sol";
import {CommitteeRegistry} from "../../src/CommitteeRegistry.sol";
import {CompensationPool} from "../../src/CompensationPool.sol";
import {FeeManager} from "../../src/FeeManager.sol";
import {ResolutionRegistry} from "../../src/ResolutionRegistry.sol";
import {RewardPool} from "../../src/RewardPool.sol";
import {VaultEscrow} from "../../src/VaultEscrow.sol";
import {VaultFactory} from "../../src/VaultFactory.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {ProofOfVaultTypes} from "../../src/libraries/ProofOfVaultTypes.sol";

contract ProofOfVaultV2Test is Test {
    uint16 internal constant CREATION_FEE_BPS = 200;
    uint16 internal constant SETTLEMENT_FEE_BPS = 100;
    uint256 internal constant PROOF_FEE = 5 ether;
    uint64 internal constant DISPUTE_WINDOW = 1 days;
    uint64 internal constant WITHDRAWAL_COOLDOWN = 7 days;
    uint256 internal constant COLLATERAL_AMOUNT = 1_000 ether;
    uint256 internal constant AGENT_STAKE = 100 ether;
    uint256 internal constant SETUP_DEPOSIT_MINIMUM = 0.00001 ether;
    uint256 internal constant SETUP_DEPOSIT = 50 ether;
    uint256 internal constant RESOLUTION_REWARD_DEPOSIT = 100 ether;
    uint256 internal constant CHALLENGE_BOND = 10 ether;
    uint256 internal constant RULE_MAKER_BOND = 25 ether;
    uint256 internal constant RULE_VERIFIER_BOND = 20 ether;
    uint256 internal constant RESOLUTION_VALIDATOR_BOND = 30 ether;
    uint256 internal constant RESOLUTION_AUDITOR_BOND = 20 ether;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal burn = address(0x000000000000000000000000000000000000dEaD);
    address internal setter = makeAddr("setter");
    address internal finalizer = makeAddr("finalizer");
    address internal safetyCouncil = makeAddr("safetyCouncil");
    address internal slashReceiver = makeAddr("slashReceiver");

    address internal makerOne = makeAddr("makerOne");
    address internal makerTwo = makeAddr("makerTwo");
    address internal verifierOne = makeAddr("verifierOne");
    address internal verifierTwo = makeAddr("verifierTwo");

    address internal validatorOne = makeAddr("validatorOne");
    address internal validatorTwo = makeAddr("validatorTwo");
    address internal validatorThree = makeAddr("validatorThree");
    address internal auditorOne = makeAddr("auditorOne");
    address internal auditorTwo = makeAddr("auditorTwo");

    MockERC20 internal collateralToken;
    MockERC20 internal stakingToken;
    FeeManager internal feeManager;
    AgentStaking internal agentStaking;
    CommitteeRegistry internal committeeRegistry;
    RewardPool internal rewardPool;
    CompensationPool internal compensationPool;
    ResolutionRegistry internal resolutionRegistry;
    VaultEscrow internal vaultEscrow;
    VaultFactory internal vaultFactory;

    function setUp() public {
        collateralToken = new MockERC20("Collateral", "COL", 18);
        stakingToken = new MockERC20("Stake", "STK", 18);

        collateralToken.mint(setter, 10_000 ether);
        stakingToken.mint(setter, 10_000 ether);
        vm.deal(setter, 1_000 ether);

        address[9] memory agents = [
            makerOne,
            makerTwo,
            verifierOne,
            verifierTwo,
            validatorOne,
            validatorTwo,
            validatorThree,
            auditorOne,
            auditorTwo
        ];

        for (uint256 i = 0; i < agents.length; i++) {
            stakingToken.mint(agents[i], 10_000 ether);
        }

        vm.startPrank(owner);
        feeManager = new FeeManager(
            owner, treasury, burn, address(stakingToken), CREATION_FEE_BPS, SETTLEMENT_FEE_BPS, PROOF_FEE
        );
        agentStaking = new AgentStaking(owner, address(stakingToken), WITHDRAWAL_COOLDOWN);
        committeeRegistry = new CommitteeRegistry(owner);
        rewardPool = new RewardPool(owner, address(stakingToken), treasury);
        compensationPool = new CompensationPool(owner);
        resolutionRegistry = new ResolutionRegistry(owner);
        vaultEscrow = new VaultEscrow(owner);
        vaultFactory = new VaultFactory(
            owner,
            address(resolutionRegistry),
            address(vaultEscrow),
            address(agentStaking),
            address(feeManager),
            address(committeeRegistry),
            address(rewardPool),
            address(compensationPool),
            DISPUTE_WINDOW
        );

        feeManager.setCollector(address(vaultFactory), true);
        feeManager.setV2DepositConfig(SETUP_DEPOSIT_MINIMUM, RESOLUTION_REWARD_DEPOSIT, CHALLENGE_BOND);
        feeManager.setV2BondConfig(
            RULE_MAKER_BOND, RULE_VERIFIER_BOND, RESOLUTION_VALIDATOR_BOND, RESOLUTION_AUDITOR_BOND
        );
        feeManager.setV2RewardConfig(
            8 ether, 4 ether, 6 ether, 4 ether, 6 ether, 2 ether, 4 ether, 6 ether, 5 ether, 2_500
        );
        feeManager.setRuleVerifierRewards(2 ether, 4 ether, 6 ether, 8 ether);

        agentStaking.setAuthorizedSlasher(owner, true);
        agentStaking.setAuthorizedController(address(vaultFactory), true);
        agentStaking.setAuthorizedController(address(rewardPool), true);
        committeeRegistry.setAuthorizedController(address(vaultFactory), true);
        rewardPool.setAuthorizedController(address(vaultFactory), true);
        rewardPool.setRewardStakeSink(address(agentStaking), true);
        resolutionRegistry.setAuthorizedOrchestrator(address(vaultFactory), true);
        vaultEscrow.setAuthorizedController(address(vaultFactory), true);
        compensationPool.setAuthorizedNotifier(address(vaultEscrow), true);
        vaultFactory.setAuthorizedFinalizer(finalizer, true);
        vaultFactory.setSafetyCouncil(safetyCouncil, true);
        vaultFactory.setAuthorizedOrchestrator(owner, true);
        vaultFactory.setCollateralPolicy(address(collateralToken), true, COLLATERAL_AMOUNT);
        vm.stopPrank();

        vm.startPrank(setter);
        collateralToken.approve(address(vaultFactory), type(uint256).max);
        stakingToken.approve(address(rewardPool), type(uint256).max);
        vm.stopPrank();

        for (uint256 i = 0; i < agents.length; i++) {
            vm.startPrank(agents[i]);
            stakingToken.approve(address(agentStaking), type(uint256).max);
            stakingToken.approve(address(feeManager), type(uint256).max);
            stakingToken.approve(address(rewardPool), type(uint256).max);
            vm.stopPrank();
        }
    }

    function test_v2CreateRequestAndRuleCommittee_locksSetupDepositAndTaskBonds() public {
        _stakeAgents(_addressArray(makerOne, verifierOne));

        uint64 settlementTime = uint64(block.timestamp + 7 days);
        uint256 vaultId = _createVaultRequest(settlementTime, "ipfs://request-1");

        ProofOfVaultTypes.VaultRecord memory vault = vaultFactory.getVault(vaultId);
        assertEq(uint8(vault.status), uint8(ProofOfVaultTypes.VaultStatus.RuleAuction));
        assertEq(vault.setupDepositAmount, SETUP_DEPOSIT);
        assertEq(rewardPool.vaultBalanceOf(vaultId).setupDepositBalance, SETUP_DEPOSIT);

        _registerRuleCommittee(vaultId, _addressArray(makerOne), _addressArray(verifierOne));

        ProofOfVaultTypes.TaskBondRecord memory makerBond =
            agentStaking.taskBondOf(makerOne, vaultId, ProofOfVaultTypes.CommitteeRole.RuleMaker);
        ProofOfVaultTypes.TaskBondRecord memory verifierBond =
            agentStaking.taskBondOf(verifierOne, vaultId, ProofOfVaultTypes.CommitteeRole.RuleVerifier);

        assertTrue(makerBond.active);
        assertEq(makerBond.amount, RULE_MAKER_BOND);
        assertTrue(verifierBond.active);
        assertEq(verifierBond.amount, RULE_VERIFIER_BOND);

        vm.prank(owner);
        agentStaking.setWithdrawalsEnabled(true);

        vm.prank(makerOne);
        vm.expectRevert(
            abi.encodeWithSelector(AgentStaking.InsufficientStake.selector, AGENT_STAKE, AGENT_STAKE - RULE_MAKER_BOND)
        );
        agentStaking.requestWithdrawal(AGENT_STAKE);
    }

    function test_v2CreateRequest_requiresMinimumNativeSetupDeposit() public {
        vm.prank(setter);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.InvalidNativeDeposit.selector, 0, SETUP_DEPOSIT_MINIMUM));
        vaultFactory.createVaultRequest(
            address(collateralToken), COLLATERAL_AMOUNT, uint64(block.timestamp + 7 days), "ipfs://request-no-okb"
        );

        vm.prank(setter);
        uint256 vaultId = vaultFactory.createVaultRequest{value: SETUP_DEPOSIT + 1}(
            address(collateralToken), COLLATERAL_AMOUNT, uint64(block.timestamp + 7 days), "ipfs://request-more-okb"
        );
        ProofOfVaultTypes.VaultRecord memory vault = vaultFactory.getVault(vaultId);
        assertEq(vault.setupDepositAmount, SETUP_DEPOSIT + 1);
        assertEq(rewardPool.vaultBalanceOf(vaultId).setupDepositBalance, SETUP_DEPOSIT + 1);
    }

    function test_v2CommitteeRegistration_rejectsOverlappingRoles() public {
        _stakeAgents(_addressArray(makerOne, verifierOne, validatorOne));

        uint256 vaultId = _createVaultRequest(uint64(block.timestamp + 7 days), "ipfs://request-overlap");

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CommitteeRegistry.DuplicateCommitteeMember.selector, makerOne));
        vaultFactory.registerRuleCommittee(
            vaultId,
            _addressArray(makerOne),
            _addressArray(makerOne),
            uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 2 hours)
        );

        uint256 activeVaultId = _createAndActivateDefaultVault();
        uint64 baseTime = vaultFactory.getVault(activeVaultId).settlementTime + 1;
        vm.warp(baseTime);
        uint64 commitDeadline = baseTime + 1 hours;
        uint64 revealDeadline = baseTime + 2 hours;
        uint64 auditDeadline = baseTime + 3 hours;
        uint64 challengeDeadline = baseTime + 4 hours;

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CommitteeRegistry.DuplicateCommitteeMember.selector, validatorOne));
        vaultFactory.registerResolutionCommittee(
            activeVaultId,
            _addressArray(validatorOne),
            _addressArray(validatorOne),
            commitDeadline,
            revealDeadline,
            auditDeadline,
            challengeDeadline,
            1
        );
    }

    function test_v2RejectRuleSetTwice_cancelsVaultAndRefundsRemainingSetupDeposit() public {
        _stakeAgents(_addressArray(makerOne, verifierOne, makerTwo, verifierTwo));

        uint64 settlementTime = uint64(block.timestamp + 7 days);
        uint256 vaultId = _createVaultRequest(settlementTime, "ipfs://request-reject");

        _registerRuleCommittee(vaultId, _addressArray(makerOne), _addressArray(verifierOne));
        _submitRuleDraft(vaultId, makerOne, keccak256("draft-1"), "ipfs://draft-1");
        _submitRuleIssue(
            vaultId, verifierOne, ProofOfVaultTypes.IssueSeverity.Low, keccak256("issue-1"), "ipfs://issue-1"
        );
        _finalizeRuleSet(
            vaultId, keccak256("criteria-1"), "ipfs://criteria-1", _addressArray(makerOne), _addressArray(verifierOne)
        );

        uint256 setterNativeBeforeReject = setter.balance;

        vm.prank(setter);
        vaultFactory.rejectRuleSet(vaultId, "ipfs://reject-once");

        ProofOfVaultTypes.VaultRecord memory afterFirstReject = vaultFactory.getVault(vaultId);
        assertEq(uint8(afterFirstReject.status), uint8(ProofOfVaultTypes.VaultStatus.RuleAuction));

        _registerRuleCommittee(vaultId, _addressArray(makerTwo), _addressArray(verifierTwo));
        _submitRuleDraft(vaultId, makerTwo, keccak256("draft-2"), "ipfs://draft-2");
        _submitRuleIssue(
            vaultId, verifierTwo, ProofOfVaultTypes.IssueSeverity.Medium, keccak256("issue-2"), "ipfs://issue-2"
        );
        _finalizeRuleSet(
            vaultId, keccak256("criteria-2"), "ipfs://criteria-2", _emptyAddressArray(), _emptyAddressArray()
        );

        vm.prank(setter);
        vaultFactory.rejectRuleSet(vaultId, "ipfs://reject-twice");

        ProofOfVaultTypes.VaultRecord memory afterSecondReject = vaultFactory.getVault(vaultId);
        assertEq(uint8(afterSecondReject.status), uint8(ProofOfVaultTypes.VaultStatus.Cancelled));
        assertEq(rewardPool.vaultBalanceOf(vaultId).setupDepositBalance, 0);
        assertEq(setter.balance - setterNativeBeforeReject, 28 ether);
        assertEq(rewardPool.claimableSetupRewards(makerOne), 12 ether);
        assertEq(rewardPool.claimableSetupRewards(verifierOne), 2 ether);
        assertEq(rewardPool.claimableSetupRewards(makerTwo), 8 ether);

        uint256 makerNativeBeforeClaim = makerOne.balance;
        vm.prank(makerOne);
        vaultFactory.claimRewards();
        assertEq(makerOne.balance - makerNativeBeforeClaim, 12 ether);
        assertEq(rewardPool.claimableSetupRewards(makerOne), 0);
    }

    function test_v2FinalizeRuleSet_slashesMissingRuleSubmissions() public {
        _stakeAgents(_addressArray(makerOne, verifierOne));

        uint256 vaultId = _createVaultRequest(uint64(block.timestamp + 7 days), "ipfs://request-slash-rule");
        _registerRuleCommittee(vaultId, _addressArray(makerOne), _addressArray(verifierOne));

        vm.prank(owner);
        vaultFactory.finalizeRuleSet(
            vaultId,
            keccak256("criteria-slash-rule"),
            "ipfs://criteria-slash-rule",
            _emptyAddressArray(),
            _emptyAddressArray(),
            _emptyAddressArray(),
            _emptyAddressArray()
        );

        assertEq(agentStaking.activeStakeOf(makerOne), AGENT_STAKE - RULE_MAKER_BOND);
        assertEq(agentStaking.activeStakeOf(verifierOne), AGENT_STAKE - RULE_VERIFIER_BOND);
    }

    function test_v2FinalizeRuleSet_rejectsInvalidBonusRecipients() public {
        _stakeAgents(_addressArray(makerOne, verifierOne));

        uint256 vaultId = _createVaultRequest(uint64(block.timestamp + 7 days), "ipfs://request-invalid-bonus");
        _registerRuleCommittee(vaultId, _addressArray(makerOne), _addressArray(verifierOne));
        _submitRuleDraft(vaultId, makerOne, keccak256("draft-bonus"), "ipfs://draft-bonus");
        _submitRuleIssue(
            vaultId, verifierOne, ProofOfVaultTypes.IssueSeverity.High, keccak256("issue-bonus"), "ipfs://issue-bonus"
        );

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                VaultFactory.InvalidCommitteeMember.selector,
                validatorOne,
                vaultId,
                ProofOfVaultTypes.CommitteeRole.RuleMaker
            )
        );
        vaultFactory.finalizeRuleSet(
            vaultId,
            keccak256("criteria-invalid-bonus"),
            "ipfs://criteria-invalid-bonus",
            _addressArray(validatorOne),
            _emptyAddressArray(),
            _emptyAddressArray(),
            _emptyAddressArray()
        );
    }

    function test_v2HappyPath_finalizesTrueAndLetsValidatorsClaimRewards() public {
        _stakeAgents(
            _addressArray(makerOne, verifierOne, validatorOne, validatorTwo, validatorThree, auditorOne, auditorTwo)
        );

        uint256 vaultId = _createAndActivateDefaultVault();
        uint256 creationFee = _creationFee(COLLATERAL_AMOUNT);
        uint256 lockedAmount = COLLATERAL_AMOUNT - creationFee;
        uint256 settlementFee = _settlementFee(lockedAmount);

        vm.warp(vaultFactory.getVault(vaultId).settlementTime + 1);

        address[] memory validators = _addressArray(validatorOne, validatorTwo, validatorThree);
        address[] memory auditors = _addressArray(auditorOne, auditorTwo);
        _registerResolutionCommittee(vaultId, validators, auditors, 2);

        bytes32 saltOne = keccak256("salt-one");
        bytes32 saltTwo = keccak256("salt-two");
        bytes32 saltThree = keccak256("salt-three");
        _commit(vaultId, validatorOne, ProofOfVaultTypes.ResolutionOutcome.True, keccak256("proof-1"), saltOne);
        _commit(vaultId, validatorTwo, ProofOfVaultTypes.ResolutionOutcome.True, keccak256("proof-2"), saltTwo);
        _commit(vaultId, validatorThree, ProofOfVaultTypes.ResolutionOutcome.True, keccak256("proof-3"), saltThree);

        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        vm.warp(config.commitDeadline + 1);

        _reveal(
            vaultId,
            validatorOne,
            ProofOfVaultTypes.ResolutionOutcome.True,
            keccak256("proof-1"),
            saltOne,
            "ipfs://reveal-1"
        );
        _reveal(
            vaultId,
            validatorTwo,
            ProofOfVaultTypes.ResolutionOutcome.True,
            keccak256("proof-2"),
            saltTwo,
            "ipfs://reveal-2"
        );
        _reveal(
            vaultId,
            validatorThree,
            ProofOfVaultTypes.ResolutionOutcome.True,
            keccak256("proof-3"),
            saltThree,
            "ipfs://reveal-3"
        );

        vm.warp(config.revealDeadline + 1);
        _submitAudit(
            vaultId,
            auditorOne,
            validatorOne,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("audit-1-1"),
            "ipfs://audit-1-1"
        );
        _submitAudit(
            vaultId,
            auditorOne,
            validatorTwo,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("audit-1-2"),
            "ipfs://audit-1-2"
        );
        _submitAudit(
            vaultId,
            auditorOne,
            validatorThree,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("audit-1-3"),
            "ipfs://audit-1-3"
        );
        _submitAudit(
            vaultId,
            auditorTwo,
            validatorOne,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("audit-2-1"),
            "ipfs://audit-2-1"
        );
        _submitAudit(
            vaultId,
            auditorTwo,
            validatorTwo,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("audit-2-2"),
            "ipfs://audit-2-2"
        );
        _submitAudit(
            vaultId,
            auditorTwo,
            validatorThree,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("audit-2-3"),
            "ipfs://audit-2-3"
        );

        vm.warp(config.challengeDeadline + 1);
        vm.prank(finalizer);
        vaultFactory.finalizeV2Vault(vaultId);

        ProofOfVaultTypes.VaultRecord memory vault = vaultFactory.getVault(vaultId);
        assertEq(uint8(vault.status), uint8(ProofOfVaultTypes.VaultStatus.ResolvedTrue));
        assertEq(collateralToken.balanceOf(setter), 10_000 ether - creationFee - settlementFee);
        assertEq(stakingToken.balanceOf(burn), PROOF_FEE * 3);

        assertEq(rewardPool.claimableRewards(validatorOne), 16 ether);
        assertEq(rewardPool.claimableRewards(validatorTwo), 16 ether);
        assertEq(rewardPool.claimableRewards(validatorThree), 16 ether);
        assertEq(rewardPool.claimableRewards(auditorOne), 4 ether);
        assertEq(rewardPool.claimableRewards(auditorTwo), 4 ether);
        assertFalse(
            agentStaking.taskBondOf(validatorOne, vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionValidator).active
        );
        assertFalse(
            agentStaking.taskBondOf(auditorOne, vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionAuditor).active
        );

        uint256 validatorStakeBeforeClaim = agentStaking.activeStakeOf(validatorOne);
        uint256 validatorBalanceBeforeClaim = stakingToken.balanceOf(validatorOne);
        vm.prank(validatorOne);
        vaultFactory.claimRewards();
        assertEq(stakingToken.balanceOf(validatorOne), validatorBalanceBeforeClaim);
        assertEq(agentStaking.activeStakeOf(validatorOne) - validatorStakeBeforeClaim, 16 ether);
    }

    function test_v2CurrentCommitteeMemberCannotOpenPublicChallenge() public {
        _stakeAgents(_addressArray(makerOne, verifierOne, validatorOne, validatorTwo, auditorOne));

        uint256 vaultId = _createAndActivateDefaultVault();
        vm.warp(vaultFactory.getVault(vaultId).settlementTime + 1);

        _registerResolutionCommittee(vaultId, _addressArray(validatorOne, validatorTwo), _addressArray(auditorOne), 1);

        bytes32 saltOne = keccak256("committee-challenge-salt-one");
        bytes32 saltTwo = keccak256("committee-challenge-salt-two");
        _commit(
            vaultId, validatorOne, ProofOfVaultTypes.ResolutionOutcome.True, keccak256("committee-proof-1"), saltOne
        );
        _commit(
            vaultId, validatorTwo, ProofOfVaultTypes.ResolutionOutcome.True, keccak256("committee-proof-2"), saltTwo
        );

        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        vm.warp(config.commitDeadline + 1);
        _reveal(
            vaultId,
            validatorOne,
            ProofOfVaultTypes.ResolutionOutcome.True,
            keccak256("committee-proof-1"),
            saltOne,
            "ipfs://committee-reveal-1"
        );
        _reveal(
            vaultId,
            validatorTwo,
            ProofOfVaultTypes.ResolutionOutcome.True,
            keccak256("committee-proof-2"),
            saltTwo,
            "ipfs://committee-reveal-2"
        );

        vm.warp(config.revealDeadline + 1);
        _submitAudit(
            vaultId,
            auditorOne,
            validatorOne,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("committee-audit-1"),
            "ipfs://committee-audit-1"
        );
        _submitAudit(
            vaultId,
            auditorOne,
            validatorTwo,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("committee-audit-2"),
            "ipfs://committee-audit-2"
        );

        vm.warp(config.auditDeadline + 1);
        vm.prank(validatorTwo);
        vm.expectRevert(
            abi.encodeWithSelector(VaultFactory.CurrentCommitteeMemberCannotChallenge.selector, validatorTwo, vaultId)
        );
        vaultFactory.openPublicChallenge(
            vaultId, validatorOne, keccak256("committee-challenge"), "ipfs://committee-challenge"
        );
    }

    function test_v2CommitRevealMismatch_slashesValidatorTaskBond() public {
        _stakeAgents(_addressArray(makerOne, verifierOne, validatorOne, auditorOne));

        uint256 vaultId = _createAndActivateDefaultVault();
        vm.warp(vaultFactory.getVault(vaultId).settlementTime + 1);

        _registerResolutionCommittee(vaultId, _addressArray(validatorOne), _addressArray(auditorOne), 1);

        bytes32 committedProofHash = keccak256("proof-match");
        bytes32 commitSalt = keccak256("good-salt");
        _commit(vaultId, validatorOne, ProofOfVaultTypes.ResolutionOutcome.True, committedProofHash, commitSalt);

        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        vm.warp(config.commitDeadline + 1);

        uint256 treasuryBalanceBefore = stakingToken.balanceOf(treasury);
        _reveal(
            vaultId,
            validatorOne,
            ProofOfVaultTypes.ResolutionOutcome.False,
            keccak256("proof-other"),
            keccak256("bad-salt"),
            "ipfs://bad-reveal"
        );

        ProofOfVaultTypes.TaskBondRecord memory bond =
            agentStaking.taskBondOf(validatorOne, vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionValidator);

        assertEq(bond.slashedAmount, RESOLUTION_VALIDATOR_BOND);
        assertEq(agentStaking.activeStakeOf(validatorOne), AGENT_STAKE - RESOLUTION_VALIDATOR_BOND);
        assertEq(stakingToken.balanceOf(treasury) - treasuryBalanceBefore, RESOLUTION_VALIDATOR_BOND);
    }

    function test_v2ChallengeFailure_slashesBondPartially() public {
        _stakeAgents(_addressArray(makerOne, verifierOne, validatorOne, auditorOne));

        uint256 vaultId = _createAndActivateDefaultVault();
        vm.warp(vaultFactory.getVault(vaultId).settlementTime + 1);

        _registerResolutionCommittee(vaultId, _addressArray(validatorOne), _addressArray(auditorOne), 1);

        bytes32 salt = keccak256("challenge-failure-salt");
        bytes32 proofHash = keccak256("challenge-failure-proof");
        _commit(vaultId, validatorOne, ProofOfVaultTypes.ResolutionOutcome.True, proofHash, salt);

        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        vm.warp(config.commitDeadline + 1);
        _reveal(vaultId, validatorOne, ProofOfVaultTypes.ResolutionOutcome.True, proofHash, salt, "ipfs://reveal");

        vm.warp(config.revealDeadline + 1);
        _submitAudit(
            vaultId,
            auditorOne,
            validatorOne,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("audit-ok"),
            "ipfs://audit-ok"
        );

        vm.warp(config.auditDeadline + 1);
        uint256 setterBalanceBefore = stakingToken.balanceOf(setter);
        uint256 treasuryBalanceBefore = stakingToken.balanceOf(treasury);

        vm.prank(setter);
        uint256 challengeId = vaultFactory.openPublicChallenge(
            vaultId, validatorOne, keccak256("challenge-failure"), "ipfs://challenge-failure"
        );

        vm.prank(finalizer);
        vaultFactory.resolveChallenge(
            vaultId,
            challengeId,
            false,
            ProofOfVaultTypes.CommitteeRole.ResolutionValidator,
            ProofOfVaultTypes.SlashReasonCode.ChallengeAbuse,
            0
        );

        assertEq(setterBalanceBefore - stakingToken.balanceOf(setter), 2.5 ether);
        assertEq(stakingToken.balanceOf(treasury) - treasuryBalanceBefore, 2.5 ether);
        assertEq(rewardPool.challengeBondBalanceOf(vaultId, challengeId), 0);
    }

    function test_v2FinalizeV2_slashesIdleAuditorAndPaysNoAuditorReward() public {
        _stakeAgents(_addressArray(makerOne, verifierOne, validatorOne, auditorOne, auditorTwo));

        uint256 vaultId = _createAndActivateDefaultVault();
        vm.warp(vaultFactory.getVault(vaultId).settlementTime + 1);

        _registerResolutionCommittee(vaultId, _addressArray(validatorOne), _addressArray(auditorOne, auditorTwo), 1);

        bytes32 salt = keccak256("idle-auditor-salt");
        bytes32 proofHash = keccak256("idle-auditor-proof");
        _commit(vaultId, validatorOne, ProofOfVaultTypes.ResolutionOutcome.True, proofHash, salt);

        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        vm.warp(config.commitDeadline + 1);
        _reveal(
            vaultId,
            validatorOne,
            ProofOfVaultTypes.ResolutionOutcome.True,
            proofHash,
            salt,
            "ipfs://idle-auditor-reveal"
        );

        vm.warp(config.revealDeadline + 1);
        _submitAudit(
            vaultId,
            auditorTwo,
            validatorOne,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("active-auditor"),
            "ipfs://active-auditor"
        );

        vm.warp(config.challengeDeadline + 1);
        vm.prank(finalizer);
        vaultFactory.finalizeV2Vault(vaultId);

        ProofOfVaultTypes.VaultRecord memory vault = vaultFactory.getVault(vaultId);
        assertEq(uint8(vault.status), uint8(ProofOfVaultTypes.VaultStatus.ResolvedTrue));
        assertEq(agentStaking.activeStakeOf(auditorOne), AGENT_STAKE - RESOLUTION_AUDITOR_BOND);
        assertEq(rewardPool.claimableRewards(auditorOne), 0);
    }

    function test_v2SlashAgent_preservesTaskBondReleaseability() public {
        _stakeAgents(_addressArray(makerOne, verifierOne));

        uint256 vaultOne = _createVaultRequest(uint64(block.timestamp + 7 days), "ipfs://request-bond-one");
        _registerRuleCommittee(vaultOne, _addressArray(makerOne), _addressArray(verifierOne));

        uint256 vaultTwo = _createVaultRequest(uint64(block.timestamp + 8 days), "ipfs://request-bond-two");
        _registerRuleCommittee(vaultTwo, _addressArray(makerOne), _addressArray(verifierOne));

        vm.prank(owner);
        agentStaking.slashAgent(makerOne, 40 ether, ProofOfVaultTypes.SlashReasonCode.ManualReview, slashReceiver);

        _submitRuleDraft(vaultOne, makerOne, keccak256("bond-draft-one"), "ipfs://bond-draft-one");
        _submitRuleIssue(
            vaultOne,
            verifierOne,
            ProofOfVaultTypes.IssueSeverity.Low,
            keccak256("bond-issue-one"),
            "ipfs://bond-issue-one"
        );
        _submitRuleDraft(vaultTwo, makerOne, keccak256("bond-draft-two"), "ipfs://bond-draft-two");
        _submitRuleIssue(
            vaultTwo,
            verifierOne,
            ProofOfVaultTypes.IssueSeverity.Low,
            keccak256("bond-issue-two"),
            "ipfs://bond-issue-two"
        );

        _finalizeRuleSet(
            vaultOne,
            keccak256("bond-criteria-one"),
            "ipfs://bond-criteria-one",
            _addressArray(makerOne),
            _addressArray(verifierOne)
        );
        _finalizeRuleSet(
            vaultTwo,
            keccak256("bond-criteria-two"),
            "ipfs://bond-criteria-two",
            _addressArray(makerOne),
            _addressArray(verifierOne)
        );

        assertEq(agentStaking.activeStakeOf(makerOne), AGENT_STAKE - 40 ether);
        assertEq(stakingToken.balanceOf(slashReceiver), 40 ether);
        assertEq(agentStaking.freeStakeOf(makerOne), AGENT_STAKE - 40 ether);
    }

    function test_v2RoundIsolation_reopensAndAllowsSecondRoundFinalization() public {
        _stakeAgents(
            _addressArray(makerOne, verifierOne, validatorOne, validatorTwo, validatorThree, auditorOne, auditorTwo)
        );

        uint256 vaultId = _createAndActivateDefaultVault();
        vm.warp(vaultFactory.getVault(vaultId).settlementTime + 1);

        _registerResolutionCommittee(vaultId, _addressArray(validatorOne, validatorTwo), _addressArray(auditorOne), 2);

        bytes32 roundOneSaltOne = keccak256("round-one-salt-one");
        bytes32 roundOneSaltTwo = keccak256("round-one-salt-two");
        _commit(
            vaultId,
            validatorOne,
            ProofOfVaultTypes.ResolutionOutcome.True,
            keccak256("round1-proof-1"),
            roundOneSaltOne
        );
        _commit(
            vaultId,
            validatorTwo,
            ProofOfVaultTypes.ResolutionOutcome.True,
            keccak256("round1-proof-2"),
            roundOneSaltTwo
        );

        CommitteeRegistry.ResolutionCommitteeConfig memory roundOneConfig =
            committeeRegistry.resolutionCommitteeOf(vaultId);
        vm.warp(roundOneConfig.commitDeadline + 1);
        _reveal(
            vaultId,
            validatorOne,
            ProofOfVaultTypes.ResolutionOutcome.True,
            keccak256("round1-proof-1"),
            roundOneSaltOne,
            "ipfs://round1-reveal-1"
        );
        _reveal(
            vaultId,
            validatorTwo,
            ProofOfVaultTypes.ResolutionOutcome.True,
            keccak256("round1-proof-2"),
            roundOneSaltTwo,
            "ipfs://round1-reveal-2"
        );

        vm.warp(roundOneConfig.revealDeadline + 1);
        _submitAudit(
            vaultId,
            auditorOne,
            validatorOne,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("round1-audit-1"),
            "ipfs://round1-audit-1"
        );
        _submitAudit(
            vaultId,
            auditorOne,
            validatorTwo,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("round1-audit-2"),
            "ipfs://round1-audit-2"
        );

        vm.warp(roundOneConfig.auditDeadline + 1);
        vm.prank(setter);
        uint256 challengeId = vaultFactory.openPublicChallenge(
            vaultId, validatorOne, keccak256("round1-challenge"), "ipfs://round1-challenge"
        );

        vm.prank(finalizer);
        vaultFactory.resolveChallenge(
            vaultId,
            challengeId,
            true,
            ProofOfVaultTypes.CommitteeRole.ResolutionValidator,
            ProofOfVaultTypes.SlashReasonCode.InvalidProof,
            0
        );

        vm.warp(roundOneConfig.challengeDeadline + 1);
        vm.prank(finalizer);
        vaultFactory.finalizeV2Vault(vaultId);

        ProofOfVaultTypes.VaultRecord memory afterRoundOne = vaultFactory.getVault(vaultId);
        assertEq(uint8(afterRoundOne.status), uint8(ProofOfVaultTypes.VaultStatus.ResolutionAuction));
        assertEq(afterRoundOne.resolutionRound, 1);

        _registerResolutionCommittee(vaultId, _addressArray(validatorOne, validatorThree), _addressArray(auditorTwo), 2);

        bytes32 roundTwoSaltOne = keccak256("round-two-salt-one");
        bytes32 roundTwoSaltThree = keccak256("round-two-salt-three");
        _commit(
            vaultId,
            validatorOne,
            ProofOfVaultTypes.ResolutionOutcome.Invalid,
            keccak256("round2-proof-1"),
            roundTwoSaltOne
        );
        _commit(
            vaultId,
            validatorThree,
            ProofOfVaultTypes.ResolutionOutcome.False,
            keccak256("round2-proof-3"),
            roundTwoSaltThree
        );

        CommitteeRegistry.ResolutionCommitteeConfig memory roundTwoConfig =
            committeeRegistry.resolutionCommitteeOf(vaultId);
        vm.warp(roundTwoConfig.commitDeadline + 1);
        _reveal(
            vaultId,
            validatorOne,
            ProofOfVaultTypes.ResolutionOutcome.Invalid,
            keccak256("round2-proof-1"),
            roundTwoSaltOne,
            "ipfs://round2-reveal-1"
        );
        _reveal(
            vaultId,
            validatorThree,
            ProofOfVaultTypes.ResolutionOutcome.False,
            keccak256("round2-proof-3"),
            roundTwoSaltThree,
            "ipfs://round2-reveal-3"
        );

        vm.warp(roundTwoConfig.revealDeadline + 1);
        _submitAudit(
            vaultId,
            auditorTwo,
            validatorOne,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("round2-audit-1"),
            "ipfs://round2-audit-1"
        );
        _submitAudit(
            vaultId,
            auditorTwo,
            validatorThree,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("round2-audit-3"),
            "ipfs://round2-audit-3"
        );

        vm.warp(roundTwoConfig.challengeDeadline + 1);
        vm.prank(finalizer);
        vaultFactory.finalizeV2Vault(vaultId);

        ProofOfVaultTypes.VaultRecord memory finalVault = vaultFactory.getVault(vaultId);
        assertEq(uint8(finalVault.status), uint8(ProofOfVaultTypes.VaultStatus.ResolvedInvalid));
        assertEq(finalVault.resolutionRound, 2);
    }

    function test_v2FinalizeV2_reopensWhenNoValidatorReveals() public {
        _stakeAgents(_addressArray(makerOne, verifierOne, validatorOne, auditorOne));

        uint256 vaultId = _createAndActivateDefaultVault();
        vm.warp(vaultFactory.getVault(vaultId).settlementTime + 1);

        _registerResolutionCommittee(vaultId, _addressArray(validatorOne), _addressArray(auditorOne), 1);
        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);

        vm.warp(config.challengeDeadline + 1);
        vm.prank(finalizer);
        vaultFactory.finalizeV2Vault(vaultId);

        ProofOfVaultTypes.VaultRecord memory vault = vaultFactory.getVault(vaultId);
        ProofOfVaultTypes.TaskBondRecord memory validatorBond =
            agentStaking.taskBondOf(validatorOne, vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionValidator);

        assertEq(uint8(vault.status), uint8(ProofOfVaultTypes.VaultStatus.ResolutionAuction));
        assertFalse(validatorBond.active);
        assertEq(agentStaking.activeStakeOf(validatorOne), AGENT_STAKE - RESOLUTION_VALIDATOR_BOND);
        assertEq(agentStaking.activeStakeOf(auditorOne), AGENT_STAKE);
    }

    function test_v2FinalizeV2_reopensWhenAuditorsNeverSubmit() public {
        _stakeAgents(_addressArray(makerOne, verifierOne, validatorOne, auditorOne));

        uint256 vaultId = _createAndActivateDefaultVault();
        vm.warp(vaultFactory.getVault(vaultId).settlementTime + 1);

        _registerResolutionCommittee(vaultId, _addressArray(validatorOne), _addressArray(auditorOne), 1);

        bytes32 salt = keccak256("no-auditor-salt");
        bytes32 proofHash = keccak256("no-auditor-proof");
        _commit(vaultId, validatorOne, ProofOfVaultTypes.ResolutionOutcome.True, proofHash, salt);

        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        vm.warp(config.commitDeadline + 1);
        _reveal(
            vaultId, validatorOne, ProofOfVaultTypes.ResolutionOutcome.True, proofHash, salt, "ipfs://no-audit-reveal"
        );

        vm.warp(config.challengeDeadline + 1);
        vm.prank(finalizer);
        vaultFactory.finalizeV2Vault(vaultId);

        ProofOfVaultTypes.VaultRecord memory vault = vaultFactory.getVault(vaultId);
        ProofOfVaultTypes.TaskBondRecord memory auditorBond =
            agentStaking.taskBondOf(auditorOne, vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionAuditor);

        assertEq(uint8(vault.status), uint8(ProofOfVaultTypes.VaultStatus.ResolutionAuction));
        assertFalse(auditorBond.active);
        assertEq(agentStaking.activeStakeOf(validatorOne), AGENT_STAKE);
        assertEq(agentStaking.activeStakeOf(auditorOne), AGENT_STAKE - RESOLUTION_AUDITOR_BOND);
    }

    function test_v2FinalizeFalse_sendsCollateralToCompensationPool() public {
        _stakeAgents(
            _addressArray(makerOne, verifierOne, validatorOne, validatorTwo, validatorThree, auditorOne, auditorTwo)
        );

        uint256 vaultId = _createAndActivateDefaultVault();
        uint256 lockedAmount = COLLATERAL_AMOUNT - _creationFee(COLLATERAL_AMOUNT);
        uint256 settlementFee = _settlementFee(lockedAmount);
        uint256 poolAmount = lockedAmount - settlementFee;

        vm.warp(vaultFactory.getVault(vaultId).settlementTime + 1);
        _registerResolutionCommittee(
            vaultId, _addressArray(validatorOne, validatorTwo, validatorThree), _addressArray(auditorOne), 2
        );

        bytes32 saltOne = keccak256("false-salt-one");
        bytes32 saltTwo = keccak256("false-salt-two");
        bytes32 saltThree = keccak256("false-salt-three");
        _commit(vaultId, validatorOne, ProofOfVaultTypes.ResolutionOutcome.False, keccak256("false-proof-1"), saltOne);
        _commit(vaultId, validatorTwo, ProofOfVaultTypes.ResolutionOutcome.False, keccak256("false-proof-2"), saltTwo);
        _commit(
            vaultId, validatorThree, ProofOfVaultTypes.ResolutionOutcome.False, keccak256("false-proof-3"), saltThree
        );

        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        vm.warp(config.commitDeadline + 1);
        _reveal(
            vaultId,
            validatorOne,
            ProofOfVaultTypes.ResolutionOutcome.False,
            keccak256("false-proof-1"),
            saltOne,
            "ipfs://false-1"
        );
        _reveal(
            vaultId,
            validatorTwo,
            ProofOfVaultTypes.ResolutionOutcome.False,
            keccak256("false-proof-2"),
            saltTwo,
            "ipfs://false-2"
        );
        _reveal(
            vaultId,
            validatorThree,
            ProofOfVaultTypes.ResolutionOutcome.False,
            keccak256("false-proof-3"),
            saltThree,
            "ipfs://false-3"
        );

        vm.warp(config.revealDeadline + 1);
        _submitAudit(
            vaultId,
            auditorOne,
            validatorOne,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("false-audit-1"),
            "ipfs://false-audit-1"
        );
        _submitAudit(
            vaultId,
            auditorOne,
            validatorTwo,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("false-audit-2"),
            "ipfs://false-audit-2"
        );
        _submitAudit(
            vaultId,
            auditorOne,
            validatorThree,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("false-audit-3"),
            "ipfs://false-audit-3"
        );

        vm.warp(config.challengeDeadline + 1);
        vm.prank(finalizer);
        vaultFactory.finalizeV2Vault(vaultId);

        ProofOfVaultTypes.VaultRecord memory vault = vaultFactory.getVault(vaultId);
        assertEq(uint8(vault.status), uint8(ProofOfVaultTypes.VaultStatus.ResolvedFalse));
        assertEq(collateralToken.balanceOf(address(compensationPool)), poolAmount);
        assertEq(compensationPool.totalReceivedByToken(address(collateralToken)), poolAmount);
        assertEq(collateralToken.balanceOf(treasury), _creationFee(COLLATERAL_AMOUNT) + settlementFee);
    }

    function test_v2FinalizeV2_capsRewardsInsteadOfBlockingCollateral() public {
        _stakeAgents(_addressArray(makerOne, verifierOne, validatorOne, auditorOne));

        vm.prank(owner);
        feeManager.setV2RewardConfig(
            8 ether, 4 ether, 60 ether, 60 ether, 60 ether, 2 ether, 60 ether, 60 ether, 5 ether, 2_500
        );

        uint256 vaultId = _createAndActivateDefaultVault();
        vm.warp(vaultFactory.getVault(vaultId).settlementTime + 1);

        _registerResolutionCommittee(vaultId, _addressArray(validatorOne), _addressArray(auditorOne), 1);

        bytes32 salt = keccak256("capped-reward-salt");
        bytes32 proofHash = keccak256("capped-reward-proof");
        _commit(vaultId, validatorOne, ProofOfVaultTypes.ResolutionOutcome.True, proofHash, salt);

        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        vm.warp(config.commitDeadline + 1);
        _reveal(
            vaultId,
            validatorOne,
            ProofOfVaultTypes.ResolutionOutcome.True,
            proofHash,
            salt,
            "ipfs://capped-reward-reveal"
        );

        vm.warp(config.revealDeadline + 1);
        _submitAudit(
            vaultId,
            auditorOne,
            validatorOne,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("capped-reward-audit"),
            "ipfs://capped-reward-audit"
        );

        vm.warp(config.challengeDeadline + 1);
        vm.prank(finalizer);
        vaultFactory.finalizeV2Vault(vaultId);

        ProofOfVaultTypes.VaultRecord memory vault = vaultFactory.getVault(vaultId);
        assertEq(uint8(vault.status), uint8(ProofOfVaultTypes.VaultStatus.ResolvedTrue));
        assertEq(rewardPool.vaultBalanceOf(vaultId).resolutionRewardBalance, 0);
        assertEq(rewardPool.claimableRewards(validatorOne), RESOLUTION_REWARD_DEPOSIT);
        assertEq(rewardPool.claimableRewards(auditorOne), 0);
    }

    function test_v2OpenPublicChallenge_capsOpenChallengeCountAndFreesCapacityOnResolve() public {
        _stakeAgents(_addressArray(makerOne, verifierOne, validatorOne, auditorOne));

        uint256 vaultId = _createAndActivateDefaultVault();
        vm.warp(vaultFactory.getVault(vaultId).settlementTime + 1);

        _registerResolutionCommittee(vaultId, _addressArray(validatorOne), _addressArray(auditorOne), 1);

        bytes32 salt = keccak256("challenge-cap-salt");
        bytes32 proofHash = keccak256("challenge-cap-proof");
        _commit(vaultId, validatorOne, ProofOfVaultTypes.ResolutionOutcome.True, proofHash, salt);

        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        vm.warp(config.commitDeadline + 1);
        _reveal(
            vaultId,
            validatorOne,
            ProofOfVaultTypes.ResolutionOutcome.True,
            proofHash,
            salt,
            "ipfs://challenge-cap-reveal"
        );

        vm.warp(config.revealDeadline + 1);
        _submitAudit(
            vaultId,
            auditorOne,
            validatorOne,
            ProofOfVaultTypes.AuditVerdict.Valid,
            keccak256("challenge-cap-audit"),
            "ipfs://challenge-cap-audit"
        );

        vm.warp(config.auditDeadline + 1);
        uint256 firstChallengeId;
        for (uint256 i = 0; i < 20; i++) {
            address challenger = makeAddr(string.concat("challenger", vm.toString(i)));
            stakingToken.mint(challenger, 100 ether);
            vm.startPrank(challenger);
            stakingToken.approve(address(agentStaking), type(uint256).max);
            stakingToken.approve(address(rewardPool), type(uint256).max);
            agentStaking.stakeForAgent(1 ether);
            uint256 challengeId = vaultFactory.openPublicChallenge(
                vaultId,
                validatorOne,
                keccak256(abi.encode("challenge", i)),
                string.concat("ipfs://challenge-", vm.toString(i))
            );
            vm.stopPrank();
            if (i == 0) {
                firstChallengeId = challengeId;
            }
        }
        assertEq(resolutionRegistry.openChallengeCountOf(vaultId, 1), 20);

        address overflowChallenger = makeAddr("overflowChallenger");
        stakingToken.mint(overflowChallenger, 100 ether);
        vm.startPrank(overflowChallenger);
        stakingToken.approve(address(agentStaking), type(uint256).max);
        stakingToken.approve(address(rewardPool), type(uint256).max);
        agentStaking.stakeForAgent(1 ether);
        vm.expectRevert();
        vaultFactory.openPublicChallenge(vaultId, validatorOne, keccak256("overflow"), "ipfs://overflow");
        vm.stopPrank();

        vm.prank(finalizer);
        vaultFactory.resolveChallenge(
            vaultId,
            firstChallengeId,
            false,
            ProofOfVaultTypes.CommitteeRole.ResolutionValidator,
            ProofOfVaultTypes.SlashReasonCode.ChallengeAbuse,
            0
        );
        assertEq(resolutionRegistry.openChallengeCountOf(vaultId, 1), 19);

        vm.prank(overflowChallenger);
        vaultFactory.openPublicChallenge(vaultId, validatorOne, keccak256("overflow"), "ipfs://overflow");
        assertEq(resolutionRegistry.openChallengeCountOf(vaultId, 1), 20);
    }

    function _createAndActivateDefaultVault() internal returns (uint256 vaultId) {
        uint64 settlementTime = uint64(block.timestamp + 7 days);
        vaultId = _createVaultRequest(settlementTime, "ipfs://request-default");

        _registerRuleCommittee(vaultId, _addressArray(makerOne), _addressArray(verifierOne));
        _submitRuleDraft(vaultId, makerOne, keccak256("default-draft"), "ipfs://default-draft");
        _submitRuleIssue(
            vaultId,
            verifierOne,
            ProofOfVaultTypes.IssueSeverity.High,
            keccak256("default-issue"),
            "ipfs://default-issue"
        );
        _finalizeRuleSet(
            vaultId,
            keccak256("default-criteria"),
            "ipfs://default-criteria",
            _addressArray(makerOne),
            _addressArray(verifierOne)
        );

        vm.prank(setter);
        vaultFactory.acceptRuleSetAndFund(vaultId);
    }

    function _createVaultRequest(uint64 settlementTime, string memory metadataURI) internal returns (uint256 vaultId) {
        vm.prank(setter);
        vaultId = vaultFactory.createVaultRequest{value: SETUP_DEPOSIT}(
            address(collateralToken), COLLATERAL_AMOUNT, settlementTime, metadataURI
        );
    }

    function _registerRuleCommittee(uint256 vaultId, address[] memory makers, address[] memory verifiers) internal {
        vm.prank(owner);
        vaultFactory.registerRuleCommittee(
            vaultId, makers, verifiers, uint64(block.timestamp + 1 hours), uint64(block.timestamp + 2 hours)
        );
    }

    function _finalizeRuleSet(
        uint256 vaultId,
        bytes32 criteriaHash,
        string memory metadataURI,
        address[] memory approvedMakers,
        address[] memory acceptedVerifiers
    ) internal {
        vm.prank(owner);
        vaultFactory.finalizeRuleSet(
            vaultId,
            criteriaHash,
            metadataURI,
            approvedMakers,
            acceptedVerifiers,
            _emptyAddressArray(),
            _emptyAddressArray()
        );
    }

    function _submitRuleDraft(uint256 vaultId, address maker, bytes32 draftHash, string memory payloadURI) internal {
        vm.prank(maker);
        vaultFactory.submitRuleDraft(vaultId, draftHash, payloadURI);
    }

    function _submitRuleIssue(
        uint256 vaultId,
        address verifier,
        ProofOfVaultTypes.IssueSeverity severity,
        bytes32 issueHash,
        string memory payloadURI
    ) internal {
        vm.prank(verifier);
        vaultFactory.submitRuleIssue(vaultId, severity, issueHash, payloadURI);
    }

    function _registerResolutionCommittee(
        uint256 vaultId,
        address[] memory validators,
        address[] memory auditors,
        uint8 minValidCount
    ) internal {
        vm.prank(owner);
        vaultFactory.registerResolutionCommittee(
            vaultId,
            validators,
            auditors,
            uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 2 hours),
            uint64(block.timestamp + 3 hours),
            uint64(block.timestamp + 4 hours),
            minValidCount
        );
    }

    function _commit(
        uint256 vaultId,
        address validator,
        ProofOfVaultTypes.ResolutionOutcome outcome,
        bytes32 proofHash,
        bytes32 salt
    ) internal {
        bytes32 commitHash = keccak256(abi.encode(vaultId, validator, outcome, proofHash, salt));
        vm.prank(validator);
        vaultFactory.commitResolution(vaultId, commitHash);
    }

    function _reveal(
        uint256 vaultId,
        address validator,
        ProofOfVaultTypes.ResolutionOutcome outcome,
        bytes32 proofHash,
        bytes32 salt,
        string memory payloadURI
    ) internal {
        vm.prank(validator);
        vaultFactory.revealResolution(vaultId, outcome, proofHash, salt, payloadURI);
    }

    function _submitAudit(
        uint256 vaultId,
        address auditor,
        address validator,
        ProofOfVaultTypes.AuditVerdict verdict,
        bytes32 verdictHash,
        string memory payloadURI
    ) internal {
        vm.prank(auditor);
        vaultFactory.submitAuditVerdict(vaultId, validator, verdict, verdictHash, payloadURI);
    }

    function _stakeAgents(address[] memory agents) internal {
        for (uint256 i = 0; i < agents.length; i++) {
            vm.prank(agents[i]);
            agentStaking.stakeForAgent(AGENT_STAKE);
        }
    }

    function _addressArray(address accountOne) internal pure returns (address[] memory accounts) {
        accounts = new address[](1);
        accounts[0] = accountOne;
    }

    function _addressArray(address accountOne, address accountTwo) internal pure returns (address[] memory accounts) {
        accounts = new address[](2);
        accounts[0] = accountOne;
        accounts[1] = accountTwo;
    }

    function _addressArray(address accountOne, address accountTwo, address accountThree)
        internal
        pure
        returns (address[] memory accounts)
    {
        accounts = new address[](3);
        accounts[0] = accountOne;
        accounts[1] = accountTwo;
        accounts[2] = accountThree;
    }

    function _addressArray(address accountOne, address accountTwo, address accountThree, address accountFour)
        internal
        pure
        returns (address[] memory accounts)
    {
        accounts = new address[](4);
        accounts[0] = accountOne;
        accounts[1] = accountTwo;
        accounts[2] = accountThree;
        accounts[3] = accountFour;
    }

    function _addressArray(
        address accountOne,
        address accountTwo,
        address accountThree,
        address accountFour,
        address accountFive
    ) internal pure returns (address[] memory accounts) {
        accounts = new address[](5);
        accounts[0] = accountOne;
        accounts[1] = accountTwo;
        accounts[2] = accountThree;
        accounts[3] = accountFour;
        accounts[4] = accountFive;
    }

    function _addressArray(
        address accountOne,
        address accountTwo,
        address accountThree,
        address accountFour,
        address accountFive,
        address accountSix,
        address accountSeven
    ) internal pure returns (address[] memory accounts) {
        accounts = new address[](7);
        accounts[0] = accountOne;
        accounts[1] = accountTwo;
        accounts[2] = accountThree;
        accounts[3] = accountFour;
        accounts[4] = accountFive;
        accounts[5] = accountSix;
        accounts[6] = accountSeven;
    }

    function _emptyAddressArray() internal pure returns (address[] memory accounts) {
        accounts = new address[](0);
    }

    function _creationFee(uint256 collateralAmount) internal pure returns (uint256) {
        return (collateralAmount * CREATION_FEE_BPS) / 10_000;
    }

    function _settlementFee(uint256 lockedAmount) internal pure returns (uint256) {
        return (lockedAmount * SETTLEMENT_FEE_BPS) / 10_000;
    }
}
