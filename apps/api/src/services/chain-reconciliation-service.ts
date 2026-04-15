import type { VaultService } from "./vault-service.js";
import type { WorkflowService } from "./workflow-service.js";

export class ChainReconciliationService {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly workflowService: WorkflowService,
    private readonly vaultService: VaultService,
    private readonly intervalMs: number
  ) {}

  start(): void {
    if (this.intervalMs <= 0 || this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.reconcileOnce();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async reconcileOnce(): Promise<void> {
    const vaults = await this.workflowService.listVaultSummaries();
    await Promise.allSettled(
      vaults
        .filter((vault) => vault.externalVaultId !== undefined)
        .map((vault) => this.vaultService.syncOnchainSnapshot(vault.id))
    );
  }
}
