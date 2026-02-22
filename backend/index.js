/**
 * Minimal backend for PrivatePay (Monad).
 * Health check only.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const PORT = process.env.PORT || 3400;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Withdraw: relayer processes treasury -> user wallet. Frontend calls this; when relayer is configured
// it performs the on-chain transfer and returns { txHash }. Frontend then calls withdrawFunds() in Supabase.
app.post('/withdraw', (req, res) => {
  const { username, amount, destinationAddress } = req.body || {};
  if (!username || amount == null || !destinationAddress) {
    return res.status(400).json({
      error: 'missing_params',
      message: 'Requires username, amount, and destinationAddress',
    });
  }
  // Relayer not configured: return 501 so frontend can show "configure relayer" message.
  // When you have a relayer that holds treasury keys, perform the Monad (EVM) transfer here
  // and return { txHash } on success.
  res.status(501).json({
    error: 'not_configured',
    message: 'Withdrawal relayer is not configured. Set up a relayer to process withdrawals from the treasury.',
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Backend listening on ${HOST}:${PORT}`);
});

process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});
