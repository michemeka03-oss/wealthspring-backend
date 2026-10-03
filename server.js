const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory storage (balance + deposits) - survives until Render restarts
// For permanent, later we add Mongo, but this works now for email push
let users = {}; // { "email@gmail.com": { balance: 0 } }
let deposits = []; // { id, email, amount, txId, status }

let transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER, // your gmail
    pass: process.env.GMAIL_PASS // app password, not normal password
  }
});

async function sendEmail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: `"Wealthspring" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html
    });
    console.log('Email sent to', to);
  } catch(e) { console.log('Email error', e.message); }
}

// When user clicks "I Have Sent"
app.post('/api/deposit', async (req, res) => {
  const { email, amount, txId } = req.body;
  const id = Date.now().toString();
  deposits.push({ id, email, amount, txId, status: 'pending', date: new Date().toLocaleString() });
  if(!users[email]) users[email] = { balance: 0 };

  // PUSH EMAIL TO YOU
  await sendEmail(
    process.env.ADMIN_EMAIL || process.env.GMAIL_USER,
    `NEW DEPOSIT $${amount} from ${email}`,
    `<h2>New Deposit Request</h2><p><b>User:</b> ${email}</p><p><b>Amount:</b> $${amount}</p><p><b>TX Hash:</b> ${txId}</p><p>Go to /admin to approve.</p>`
  );

  res.json({ ok: true });
});

// When user requests withdraw
app.post('/api/withdraw', async (req, res) => {
  const { email, amount, address } = req.body;
  await sendEmail(
    process.env.ADMIN_EMAIL,
    `WITHDRAW $${amount} from ${email}`,
    `<p>User ${email} wants to withdraw $${amount} to ${address}</p>`
  );
  res.json({ ok: true });
});

// Support message
app.post('/api/support', async (req, res) => {
  const { email, subject, message } = req.body;
  await sendEmail(
    process.env.ADMIN_EMAIL,
    `Support: ${subject} from ${email}`,
    `<p>From: ${email}</p><p>Subject: ${subject}</p><p>${message}</p>`
  );
  res.json({ ok: true });
});

// Get balance
app.get('/api/balance', (req, res) => {
  const email = req.query.email;
  res.json({ balance: users[email]?.balance || 0 });
});

// Admin - view all deposits
app.get('/api/admin/deposits', (req, res) => {
  res.json(deposits);
});

// Admin - APPROVE and update balance
app.post('/api/admin/approve', async (req, res) => {
  const { id } = req.body;
  const dep = deposits.find(d => d.id === id);
  if(!dep) return res.status(404).json({msg:'not found'});
  if(dep.status === 'approved') return res.json({msg:'already approved'});

  dep.status = 'approved';
  if(!users[dep.email]) users[dep.email] = { balance: 0 };
  users[dep.email].balance += Number(dep.amount);

  await sendEmail(
    dep.email,
    `Deposit Approved $${dep.amount}`,
    `<h3>Your deposit of $${dep.amount} is now approved!</h3><p>New balance: $${users[dep.email].balance}</p><p>TX: ${dep.txId}</p>`
  );

  res.json({ ok: true, balance: users[dep.email].balance });
});

app.get('/', (req,res)=> res.send('Wealthspring backend running - no Mongo'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> console.log('Running on', PORT));
