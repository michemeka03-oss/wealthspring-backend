const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');
function load(){
  try{ if(fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }catch(e){}
  return { balances:{}, deposits:[], withdraws:[], supports:[], users:{}, idCounter:1 };
}
function save(db){
  try{ fs.writeFileSync(DATA_FILE, JSON.stringify(db,null,2)); }catch(e){}
}
let db = load();
let balances = db.balances || {};
let deposits = db.deposits || [];
let withdraws = db.withdraws || [];
let supports = db.supports || [];
let users = db.users || {};
let idCounter = db.idCounter || 1;

function persist(){
  save({ balances, deposits, withdraws, supports, users, idCounter });
}

function getRate(a){
  a=parseFloat(a);
  if(a>=100 && a<500) return 0.10;
  if(a<2000) return 0.15;
  if(a<5000) return 0.18;
  return 0.22;
}

function isValidEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// FIXED REGISTER — blocks baba blur
app.post('/api/register', (req,res)=>{
  const email=(req.body.email||'').toLowerCase().trim();
  const password=req.body.password||'';
  if(!email||!password) return res.json({ok:false, error:'missing fields'});
  if(!isValidEmail(email)) return res.json({ok:false, error:'invalid email - must contain @ and domain'});
  if(users[email]) return res.json({ok:false, error:'exists'});
  users[email]={email,password,createdAt:Date.now()};
  balances[email]=balances[email]||0;
  persist();
  res.json({ok:true, email});
});

app.post('/api/login', (req,res)=>{
  const email=(req.body.email||'').toLowerCase().trim();
  const password=req.body.password||'';
  if(!isValidEmail(email)) return res.json({ok:false, error:'invalid email format'});
  if(users[email] && users[email].password===password) return res.json({ok:true,email});
  res.json({ok:false, error:'invalid'});
});

app.post('/api/balance', (req,res)=>{
  const email = (req.body.email||'').toLowerCase().trim();
  res.json({ balance: balances[email] || 0 });
});
app.post('/api/my-deposits', (req,res)=>{
  const email = (req.body.email||'').toLowerCase().trim();
  res.json({ deposits: deposits.filter(d=>d.email===email).sort((a,b)=>b.createdAt-a.createdAt) });
});
app.post('/api/deposit', (req,res)=>{
  const email=(req.body.email||'').toLowerCase().trim();
  if(!isValidEmail(email)) return res.json({ok:false, error:'invalid email'});
  const amount=parseFloat(req.body.amount)||0;
  if(amount < 100) return res.json({ok:false, error:'min $100'});
  const txHash=req.body.txHash||req.body.hash||req.body.txId||'';
  if(!txHash) return res.json({ok:false, error:'tx hash required'});
  deposits.push({ id:idCounter++, email, amount, txHash, status:'pending', createdAt:Date.now() });
  persist();
  console.log('NEW DEPOSIT', email, amount);
  res.json({ok:true});
});

// FIXED WITHDRAW — now deducts smartly
app.post('/api/withdraw', (req,res)=>{
  let email=(req.body.email||'').toLowerCase().trim();
  let amount=parseFloat(req.body.amount)||0;
  let address=(req.body.address||'').trim();

  if(!isValidEmail(email)) return res.json({ok:false, error:'invalid email'});
  if(!amount || amount <=0) return res.json({ok:false, error:'invalid amount'});
  if(!address) return res.json({ok:false, error:'address required'});

  let bal = balances[email] || 0;
  if(bal < amount){
    return res.json({ok:false, error:`Insufficient balance — you have $${bal.toFixed(2)}, trying to withdraw $${amount}`});
  }

  balances[email] = bal - amount;
  withdraws.push({id:idCounter++, email, amount, address, date:Date.now(), status:'pending'});
  persist();
  console.log(`WITHDRAW ${email} -$${amount} => left $${balances[email]}`);
  res.json({ok:true, newBalance: balances[email]});
});

app.post('/api/support', (req,res)=>{
  const {email,subject,message}=req.body;
  supports.push({id:idCounter++, email, subject, message, date:Date.now()});
  persist();
  res.json({ok:true, id:idCounter-1});
});

app.get('/api/admin/deposits', (req,res)=> res.json({deposits}));
app.get('/api/admin/withdraws', (req,res)=> res.json({withdraws}));
app.get('/api/admin/supports', (req,res)=> res.json({supports}));
app.get('/api/admin/balances', (req,res)=> res.json({balances}));
app.get('/api/admin/all', (req,res)=> res.json({deposits,withdraws,supports,balances,users}));

app.post('/api/admin/approve', (req,res)=>{
  const d=deposits.find(x=>x.id==req.body.id);
  if(d && d.status!=='approved'){
    d.status='approved';
    const rate = getRate(d.amount);
    const profit = d.amount * rate;
    balances[d.email]=(balances[d.email]||0)+d.amount+profit;
    console.log(`APPROVED ${d.email} $${d.amount} + profit $${profit} = balance $${balances[d.email]}`);
    persist();
  }
  res.json({ok:true, newBalance: d? balances[d.email] : 0});
});
app.post('/api/admin/reject', (req,res)=>{
  const d=deposits.find(x=>x.id==req.body.id);
  if(d){ d.status='rejected'; persist(); }
  res.json({ok:true});
});
app.post('/api/admin/withdraw-approve', (req,res)=>{
  const w=withdraws.find(x=>x.id==req.body.id);
  if(w){ w.status='approved'; persist(); }
  res.json({ok:true});
});
app.post('/api/admin/withdraw-reject', (req,res)=>{
  const w=withdraws.find(x=>x.id==req.body.id);
  if(w && w.status!=='rejected'){
    w.status='rejected';
    // refund balance if you rejected
    balances[w.email]=(balances[w.email]||0)+parseFloat(w.amount);
    persist();
  }
  res.json({ok:true});
});

app.get('/', (req,res)=> res.json({ status:'ok', admin:'/admin.html' }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', ()=> console.log('live on port '+PORT));
