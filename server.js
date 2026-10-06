const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let balances = {};
let deposits = [];
let withdraws = [];
let supports = [];
let idCounter = 1;

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
  res.json({ok:true});
});
app.post('/api/withdraw', (req,res)=>{
  const {email,amount,address}=req.body;
  withdraws.push({id:idCounter++, email:(email||'').toLowerCase(), amount, address, date:Date.now(), status:'pending'});
  res.json({ok:true});
});
app.post('/api/support', (req,res)=>{
  const {email,subject,message}=req.body;
  supports.push({id:idCounter++, email, subject, message, date:Date.now()});
  res.json({ok:true});
});

app.get('/api/admin/deposits', (req,res)=> res.json({deposits}));
app.get('/api/admin/withdraws', (req,res)=> res.json({withdraws}));
app.get('/api/admin/supports', (req,res)=> res.json({supports}));
app.get('/api/admin/balances', (req,res)=> res.json({balances}));

app.post('/api/admin/approve', (req,res)=>{
  const d=deposits.find(x=>x.id==req.body.id);
  if(d && d.status!=='approved'){ d.status='approved'; balances[d.email]=(balances[d.email]||0)+d.amount; }
  res.json({ok:true});
});
app.post('/api/admin/reject', (req,res)=>{
  const d=deposits.find(x=>x.id==req.body.id);
  if(d) d.status='rejected';
  res.json({ok:true});
});
app.post('/api/admin/withdraw-approve', (req,res)=>{
  const w=withdraws.find(x=>x.id==req.body.id);
  if(w) w.status='approved';
  res.json({ok:true});
});

app.get('/', (req,res)=>{
  res.json({ status:'ok', admin:'/admin.html' });
});

app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'), (err)=>{
    if(err) res.json({ status:'ok' });
  });
});

app.listen(process.env.PORT||10000, ()=> console.log('live'));
