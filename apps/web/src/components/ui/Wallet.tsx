'use client';

import React, { useState, useEffect, useCallback, useContext, createContext } from 'react';
import { Logo } from './Logo';
import {
  getInjectedEthereumProvider,
  subscribeToInjectedWalletProviders,
  waitForInjectedEthereumProvider,
  type Eip1193Provider,
} from '@/lib/wallet/injected';

interface WalletState {
  address: string | null;
  balance: string | null;
  chainId: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

const defaultState: WalletState = {
  address: null,
  balance: null,
  chainId: null,
  isConnected: false,
  isConnecting: false,
  error: null,
};

interface WalletContextValue extends WalletState {
  requiredChainId: number;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: (chainId: number) => Promise<void>;
}

const WalletContext = React.createContext<WalletContextValue | undefined>(undefined);

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within WalletProvider');
  return context;
}

interface WalletProviderProps {
  children: React.ReactNode;
  requiredChainId?: number;
}

const DEFAULT_REQUIRED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID ?? 196);

export function WalletProvider({ children, requiredChainId = DEFAULT_REQUIRED_CHAIN_ID }: WalletProviderProps) {
  const [state, setState] = useState<WalletState>(defaultState);

  const fetchAccountInfo = useCallback(async () => {
    const ethereum = getInjectedEthereumProvider();
    if (!ethereum) return;

    try {
      const accounts = await ethereum.request<string[]>({ method: 'eth_accounts' });
      const chainId = await ethereum.request<string>({ method: 'eth_chainId' });

      if (accounts.length === 0) {
        setState((prev) => ({
          ...prev,
          address: null,
          balance: null,
          chainId: parseInt(chainId, 16),
          isConnected: false,
          isConnecting: false,
        }));
        return;
      }

      const balance = await ethereum.request<string>({
        method: 'eth_getBalance',
        params: [accounts[0], 'latest'],
      });

      const balanceInEth = parseInt(balance, 16) / 1e18;

      setState({
        address: accounts[0],
        balance: balanceInEth.toFixed(4),
        chainId: parseInt(chainId, 16),
        isConnected: true,
        isConnecting: false,
        error: null,
      });
    } catch (err) {
      console.error('Failed to fetch account info:', err);
    }
  }, []);

  const connect = useCallback(async () => {
    const ethereum = await waitForInjectedEthereumProvider();
    if (!ethereum) {
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: 'No injected EVM wallet found. Install or unlock OKX Wallet / MetaMask and refresh this page.',
      }));
      return;
    }

    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      const accounts = await ethereum.request<string[]>({
        method: 'eth_requestAccounts',
      });

      if (accounts.length > 0) {
        const chainId = await ethereum.request<string>({ method: 'eth_chainId' });
        const balance = await ethereum.request<string>({
          method: 'eth_getBalance',
          params: [accounts[0], 'latest'],
        });

        const balanceInEth = parseInt(balance, 16) / 1e18;

        setState({
          address: accounts[0],
          balance: balanceInEth.toFixed(4),
          chainId: parseInt(chainId, 16),
          isConnected: true,
          isConnecting: false,
          error: null,
        });
        return;
      }

      setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: 'Wallet did not return an account. Unlock your wallet and try again.',
      }));
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: err.message || 'Connection failed',
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState(defaultState);
  }, []);

  const switchNetwork = useCallback(async (chainId: number) => {
    const ethereum = getInjectedEthereumProvider();
    if (!ethereum) return;

    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
    } catch (err: any) {
      if (err.code === 4902) {
        const networks: Record<number, any> = {
          196: {
            chainId: '0xC4',
            chainName: 'X Layer',
            rpcUrls: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'],
            blockExplorerUrls: ['https://www.oklink.com/xlayer'],
            nativeCurrency: {
              name: 'OKB',
              symbol: 'OKB',
              decimals: 18,
            },
          },
        };

        if (networks[chainId]) {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [networks[chainId]],
          });
          return;
        }
      }
      setState((prev) => ({ ...prev, error: 'Failed to switch network' }));
    }
  }, []);

  useEffect(() => {
    let currentProvider: Eip1193Provider | undefined;

    const handleAccountsChanged = (accounts: unknown) => {
      if (!Array.isArray(accounts)) {
        return;
      }
      if (accounts.length === 0) {
        disconnect();
      } else {
        fetchAccountInfo();
      }
    };

    const handleChainChanged = () => {
      fetchAccountInfo();
    };

    const detachProvider = () => {
      currentProvider?.removeListener?.('accountsChanged', handleAccountsChanged);
      currentProvider?.removeListener?.('chainChanged', handleChainChanged);
      currentProvider = undefined;
    };

    const attachProvider = (provider: Eip1193Provider | undefined) => {
      if (!provider || currentProvider === provider) {
        return;
      }

      detachProvider();
      currentProvider = provider;
      provider.on?.('accountsChanged', handleAccountsChanged);
      provider.on?.('chainChanged', handleChainChanged);
      fetchAccountInfo();
    };

    attachProvider(getInjectedEthereumProvider());
    const cleanupDiscovery = subscribeToInjectedWalletProviders(() => {
      attachProvider(getInjectedEthereumProvider());
    });

    return () => {
      cleanupDiscovery();
      detachProvider();
    };
  }, [fetchAccountInfo, disconnect]);

  useEffect(() => {
    if (state.isConnected && state.chainId && state.chainId !== requiredChainId) {
      setState((prev) => ({
        ...prev,
        error: `Please switch to X Layer mainnet (Chain ID: ${requiredChainId})`,
      }));
    }
  }, [state.isConnected, state.chainId, requiredChainId]);

  return (
    <WalletContext.Provider
      value={{
        ...state,
        requiredChainId,
        connect,
        disconnect,
        switchNetwork,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

interface ConnectButtonProps {
  className?: string;
}

export function ConnectButton({ className = '' }: ConnectButtonProps) {
  const { address, isConnected, isConnecting, connect, error } = useWallet();

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (isConnecting) {
    return (
      <button disabled className={`px-4 py-2 border border-matrix-dark text-matrix-dark font-mono ${className}`}>
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          CONNECTING...
        </span>
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <button
        onClick={() => {
          navigator.clipboard.writeText(address);
        }}
        className={`px-4 py-2 border border-matrix-green text-matrix-green font-mono hover:bg-matrix-green hover:text-black transition-all ${className}`}
        title="Click to copy address"
        style={{ boxShadow: '0 0 10px rgba(0, 255, 65, 0.3)' }}
      >
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-matrix-green animate-pulse" />
          <span style={{ textShadow: '0 0 5px #00ff41' }}>{formatAddress(address)}</span>
        </span>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={connect}
        className={`px-4 py-2 border border-matrix-green text-matrix-green font-mono hover:bg-matrix-green hover:text-black transition-all ${className}`}
        style={{ boxShadow: '0 0 10px rgba(0, 255, 65, 0.3)' }}
      >
        [ CONNECT ]
      </button>
      {error && (
        <p className="mt-2 max-w-xs text-xs text-red-400 font-mono" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

interface WalletInfoProps {
  className?: string;
}

export function WalletInfo({ className = '' }: WalletInfoProps) {
  const { address, balance, chainId, isConnected, requiredChainId, switchNetwork } = useWallet();

  if (!isConnected || !address) return null;

  const chainName = chainId === requiredChainId
    ? 'X Layer'
    : `Chain ${chainId}`;

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div className="text-right">
        <p className="text-sm font-medium text-matrix-green">{balance} OKB</p>
        <p className="text-xs text-matrix-dark">{chainName}</p>
      </div>
      <button
        onClick={() => navigator.clipboard.writeText(address)}
        className="px-3 py-1.5 border border-matrix-dark text-matrix-dark text-sm font-mono hover:border-matrix-green hover:text-matrix-green transition-colors"
        title="Click to copy"
      >
        {address.slice(0, 6)}...{address.slice(-4)}
      </button>
      {chainId !== requiredChainId && (
        <button
          onClick={() => switchNetwork(requiredChainId)}
          className="px-3 py-1.5 border border-yellow-500 text-yellow-400 text-sm font-mono hover:bg-yellow-500 hover:text-black transition-colors"
        >
          SWITCH NET
        </button>
      )}
    </div>
  );
}

export default WalletProvider;
