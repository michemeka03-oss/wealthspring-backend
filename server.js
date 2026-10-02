import express from 'express';
import cors from 'cors';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const resend = new Resend(process.env.RESEND_API_KEY || 're_KkG9XmD7_88CX21vGHhR5PPatxDCvEiv2');

const DB_FILE = './database.json';
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], deposits: [], withdrawals: [], codes: [] }));
}
const readDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const WALLETS = {
  btc: 'bc1qmmw3778u3w409wjthpp5gyqjxj9fesqcq8maez',
  usdt_bep20: '0xcF1e36b4c1666f42F34A8616FAe80Fc30440F8D9',
  support_display: 'support@wealthspringassets.com',
  support_forward: 'Jeffryhart96@gmail.com'
};

const JWT_SECRET = process.env.JWT_SECRET || 'wealthspring-secret-2025';

app.post('/api/send-code', async (req, res) => {
  try {
    const { email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const db = readDB();
    db.codes = db.codes.filter(c => c.email !== email);
    db.codes.push({ email, code, expires: Date.now() + 10*60*1000 });
    writeDB(db);
    await resend.emails.send({
      from: 'WealthSpring <onboarding@resend.dev>',
      to: email,
      subject: 'Your WealthSpring Verification Code',
      html: `<div style="font-family:sans-serif;background:#0a0a0a;color:#fff;padding:30px"><h2 style="color:#00ff88">WealthSpring Assets</h2><h1 style="font-size:36px;letter-spacing:5px">${code}</h1><p>Expires in 10 mins</p></div>`
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/verify-code', (req, res) => {
  const { email, code } = req.body;
  const db = readDB();
  const found = db.codes.find(c => c.email === email && c.code === code);
  if (!found) return res.status(400).json({ error: 'Invalid code' });
  if (Date.now() > found.expires) return res.status(400).json({ error: 'Expired' });
  res.json({ ok: true });
});

app.get('/', (req, res) => res.json({ status: 'WealthSpring LIVE - No Mongo', wallets: WALLETS }));
app.get('/api/wallets', (req, res) => res.json(WALLETS));
app.get('/api/plans', (req, res) => res.json([
  { name: 'Starter', min: 100, target: '10% / 7 days', note: 'Target - not guaranteed' },
  { name: 'Growth', min: 500, target: '15% / 7 days', note: 'Target - not guaranteed' },
  { name: 'Pro', min: 1000, target: '18% / 7 days', note: 'Target - not guaranteed' },
  { name: 'Elite', min: 5000, target: '22% / 7 days', note: 'Target - not guaranteed' }
]));
app.post('/api/register', async (req, res) => {
  const db = readDB();
  if (db.users.find(u => u.email === email)) return res.status(400).json({ error: 'User exists' });
  const hash = await bcrypt.hash(req.body.password, 10);
  db.users.push({ email: req.body.email, password: hash, balance: 0 });
  writeDB(db);
  res.json({ token: jwt.sign({ email: req.body.email }, JWT_SECRET), email: req.body.email });
});
app.post('/api/login', async (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.email === req.body.email);
  if (!user) return res.status(400).json({ error: 'No user' });
  const ok = await bcrypt.compare(req.body.password, user.password);
  if (!ok) return res.status(400).json({ error: 'Wrong password' });
  res.json({ token: jwt.sign({ email: req.body.email }, JWT_SECRET), email: req.body.email });
});
app.post('/api/deposit', (req, res) => { const db=readDB(); db.deposits.push({...req.body,status:'pending',createdAt:new Date()}); writeDB(db); res.json({ok:true}); });
app.post('/api/withdraw', (req, res) => { const db=readDB(); db.withdrawals.push({...req.body,status:'pending-manual',createdAt:new Date()}); writeDB(db); res.json({ok:true}); });
app.get('/api/admin/deposits', (req, res) => res.json(readDB().deposits.reverse()));
app.get('/api/admin/withdrawals', (req, res) => res.json(readDB().withdrawals.reverse()));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('LIVE on '+PORT));
