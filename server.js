const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/admin', (req,res)=> {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- EMAIL SETUP ---
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
}

async function sendMail(to, subject, html){
  if(!transporter) return;
  try{ await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, html }); }catch(e){ console.log('mail err',e.message) }
}
function notifyAdmin(subject, html){
  if(process.env.EMAIL_USER) sendMail(process.env.EMAIL_USER, subject, html);
}

// --- DB ---
let useMongo = false;
if(process.env.MONGO_URL){
  mongoose.connect(process.env.MONGO_URL).then(()=>{ useMongo=true; console.log('Mongo connected') }).catch(()=>{});
}
const users = [];

// --- ROUTES ---
app.get('/', (req,res)=> res.send('Wealthspring backend running'));
app.get('/health', (req,res)=> res.json({ status:'ok', mongo: useMongo, mail: !!transporter, users: users.length }));

app.post('/api/register', async (req,res)=>{
  const {email, password, name} = req.body;
  if(!email || !password) return res.status(400).json({error:'Missing fields'});
  if(users.find(u=>u.email===email)) return res.status(400).json({error:'User exists'});
  const hash = await bcrypt.hash(password, 10);
  const user = { id: Date.now().toString(), email, password: hash, name: name||email, balance: 0, profit: 0, deposits: [], withdrawals: [] };
  users.push(user);
  notifyAdmin(`New User: ${email}`, `<h3>New user ${email}</h3>`);
  res.json({message:'Registered', user:{id:user.id,email:user.email,name:user.name}});
});

app.post('/api/login', async (req,res)=>{
  const {email,password} = req.body;
  const u = users.find(x=>x.email===email);
  if(!u) return res.status(400).json({error:'No user'});
  const ok = await bcrypt.compare(password, u.password);
  if(!ok) return res.status(400).json({error:'Wrong password'});
  res.json({user:{id:u.id,email:u.email,name:u.name}});
});

app.post('/api/deposit', (req,res)=>{
  const {email, amount, method, proof, txId} = req.body;
  const u = users.find(x=>x.email===email);
  if(!u) return res.status(400).json({error:'No user'});
  const dep = { id: Date.now().toString(), amount: parseFloat(amount)||0, method: method||'btc', proof: proof||txId||'', status: 'pending' };
  u.deposits.push(dep);
  notifyAdmin(`New Deposit $${amount} from ${email}`, `<p>${email} deposited $${amount}<br>TX: ${proof||txId}</p>`);
  res.json({message:'Deposit submitted'});
});

app.post('/api/withdraw', (req,res)=>{
  const {email, amount, wallet} = req.body;
  const u = users.find(x=>x.email===email);
  if(!u) return res.status(400).json({error:'No user'});
  const wd = { id: Date.now().toString(), amount, wallet, status:'pending' };
  u.withdrawals.push(wd);
  notifyAdmin(`Withdraw Request $${amount} from ${email}`, `<p>Wallet: ${wallet}</p>`);
  res.json({message:'Withdraw request submitted'});
});

app.post('/api/support', (req,res)=>{
  const {email, message} = req.body;
  notifyAdmin(`Support from ${email}`, `<p>${message}</p>`);
  res.json({message:'Sent'});
});

// Admin
app.post('/api/admin/login', (req,res)=>{
  if(req.body.password === process.env.ADMIN_PASS) res.json({ok:true});
  else res.status(401).json({error:'Wrong password'});
});
app.get('/api/admin/users', (req,res)=> res.json(users));
app.post('/api/admin/approve-deposit', (req,res)=>{
  const {email, depositId} = req.body;
  const u = users.find(x=>x.email===email);
  const d = u?.deposits.find(x=>x.id===depositId);
  if(!d) return res.status(404).json({error:'Deposit not found'});
  if(d.status!=='pending') return res.json({message:'Already processed'});
  d.status='approved'; u.balance+=d.amount;
  sendMail(u.email, 'Deposit Approved', `Your $${d.amount} deposit was approved.`);
  res.json({ok:true});
});

const PORT = process.env.PORT||10000;
app.listen(PORT, ()=> console.log('Server running on '+PORT));
