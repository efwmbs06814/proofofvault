import type { Metadata } from 'next';
import './globals.css';
import { WalletProvider } from '@/components/ui/Wallet';
import { ToastProvider } from '@/components/ui/Toast';

const requiredChainId = Number(process.env.NEXT_PUBLIC_PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID ?? 196);

export const metadata: Metadata = {
  title: 'Proof of Vault // Multi-Agent Verification System',
  description: 'Stake-based multi-Agent consensus verification. Trustless, decentralized, verifiable. OKX Build X Hackathon 2026',
  keywords: ['Proof of Vault', 'Multi-agent', 'Staking', 'X Layer', 'OKX', 'Verification', 'Consensus'],
  authors: [{ name: 'Proof of Vault Team' }],
  openGraph: {
    title: 'Proof of Vault',
    description: 'Multi-agent criteria verification system with stake and slash mechanism',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased font-mono">
        <WalletProvider requiredChainId={Number.isFinite(requiredChainId) ? requiredChainId : 196}>
          <ToastProvider>
            {children}
          </ToastProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
