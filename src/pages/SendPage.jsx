/**
 * Send & Withdraw page - Updated for Monad (EVM).
 * - Send: Transfer MON from your wallet to any address (e.g. treasury).
 * - Withdraw: Withdraw your credited balance from the treasury to your wallet.
 */

import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardBody, Button } from '@nextui-org/react';
import { Send, ArrowDownToLine, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { ethers } from 'ethers';
import { MONAD_LOGO_PRIMARY, MONAD_LOGO_ICON } from '../config.js';

import { getUserBalance, withdrawFunds, getUserByWallet, getUserByUsername, getPaymentLinkByAlias, recordPayment, supabase } from '../lib/supabase.js';
import { useAppWallet } from '../hooks/useAppWallet.js';

// When VITE_BACKEND_URL is set (e.g. local backend on 3400), use it; else use same-origin /api (Vercel serverless)
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const WITHDRAW_URL = BACKEND_URL ? `${BACKEND_URL}/withdraw` : '/api/withdraw';

export default function SendPage() {
  const location = useLocation();
  const hash = (location.hash || '#send').replace('#', '') || 'send';
  const [activeTab, setActiveTab] = useState(hash === 'withdraw' ? 'withdraw' : 'send');

  useEffect(() => {
    const h = (location.hash || '#send').replace('#', '') || 'send';
    setActiveTab(h === 'withdraw' ? 'withdraw' : 'send');
  }, [location.hash]);

  return (
    <div className="flex flex-col items-center w-full min-h-screen bg-light-white pb-24 pt-6 px-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-center gap-2 mb-6">
          <img src={MONAD_LOGO_PRIMARY} alt="Monad" className="h-10 w-auto object-contain" />
          <h1 className="font-bold text-2xl text-gray-900">Send & Withdraw</h1>
        </div>


        <div className="flex rounded-2xl bg-primary-100 p-1 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('send')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-all ${activeTab === 'send' ? 'bg-primary text-white shadow' : 'text-primary-700 hover:bg-primary-50'
              }`}
          >
            <Send className="size-5" />
            Send
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('withdraw')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-all ${activeTab === 'withdraw' ? 'bg-primary text-white shadow' : 'text-primary-700 hover:bg-primary-50'
              }`}
          >
            <ArrowDownToLine className="size-5" />
            Withdraw
          </button>
        </div>

        {activeTab === 'send' ? <SendTab /> : <WithdrawTab />}
      </div>
    </div>
  );
}

function SendTab() {
  const { account, isConnected, connect, signer } = useAppWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('0.1');
  const [transferLoading, setTransferLoading] = useState(false);
  const [lastTx, setLastTx] = useState(null);

  const handleTransfer = async () => {
    if (!isConnected || !signer) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!recipient.trim() || !amount) {
      toast.error('Please enter recipient and amount');
      return;
    }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Invalid amount');
      return;
    }

    // Alıcı kullanıcı adı / alias'ını çöz
    const rawRecipient = recipient.trim();
    const alias = rawRecipient.replace(/\.privatepay$/i, '').toLowerCase().trim();

    let recipientUsername = null;    // Supabase'de balance yazılacak username
    let recipientWalletAddress = null; // Supabase users/payment_links kayıtlı cüzdan (bilgi amaçlı)

    try {
      // 1. users tablosunda username olarak ara
      const userByName = await getUserByUsername(alias);
      if (userByName) {
        recipientUsername = userByName.username;
        recipientWalletAddress = userByName.wallet_address;
      }

      if (!recipientUsername && supabase) {
        // 2. payment_links tablosunda alias olarak ara
        const linkByAlias = await getPaymentLinkByAlias(alias);
        if (linkByAlias) {
          recipientUsername = linkByAlias.alias || linkByAlias.username;
          recipientWalletAddress = linkByAlias.wallet_address;
        }
      }

      if (!recipientUsername && supabase) {
        // 3. payment_links tablosunda username olarak ara
        const { data: linkByUser } = await supabase
          .from('payment_links')
          .select('wallet_address, alias, username')
          .eq('username', alias)
          .maybeSingle();
        if (linkByUser) {
          recipientUsername = linkByUser.alias || linkByUser.username;
          recipientWalletAddress = linkByUser.wallet_address;
        }
      }

      // 4. Fallback: 0x adresi girilmişse users'ta wallet_address ile ara
      if (!recipientUsername && ethers.isAddress(rawRecipient) && supabase) {
        const userByWallet = await getUserByWallet(rawRecipient);
        if (userByWallet) {
          recipientUsername = userByWallet.username;
          recipientWalletAddress = userByWallet.wallet_address;
        } else {
          // Henüz kayıtlı değil, cüzdan adresini username gibi kullan
          recipientUsername = rawRecipient.toLowerCase();
          recipientWalletAddress = rawRecipient;
        }
      }

      if (!recipientUsername) {
        toast.error(`"${alias}" not found! Please enter a valid username or wallet address.`);
        return;
      }
    } catch (err) {
      console.error('Recipient resolution error:', err);
      toast.error('Recipient not found, please try again');
      return;
    }

    // Send to treasury (not directly to recipient — privacy shield)
    const treasuryAddress = import.meta.env.VITE_MONAD_TREASURY_ADDRESS?.trim();
    if (!treasuryAddress || !ethers.isAddress(treasuryAddress)) {
      toast.error('Treasury address not configured! Check .env file.');
      return;
    }

    try {
      setTransferLoading(true);
      toast.loading('Submitting transaction...', { id: 'tx-loading' });

      // SENDER → TREASURY (privacy shield: recipient wallet stays hidden)
      const tx = await signer.sendTransaction({
        to: treasuryAddress,
        value: ethers.parseEther(amount.toString())
      });

      toast.loading('Awaiting blockchain confirmation...', { id: 'tx-loading' });
      const receipt = await tx.wait();

      toast.dismiss('tx-loading');

      if (!receipt || receipt.status === 0) {
        throw new Error('Transaction failed on-chain');
      }

      // Credit recipient balance in Supabase
      await recordPayment(account, recipientUsername, amountNum, tx.hash);

      window.dispatchEvent(new Event('balance-updated'));
      window.dispatchEvent(new Event('transactions-updated'));

      const shortHash = tx.hash ? `${tx.hash.slice(0, 8)}...${tx.hash.slice(-6)}` : '';
      setLastTx({
        hash: tx.hash,
        explorerLink: `${import.meta.env.VITE_MONAD_EXPLORER || 'https://testnet.monadexplorer.com'}/tx/${tx.hash}`,
        recipientUsername
      });

      toast.success(
        (t) => (
          <div onClick={() => { window.open(`${import.meta.env.VITE_MONAD_EXPLORER}/tx/${tx.hash}`, '_blank'); toast.dismiss(t.id); }} className="cursor-pointer">
            <p className="font-bold">✅ Sent!</p>
            <p className="text-xs text-gray-600">Recipient: <span className="font-mono font-bold">{recipientUsername}</span></p>
            <p className="text-xs text-gray-500">TX: {shortHash} (click to view)</p>
          </div>
        ),
        { duration: 8000 }
      );

      setAmount('0.1');
      setRecipient('');
    } catch (error) {
      toast.dismiss('tx-loading');
      console.error('[Send] Transfer failed:', error);
      toast.error(error.message?.slice(0, 80) || 'Transfer failed');
    } finally {
      setTransferLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <Card className="bg-white border border-gray-200 shadow-md rounded-3xl">
        <CardBody className="p-8 flex flex-col items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center p-3">
            <img src={MONAD_LOGO_ICON} alt="Monad" className="w-full h-full object-contain" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-xl font-bold text-gray-900">Connect wallet to send</h3>
            <p className="text-gray-500 text-sm">Connect your wallet to send private MON transfers.</p>
          </div>
          <Button onClick={connect} className="w-full bg-primary hover:bg-primary-800 text-white font-bold h-12 rounded-2xl">
            Connect Wallet
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="bg-white border border-gray-200 shadow-md rounded-3xl">
      <CardBody className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-primary-50 flex items-center justify-center p-2">
            <img src={MONAD_LOGO_ICON} alt="Monad" className="w-full h-full object-contain" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Private MON Send</h3>
            <p className="text-xs text-gray-500">Recipient wallet stays hidden — routed via Treasury</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Recipient (username or 0x address)</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="alice or alice.privatepay or 0x..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Amount (MON)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              step="0.0001"
              min="0"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
            />
          </div>
          {lastTx && (
            <div className="p-4 rounded-2xl border bg-green-50 border-green-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-bold text-green-900">Transfer Complete</span>
                </div>
                <a href={lastTx.explorerLink} target="_blank" rel="noopener noreferrer" className="text-xs underline flex items-center gap-1 text-green-700">
                  View <ExternalLink size={12} />
                </a>
              </div>
              <p className="text-xs text-green-600 mt-1">Recipient balance updated: <span className="font-bold">{lastTx.recipientUsername}</span></p>
            </div>
          )}
          <Button
            onClick={handleTransfer}
            isLoading={transferLoading}
            isDisabled={!recipient || !amount || transferLoading}
            className="w-full bg-primary hover:bg-primary-800 text-white font-semibold h-12 rounded-2xl"
            startContent={!transferLoading && <Send size={18} />}
          >
            {transferLoading ? 'Sending...' : 'Send Privately'}
          </Button>
          <p className="text-xs text-gray-500 text-center">🔒 Private routing via Treasury — recipient identity protected</p>
        </div>
      </CardBody>
    </Card>
  );
}

function WithdrawTab() {
  const { account, isConnected } = useAppWallet();
  const [username, setUsername] = useState('');
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(true);

  useEffect(() => {
    if (!account) {
      setLoadingBalance(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const un = localStorage.getItem(`monad_username_${account}`) || account?.slice(-8) || 'user';

      if (!cancelled) setUsername(un);
      try {
        const user = await getUserByWallet(account);
        const resolvedUsername = user?.username ?? un;
        if (!cancelled) setUsername(resolvedUsername);
        const balanceData = await getUserBalance(resolvedUsername);
        const bal = Number(balanceData?.available_balance || 0);
        if (!cancelled) {
          setBalance(bal);
          setDestination(account);
        }
      } catch (e) {
        if (!cancelled) setBalance(0);
      } finally {
        if (!cancelled) setLoadingBalance(false);
      }
    })();
    return () => { cancelled = true; };
  }, [account]);

  const setMaxAmount = () => {
    const max = Math.max(0, balance - 0.0001);
    setAmount(String(max.toFixed(4)));
  };

  const handleWithdraw = async () => {
    if (!isConnected || !account) {
      toast.error('Connect your wallet first');
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (amt > balance) {
      toast.error('Insufficient balance');
      return;
    }
    if (!destination?.trim()) {
      toast.error('Enter destination address');
      return;
    }

    let finalDestination = destination.trim();
    // Alias çözümleme: 0x ile başlamıyorsa alias/username olarak kabul et
    if (!finalDestination.startsWith('0x') && finalDestination.length > 0) {
      try {
        const alias = finalDestination.replace(/\.privatepay$/i, '').toLowerCase().trim();
        // 1. Önce users tablosunda ara
        let user = await getUserByUsername(alias);
        if (user && user.wallet_address) {
          finalDestination = user.wallet_address;
        } else {
          // 2. payment_links tablosunda alias olarak ara
          const linkByAlias = await getPaymentLinkByAlias(alias);
          if (linkByAlias && linkByAlias.wallet_address) {
            finalDestination = linkByAlias.wallet_address;
          } else if (supabase) {
            // 3. payment_links tablosunda username olarak ara
            const { data: linkByUsername } = await supabase
              .from('payment_links')
              .select('wallet_address')
              .eq('username', alias)
              .maybeSingle();
            if (linkByUsername && linkByUsername.wallet_address) {
              finalDestination = linkByUsername.wallet_address;
            } else {
              toast.error(`Kullanıcı "${alias}" bulunamadı!`);
              return;
            }
          } else {
            toast.error(`Kullanıcı "${alias}" bulunamadı!`);
            return;
          }
        }
      } catch (err) {
        console.error("Alias çözümlenirken hata:", err);
        toast.error("Alias çözümlenemedi, lütfen tekrar deneyin");
        return;
      }
    }

    if (!ethers.isAddress(finalDestination)) {
      toast.error('Invalid destination address format');
      return;
    }

    setLoading(true);
    try {
      const pKey = import.meta.env.VITE_TREASURY_PRIVATE_KEY;
      if (!pKey) {
        throw new Error('Treasury private key is not configured in .env file');
      }

      toast.loading('Processing withdrawal from treasury...', { id: 'withdraw-loading' });

      // Initialize provider and treasury wallet
      const rpcProvider = new ethers.JsonRpcProvider("https://testnet-rpc.monad.xyz/");
      const treasuryWallet = new ethers.Wallet(pKey, rpcProvider);

      // Add a simple balance check for the treasury to help debugging
      const tBalance = await rpcProvider.getBalance(treasuryWallet.address);
      if (tBalance < ethers.parseEther(amount.toString())) {
        toast.dismiss('withdraw-loading');
        toast.error('Treasury gas/balance is too low to process withdrawal!');
        setLoading(false);
        return;
      }

      // Send transaction - gasLimit manuel olarak belirleniyor (Monad testnet estimateGas sorunu)
      const tx = await treasuryWallet.sendTransaction({
        to: finalDestination,
        value: ethers.parseEther(amount.toString()),
        gasLimit: 21000n
      });

      toast.loading('Waiting for blockchain confirmation...', { id: 'withdraw-loading' });
      await tx.wait();

      // Deduct balance and add transaction string to Supabase
      await withdrawFunds(username, amt, finalDestination, tx.hash);

      toast.dismiss('withdraw-loading');
      window.dispatchEvent(new Event('balance-updated'));
      window.dispatchEvent(new Event('transactions-updated'));

      toast.success(
        <div>
          <p className="font-bold">Withdrew {amt.toFixed(4)} MON!</p>
          <a href={`https://testnet.monadexplorer.com/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 underline">View on Explorer</a>
        </div>
      );

      setAmount('');
      setBalance((b) => Math.max(0, b - amt));
    } catch (err) {
      toast.dismiss('withdraw-loading');
      console.error('[Withdraw]', err);
      if (err.message?.includes('Insufficient balance') || err.message?.includes('balance is too low')) {
        toast.error(err.message || 'Insufficient balance');
      } else if (err.message?.includes('Supabase')) {
        toast.error('Blockchain transfer succeeded but could not update dashboard balance. Check connection.');
      } else {
        toast.error('Withdrawal failed: ' + (err.message?.slice(0, 50) || 'Unknown error'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <Card className="bg-white border border-gray-200 shadow-md rounded-3xl">
        <CardBody className="p-8 flex flex-col items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center p-3">
            <img src={MONAD_LOGO_ICON} alt="Monad" className="w-full h-full object-contain" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-xl font-bold text-gray-900">Connect wallet to withdraw</h3>
            <p className="text-gray-500 text-sm">Withdraw your credited balance from the treasury to your Monad wallet.</p>
          </div>
          <Button onClick={connect} className="w-full bg-primary hover:bg-primary-800 text-white font-bold h-12 rounded-2xl">
            Connect Wallet
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="bg-white border border-gray-200 shadow-md rounded-3xl">
      <CardBody className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-primary-50 flex items-center justify-center p-2">
            <img src={MONAD_LOGO_ICON} alt="Monad" className="w-full h-full object-contain" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Withdraw from treasury</h3>
            <p className="text-xs text-gray-500">Move your credited balance from the treasury to your Monad wallet</p>
          </div>
        </div>

        <div className="mb-4 p-4 rounded-2xl bg-primary-50 border border-primary-100">
          <p className="text-xs text-primary-700 font-medium">Your credited balance (from payments sent to you)</p>
          {loadingBalance ? (
            <p className="text-xl font-bold text-primary-900">...</p>
          ) : (
            <p className="text-xl font-bold text-primary-900">{balance.toFixed(4)} MON</p>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Amount (MON)</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                step="0.0001"
                min="0"
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
              />
              <Button size="sm" variant="flat" className="bg-primary-100 text-primary font-semibold rounded-2xl" onPress={setMaxAmount}>
                Max
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Destination (your Monad wallet or .privatepay)</label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="0x... or alice.privatepay"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-sm"
            />
          </div>

          <div className="p-4 rounded-2xl bg-primary-50 border border-primary-100 flex gap-3">
            <AlertCircle className="size-5 text-primary-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-primary-800">
              The relayer sends MON from the single treasury to your wallet. Your balance is what senders have credited to you.
            </p>
          </div>

          <Button
            onClick={handleWithdraw}
            isLoading={loading}
            isDisabled={loadingBalance || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance || !destination?.trim()}
            className="w-full bg-primary hover:bg-primary-800 text-white font-semibold h-12 rounded-2xl"
            startContent={!loading && <ArrowDownToLine size={18} />}
          >
            {loading ? 'Processing...' : 'Withdraw'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
