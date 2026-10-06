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

// ADDED - these were missing
app.post('/api/register', (req,res)=>{
  const email=(req.body.email||'').toLowerCase().trim();
  const password=req.body.password||'';
  if(!email||!password) return res.json({ok:false, error:'missing'});
  if(users[email]) return res.json({ok:false, error:'exists'});
  users[email]={email,password,createdAt:Date.now()};
  balances[email]=balances[email]||0;
  persist();
  res.json({ok:true, email});
});
app.post('/api/login', (req,res)=>{
  const email=(req.body.email||'').toLowerCase().trim();
  const password=req.body.password||'';
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
  const amount=parseFloat(req.body.amount)||0;
  const txHash=req.body.txHash||req.body.hash||req.body.txId||'';
  deposits.push({ id:idCounter++, email, amount, txHash, status:'pending', createdAt:Date.now() });
  persist();
  console.log('NEW DEPOSIT', email, amount);
  res.json({ok:true});
});
app.post('/api/withdraw', (req,res)=>{
  const {email,amount,address}=req.body;
  withdraws.push({id:idCounter++, email:(email||'').toLowerCase(), amount, address, date:Date.now(), status:'pending'});
  persist();
  res.json({ok:true});
});
app.post('/api/support', (req,res)=>{
  const {email,subject,message}=req.body;
  supports.push({id:idCounter++, email, subject, message, date:Date.now()});
  persist();
  res.json({ok:true});
});

app.get('/api/admin/deposits', (req,res)=> res.json({deposits}));
app.get('/api/admin/withdraws', (req,res)=> res.json({withdraws}));
app.get('/api/admin/supports', (req,res)=> res.json({supports}));
// FIXED: admin.html expects just balances map
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

app.get('/', (req,res)=> res.json({ status:'ok', admin:'/admin.html' }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', ()=> console.log('live on port '+PORT));
