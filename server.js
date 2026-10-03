const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// --- EMAIL SETUP ---
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
}
async function sendMail(to, subject, html) {
  if (!transporter) return;
  try { await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, html }); } catch(e){ console.log('mail fail', e.message) }
}
function notifyAdmin(subject, html){
  if(process.env.EMAIL_USER) sendMail(process.env.EMAIL_USER, subject, html);
}

// --- DB ---
let useMongo = false;
if(process.env.MONGO_URL){
  mongoose.connect(process.env.MONGO_URL).then(()=>{ useMongo=true; console.log('Mongo connected'); }).catch(()=>{});
}
const users = []; // in-memory fallback

// --- ROUTES ---
app.get('/', (req,res)=> res.send('Wealthspring Backend Live'));
app.get('/health', (req,res)=> res.json({status:'ok', mongo: useMongo, mail: !!transporter}));

app.post('/api/register', async (req,res)=>{
  const {email, password, name} = req.body;
  if(!email || !password) return res.status(400).json({error:'Missing fields'});
  if(users.find(u=>u.email===email)) return res.status(400).json({error:'User exists'});
  const hash = await bcrypt.hash(password, 10);
  const user = { id: Date.now().toString(), email, name: name||email, password: hash, balance:0, deposits:[], withdrawals:[], created: new Date() };
  users.push(user);
  notifyAdmin(`New User: ${email}`, `<h3>New registration</h3><p>Email: ${email}<br>Name: ${name}<br>Time: ${new Date()}</p>`);
  res.json({message:'Registered', user:{id:user.id,email:user.email,name:user.name,balance:0}});
});

app.post('/api/login', async (req,res)=>{
  const {email,password} = req.body;
  const u = users.find(x=>x.email===email);
  if(!u) return res.status(400).json({error:'No user'});
  const ok = await bcrypt.compare(password, u.password);
  if(!ok) return res.status(400).json({error:'Wrong password'});
  res.json({user:{id:u.id,email:u.email,name:u.name,balance:u.balance}});
});

app.post('/api/deposit', (req,res)=>{
  const {email, amount, method, proof} = req.body;
  const u = users.find(x=>x.email===email);
  if(!u) return res.status(400).json({error:'No user'});
  const dep = {id:Date.now().toString(), amount:Number(amount), method, proof, status:'pending', date:new Date()};
  u.deposits.push(dep);
  notifyAdmin(`New Deposit $${amount} from ${email}`, `<h3>Deposit Request</h3><p>User: ${email}<br>Amount: $${amount}<br>Method: ${method}<br>Proof: ${proof||'none'}</p>`);
  res.json({message:'Deposit submitted'});
});

app.post('/api/withdraw', (req,res)=>{
  const {email, amount, wallet} = req.body;
  const u = users.find(x=>x.email===email);
  if(!u) return res.status(400).json({error:'No user'});
  const wd = {id:Date.now().toString(), amount:Number(amount), wallet, status:'pending', date:new Date()};
  u.withdrawals.push(wd);
  notifyAdmin(`Withdraw Request $${amount} from ${email}`, `<p>User: ${email} wants $${amount} to ${wallet}</p>`);
  res.json({message:'Withdraw request submitted'});
});

app.post('/api/support', (req,res)=>{
  const {email, message} = req.body;
  notifyAdmin(`Support from ${email}`, `<p>${message}</p><p>From: ${email}</p>`);
  res.json({message:'Sent'});
});

// Admin
app.post('/api/admin/login', (req,res)=>{
  if(req.body.password === (process.env.ADMIN_PASS||'Wealth2025!Jeffry')) res.json({ok:true});
  else res.status(401).json({error:'Wrong pass'});
});
app.get('/api/admin/users', (req,res)=> res.json(users));
app.post('/api/admin/approve-deposit', (req,res)=>{
  const {email, depositId} = req.body;
  const u = users.find(x=>x.email===email);
  const d = u?.deposits.find(x=>x.id===depositId);
  if(!d) return res.status(404).json({error:'Not found'});
  if(d.status!=='pending') return res.json({message:'Already processed'});
  d.status='approved'; u.balance+=d.amount;
  sendMail(u.email,'Deposit Approved',`Your $${d.amount} deposit approved. Balance: $${u.balance}`);
  res.json({ok:true});
});

const PORT = process.env.PORT||10000;
app.listen(PORT, ()=> console.log('Server running '+PORT));
