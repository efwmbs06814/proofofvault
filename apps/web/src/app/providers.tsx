/**
 * Providers - React Context 提供者组件
 * 
 * 集中管理全局状态和 Context
 */

'use client';

import { WalletProvider as WalletProviderComponent } from '@/components/ui/Wallet';
import { ToastProvider } from '@/components/ui/Toast';

export function WalletProvider({
  children,
  requiredChainId = 196,
}: {
  children: React.ReactNode;
  requiredChainId?: number;
}) {
  return (
    <WalletProviderComponent requiredChainId={requiredChainId}>
      {children}
    </WalletProviderComponent>
  );
}

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  );
}
