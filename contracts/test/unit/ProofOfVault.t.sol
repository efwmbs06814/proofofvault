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
import {ProofOfVaultToken} from "../../src/ProofOfVaultToken.sol";
import {FeeOnTransferERC20} from "../../src/mocks/FeeOnTransferERC20.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {ProofOfVaultTypes} from "../../src/libraries/ProofOfVaultTypes.sol";

contract ProofOfVaultTest is Test {
    uint16 internal constant CREATION_FEE_BPS = 200;
    uint16 internal constant SETTLEMENT_FEE_BPS = 100;
    uint256 internal constant PROOF_FEE = 5 ether;
    uint64 internal constant DISPUTE_WINDOW = 1 days;
    uint64 internal constant WITHDRAWAL_COOLDOWN = 7 days;
    uint256 internal constant COLLATERAL_AMOUNT = 1_000 ether;
    uint256 internal constant AGENT_STAKE = 100 ether;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal burn = address(0x000000000000000000000000000000000000dEaD);
    address internal setter = makeAddr("setter");
    address internal validator = makeAddr("validator");
    address internal finalizer = makeAddr("finalizer");
    address internal safetyCouncil = makeAddr("safetyCouncil");
    address internal slashReceiver = makeAddr("slashReceiver");

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

    event AgentStaked(address indexed agent, uint256 amount, uint256 newStake);
    event AgentSlashed(
        address indexed agent, address indexed receiver, uint256 amount, ProofOfVaultTypes.SlashReasonCode reasonCode
    );
    event VaultCreated(
        uint256 indexed vaultId,
        address indexed setter,
        address indexed collateralToken,
        uint256 grossCollateralAmount,
        uint256 lockedCollateralAmount,
        uint256 creationFee,
        uint64 settlementTime,
        bytes32 criteriaHash,
        string metadataURI
    );
    event SlashDepositRecorded(uint256 indexed vaultId, address indexed token, uint256 amount);

    function setUp() public {
        collateralToken = new MockERC20("Collateral", "COL", 18);
        stakingToken = new MockERC20("Stake", "STK", 18);

        collateralToken.mint(setter, 10_000 ether);
        stakingToken.mint(validator, 10_000 ether);

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
        feeManager.setV2DepositConfig(50 ether, 100 ether, 10 ether);
        feeManager.setV2BondConfig(25 ether, 20 ether, 30 ether, 20 ether);
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

        vm.prank(setter);
        collateralToken.approve(address(vaultFactory), type(uint256).max);

        vm.prank(setter);
        stakingToken.approve(address(rewardPool), type(uint256).max);

        vm.startPrank(validator);
        stakingToken.approve(address(agentStaking), type(uint256).max);
        stakingToken.approve(address(feeManager), type(uint256).max);
        stakingToken.approve(address(rewardPool), type(uint256).max);
        vm.stopPrank();
    }

    function test_createVaultAndDeposit_locksCollateralAndRegistersCriteria() public {
        uint64 settlementTime = uint64(block.timestamp + 3 days);
        bytes32 criteriaHash = keccak256("criteria");
        uint256 creationFee = _creationFee(COLLATERAL_AMOUNT);
        uint256 lockedAmount = COLLATERAL_AMOUNT - creationFee;

        vm.expectEmit(true, true, true, true, address(vaultFactory));
        emit VaultCreated(
            1,
            setter,
            address(collateralToken),
            COLLATERAL_AMOUNT,
            lockedAmount,
            creationFee,
            settlementTime,
            criteriaHash,
            "ipfs://criteria"
        );

        uint256 vaultId = _createVault(criteriaHash, settlementTime);

        ProofOfVaultTypes.VaultRecord memory vault = vaultFactory.getVault(vaultId);
        assertEq(uint8(vault.status), uint8(ProofOfVaultTypes.VaultStatus.Active));
        assertEq(vault.lockedCollateralAmount, lockedAmount);
        assertEq(collateralToken.balanceOf(treasury), creationFee);
        assertEq(collateralToken.balanceOf(address(vaultEscrow)), lockedAmount);

        ProofOfVaultTypes.CriteriaRecord memory criteria = resolutionRegistry.criteriaOf(vaultId);
        assertEq(criteria.criteriaHash, criteriaHash);
        assertEq(criteria.approvedBy, setter);
    }

    function test_stakeAndFinalizeTrue_releasesCollateralToSetter() public {
        uint256 vaultId = _createVault(keccak256("true"), uint64(block.timestamp + 1 days));
        uint256 creationFee = _creationFee(COLLATERAL_AMOUNT);
        uint256 lockedAmount = COLLATERAL_AMOUNT - creationFee;
        uint256 settlementFee = _settlementFee(lockedAmount);

        vm.expectEmit(true, false, false, true, address(agentStaking));
        emit AgentStaked(validator, AGENT_STAKE, AGENT_STAKE);
        _stakeAgent();

        vm.warp(block.timestamp + 1 days + 1);
        _submitResolution(vaultId, ProofOfVaultTypes.ResolutionOutcome.True, keccak256("resolution:true"));

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        vm.prank(finalizer);
        vaultFactory.finalizeVault(vaultId);

        ProofOfVaultTypes.VaultRecord memory vault = vaultFactory.getVault(vaultId);
        assertEq(uint8(vault.status), uint8(ProofOfVaultTypes.VaultStatus.ResolvedTrue));
        assertEq(collateralToken.balanceOf(setter), 10_000 ether - creationFee - settlementFee);
        assertEq(collateralToken.balanceOf(treasury), creationFee + settlementFee);
        assertEq(collateralToken.balanceOf(address(vaultEscrow)), 0);
        assertEq(stakingToken.balanceOf(burn), PROOF_FEE);
    }

    function test_finalizeFalse_sendsCollateralToCompensationPool() public {
        uint256 vaultId = _createVault(keccak256("false"), uint64(block.timestamp + 1 days));
        uint256 creationFee = _creationFee(COLLATERAL_AMOUNT);
        uint256 lockedAmount = COLLATERAL_AMOUNT - creationFee;
        uint256 settlementFee = _settlementFee(lockedAmount);
        uint256 poolAmount = lockedAmount - settlementFee;

        _stakeAgent();

        vm.warp(block.timestamp + 1 days + 1);
        _submitResolution(vaultId, ProofOfVaultTypes.ResolutionOutcome.False, keccak256("resolution:false"));

        vm.expectEmit(true, true, false, true, address(compensationPool));
        emit SlashDepositRecorded(vaultId, address(collateralToken), poolAmount);

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        vm.prank(finalizer);
        vaultFactory.finalizeVault(vaultId);

        ProofOfVaultTypes.VaultRecord memory vault = vaultFactory.getVault(vaultId);
        assertEq(uint8(vault.status), uint8(ProofOfVaultTypes.VaultStatus.ResolvedFalse));
        assertEq(compensationPool.totalReceivedByToken(address(collateralToken)), poolAmount);
        assertEq(collateralToken.balanceOf(address(compensationPool)), poolAmount);
        assertEq(collateralToken.balanceOf(treasury), creationFee + settlementFee);
        assertEq(collateralToken.balanceOf(setter), 10_000 ether - COLLATERAL_AMOUNT);
    }

    function test_finalizeInvalid_refundsCollateralWithoutSettlementFee() public {
        uint256 vaultId = _createVault(keccak256("invalid"), uint64(block.timestamp + 1 days));
        uint256 creationFee = _creationFee(COLLATERAL_AMOUNT);

        _stakeAgent();

        vm.warp(block.timestamp + 1 days + 1);
        _submitResolution(vaultId, ProofOfVaultTypes.ResolutionOutcome.Invalid, keccak256("resolution:invalid"));

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        vm.prank(finalizer);
        vaultFactory.finalizeVault(vaultId);

        ProofOfVaultTypes.VaultRecord memory vault = vaultFactory.getVault(vaultId);
        assertEq(uint8(vault.status), uint8(ProofOfVaultTypes.VaultStatus.ResolvedInvalid));
        assertEq(collateralToken.balanceOf(setter), 10_000 ether - creationFee);
        assertEq(collateralToken.balanceOf(treasury), creationFee);
        assertEq(stakingToken.balanceOf(burn), PROOF_FEE);
    }

    function test_submitResolutionHash_requiresActiveAgentStake() public {
        uint256 vaultId = _createVault(keccak256("needs-stake"), uint64(block.timestamp + 1 days));

        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(validator);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.CallerNotActiveAgent.selector, validator));
        vaultFactory.submitResolutionHash(
            vaultId, ProofOfVaultTypes.ResolutionOutcome.True, keccak256("resolution:unauthorized"), "ipfs://resolution"
        );
    }

    function test_markVaultDisputed_blocksFinalizationUntilNewSubmission() public {
        uint256 vaultId = _createVault(keccak256("dispute"), uint64(block.timestamp + 1 days));
        _stakeAgent();

        vm.warp(block.timestamp + 1 days + 1);
        _submitResolution(vaultId, ProofOfVaultTypes.ResolutionOutcome.True, keccak256("resolution:dispute"));

        vm.prank(safetyCouncil);
        vaultFactory.markVaultDisputed(vaultId, "ipfs://dispute");

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        vm.prank(finalizer);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.VaultInDispute.selector, vaultId));
        vaultFactory.finalizeVault(vaultId);

        ProofOfVaultTypes.VaultRecord memory vault = vaultFactory.getVault(vaultId);
        assertEq(uint8(vault.status), uint8(ProofOfVaultTypes.VaultStatus.Disputed));
    }

    function test_submitResolutionHash_rejectsReplacementWithoutDispute() public {
        uint256 vaultId = _createVault(keccak256("single-resolution"), uint64(block.timestamp + 1 days));
        _stakeAgent();

        vm.warp(block.timestamp + 1 days + 1);
        _submitResolution(vaultId, ProofOfVaultTypes.ResolutionOutcome.True, keccak256("resolution:first"));

        vm.prank(validator);
        vm.expectRevert(abi.encodeWithSelector(ResolutionRegistry.ActiveResolutionExists.selector, vaultId));
        vaultFactory.submitResolutionHash(
            vaultId,
            ProofOfVaultTypes.ResolutionOutcome.False,
            keccak256("resolution:replacement"),
            "ipfs://resolution-replacement"
        );
    }

    function test_markVaultDisputed_allowsReplacementResolutionAndFinalize() public {
        uint256 vaultId = _createVault(keccak256("re-submit-after-dispute"), uint64(block.timestamp + 1 days));
        uint256 creationFee = _creationFee(COLLATERAL_AMOUNT);
        uint256 lockedAmount = COLLATERAL_AMOUNT - creationFee;
        uint256 settlementFee = _settlementFee(lockedAmount);
        uint256 poolAmount = lockedAmount - settlementFee;

        _stakeAgent();

        vm.warp(block.timestamp + 1 days + 1);
        _submitResolution(vaultId, ProofOfVaultTypes.ResolutionOutcome.True, keccak256("resolution:original"));

        vm.prank(safetyCouncil);
        vaultFactory.markVaultDisputed(vaultId, "ipfs://dispute-reason");

        vm.prank(validator);
        vaultFactory.submitResolutionHash(
            vaultId,
            ProofOfVaultTypes.ResolutionOutcome.False,
            keccak256("resolution:replacement"),
            "ipfs://resolution-replacement"
        );

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        vm.prank(finalizer);
        vaultFactory.finalizeVault(vaultId);

        ProofOfVaultTypes.VaultRecord memory vault = vaultFactory.getVault(vaultId);
        assertEq(uint8(vault.status), uint8(ProofOfVaultTypes.VaultStatus.ResolvedFalse));
        assertEq(compensationPool.totalReceivedByToken(address(collateralToken)), poolAmount);
    }

    function test_finalizeVault_requiresAuthorizedFinalizer() public {
        uint256 vaultId = _createVault(keccak256("finalizer-auth"), uint64(block.timestamp + 1 days));
        _stakeAgent();

        vm.warp(block.timestamp + 1 days + 1);
        _submitResolution(vaultId, ProofOfVaultTypes.ResolutionOutcome.True, keccak256("resolution:auth"));

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        vm.prank(validator);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.CallerNotAuthorizedFinalizer.selector, validator));
        vaultFactory.finalizeVault(vaultId);
    }

    function test_slashAgent_movesStakeToReceiver() public {
        _stakeAgent();

        vm.expectEmit(true, true, false, true, address(agentStaking));
        emit AgentSlashed(validator, slashReceiver, 40 ether, ProofOfVaultTypes.SlashReasonCode.MaliciousResolution);

        vm.prank(owner);
        agentStaking.slashAgent(
            validator, 40 ether, ProofOfVaultTypes.SlashReasonCode.MaliciousResolution, slashReceiver
        );

        assertEq(agentStaking.activeStakeOf(validator), 60 ether);
        assertEq(stakingToken.balanceOf(slashReceiver), 40 ether);
    }

    function test_agentStaking_defaultsToNoUnstake() public {
        _stakeAgent();

        vm.prank(validator);
        vm.expectRevert(AgentStaking.WithdrawalDisabled.selector);
        agentStaking.requestWithdrawal(1 ether);
    }

    function test_ownerCanSeedRegisteredAgentStakesWhileWithdrawalsStayDisabled() public {
        address seededAgent = makeAddr("seededAgent");
        address[] memory agents = new address[](2);
        agents[0] = validator;
        agents[1] = seededAgent;

        stakingToken.mint(owner, 10 ether);
        vm.startPrank(owner);
        stakingToken.approve(address(agentStaking), 10 ether);
        agentStaking.seedAgentStakesFrom(owner, agents, 10 ether);
        vm.stopPrank();

        assertEq(agentStaking.activeStakeOf(validator), 5 ether);
        assertEq(agentStaking.activeStakeOf(seededAgent), 5 ether);
        assertEq(agentStaking.totalAccountedStake(), 10 ether);

        vm.prank(seededAgent);
        vm.expectRevert(AgentStaking.WithdrawalDisabled.selector);
        agentStaking.requestWithdrawal(1 ether);
    }

    function test_seedAgentStakesFrom_rejectsDuplicateAgents() public {
        address[] memory agents = new address[](2);
        agents[0] = validator;
        agents[1] = validator;

        stakingToken.mint(owner, 10 ether);
        vm.startPrank(owner);
        stakingToken.approve(address(agentStaking), 10 ether);
        vm.expectRevert(abi.encodeWithSelector(AgentStaking.DuplicateAgent.selector, validator));
        agentStaking.seedAgentStakesFrom(owner, agents, 10 ether);
        vm.stopPrank();
    }

    function test_slashAgent_canConsumePendingWithdrawalStake() public {
        _stakeAgent();

        vm.prank(owner);
        agentStaking.setWithdrawalsEnabled(true);

        vm.prank(validator);
        agentStaking.requestWithdrawal(70 ether);

        vm.prank(owner);
        agentStaking.slashAgent(
            validator, 90 ether, ProofOfVaultTypes.SlashReasonCode.MaliciousResolution, slashReceiver
        );

        (uint256 pendingAmount, uint64 readyAt) = agentStaking.pendingWithdrawalOf(validator);
        assertEq(agentStaking.activeStakeOf(validator), 0);
        assertEq(pendingAmount, 10 ether);
        assertGt(readyAt, 0);
        assertEq(stakingToken.balanceOf(slashReceiver), 90 ether);
    }

    function test_rescueToken_rejectsTrackedCompensationBalances() public {
        uint256 vaultId = _createVault(keccak256("pool-locked"), uint64(block.timestamp + 1 days));
        _stakeAgent();

        vm.warp(block.timestamp + 1 days + 1);
        _submitResolution(vaultId, ProofOfVaultTypes.ResolutionOutcome.False, keccak256("resolution:pool-locked"));

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        vm.prank(finalizer);
        vaultFactory.finalizeVault(vaultId);

        uint256 trackedBalance = compensationPool.totalReceivedByToken(address(collateralToken));

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                CompensationPool.InsufficientRescueableBalance.selector, address(collateralToken), 1 ether, 0
            )
        );
        compensationPool.rescueToken(address(collateralToken), owner, 1 ether);

        assertEq(collateralToken.balanceOf(address(compensationPool)), trackedBalance);
    }

    function test_rescueToken_allowsSurplusThatWasNotRecordedAsCompensation() public {
        collateralToken.mint(address(compensationPool), 25 ether);

        vm.prank(owner);
        compensationPool.rescueToken(address(collateralToken), owner, 10 ether);

        assertEq(collateralToken.balanceOf(owner), 10 ether);
        assertEq(collateralToken.balanceOf(address(compensationPool)), 15 ether);
    }

    function test_createVaultAndDeposit_rejectsFeeOnTransferCollateral() public {
        FeeOnTransferERC20 taxedCollateral = new FeeOnTransferERC20("Taxed Collateral", "TCOL", 18, 100);
        taxedCollateral.mint(setter, COLLATERAL_AMOUNT);
        vm.prank(owner);
        vaultFactory.setCollateralPolicy(address(taxedCollateral), true, COLLATERAL_AMOUNT);

        vm.startPrank(setter);
        taxedCollateral.approve(address(vaultFactory), type(uint256).max);
        vm.expectRevert();
        vaultFactory.createVaultAndDeposit(
            address(taxedCollateral),
            COLLATERAL_AMOUNT,
            uint64(block.timestamp + 1 days),
            keccak256("fee-on-transfer-collateral"),
            "ipfs://fee-on-transfer"
        );
        vm.stopPrank();
    }

    function test_stakeForAgent_rejectsFeeOnTransferStakeToken() public {
        FeeOnTransferERC20 taxedStake = new FeeOnTransferERC20("Taxed Stake", "TSTK", 18, 100);
        taxedStake.mint(validator, AGENT_STAKE);

        AgentStaking taxedStaking = new AgentStaking(owner, address(taxedStake), WITHDRAWAL_COOLDOWN);
        vm.prank(validator);
        taxedStake.approve(address(taxedStaking), type(uint256).max);

        vm.prank(validator);
        vm.expectRevert();
        taxedStaking.stakeForAgent(AGENT_STAKE);
    }

    function test_proofOfVaultToken_mintsFixedSupplyOnce() public {
        ProofOfVaultToken pov = new ProofOfVaultToken(treasury, 1_000_000 ether);

        assertEq(pov.name(), "Proof of Vault");
        assertEq(pov.symbol(), "POV");
        assertEq(pov.decimals(), 18);
        assertEq(pov.totalSupply(), 1_000_000 ether);
        assertEq(pov.balanceOf(treasury), 1_000_000 ether);

        vm.prank(treasury);
        assertTrue(pov.transfer(setter, 1 ether));

        assertEq(pov.totalSupply(), 1_000_000 ether);
        assertEq(pov.balanceOf(setter), 1 ether);
    }

    function test_proofOfVaultToken_rejectsZeroInitialSupply() public {
        vm.expectRevert(ProofOfVaultToken.InvalidInitialSupply.selector);
        new ProofOfVaultToken(treasury, 0);
    }

    function test_vaultEscrow_rejectsUnfundedCollateralAccounting() public {
        vm.prank(owner);
        vaultEscrow.setAuthorizedController(owner, true);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                VaultEscrow.InsufficientFundedCollateral.selector, address(collateralToken), 10 ether, 0
            )
        );
        vaultEscrow.lockCollateral(999, setter, address(collateralToken), 10 ether);
    }

    function test_vaultEscrow_rescueTokenProtectsAccountedCollateral() public {
        vm.prank(owner);
        vaultEscrow.setAuthorizedController(owner, true);

        collateralToken.mint(address(vaultEscrow), 100 ether);

        vm.prank(owner);
        vaultEscrow.lockCollateral(999, setter, address(collateralToken), 90 ether);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                VaultEscrow.InsufficientRescueableBalance.selector, address(collateralToken), 11 ether, 10 ether
            )
        );
        vaultEscrow.rescueToken(address(collateralToken), owner, 11 ether);

        vm.prank(owner);
        vaultEscrow.rescueToken(address(collateralToken), owner, 10 ether);

        assertEq(collateralToken.balanceOf(address(vaultEscrow)), 90 ether);
        assertEq(vaultEscrow.accountedCollateralByToken(address(collateralToken)), 90 ether);
    }

    function testFuzz_v1CustodyConservationAfterFinalization(uint256 collateralAmount, uint8 outcomeSeed) public {
        collateralAmount = bound(collateralAmount, 10_000, 1_000_000 ether);
        MockERC20 fuzzCollateral = new MockERC20("Fuzz Collateral", "FCOL", 18);
        fuzzCollateral.mint(setter, collateralAmount);

        vm.prank(owner);
        vaultFactory.setCollateralPolicy(address(fuzzCollateral), true, collateralAmount);

        vm.prank(setter);
        fuzzCollateral.approve(address(vaultFactory), type(uint256).max);

        uint64 settlementTime = uint64(block.timestamp + 1 days);
        vm.prank(setter);
        uint256 vaultId = vaultFactory.createVaultAndDeposit(
            address(fuzzCollateral), collateralAmount, settlementTime, keccak256("fuzz-criteria"), "ipfs://fuzz"
        );

        _stakeAgent();

        ProofOfVaultTypes.ResolutionOutcome outcome = outcomeSeed % 3 == 0
            ? ProofOfVaultTypes.ResolutionOutcome.True
            : outcomeSeed % 3 == 1
                ? ProofOfVaultTypes.ResolutionOutcome.False
                : ProofOfVaultTypes.ResolutionOutcome.Invalid;

        vm.warp(settlementTime + 1);
        vm.prank(validator);
        vaultFactory.submitResolutionHash(vaultId, outcome, keccak256("fuzz-resolution"), "ipfs://fuzz-resolution");

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        vm.prank(finalizer);
        vaultFactory.finalizeVault(vaultId);

        uint256 creationFee = _creationFee(collateralAmount);
        uint256 lockedAmount = collateralAmount - creationFee;
        uint256 settlementFee =
            outcome == ProofOfVaultTypes.ResolutionOutcome.Invalid ? 0 : _settlementFee(lockedAmount);
        uint256 expectedSetterBalance = outcome == ProofOfVaultTypes.ResolutionOutcome.True
            ? lockedAmount - settlementFee
            : outcome == ProofOfVaultTypes.ResolutionOutcome.Invalid ? lockedAmount : 0;
        uint256 expectedPoolBalance =
            outcome == ProofOfVaultTypes.ResolutionOutcome.False ? lockedAmount - settlementFee : 0;

        assertEq(fuzzCollateral.balanceOf(address(vaultEscrow)), 0);
        assertEq(vaultEscrow.accountedCollateralByToken(address(fuzzCollateral)), 0);
        assertEq(fuzzCollateral.balanceOf(setter), expectedSetterBalance);
        assertEq(fuzzCollateral.balanceOf(treasury), creationFee + settlementFee);
        assertEq(fuzzCollateral.balanceOf(address(compensationPool)), expectedPoolBalance);
        assertEq(
            fuzzCollateral.balanceOf(setter) + fuzzCollateral.balanceOf(treasury)
                + fuzzCollateral.balanceOf(address(compensationPool)),
            collateralAmount
        );
    }

    function _createVault(bytes32 criteriaHash, uint64 settlementTime) internal returns (uint256 vaultId) {
        vm.prank(setter);
        vaultId = vaultFactory.createVaultAndDeposit(
            address(collateralToken), COLLATERAL_AMOUNT, settlementTime, criteriaHash, "ipfs://criteria"
        );
    }

    function _stakeAgent() internal {
        vm.prank(validator);
        agentStaking.stakeForAgent(AGENT_STAKE);
    }

    function _submitResolution(uint256 vaultId, ProofOfVaultTypes.ResolutionOutcome outcome, bytes32 resolutionHash)
        internal
    {
        vm.prank(validator);
        vaultFactory.submitResolutionHash(vaultId, outcome, resolutionHash, "ipfs://resolution");
    }

    function _creationFee(uint256 collateralAmount) internal pure returns (uint256) {
        return (collateralAmount * CREATION_FEE_BPS) / 10_000;
    }

    function _settlementFee(uint256 lockedAmount) internal pure returns (uint256) {
        return (lockedAmount * SETTLEMENT_FEE_BPS) / 10_000;
    }

    function test_createVault_rejectsUnconfiguredCollateral() public {
        MockERC20 unknownCollateral = new MockERC20("Unknown", "UNK", 18);
        unknownCollateral.mint(setter, COLLATERAL_AMOUNT);

        vm.startPrank(setter);
        unknownCollateral.approve(address(vaultFactory), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.CollateralNotAllowed.selector, address(unknownCollateral)));
        vaultFactory.createVaultAndDeposit(
            address(unknownCollateral),
            COLLATERAL_AMOUNT,
            uint64(block.timestamp + 1 days),
            keccak256("unknown"),
            "ipfs://unknown"
        );
        vm.stopPrank();
    }

    function test_setCollateralPolicy_canOnlyLowerAfterFreeze() public {
        vm.prank(owner);
        vaultFactory.freezeCollateralPolicy();

        vm.prank(owner);
        vaultFactory.setCollateralPolicy(address(collateralToken), true, COLLATERAL_AMOUNT / 2);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.CollateralPolicyFrozen.selector, address(collateralToken)));
        vaultFactory.setCollateralPolicy(address(collateralToken), true, COLLATERAL_AMOUNT);

        vm.prank(owner);
        vaultFactory.setCollateralPolicy(address(collateralToken), false, COLLATERAL_AMOUNT / 2);

        vm.prank(setter);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.CollateralNotAllowed.selector, address(collateralToken)));
        vaultFactory.createVaultAndDeposit(
            address(collateralToken),
            COLLATERAL_AMOUNT / 4,
            uint64(block.timestamp + 1 days),
            keccak256("paused"),
            "ipfs://paused"
        );
    }
}
