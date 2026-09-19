const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Razorpay = require("razorpay");
require("dotenv").config();

const app = express();
app.use(express.json({limit:"10mb"}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"public")));

const DATA = path.join(__dirname,"data");
const file = n => path.join(DATA,n);
function read(name, fallback=[]){
  const p=file(name);
  try { return JSON.parse(fs.readFileSync(p,"utf8")); } catch { fs.writeFileSync(p,JSON.stringify(fallback,null,2)); return fallback; }
}
function write(name,data){ fs.writeFileSync(file(name),JSON.stringify(data,null,2)); }

if(!fs.existsSync(file("orders.json"))) write("orders.json",[]);
if(!fs.existsSync(file("users.json"))) write("users.json",[]);

const PORT=process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET||"CHANGE_ME_BEFORE_PRODUCTION";
const ADMIN_EMAIL=process.env.ADMIN_EMAIL||"admin@msmuskansselect.com";
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"ChangeMe123!";
const ASSETS = path.join(__dirname,"public","assets");
if(!fs.existsSync(ASSETS)) fs.mkdirSync(ASSETS,{recursive:true});
if(!fs.existsSync(file("site-settings.json"))) write("site-settings.json",{logo:"assets/ms-muskan-select-logo.png",hero:"assets/hero-luxury.svg",featuredProductIds:read("products.json",[]).filter(p=>p.featured).map(p=>p.id)});
if(!fs.existsSync(path.join(__dirname,"public","data"))) fs.mkdirSync(path.join(__dirname,"public","data"),{recursive:true});
function saveDataImage(data,prefix){const match=data.match(/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,(.+)$/);if(!match)return null;const ext=match[1].replace("jpeg","jpg").replace("svg+xml","svg");const filename=`ms-${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}.${ext}`;fs.writeFileSync(path.join(ASSETS,filename),Buffer.from(match[2],"base64"));return `assets/${filename}`;}
function syncPublicData(){try{fs.writeFileSync(path.join(__dirname,"public","data","products.json"),JSON.stringify(read("products.json",[]),null,2));fs.writeFileSync(path.join(__dirname,"public","data","site-settings.json"),JSON.stringify(read("site-settings.json",{}),null,2));}catch(e){console.error("Static data sync failed",e.message)}}


async function ensureAdmin(){
  let users=read("users.json");
  if(!users.find(u=>u.email===ADMIN_EMAIL)){
    users.push({id:crypto.randomUUID(),email:ADMIN_EMAIL,password:await bcrypt.hash(ADMIN_PASSWORD,12),role:"admin"});
    write("users.json",users);
    console.log("Admin account initialized:",ADMIN_EMAIL);
  }
}
ensureAdmin();

function auth(req,res,next){
  const token=(req.headers.authorization||"").replace("Bearer ","");
  if(!token) return res.status(401).json({error:"Authentication required"});
  try { req.user=jwt.verify(token,JWT_SECRET); next(); } catch { return res.status(401).json({error:"Invalid or expired session"}); }
}
function admin(req,res,next){ if(req.user?.role!=="admin") return res.status(403).json({error:"Admin access required"}); next(); }

app.get("/api/config",(req,res)=>res.json({razorpayKeyId:process.env.RAZORPAY_KEY_ID||null,storeName:"MS Muskan Select"}));
app.get("/api/products",(req,res)=>res.json(read("products.json",[])));
app.get("/api/site-settings",(req,res)=>res.json(read("site-settings.json",{})));

app.post("/api/admin/login",async(req,res)=>{
  const {email,password}=req.body||{};
  const users=read("users.json",[]);
  const u=users.find(x=>x.email===String(email||"").toLowerCase());
  if(!u || !(await bcrypt.compare(String(password||""),u.password))) return res.status(401).json({error:"Invalid email or password"});
  const token=jwt.sign({id:u.id,email:u.email,role:u.role},JWT_SECRET,{expiresIn:"12h"});
  res.json({token,user:{email:u.email,role:u.role}});
});

app.get("/api/admin/orders",auth,admin,(req,res)=>res.json(read("orders.json",[])));

app.post("/api/admin/products",auth,admin,(req,res)=>{
  const p=req.body||{};
  if(!p.name||!p.category||Number(p.price)<0) return res.status(400).json({error:"Name, category and valid price are required"});
  const products=read("products.json",[]);
  let image=String(p.image||""); if(image.startsWith("data:image/")){try{image=saveDataImage(image,"product")}catch(e){return res.status(500).json({error:"Could not save product image"})}} const item={id:"p_"+crypto.randomBytes(5).toString("hex"),name:String(p.name),category:String(p.category),price:Number(p.price),compareAt:Number(p.compareAt||p.price),stock:Number(p.stock||0),badge:String(p.badge||"NEW"),description:String(p.description||""),image:image||"",everShine:Boolean(p.everShine),featured:Boolean(p.featured)};
  products.push(item); write("products.json",products); syncPublicData(); res.status(201).json(item);
});
app.put("/api/admin/products/:id",auth,admin,(req,res)=>{
  const products=read("products.json",[]), i=products.findIndex(p=>p.id===req.params.id);
  if(i<0) return res.status(404).json({error:"Product not found"});
  let patch={...req.body}; if(typeof patch.image==="string"&&patch.image.startsWith("data:image/")){try{patch.image=saveDataImage(patch.image,"product")}catch(e){return res.status(500).json({error:"Could not save product image"})}} products[i]={...products[i],...patch,id:products[i].id,price:Number(req.body.price??products[i].price),compareAt:Number(req.body.compareAt??products[i].compareAt),stock:Number(req.body.stock??products[i].stock)};
  write("products.json",products); syncPublicData(); res.json(products[i]);
});
app.delete("/api/admin/products/:id",auth,admin,(req,res)=>{
  const products=read("products.json",[]).filter(p=>p.id!==req.params.id);
  write("products.json",products); syncPublicData(); res.json({ok:true});
});


app.put("/api/admin/site-settings",auth,admin,(req,res)=>{
  const {type,data}=req.body||{};
  if(!["logo","hero"].includes(type)||typeof data!=="string"||!data.startsWith("data:image/")) return res.status(400).json({error:"Valid logo/background image is required"});
  const match=data.match(/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,(.+)$/);
  if(!match) return res.status(400).json({error:"Only PNG, JPG, WEBP or SVG images are supported"});
  const ext=match[1].replace("jpeg","jpg").replace("svg+xml","svg"); const filename=`ms-${type}-${Date.now()}.${ext}`;
  try{fs.writeFileSync(path.join(ASSETS,filename),Buffer.from(match[2],"base64"));}catch(e){return res.status(500).json({error:"Could not save image"})}
  const st=read("site-settings.json",{}); st[type]=`assets/${filename}`; write("site-settings.json",st); syncPublicData(); res.json(st);
});

function calcCart(items){
  const products=read("products.json",[]);
  let subtotal=0;
  const normalized=[];
  for(const raw of (Array.isArray(items)?items:[])){
    const p=products.find(x=>x.id===raw.id);
    const qty=Math.max(1,Math.min(Number(raw.qty||1),p?.stock||0));
    if(!p || qty<1) continue;
    normalized.push({id:p.id,name:p.name,price:p.price,qty,image:p.image});
    subtotal += p.price*qty;
  }
  return {products,normalized,subtotal};
}

app.post("/api/orders/cod",(req,res)=>{
  const {customer,items,coupon}=req.body||{};
  if(!customer?.name||!customer?.phone||!customer?.address||!customer?.pincode) return res.status(400).json({error:"Complete delivery details are required"});
  const c=calcCart(items); if(!c.normalized.length) return res.status(400).json({error:"Cart is empty"});
  const discount=String(coupon||"").toUpperCase()==="MUSKAN10"?Math.round(c.subtotal*.10):0;
  const total=c.subtotal-discount;
  const order={id:"MS"+Date.now().toString().slice(-8),createdAt:new Date().toISOString(),customer,items:c.normalized,subtotal:c.subtotal,discount,total,paymentMethod:"COD",paymentStatus:"pending",status:"confirmed",shippingStatus:"pending"};
  const orders=read("orders.json",[]); orders.unshift(order); write("orders.json",orders);
  const products=c.products.map(p=>{const item=c.normalized.find(x=>x.id===p.id);return item?{...p,stock:Math.max(0,p.stock-item.qty)}:p}); write("products.json",products);
  res.status(201).json({order});
});

app.post("/api/payment/create",(req,res)=>{
  if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET) return res.status(503).json({error:"Online payment is not configured. Add Razorpay keys in .env."});
  const {customer,items,coupon}=req.body||{};
  if(!customer?.name||!customer?.phone||!customer?.address||!customer?.pincode) return res.status(400).json({error:"Complete delivery details are required"});
  const c=calcCart(items); if(!c.normalized.length) return res.status(400).json({error:"Cart is empty"});
  const discount=String(coupon||"").toUpperCase()==="MUSKAN10"?Math.round(c.subtotal*.10):0;
  const total=c.subtotal-discount;
  const instance=new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET});
  const receipt="ms_"+Date.now();
  instance.orders.create({amount:total*100,currency:"INR",receipt,notes:{store:"MS Muskan Select"}})
    .then(rp=>res.json({keyId:process.env.RAZORPAY_KEY_ID,razorpayOrderId:rp.id,amount:total,customer,items:c.normalized,coupon:coupon||""}))
    .catch(e=>res.status(500).json({error:"Could not create payment order"}));
});

app.post("/api/payment/verify",(req,res)=>{
  if(!process.env.RAZORPAY_KEY_SECRET) return res.status(503).json({error:"Payment verification is not configured"});
  const {razorpay_order_id,razorpay_payment_id,razorpay_signature,customer,items,coupon}=req.body||{};
  const generated=crypto.createHmac("sha256",process.env.RAZORPAY_KEY_SECRET).update(razorpay_order_id+"|"+razorpay_payment_id).digest("hex");
  if(generated!==razorpay_signature) return res.status(400).json({error:"Payment signature verification failed"});
  const c=calcCart(items); const discount=String(coupon||"").toUpperCase()==="MUSKAN10"?Math.round(c.subtotal*.10):0;
  const total=c.subtotal-discount;
  const order={id:"MS"+Date.now().toString().slice(-8),createdAt:new Date().toISOString(),customer,items:c.normalized,subtotal:c.subtotal,discount,total,paymentMethod:"Razorpay",paymentStatus:"paid",paymentId:razorpay_payment_id,razorpayOrderId:razorpay_order_id,status:"confirmed",shippingStatus:"pending"};
  const orders=read("orders.json",[]);orders.unshift(order);write("orders.json",orders);
  write("products.json",c.products.map(p=>{const item=c.normalized.find(x=>x.id===p.id);return item?{...p,stock:Math.max(0,p.stock-item.qty)}:p}));
  res.status(201).json({order});
});

app.get("/api/orders/:id",(req,res)=>{
  const o=read("orders.json",[]).find(x=>x.id===req.params.id);
  if(!o)return res.status(404).json({error:"Order not found"});
  res.json({id:o.id,createdAt:o.createdAt,status:o.status,paymentStatus:o.paymentStatus,shippingStatus:o.shippingStatus,total:o.total});
});

app.get("/api/health",(req,res)=>res.json({ok:true,store:"MS Muskan Select"}));;
app.use((req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`MS Muskan Select running on port ${PORT}`));
