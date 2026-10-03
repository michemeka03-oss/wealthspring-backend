const express = require('express');
const path = require('path');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(express.json());

// --- MEMORY STORAGE (No Mongo needed) ---
let users = [];
let deposits = [];

// --- EMAIL ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendMail(to, subject, html){
  try{
    await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, html });
  }catch(e){ console.log("Mail error", e.message); }
}

// --- ROUTES ---

app.get('/', (req,res)=> res.send('Wealthspring backend live'));

// Signup
app.post('/api/signup', async (req,res)=>{
  const {email, password} = req.body;
  if(users.find(u=>u.email===email)) return res.json({success:false, message:"Exists"});
  users.push({email, password, balance:0});
  res.json({success:true});
});

// Login
app.post('/api/login', (req,res)=>{
  const {email,password} = req.body;
  const user = users.find(u=>u.email===email && u.password===password);
  if(!user) return res.json({success:false, message:"Invalid login"});
  res.json({success:true, email: user.email, balance: user.balance});
});

// Get balance
app.post('/api/balance', (req,res)=>{
  const {email} = req.body;
  const user = users.find(u=>u.email===email);
  res.json({balance: user?user.balance:0});
});

// Deposit
app.post('/api/deposit', async (req,res)=>{
  const {email, amount, txHash} = req.body;
  const id = Date.now().toString();
  const dep = {id, email, amount: Number(amount), txHash, status:'pending', createdAt: new Date()};
  deposits.push(dep);

  // Email you instantly
  await sendMail(process.env.EMAIL_USER, `NEW DEPOSIT $${amount} from ${email}`, `<h2>$${amount}</h2><p>Email: ${email}</p><p>TX: ${txHash}</p><p><a href="https://wealthspring-backend.onrender.com/admin.html">Click to Approve</a></p>`);

  res.json({success:true});
});

// Admin - get deposits
app.get('/api/admin/deposits', (req,res)=>{
  res.json({deposits: deposits.reverse()});
});

// Admin - approve
app.post('/api/admin/approve', async (req,res)=>{
  const {id} = req.body;
  const dep = deposits.find(d=>d.id===id);
  if(!dep) return res.json({success:false, message:"Not found"});
  dep.status = 'approved';
  const user = users.find(u=>u.email===dep.email);
  if(user) user.balance += Number(dep.amount);
  
  await sendMail(dep.email, "Deposit Approved", `<h2>Your $${dep.amount} deposit was approved!</h2><p>Balance updated.</p>`);
  
  res.json({success:true});
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> console.log("Running on", PORT));
