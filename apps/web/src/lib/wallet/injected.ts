export type Eip1193RequestArgs = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

export type Eip1193Provider = {
  request<T = unknown>(args: Eip1193RequestArgs): Promise<T>;
  on?(eventName: string, listener: (...args: unknown[]) => void): void;
  removeListener?(eventName: string, listener: (...args: unknown[]) => void): void;
  providers?: Eip1193Provider[];
  isMetaMask?: boolean;
  isOkxWallet?: boolean;
  isOKExWallet?: boolean;
};

type Eip6963ProviderDetail = {
  info?: {
    name?: string;
    rdns?: string;
    uuid?: string;
  };
  provider?: Eip1193Provider;
};

const announcedProviders: Eip6963ProviderDetail[] = [];

let discoveryListenerAttached = false;

function isProvider(value: unknown): value is Eip1193Provider {
  return Boolean(value && typeof value === "object" && typeof (value as Eip1193Provider).request === "function");
}

function rememberProvider(detail: Eip6963ProviderDetail | undefined): void {
  if (!detail?.provider || !isProvider(detail.provider)) {
    return;
  }

  const alreadyKnown = announcedProviders.some((entry) => entry.provider === detail.provider);
  if (!alreadyKnown) {
    announcedProviders.push(detail);
  }
}

function ensureDiscoveryListener(): void {
  if (typeof window === "undefined" || discoveryListenerAttached) {
    return;
  }

  window.addEventListener("eip6963:announceProvider", ((event: CustomEvent<Eip6963ProviderDetail>) => {
    rememberProvider(event.detail);
  }) as EventListener);
  discoveryListenerAttached = true;
}

function requestProviderAnnouncements(): void {
  if (typeof window === "undefined") {
    return;
  }

  ensureDiscoveryListener();
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

function pushCandidate(candidates: Eip6963ProviderDetail[], detail: Eip6963ProviderDetail | undefined): void {
  if (!detail?.provider || !isProvider(detail.provider)) {
    return;
  }

  if (!candidates.some((candidate) => candidate.provider === detail.provider)) {
    candidates.push(detail);
  }
}

function providerScore(detail: Eip6963ProviderDetail): number {
  const provider = detail.provider;
  const walletName = `${detail.info?.name ?? ""} ${detail.info?.rdns ?? ""}`.toLowerCase();

  if (provider?.isOkxWallet || provider?.isOKExWallet || walletName.includes("okx") || walletName.includes("okex")) {
    return 300;
  }

  if (provider?.isMetaMask || walletName.includes("metamask")) {
    return 200;
  }

  return 100;
}

function collectInjectedProviders({
  requestAnnouncements = true,
}: {
  requestAnnouncements?: boolean;
} = {}): Eip6963ProviderDetail[] {
  if (typeof window === "undefined") {
    return [];
  }

  if (requestAnnouncements) {
    requestProviderAnnouncements();
  }

  const candidates: Eip6963ProviderDetail[] = [];
  pushCandidate(candidates, { info: { name: "OKX Wallet" }, provider: window.okxwallet });

  const ethereum = window.ethereum;
  if (ethereum?.providers?.length) {
    for (const provider of ethereum.providers) {
      pushCandidate(candidates, { provider });
    }
  }

  for (const providerDetail of announcedProviders) {
    pushCandidate(candidates, providerDetail);
  }

  pushCandidate(candidates, { provider: ethereum });
  pushCandidate(candidates, { info: { name: "OKX Legacy Provider" }, provider: window.okexchain });

  return candidates;
}

export function getInjectedEthereumProvider(): Eip1193Provider | undefined {
  return collectInjectedProviders().sort((left, right) => providerScore(right) - providerScore(left))[0]?.provider;
}

export function subscribeToInjectedWalletProviders(onProvider: (provider: Eip1193Provider) => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleProvider = (event: CustomEvent<Eip6963ProviderDetail>) => {
    rememberProvider(event.detail);
    const provider = collectInjectedProviders({ requestAnnouncements: false }).sort(
      (left, right) => providerScore(right) - providerScore(left)
    )[0]?.provider;
    if (provider) {
      onProvider(provider);
    }
  };

  window.addEventListener("eip6963:announceProvider", handleProvider as EventListener);
  requestProviderAnnouncements();

  return () => {
    window.removeEventListener("eip6963:announceProvider", handleProvider as EventListener);
  };
}

export async function waitForInjectedEthereumProvider(timeoutMs = 500): Promise<Eip1193Provider | undefined> {
  const immediateProvider = getInjectedEthereumProvider();
  if (immediateProvider || typeof window === "undefined") {
    return immediateProvider;
  }

  return new Promise((resolve) => {
    let resolved = false;
    let cleanup: () => void = () => undefined;
    const finish = (provider: Eip1193Provider | undefined) => {
      if (resolved) {
        return;
      }

      resolved = true;
      cleanup();
      resolve(provider);
    };
    cleanup = subscribeToInjectedWalletProviders((provider) => finish(provider));
    const timer = window.setTimeout(() => {
      window.clearTimeout(timer);
      finish(getInjectedEthereumProvider());
    }, timeoutMs);

    requestProviderAnnouncements();
  });
}

export function requireInjectedEthereumProvider(): Eip1193Provider {
  const provider = getInjectedEthereumProvider();
  if (!provider) {
    throw new Error("No injected EVM wallet found. Install or unlock OKX Wallet / MetaMask and refresh this page.");
  }

  return provider;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
    okxwallet?: Eip1193Provider;
    okexchain?: Eip1193Provider;
  }
}
