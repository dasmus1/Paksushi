import { useState, useMemo, useEffect } from "react";
// ─── Firebase через CDN (не требует npm install) ───
const FB_CONFIG = {
  apiKey: "AIzaSyByv-cxXkJT6iKay85ME-goVR16YUEU54Y",
  authDomain: "pak-sushi.firebaseapp.com",
  projectId: "pak-sushi",
  storageBucket: "pak-sushi.firebasestorage.app",
  messagingSenderId: "264463017591",
  appId: "1:264463017591:web:1125febdedc535524cc872",
};

// Firestore REST API — работает без npm пакета
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FB_CONFIG.projectId}/databases/(default)/documents`;

const saveMenuToCloud = async (menuData: any) => {
  try {
    const fields: any = {};
    const encoded = JSON.stringify(menuData);
    fields.data = { stringValue: encoded };
    fields.updatedAt = { timestampValue: new Date().toISOString() };
    await fetch(`${FS_BASE}/settings/menu?key=${FB_CONFIG.apiKey}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
  } catch(e) { console.error("Firebase save menu:", e); }
};

const loadMenuFromCloud = async (): Promise<any|null> => {
  try {
    const res = await fetch(`${FS_BASE}/settings/menu?key=${FB_CONFIG.apiKey}`);
    if (!res.ok) return null;
    const data = await res.json();
    const str = data?.fields?.data?.stringValue;
    if (str) return JSON.parse(str);
  } catch(e) { console.error("Firebase load menu:", e); }
  return null;
};

const saveOrderToCloud = async (orderData: any) => {
  try {
    const fields: any = {};
    Object.entries(orderData).forEach(([k, v]) => {
      if (typeof v === "string") fields[k] = { stringValue: v };
      else if (typeof v === "number") fields[k] = { integerValue: String(v) };
      else if (typeof v === "boolean") fields[k] = { booleanValue: v };
      else fields[k] = { stringValue: JSON.stringify(v) };
    });
    fields.createdAt = { timestampValue: new Date().toISOString() };
    await fetch(`${FS_BASE}/orders?key=${FB_CONFIG.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
  } catch(e) { console.error("Firebase save order:", e); }
};

const loadOrdersFromCloud = async (): Promise<any[]> => {
  try {
    const res = await fetch(`${FS_BASE}/orders?key=${FB_CONFIG.apiKey}&pageSize=50&orderBy=createdAt+desc`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.documents || []).map((d: any) => {
      const obj: any = { id: d.name?.split("/").pop() };
      Object.entries(d.fields || {}).forEach(([k, v]: any) => {
        obj[k] = v.stringValue ?? v.integerValue ?? v.booleanValue ?? v.timestampValue ?? "";
        if (k === "items" || k === "total" || k === "discount") {
          try { obj[k] = JSON.parse(obj[k]); } catch {}
        }
      });
      return obj;
    });
  } catch(e) { console.error("Firebase load orders:", e); return []; }
};

// Генерация уникального номера заказа: ПС-XXXX (порядковый)
const generateOrderNumber = (): string => {
  try {
    const current = parseInt(localStorage.getItem("paksushi_order_counter") || "1000");
    const next = current + 1;
    localStorage.setItem("paksushi_order_counter", String(next));
    return `ПС-${next}`;
  } catch {
    return `ПС-${Math.floor(1000 + Math.random() * 9000)}`;
  }
};

const YELLOW = "#f5c518";
const DARK = "#111111";
const MUTED = "#888";
const WA_NUMBER = "77057210505";
const WA = `https://wa.me/${WA_NUMBER}`;
const INSTAGRAM = "https://www.instagram.com/paksushi_saryagash?igsh=dnFnZmxpYm56OXJt";
const TIKTOK = "https://www.tiktok.com/@paksushi_saryagash7?_r=1&_t=ZS-94ktZD7aqPp";
const ADDRESS = "г. Сарыағаш, ул. Айбергенова 1 (рядом с рестораном Нарлен)";
const MAPS_URL = "https://maps.google.com/?q=41.0185,68.7145";
const MAPS_EMBED = "https://maps.google.com/maps?q=41.0185,68.7145&z=16&output=embed";
const ADMIN_PASSWORD = "paksushi2024";
const OWNER_PASSWORD = "202ZNB02";
const OPEN_HOUR = 9;
const OPEN_MINUTE = 30;
const CLOSE_HOUR = 24;

const DISCOUNT_TIERS = [
  { min:20000, pct:35, label:"35%" },
  { min:10000, pct:30, label:"30%" },
  { min:6000,  pct:20, label:"20%" },
  { min:0,     pct:0,  label:""   },
];
const getDiscount = (t: number) => { for (const d of DISCOUNT_TIERS) if (t >= d.min) return d; return DISCOUNT_TIERS[3]; };
const HITS = new Set([27, 28]);

// Статистика сайта
const getStats = () => {
  try { return JSON.parse(localStorage.getItem("paksushi_stats") || '{"visits":0,"orders":0,"totalRevenue":0,"popularItems":{}}'); } catch { return {visits:0,orders:0,totalRevenue:0,popularItems:{}}; }
};
const saveStats = (s: any) => localStorage.setItem("paksushi_stats", JSON.stringify(s));
const trackVisit = () => { const s=getStats(); s.visits=(s.visits||0)+1; saveStats(s); };
const trackOrder = (items: any[], total: number) => {
  const s=getStats(); s.orders=(s.orders||0)+1; s.totalRevenue=(s.totalRevenue||0)+total;
  if (!s.popularItems) s.popularItems={};
  items.forEach(i => { s.popularItems[i.name]=(s.popularItems[i.name]||0)+i.qty; });
  saveStats(s);
};

type OrderHistoryItem = { id:number; name:string; price:number; qty:number; isDrink?:boolean };
type OrderRecord = { id:string; date:string; items:OrderHistoryItem[]; total:number; discount:number };

const getClients = (): Record<string, {name:string;phone:string;orders:number;bonusPoints:number;registeredAt:string}> => {
  try { return JSON.parse(localStorage.getItem("paksushi_clients") || "{}"); } catch { return {}; }
};
const saveClients = (d: ReturnType<typeof getClients>) => localStorage.setItem("paksushi_clients", JSON.stringify(d));

// История заказов — хранится отдельно по номеру телефона
const getOrderHistory = (phone: string): OrderRecord[] => {
  try { return JSON.parse(localStorage.getItem(`paksushi_history_${phone}`) || "[]"); } catch { return []; }
};
const saveOrderHistory = (phone: string, history: OrderRecord[]) =>
  localStorage.setItem(`paksushi_history_${phone}`, JSON.stringify(history.slice(0, 20))); // храним последние 20

// Меню с хорошими фотографиями для каждой позиции
type MenuItem = { id:number; name:string; price:number; isDrink?:boolean; noDiscount?:boolean; img:string; note?:string; desc?:string };
type MenuData = Record<string, MenuItem[]>;

const DEFAULT_MENU: MenuData = {
  "🍣 Суши": [
    { id:1,  name:"Цезарь classic",        price:1890, note:"10 шт", desc:"Нежный ролл с крабом, огурцом и сливочным сыром", img:"https://loremflickr.com/400/300/sushi,roll?lock=1" },
    { id:2,  name:"Америка",               price:1990, note:"10 шт", desc:"Ролл с лососем, авокадо и сливочным сыром Philadelphia", img:"https://loremflickr.com/400/300/sushi,salmon?lock=2" },
    { id:3,  name:"Цезарь запечённый",     price:1990, note:"10 шт", desc:"Запечённый ролл с крабом и сыром под соусом", img:"https://loremflickr.com/400/300/sushi,baked?lock=3" },
    { id:4,  name:"Сяке Темпура",          price:2190, note:"10 шт", desc:"Хрустящий ролл с лососем в темпуре", img:"https://loremflickr.com/400/300/sushi,tempura?lock=4" },
    { id:5,  name:"Филадельфия",           price:2190, note:"10 шт", desc:"Классика: лосось, сливочный сыр, огурец", img:"https://loremflickr.com/400/300/philadelphia,sushi?lock=5" },
    { id:6,  name:"Канада",                price:2090, note:"10 шт", desc:"Ролл с угрём, огурцом и сливочным сыром", img:"https://loremflickr.com/400/300/sushi,roll?lock=6" },
    { id:7,  name:"Унаги Темпура",         price:1990, note:"10 шт", desc:"Запечённый угорь в хрустящей темпуре", img:"https://loremflickr.com/400/300/sushi,eel?lock=7" },
    { id:8,  name:"Аляска",                price:1890, note:"10 шт", desc:"Ролл с лососем, огурцом и тобико", img:"https://loremflickr.com/400/300/sushi,alaska?lock=8" },
    { id:9,  name:"Калифорния с крабом",   price:1890, note:"10 шт", desc:"Классическая Калифорния с крабовым мясом и авокадо", img:"https://loremflickr.com/400/300/california,roll?lock=9" },
    { id:10, name:"Калифорния с лососем",  price:2090, note:"10 шт", desc:"Калифорния с нежным лососем и авокадо", img:"https://loremflickr.com/400/300/sushi,salmon?lock=10" },
    { id:11, name:"Калифорния запечённый", price:1990, note:"10 шт", desc:"Запечённая Калифорния с тягучим сыром", img:"https://loremflickr.com/400/300/sushi,baked?lock=11" },
    { id:12, name:"Бонита",                price:1790, note:"10 шт", desc:"Ролл с тунцом, огурцом и соусом спайси", img:"https://loremflickr.com/400/300/sushi,roll?lock=12" },
    { id:13, name:"Сингапур",              price:2090, note:"10 шт", desc:"Острый ролл с креветкой темпура и соусом", img:"https://loremflickr.com/400/300/sushi,shrimp?lock=13" },
    { id:14, name:"Капа маки",             price:890,  note:"10 шт", desc:"Простой ролл с огурцом — лёгкий и свежий", img:"https://loremflickr.com/400/300/cucumber,roll?lock=14" },
    { id:15, name:"Капа маки с лососем",   price:2190, note:"10 шт", desc:"Ролл с огурцом и нежным лососем", img:"https://loremflickr.com/400/300/sushi,salmon?lock=15" },
    { id:16, name:"Дракон с помидором",    price:1890, note:"10 шт", desc:"Ролл-дракон с угрём и свежим томатом", img:"https://loremflickr.com/400/300/sushi,dragon?lock=16" },
    { id:17, name:"Сяке Темпура",          price:2190, note:"10 шт", desc:"Запечённый лосось в темпуре с сырным соусом", img:"https://loremflickr.com/400/300/sushi,tempura?lock=17" },
    { id:18, name:"Саше пончик лосось",    price:2190, note:"10 шт", desc:"Пышный пончик-ролл с нежным лососем", img:"https://loremflickr.com/400/300/sushi,salmon?lock=18" },
    { id:19, name:"Саше пончик куриный",   price:1990, note:"10 шт", desc:"Пышный пончик-ролл с куриным филе", img:"https://loremflickr.com/400/300/sushi,chicken?lock=19" },
    { id:20, name:"Гункан",                price:1290, note:"10 шт", desc:"Традиционный гункан с лососем и икрой", img:"https://loremflickr.com/400/300/gunkan,sushi?lock=20" },
  ],
  "🍔 Бургер": [
    { id:21, name:"Бургер куриный",        price:1190, noDiscount:true, desc:"Сочная куриная котлета, салат, томат, соус", img:"https://loremflickr.com/400/300/chicken,burger?lock=21" },
    { id:22, name:"Чизбургер куриный",     price:1390, noDiscount:true, desc:"Куриная котлета с плавленым сыром чеддер", img:"https://loremflickr.com/400/300/cheeseburger,chicken?lock=22" },
    { id:23, name:"Биг Чизбургер куриный", price:1690, noDiscount:true, desc:"Двойная куриная котлета с двойным сыром", img:"https://loremflickr.com/400/300/burger,big?lock=23" },
    { id:24, name:"Бургер говяжий",        price:1290, noDiscount:true, desc:"Сочная говяжья котлета 100% мясо, соус", img:"https://loremflickr.com/400/300/beef,burger?lock=24" },
    { id:25, name:"Чизбургер говяжий",     price:1490, noDiscount:true, desc:"Говяжья котлета с сыром и маринованным огурцом", img:"https://loremflickr.com/400/300/cheeseburger,beef?lock=25" },
    { id:26, name:"Биг чизбургер говяжий", price:1790, noDiscount:true, desc:"Двойная говяжья котлета с двойным сыром чеддер", img:"https://loremflickr.com/400/300/burger,double?lock=26" },
  ],
  "🫓 Лаваш": [
    { id:27, name:"Лаваш куриный",         price:1290, noDiscount:true, desc:"Хрустящий лаваш с куриным филе, свежими овощами и фри внутри", img:"https://loremflickr.com/400/300/lavash,wrap?lock=27" },
    { id:28, name:"Лаваш куриный сыр",     price:1390, noDiscount:true, desc:"Лаваш с куриным филе, сыром, овощами и фри", img:"https://loremflickr.com/400/300/wrap,cheese?lock=28" },
  ],
  "🍗 Крылышки": [
    { id:31, name:"Крылышки 8 шт",  price:1490, noDiscount:true, desc:"Хрустящие куриные крылышки в фирменном соусе", img:"https://loremflickr.com/400/300/chicken,wings?lock=31" },
    { id:32, name:"Крылышки 16 шт", price:2790, noDiscount:true, desc:"Хрустящие куриные крылышки в фирменном соусе, большая порция", img:"https://loremflickr.com/400/300/chicken,wings?lock=32" },
    { id:33, name:"Крылышки 24 шт", price:4280, noDiscount:true, desc:"Хрустящие крылышки — идеально для компании", img:"https://loremflickr.com/400/300/wings,crispy?lock=33" },
    { id:34, name:"Крылышки 32 шт", price:5580, noDiscount:true, desc:"Максимальная порция для большой компании", img:"https://loremflickr.com/400/300/chicken,wings?lock=34" },
  ],
  "🍟 Снэки": [
    { id:35, name:"Фри",                  price:700,  noDiscount:true, desc:"Золотистая картошка фри, хрустящая снаружи", img:"https://loremflickr.com/400/300/french,fries?lock=35" },
    { id:36, name:"Картофельные шарики",  price:700,  noDiscount:true, desc:"Хрустящие шарики из картофельного пюре", img:"https://loremflickr.com/400/300/potato,balls?lock=36" },
    { id:37, name:"Нагетсы 8 шт",         price:1490, noDiscount:true, desc:"Сочные куриные нагетсы в панировке", img:"https://loremflickr.com/400/300/chicken,nuggets?lock=37" },
    { id:38, name:"Корн дог 5 шт",        price:1290, noDiscount:true, desc:"Сосиски в кукурузном тесте на палочке", img:"https://loremflickr.com/400/300/corn,dog?lock=38" },
    { id:39, name:"Сырные палочки 6 шт",  price:1290, noDiscount:true, desc:"Хрустящие палочки с тягучим сыром внутри", img:"https://loremflickr.com/400/300/mozzarella,sticks?lock=39" },
    { id:40, name:"Соус",                 price:150,  noDiscount:true, desc:"Фирменный соус на выбор: чесночный, острый, барбекю", img:"https://loremflickr.com/400/300/sauce,dip?lock=40" },
  ],
  "🍕 Пицца": [
    { id:41, name:"Маргарита", price:2090, desc:"Томатный соус, моцарелла, свежий базилик", img:"https://loremflickr.com/400/300/pizza,margherita?lock=41" },
    { id:42, name:"4 сезона",  price:2390, desc:"Четыре начинки: грибы, ветчина, артишоки, оливки", img:"https://loremflickr.com/400/300/pizza,seasons?lock=42" },
    { id:43, name:"Пепперони", price:2090, desc:"Острая пепперони с моцареллой и томатным соусом", img:"https://loremflickr.com/400/300/pepperoni,pizza?lock=43" },
    { id:44, name:"Сырный",    price:1890, desc:"Четыре вида сыра: моцарелла, чеддер, пармезан, рикотта", img:"https://loremflickr.com/400/300/pizza,cheese?lock=44" },
    { id:45, name:"Куриная",   price:2090, desc:"Курица гриль, болгарский перец, лук, моцарелла", img:"https://loremflickr.com/400/300/chicken,pizza?lock=45" },
  ],
  "🥤 Напитки": [
    { id:46, name:"Фанта 1л",    price:700, isDrink:true, desc:"Апельсиновая газировка Fanta, 1 литр", img:"https://loremflickr.com/400/300/fanta,orange?lock=46" },
    { id:47, name:"Кола 1л",     price:700, isDrink:true, desc:"Классическая Coca-Cola, 1 литр", img:"https://loremflickr.com/400/300/cola,drink?lock=47" },
    { id:48, name:"Фьюс-ти 1л",  price:700, isDrink:true, desc:"Холодный чай Fuze Tea с лимоном или персиком, 1 литр", img:"https://loremflickr.com/400/300/iced,tea?lock=48" },
    { id:49, name:"Макси чай 1л", price:700, isDrink:true, desc:"Освежающий холодный чай Maxi, 1 литр", img:"https://loremflickr.com/400/300/tea,cold?lock=49" },
    { id:50, name:"Пепси 1л",    price:700, isDrink:true, desc:"Классическая Pepsi Cola, 1 литр", img:"https://loremflickr.com/400/300/pepsi,drink?lock=50" },
    { id:51, name:"Пико сок 1л", price:800, isDrink:true, desc:"Натуральный сок Piko, 1 литр — яблоко, апельсин или вишня", img:"https://loremflickr.com/400/300/juice,fruit?lock=51" },
    { id:52, name:"Фанта 2л",    price:900, isDrink:true, desc:"Апельсиновая газировка Fanta, 2 литра", img:"https://loremflickr.com/400/300/fanta,orange?lock=52" },
    { id:53, name:"Кола 2л",     price:900, isDrink:true, desc:"Классическая Coca-Cola, 2 литра", img:"https://loremflickr.com/400/300/coca,cola?lock=53" },
    { id:54, name:"Макси чай 2л", price:900, isDrink:true, desc:"Холодный чай Maxi, 2 литра", img:"https://loremflickr.com/400/300/tea,cold?lock=54" },
    { id:55, name:"Горилла",     price:600, isDrink:true, desc:"Энергетический напиток Gorilla, заряд бодрости", img:"https://loremflickr.com/400/300/energy,drink?lock=55" },
    { id:56, name:"Диззи",       price:600, isDrink:true, desc:"Энергетический напиток Dizzy", img:"https://loremflickr.com/400/300/energy,drink?lock=56" },
    { id:57, name:"Чай бокал",   price:150, isDrink:true, desc:"Горячий чай в бокале — чёрный или зелёный", img:"https://loremflickr.com/400/300/hot,tea?lock=57" },
    { id:58, name:"Чай чайник",  price:300, isDrink:true, desc:"Горячий чай в чайнике для двоих", img:"https://loremflickr.com/400/300/tea,pot?lock=58" },
    { id:59, name:"Кофе бокал",  price:200, isDrink:true, desc:"Ароматный кофе Americano или Cappuccino", img:"https://loremflickr.com/400/300/coffee,cup?lock=59" },
    { id:60, name:"Кофе 3в1",    price:300, isDrink:true, desc:"Растворимый кофе 3в1 с молоком и сахаром", img:"https://loremflickr.com/400/300/coffee,instant?lock=60" },
    { id:61, name:"Айран",       price:250, isDrink:true, desc:"Освежающий кисломолочный напиток Айран", img:"https://loremflickr.com/400/300/ayran,yogurt?lock=61" },
  ],
};

const loadMenu = (): MenuData => {
  try {
    const saved = localStorage.getItem("paksushi_menu");
    if (saved) return JSON.parse(saved);
  } catch {}
  return DEFAULT_MENU;
};
const saveMenuData = (m: MenuData) => {
  localStorage.setItem("paksushi_menu", JSON.stringify(m));
  saveMenuToCloud(m); // также сохраняем в Firebase
};

const TIME_SLOTS: string[] = [];
for (let h=10; h<24; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2,"0")}:00`);
  if (h<23) TIME_SLOTS.push(`${String(h).padStart(2,"0")}:30`);
}

const css = `
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;background:#111}
  @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .fadeIn{animation:fadeIn 0.25s ease}
  @keyframes slideUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:none}}
  .slideUp{animation:slideUp 0.3s ease}
  @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(245,197,24,0.5)}50%{box-shadow:0 0 0 10px rgba(245,197,24,0)}}
  .pulse{animation:pulse 1.4s infinite}
  @keyframes bounce{0%{transform:scale(1)}30%{transform:scale(1.4)}60%{transform:scale(0.9)}100%{transform:scale(1)}}
  .bounce{animation:bounce 0.35s ease}
  ::-webkit-scrollbar{width:3px}
  ::-webkit-scrollbar-thumb{background:#333;border-radius:3px}
  .row:active{background:#1e1e00!important}
  input::placeholder{color:#444}
  textarea::placeholder{color:#444}
  textarea{resize:none}
  select{appearance:none;-webkit-appearance:none}
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:500;display:flex;align-items:flex-end;justify-content:center}
  .modal-sheet{width:100%;max-width:600px;max-height:90vh;overflow-y:auto;border-radius:24px 24px 0 0}
`;

const IgIcon = ({size=22}:{size?:number}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="2" y="2" width="20" height="20" rx="5.5" stroke="url(#igG)" strokeWidth="2"/>
    <circle cx="12" cy="12" r="4.5" stroke="url(#igG)" strokeWidth="2"/>
    <circle cx="17.5" cy="6.5" r="1.2" fill="#e1306c"/>
    <defs><linearGradient id="igG" x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
      <stop stopColor="#f09433"/><stop offset="0.5" stopColor="#dc2743"/><stop offset="1" stopColor="#bc1888"/>
    </linearGradient></defs>
  </svg>
);
const TkIcon = ({size=22}:{size?:number}) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.77a8.18 8.18 0 0 0 4.78 1.52V6.83a4.85 4.85 0 0 1-1.01-.14z" fill="white"/>
  </svg>
);
const WaIcon = ({size=22}:{size?:number}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.413A9.953 9.953 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm-1.087 5.5c-.193-.44-.397-.449-.58-.457l-.494-.006c-.174 0-.454.065-.691.327-.238.262-.908.887-.908 2.162s.929 2.508 1.058 2.681c.13.174 1.79 2.856 4.409 3.893 2.183.862 2.62.69 3.092.647.473-.044 1.524-.623 1.738-1.225.215-.601.215-1.117.15-1.225-.064-.108-.237-.173-.496-.302-.26-.13-1.524-.752-1.762-.838-.237-.086-.41-.13-.582.13-.173.26-.668.838-.819 1.011-.15.173-.302.194-.56.065-.26-.13-1.097-.404-2.09-1.29-.773-.69-1.295-1.54-1.447-1.8-.151-.26-.016-.4.114-.53.116-.116.26-.302.389-.453.13-.15.173-.26.26-.432.086-.174.043-.326-.022-.455-.064-.13-.562-1.41-.795-1.944z" fill="#25d366"/>
  </svg>
);

type Screen = "menu"|"info"|"login"|"profile"|"checkout"|"confirm"|"admin";
type Client = {name:string;phone:string;orders:number;bonusPoints:number;registeredAt:string};

export default function App() {
  const [menuData, setMenuData]   = useState<MenuData>(() => loadMenu());
  const [order,     setOrder]     = useState<Record<number,number>>({});
  const [activeTab, setActiveTab] = useState("🍣 Суши");
  const [search,    setSearch]    = useState("");
  const [screen,    setScreen]    = useState<Screen>("menu");
  const [name,      setName]      = useState("");
  const [phone,     setPhone]     = useState("");
  const [address,   setAddress]   = useState("");
  const [comment,   setComment]   = useState("");
  const [animId,    setAnimId]    = useState<number|null>(null);
  const [sent,      setSent]      = useState(false);
  const [darkMode,  setDarkMode]  = useState(true);
  const [showClear, setShowClear] = useState(false);
  const [cartBounce,setCartBounce]= useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem|null>(null);

  // Логин клиента

  const [currentClient, setCurrentClient] = useState<(Client&{phone:string})|null>(null);

  // Админ
  const [adminPass,     setAdminPass]     = useState("");
  const [adminRole,     setAdminRole]     = useState<""|"admin"|"owner">("");
  const [adminTab,      setAdminTab]      = useState<"stats"|"menu"|"clients"|"deleted">("stats");
  const [deletedOrders, setDeletedOrders] = useState<any[]>([]);
  const [editItem,      setEditItem]      = useState<MenuItem|null>(null);
  const [editCat,       setEditCat]       = useState("");
  const [addingToCat,   setAddingToCat]   = useState<string|null>(null);
  const [newItem,       setNewItem]       = useState<Partial<MenuItem>>({});
  const [confirmDelete, setConfirmDelete] = useState<{cat:string;id:number;name:string}|null>(null);

  const [orderNumber, setOrderNumber] = useState("");
  const [cloudOrders, setCloudOrders] = useState<any[]>([]);

  useEffect(() => {
    trackVisit();
    // Загрузить меню из Firebase при старте
    loadMenuFromCloud().then(cloudMenu => {
      if (cloudMenu) {
        setMenuData(cloudMenu);
        localStorage.setItem("paksushi_menu", JSON.stringify(cloudMenu));
      }
    });
    // Восстановить клиента из localStorage при загрузке
    try {
      const saved = localStorage.getItem("paksushi_current_client");
      if (saved) {
        const client = JSON.parse(saved);
        setCurrentClient(client);
        setName(client.name||"");
        setPhone(client.phone||"");
        // Обновить данные из Firebase
        fetch(`${FS_BASE}/clients/${client.phone}?key=${FB_CONFIG.apiKey}`)
          .then(r=>r.ok?r.json():null)
          .then(d=>{
            if(d&&d.fields){
              const obj = Object.fromEntries(Object.entries(d.fields).map(([k,v]:any)=>[k,(v.stringValue||v.integerValue||"")]));
              const updated = {name:obj.name||client.name, phone:client.phone, orders:Number(obj.orders)||client.orders, bonusPoints:Number(obj.bonusPoints)||client.bonusPoints, registeredAt:obj.registeredAt||client.registeredAt};
              setCurrentClient(updated);
              setName(updated.name);
              localStorage.setItem("paksushi_current_client", JSON.stringify(updated));
            }
          }).catch(()=>{});
      }
    } catch(e){}
  }, []);

  // Компонент формы входа
  const LoginForm = ({bg:_bg,bgCard:_bgCard,clr:_clr,brd:_brd,mutedC:_mutedC,onLogin}:any) => {
    const [lPhone, setLPhone] = useState("");
    const [lName,  setLName]  = useState("");
    const [step,   setStep]   = useState<"phone"|"name">("phone");
    const [loading,setLoading]= useState(false);

    const checkPhone = async () => {
      if (lPhone.replace(/\D/g,"").length < 10) return;
      setLoading(true);
      try {
        const r = await fetch(`${FS_BASE}/clients/${lPhone.replace(/\D/g,"")}?key=${FB_CONFIG.apiKey}`);
        if (r.ok) {
          const d = await r.json();
          const savedName = d.fields?.name?.stringValue||"";
          if (savedName) {
            // Клиент уже зарегистрирован — сразу входим
            onLogin(lPhone, savedName);
          } else {
            setStep("name");
          }
        } else {
          setStep("name");
        }
      } catch { setStep("name"); }
      setLoading(false);
    };

    return (
      <div>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:72,height:72,borderRadius:"50%",background:darkMode?"#1a1a00":"#fff8e8",border:`2px solid ${YELLOW}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke={YELLOW} strokeWidth="2"/><path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6" stroke={YELLOW} strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <div style={{fontSize:20,fontWeight:900,marginBottom:8,color:clr}}>{step==="phone"?"Войти / Зарегистрироваться":"Как вас зовут?"}</div>
          <div style={{fontSize:13,color:mutedC,lineHeight:1.6}}>{step==="phone"?"Введите номер телефона":"Введите ваше имя для заказов"}</div>
        </div>

        <div style={{background:darkMode?"#1a1200":"#fff8e8",border:`1px solid ${darkMode?"#3a3000":"#ffe0a0"}`,borderRadius:12,padding:"12px 14px",marginBottom:20}}>
          {[["⭐","Бонусы за каждый заказ"],["📢","Акции и спецпредложения"],["🔄","История заказов на любом устройстве"]].map(([ic,tx],i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:i<2?8:0}}>
              <span style={{fontSize:16}}>{ic}</span><span style={{fontSize:12,color:darkMode?"#ccc":"#555"}}>{tx}</span>
            </div>
          ))}
        </div>

        {step==="phone"?(
          <>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:9,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:6}}>НОМЕР ТЕЛЕФОНА</div>
              <input type="tel" value={lPhone} onChange={e=>setLPhone(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&checkPhone()}
                placeholder="+7 705 000 00 00" autoFocus
                style={{width:"100%",padding:"13px 16px",background:bgCard,border:`1.5px solid ${brd}`,borderRadius:12,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:16,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <button onClick={checkPhone} disabled={lPhone.replace(/\D/g,"").length<10||loading}
              style={{width:"100%",background:lPhone.replace(/\D/g,"").length>=10?YELLOW:"#333",color:lPhone.replace(/\D/g,"").length>=10?DARK:MUTED,border:"none",padding:14,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:900,cursor:lPhone.replace(/\D/g,"").length>=10?"pointer":"not-allowed"}}>
              {loading?"Проверяем...":"Продолжить →"}
            </button>
          </>
        ):(
          <>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:9,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:6}}>ВАШЕ ИМЯ</div>
              <input type="text" value={lName} onChange={e=>setLName(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&lName.trim()&&onLogin(lPhone,lName.trim())}
                placeholder="Например: Асель" autoFocus
                style={{width:"100%",padding:"13px 16px",background:bgCard,border:`1.5px solid ${brd}`,borderRadius:12,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:16,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <button onClick={()=>lName.trim()&&onLogin(lPhone,lName.trim())} disabled={!lName.trim()}
              style={{width:"100%",background:lName.trim()?YELLOW:"#333",color:lName.trim()?DARK:MUTED,border:"none",padding:14,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:900,cursor:lName.trim()?"pointer":"not-allowed",marginBottom:10}}>
              ✅ Готово
            </button>
            <button onClick={()=>setStep("phone")}
              style={{width:"100%",background:"transparent",color:mutedC,border:`1px solid ${brd}`,padding:12,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>← Изменить номер</button>
          </>
        )}
      </div>
    );
  };

  const now    = new Date();
  const hour   = now.getHours();
  const isOpen = (hour > OPEN_HOUR || (hour === OPEN_HOUR && now.getMinutes() >= OPEN_MINUTE)) && hour < CLOSE_HOUR;

  const bg     = darkMode ? "#111111" : "#f5f5f0";
  const bgCard = darkMode ? "#1a1a1a" : "#ffffff";
  const bgHdr  = darkMode ? "#000000" : "#ffffff";
  const clr    = darkMode ? "#ffffff" : "#111111";
  const brd    = darkMode ? "#222222" : "#e5e5e5";
  const mutedC = darkMode ? "#888888" : "#999999";

  const allItems = useMemo(() => Object.values(menuData).flat(), [menuData]);
  const cartItems   = useMemo(() => Object.entries(order).filter(([,q])=>q>0).map(([id,qty])=>({...allItems.find(i=>i.id===+id)!,qty})), [order,allItems]);
  // ─── Суммы по категориям ───
  // Суши + Пицца (скидка 20/30/35%)
  const totalSushiPizza  = useMemo(() => cartItems.filter(i=>!i.isDrink&&!i.noDiscount).reduce((s,i)=>s+i.price*i.qty,0), [cartItems]);
  // Бургеры + Лаваш + Крылышки + Снэки (скидка 10% от 10 000 ₸)
  const totalOther       = useMemo(() => cartItems.filter(i=>!i.isDrink&&!!i.noDiscount).reduce((s,i)=>s+i.price*i.qty,0), [cartItems]);
  const totalFood        = totalSushiPizza + totalOther;
  const totalDrinks      = useMemo(() => cartItems.filter(i=>i.isDrink).reduce((s,i)=>s+i.price*i.qty,0), [cartItems]);
  const totalRaw         = totalFood + totalDrinks;
  // ─── Скидки ───
  // Суши+Пицца: 20/30/35% от их суммы
  const discountSushi    = getDiscount(totalSushiPizza);
  const discountSushiAmt = Math.round(totalSushiPizza * discountSushi.pct / 100);
  // Бургеры+др: 10% если их сумма >= 10 000 ₸ (независимо от суши)
  const discountOtherAmt = totalOther >= 10000 ? Math.round(totalOther * 0.10) : 0;
  // Итоговая скидка
  const discountAmt      = discountSushiAmt + discountOtherAmt;
  const totalFinal       = totalRaw - discountAmt;
  const cartCount        = useMemo(() => Object.values(order).reduce((s,q)=>s+q,0), [order]);
  const nextTier         = DISCOUNT_TIERS.find(t=>t.pct>discountSushi.pct&&t.min>totalSushiPizza);
  const progress    = Math.min(100,(totalSushiPizza/20000)*100);

  const filtered = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const res: MenuData = {};
    Object.entries(menuData).forEach(([cat,items]) => {
      const f = items.filter(i=>i.name.toLowerCase().includes(q));
      if (f.length) res[cat]=f;
    });
    return res;
  }, [search, menuData]);

  const change = (id:number, delta:number) => {
    setAnimId(id); setTimeout(()=>setAnimId(null),350);
    if (delta>0){setCartBounce(true);setTimeout(()=>setCartBounce(false),400);}
    setOrder(prev=>{
      const cur=prev[id]||0, next=Math.max(0,cur+delta);
      if (next===0){const{[id]:_,...rest}=prev;return rest;}
      return{...prev,[id]:next};
    });
  };



  const logout = () => {
    setCurrentClient(null);
    setName("");
    setPhone("");
    localStorage.removeItem("paksushi_current_client");
  };

  const sendOrder = () => {
    if (!name||!phone) return;
    const ordNum = generateOrderNumber();
    setOrderNumber(ordNum);
    const foodLines  = cartItems.filter(i=>!i.isDrink).map(i=>`- ${i.name}${i.note?` (${i.note})`:""} x${i.qty} = ${(i.price*i.qty).toLocaleString("ru-RU")} T`).join("\n");
    const drinkLines = cartItems.filter(i=> i.isDrink).map(i=>`- ${i.name} x${i.qty} = ${(i.price*i.qty).toLocaleString("ru-RU")} T`).join("\n");
    const msg = [
      `ПАК СУШИ Сарыагаш`,
      ``,
      `Номер заказа: *${ordNum}*`,
      ``,
      `Имя: ${name}`,
      `Тел: ${phone}`,
      address ? `Адрес: ${address}` : "",
      `Оплата: Kaspi Gold (номер пришлет менеджер)`,
      currentClient ? `Клиент: ${currentClient.name||name} | бонусов: ${currentClient.bonusPoints+Math.floor(totalFinal/100)}` : "",
      ``,
      foodLines ? `Еда:\n${foodLines}` : "",
      drinkLines ? `Напитки:\n${drinkLines}` : "",
      ``,
      discountSushiAmt > 0 ? `Скидка суши+пицца ${discountSushi.label}: -${discountSushiAmt.toLocaleString("ru-RU")} T` : "",
      discountOtherAmt > 0 ? `Скидка бургеры/лаваш -10%: -${discountOtherAmt.toLocaleString("ru-RU")} T` : "",
      `ИТОГО: ${totalFinal.toLocaleString("ru-RU")} T`,
      comment ? `Комментарий: ${comment}` : "",
      ``,
      `Код заказа: ${ordNum}`,
      `Заказ с сайта: paksushi-sary.com`,
    ].filter(Boolean).join("\n");
    window.open(`${WA}?text=${encodeURIComponent(msg)}`, "_blank");
    trackOrder(cartItems, totalFinal);
    // Сохранить в Firebase
    saveOrderToCloud({
      orderNumber: ordNum,
      name, phone, address, comment,
      items: cartItems.map(i=>({id:i.id,name:i.name,price:i.price,qty:i.qty,isDrink:!!i.isDrink})),
      total: totalFinal,
      discount: discountAmt,
      discountSushi: discountSushiAmt,
      discountOther: discountOtherAmt,
      discountPct: discountSushi.pct,
      clientPhone: currentClient?.phone || null,
      date: new Date().toLocaleString("ru-RU", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}),
      status: "new",
    });
    // Сохранить историю если клиент залогинен
    if (currentClient) {
      const ph = currentClient.phone;
      const history = getOrderHistory(ph);
      const record: OrderRecord = {
        id: ordNum,
        date: new Date().toLocaleString("ru-RU", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}),
        items: cartItems.map(i=>({id:i.id,name:i.name,price:i.price,qty:i.qty,isDrink:i.isDrink})),
        total: totalFinal,
        discount: discountAmt,
      };
      saveOrderHistory(ph, [record, ...history]);
      const pph = currentClient.phone;
      const updatedClient = {...currentClient, orders: currentClient.orders+1, bonusPoints: currentClient.bonusPoints+Math.floor(totalFinal/100), name};
      setCurrentClient(updatedClient);
      localStorage.setItem("paksushi_current_client", JSON.stringify(updatedClient));
      // Сохранить в Firebase
      fetch(`${FS_BASE}/clients/${pph}?key=${FB_CONFIG.apiKey}`, {
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({fields:{name:{stringValue:name},phone:{stringValue:pph},orders:{integerValue:String(updatedClient.orders)},bonusPoints:{integerValue:String(updatedClient.bonusPoints)},registeredAt:{stringValue:currentClient.registeredAt}}})
      }).catch(()=>{});
    }
    setSent(true);
    setTimeout(()=>{setOrder({});setScreen("menu");setSent(false);setOrderNumber("");setName(currentClient?.name||"");setAddress("");setComment("");}, 4000);
  };

  const repeatOrder = (record: OrderRecord) => {
    const newOrder: Record<number,number> = {};
    record.items.forEach(i => { newOrder[i.id] = (newOrder[i.id]||0) + i.qty; });
    setOrder(newOrder);
    setScreen("menu");
  };

  // Обновление пункта меню
  const updateMenuItem = (cat: string, item: MenuItem) => {
    const updated = {...menuData, [cat]: menuData[cat].map(i=>i.id===item.id?item:i)};
    setMenuData(updated); saveMenuData(updated); setEditItem(null);
  };

  const deleteMenuItem = (cat: string, id: number) => {
    const updated = {...menuData, [cat]: menuData[cat].filter(i=>i.id!==id)};
    setMenuData(updated); saveMenuData(updated); setConfirmDelete(null);
  };

  const addMenuItem = (cat: string) => {
    if (!newItem.name || !newItem.price) return;
    const allIds = Object.values(menuData).flat().map(i=>i.id);
    const maxId = allIds.length ? Math.max(...allIds) : 0;
    const item: MenuItem = {
      id: maxId + 1,
      name: newItem.name!,
      price: Number(newItem.price),
      desc: newItem.desc || "",
      img: newItem.img || `https://loremflickr.com/400/300/food?lock=${maxId+1}`,
      isDrink: cat === "🥤 Напитки",
      note: newItem.note || undefined,
    };
    const updated = {...menuData, [cat]: [...menuData[cat], item]};
    setMenuData(updated); saveMenuData(updated);
    setAddingToCat(null); setNewItem({});
  };

  const Qty = ({item}:{item:MenuItem}) => {
    const q=order[item.id]||0, isAnim=animId===item.id;
    const [editing, setEditing] = useState(false);
    const [inputVal, setInputVal] = useState("");
    return (
      <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
        {q>0&&<button onClick={e=>{e.stopPropagation();change(item.id,-1);}} className={isAnim?"bounce":""} style={{width:30,height:30,borderRadius:"50%",border:`1.5px solid ${brd}`,background:"transparent",color:clr,fontSize:17,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>−</button>}
        {q>0&&(
          editing ? (
            <input
              type="number" value={inputVal} autoFocus
              onChange={e=>setInputVal(e.target.value)}
              onBlur={()=>{
                const n=parseInt(inputVal);
                if(!isNaN(n)&&n>=0){
                  const diff=n-q;
                  if(diff!==0) change(item.id,diff);
                }
                setEditing(false); setInputVal("");
              }}
              onKeyDown={e=>{
                if(e.key==="Enter"){(e.target as HTMLInputElement).blur();}
                if(e.key==="Escape"){setEditing(false);setInputVal("");}
              }}
              onClick={e=>e.stopPropagation()}
              style={{width:40,textAlign:"center",fontSize:14,fontWeight:800,color:YELLOW,background:darkMode?"#2a2000":"#fff8e0",border:`1.5px solid ${YELLOW}`,borderRadius:8,padding:"2px 4px",outline:"none",fontFamily:"'Nunito',sans-serif"}}
            />
          ) : (
            <span
              onClick={e=>{e.stopPropagation();setEditing(true);setInputVal(String(q));}}
              style={{minWidth:20,textAlign:"center",fontSize:14,fontWeight:800,color:YELLOW,cursor:"text",borderBottom:`1px dashed ${YELLOW}`,paddingBottom:1}}
              title="Нажмите чтобы ввести количество"
            >{q}</span>
          )
        )}
        <button onClick={e=>{e.stopPropagation();change(item.id,1);}} className={isAnim?"bounce":""} style={{width:30,height:30,borderRadius:"50%",border:`1.5px solid ${YELLOW}`,background:q>0?YELLOW:"transparent",color:q>0?DARK:clr,fontSize:19,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,transition:"all 0.15s"}}>+</button>
      </div>
    );
  };

  // Модалка товара
  const ItemModal = () => {
    if (!selectedItem) return null;
    const q = order[selectedItem.id]||0;
    return (
      <div className="modal-overlay" onClick={()=>setSelectedItem(null)}>
        <div className="modal-sheet slideUp" style={{background:bgCard}} onClick={e=>e.stopPropagation()}>
          <img src={selectedItem.img} alt={selectedItem.name} style={{width:"100%",height:220,objectFit:"cover",borderRadius:"24px 24px 0 0"}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>
          <div style={{padding:"20px 20px 32px"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
              <div>
                <div style={{fontSize:20,fontWeight:900,color:clr,marginBottom:4}}>{selectedItem.name}</div>
                {selectedItem.note&&<div style={{fontSize:12,color:"#5ab4e8",fontWeight:700}}>{selectedItem.note}</div>}
              </div>
              <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                {!selectedItem.isDrink&&discountSushi.pct>0&&<div style={{fontSize:12,color:mutedC,textDecoration:"line-through"}}>{selectedItem.price.toLocaleString("ru-RU")} ₸</div>}
                <div style={{fontSize:22,fontWeight:900,color:YELLOW}}>{(!selectedItem.isDrink&&discountSushi.pct>0?Math.round(selectedItem.price*(1-discountSushi.pct/100)):selectedItem.price).toLocaleString("ru-RU")} ₸</div>
              </div>
            </div>
            {selectedItem.desc&&<div style={{fontSize:14,color:mutedC,lineHeight:1.7,marginBottom:20}}>{selectedItem.desc}</div>}
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
                {q>0&&<button onClick={()=>change(selectedItem.id,-1)} style={{width:40,height:40,borderRadius:"50%",border:`2px solid ${brd}`,background:"transparent",color:clr,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>−</button>}
                {q>0&&<span style={{fontSize:18,fontWeight:900,color:YELLOW,minWidth:24,textAlign:"center"}}>{q}</span>}
              </div>
              <button onClick={()=>change(selectedItem.id,1)} style={{flex:2,background:YELLOW,color:DARK,border:"none",padding:"13px",borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:15,fontWeight:900,cursor:"pointer"}}>
                {q>0?"+ Ещё один":"+ В корзину"} — {(!selectedItem.isDrink&&discountSushi.pct>0?Math.round(selectedItem.price*(1-discountSushi.pct/100)):selectedItem.price).toLocaleString("ru-RU")} ₸
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const todayStr = new Date().toISOString().split("T")[0];

  const Header = ({title,back}:{title?:string;back?:Screen}) => (
    <header style={{background:bgHdr,borderBottom:`1px solid ${brd}`,position:"sticky",top:0,zIndex:200,boxShadow:"0 2px 16px rgba(0,0,0,0.25)"}}>
      <div style={{maxWidth:700,margin:"0 auto",padding:"0 16px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {back&&<button onClick={()=>setScreen(back)} style={{background:"none",border:"none",color:YELLOW,fontSize:20,cursor:"pointer",marginRight:2}}>←</button>}
          {!back&&(
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:"#e5a800",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🍣</div>
              <div>
                <div style={{fontSize:15,fontWeight:900,letterSpacing:1,color:YELLOW,lineHeight:1}}>ПАК СУШИ</div>
                <div style={{fontSize:9,color:mutedC,letterSpacing:1}}>САРЫАҒАШ</div>
                <div style={{display:"flex",alignItems:"center",gap:4,marginTop:1}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:isOpen?"#4cff91":"#ff4444"}}/>
                  <span style={{fontSize:8,color:isOpen?"#4cff91":"#ff4444",fontWeight:700}}>{isOpen?"Открыто · до 00:00":"Закрыто · с 9:30"}</span>
                </div>
              </div>
            </div>
          )}
          {title&&<span style={{fontSize:16,fontWeight:900,color:YELLOW}}>{title}</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button onClick={()=>setDarkMode(!darkMode)} style={{width:30,height:30,borderRadius:"50%",border:`1px solid ${brd}`,background:"transparent",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{darkMode?"☀️":"🌙"}</button>
          {!back&&(<>
            <button onClick={()=>setScreen(currentClient?"profile":"login")} style={{width:30,height:30,borderRadius:"50%",border:`1px solid ${currentClient?"#4cff91":brd}`,background:currentClient?"#0a2a0a":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke={currentClient?"#4cff91":mutedC} strokeWidth="2"/><path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6" stroke={currentClient?"#4cff91":mutedC} strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
            <button onClick={()=>setScreen("info")} style={{width:30,height:30,borderRadius:"50%",border:`1px solid ${brd}`,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={mutedC} strokeWidth="2"/><path d="M12 11v5" stroke={mutedC} strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="7.5" r="1" fill={mutedC}/></svg>
            </button>
            {cartCount>0&&<button onClick={()=>setScreen("checkout")} className={cartBounce?"bounce pulse":"pulse"} style={{background:YELLOW,color:DARK,border:"none",padding:"7px 13px",borderRadius:20,cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontSize:12,fontWeight:800,display:"flex",alignItems:"center",gap:5}}>🛒 {cartCount} · {(totalRaw-discountAmt).toLocaleString("ru-RU")} ₸</button>}
          </>)}
        </div>
      </div>
    </header>
  );

  // ─── ADMIN ───
  if (screen==="admin") {
    if (!adminRole) return (
      <div style={{fontFamily:"'Nunito',sans-serif",background:bg,minHeight:"100vh",color:clr}}>
        <style>{css}</style>
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
        <Header title="🔒 Вход в панель" back="menu"/>
        <div style={{maxWidth:400,margin:"0 auto",padding:"60px 16px"}} className="fadeIn">
          <div style={{textAlign:"center",marginBottom:32}}>
            <div style={{fontSize:50,marginBottom:12}}>🔐</div>
            <div style={{fontSize:20,fontWeight:900,marginBottom:8}}>Панель управления</div>
            <div style={{fontSize:13,color:mutedC}}>Введите пароль для входа</div>
          </div>
          <input type="password" value={adminPass} onChange={e=>setAdminPass(e.target.value)}
            onKeyDown={e=>{
              if(e.key==="Enter"){
                if(adminPass===OWNER_PASSWORD) setAdminRole("owner");
                else if(adminPass===ADMIN_PASSWORD) setAdminRole("admin");
                else alert("Неверный пароль");
              }
            }}
            placeholder="Пароль" autoFocus
            style={{width:"100%",padding:"13px 16px",background:bgCard,border:`1.5px solid ${brd}`,borderRadius:12,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:16,outline:"none",boxSizing:"border-box",marginBottom:16}}/>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button onClick={()=>{
              if(adminPass===OWNER_PASSWORD) setAdminRole("owner");
              else if(adminPass===ADMIN_PASSWORD) setAdminRole("admin");
              else alert("Неверный пароль");
            }} style={{width:"100%",background:YELLOW,color:DARK,border:"none",padding:14,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:900,cursor:"pointer"}}>
              Войти
            </button>
          </div>

        </div>
      </div>
    );
    const stats = getStats();
    const clients = getClients();
    const popularSorted = Object.entries(stats.popularItems||{}).sort((a:any,b:any)=>b[1]-a[1]).slice(0,10);

    return (
      <div style={{fontFamily:"'Nunito',sans-serif",background:bg,minHeight:"100vh",color:clr}}>
        <style>{css}</style>
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
        <Header title="⚙️ Панель" back="menu"/>
        {/* Табы */}
        <div style={{maxWidth:700,margin:"0 auto",padding:"12px 16px 0"}}>
          {/* Роль */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:11,background:adminRole==="owner"?"#1a1200":"#0a1a2a",border:`1px solid ${adminRole==="owner"?"#3a3000":"#1a3a5a"}`,borderRadius:10,padding:"4px 10px",color:adminRole==="owner"?YELLOW:"#5ab4e8",fontWeight:800}}>
              {adminRole==="owner"?"⭐ Владелец":"👤 Администратор"}
            </div>
            <button onClick={()=>{setAdminRole("");setAdminPass("");}} style={{background:"transparent",border:`1px solid ${brd}`,borderRadius:8,padding:"4px 10px",color:mutedC,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
              Выйти
            </button>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {(["stats","menu","clients",...(adminRole==="owner"?["deleted"]:[])]).map((t:any)=>(
              <button key={t} onClick={()=>{
                if(t==="deleted"&&adminRole==="owner"){
                  const saved = JSON.parse(localStorage.getItem("paksushi_deleted_orders")||"[]");
                  setDeletedOrders(saved);
                }
                setAdminTab(t);
              }}
                style={{flex:1,minWidth:"40%",padding:"8px",borderRadius:10,border:`1px solid ${brd}`,background:adminTab===t?YELLOW:bgCard,color:adminTab===t?DARK:mutedC,fontFamily:"'Nunito',sans-serif",fontSize:11,fontWeight:800,cursor:"pointer"}}>
                {t==="stats"?"📊 Статистика":t==="menu"?"🍣 Меню":t==="clients"?"👥 Клиенты":"🗑 Удалённые"}
              </button>
            ))}
          </div>
        </div>

        <div style={{maxWidth:700,margin:"0 auto",padding:"16px 16px 60px"}} className="fadeIn">
          {adminTab==="stats"&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
                {[
                  {label:"Посещений сайта",value:stats.visits||0,icon:"👁"},
                  {label:"Заказов",value:stats.orders||0,icon:"🛒"},
                  {label:"Выручка ₸",value:(stats.totalRevenue||0).toLocaleString("ru-RU"),icon:"💰"},
                  {label:"Клиентов",value:Object.keys(clients).length,icon:"👥"},
                ].map((s,i)=>(
                  <div key={i} style={{background:bgCard,border:`1px solid ${brd}`,borderRadius:14,padding:"16px",textAlign:"center"}}>
                    <div style={{fontSize:26,marginBottom:6}}>{s.icon}</div>
                    <div style={{fontSize:20,fontWeight:900,color:YELLOW}}>{s.value}</div>
                    <div style={{fontSize:10,color:mutedC,fontWeight:700,marginTop:2}}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Последние заказы из Firebase */}
              <div style={{marginBottom:20}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700}}>ПОСЛЕДНИЕ ЗАКАЗЫ (FIREBASE)</div>
  <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>loadOrdersFromCloud().then(setCloudOrders)}
                    style={{background:"#1a1a2a",border:`1px solid ${brd}`,borderRadius:8,padding:"4px 10px",color:"#5ab4e8",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
                    🔄 Обновить
                  </button>
                  <button onClick={()=>{
                    if(!window.confirm("Сбросить всю статистику? Это нельзя отменить!")) return;
                    saveStats({visits:0,orders:0,totalRevenue:0,popularItems:{}});
                    localStorage.setItem("paksushi_order_counter","1000");
                    setCloudOrders([]);
                    alert('✅ Статистика сброшена!');
                  }} style={{background:"#2a0a0a",border:"1px solid #5a1a1a",borderRadius:8,padding:"4px 10px",color:"#ff6b6b",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
                    🗑 Сбросить
                  </button>
                </div>
                </div>
                {cloudOrders.length===0?(
                  <div style={{background:bgCard,borderRadius:14,border:`1px solid ${brd}`,padding:"20px",textAlign:"center",color:mutedC,fontSize:13}}>
                    Нажмите "Обновить" чтобы загрузить заказы
                  </div>
                ):(
                  (() => {
                    const STATUS_CONFIG: Record<string,{label:string;color:string;bg:string;border:string}> = {
                      "new":       {label:"🆕 Новый",      color:"#5ab4e8", bg:"#0a1a2a", border:"#1a3a5a"},
                      "paid":      {label:"💳 Оплачен",    color:"#4cff91", bg:"#0a2a0a", border:"#1a4a1a"},
                      "cooking":   {label:"🍳 Готовится",  color:"#ffaa00", bg:"#2a1a00", border:"#4a3a00"},
                      "delivered": {label:"✅ Доставлен",  color:"#aaa",    bg:"#1a1a1a", border:"#2a2a2a"},
                      "cancelled": {label:"❌ Отменён",    color:"#ff6b6b", bg:"#2a0a0a", border:"#5a1a1a"},
                    };
                    const STATUS_NEXT: Record<string,string> = {
                      "new":"paid", "paid":"cooking", "cooking":"delivered"
                    };
                    const STATUS_NEXT_LABEL: Record<string,string> = {
                      "new":"Отметить оплаченным →",
                      "paid":"Готовится →",
                      "cooking":"Доставлен →",
                    };
                    const updateOrderStatus = async (ordId:string, newStatus:string) => {
                      try {
                        await fetch(`${FS_BASE}/orders/${ordId}?key=${FB_CONFIG.apiKey}&updateMask.fieldPaths=status`, {
                          method:"PATCH",
                          headers:{"Content-Type":"application/json"},
                          body: JSON.stringify({fields:{status:{stringValue:newStatus}}}),
                        });
                        setCloudOrders(prev=>prev.map(o=>o.id===ordId?{...o,status:newStatus}:o));
                      } catch(e){console.error(e);}
                    };
                    // Счётчики по статусам
                    const counts: Record<string,number> = {};
                    cloudOrders.forEach(o=>{ const s=o.status||"new"; counts[s]=(counts[s]||0)+1; });
                    const paidRevenue = cloudOrders.filter(o=>o.status==="paid"||o.status==="cooking"||o.status==="delivered").reduce((s:number,o:any)=>s+(o.total||0),0);
                    return (<>
                      {/* Сводка */}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                        <div style={{background:"#0a2a0a",border:"1px solid #1a4a1a",borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:900,color:"#4cff91"}}>{paidRevenue.toLocaleString("ru-RU")} ₸</div>
                          <div style={{fontSize:10,color:mutedC,marginTop:2}}>💳 Реальная выручка</div>
                        </div>
                        <div style={{background:bgCard,border:`1px solid ${brd}`,borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:900,color:YELLOW}}>{cloudOrders.filter(o=>o.status==="new"||!o.status).length}</div>
                          <div style={{fontSize:10,color:mutedC,marginTop:2}}>🆕 Новых заказов</div>
                        </div>
                      </div>
                      {/* Список заказов */}
                      <div style={{display:"flex",flexDirection:"column",gap:10}}>
                        {cloudOrders.slice(0,30).map((ord:any)=>{
                          const st = ord.status||"new";
                          const cfg = STATUS_CONFIG[st]||STATUS_CONFIG["new"];
                          const nextSt = STATUS_NEXT[st];
                          return (
                            <div key={ord.id} style={{background:bgCard,borderRadius:14,border:`1px solid ${brd}`,overflow:"hidden"}}>
                              {/* Шапка заказа */}
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderBottom:`1px solid ${brd}`}}>
                                <div style={{flex:1}}>
                                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                                    <span style={{fontSize:13,fontWeight:900,color:YELLOW}}>{ord.orderNumber}</span>
                                    <span style={{fontSize:10,background:cfg.bg,border:`1px solid ${cfg.border}`,color:cfg.color,padding:"1px 7px",borderRadius:8,fontWeight:700}}>{cfg.label}</span>
                                  </div>
                                  <div style={{fontSize:11,color:mutedC,marginTop:2}}>{ord.date} · {ord.name} · {ord.phone}</div>
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                                  <div style={{textAlign:"right"}}>
                                    <div style={{fontSize:14,fontWeight:900,color:YELLOW}}>{(ord.total||0).toLocaleString("ru-RU")} ₸</div>
                                    {ord.discount>0&&<div style={{fontSize:10,color:"#4cff91"}}>−{(ord.discount||0).toLocaleString("ru-RU")} ₸</div>}
                                  </div>
                                  <button onClick={async()=>{
                                    if(!window.confirm(`Удалить заказ ${ord.orderNumber}?`)) return;
                                    try {
                                      await fetch(`${FS_BASE}/orders/${ord.id}?key=${FB_CONFIG.apiKey}`,{method:"DELETE"});
                                      // Сохранить в историю удалённых
                                      const deleted = JSON.parse(localStorage.getItem("paksushi_deleted_orders")||"[]");
                                      deleted.unshift({...ord, deletedAt: new Date().toLocaleString("ru-RU"), deletedBy: adminRole});
                                      localStorage.setItem("paksushi_deleted_orders", JSON.stringify(deleted.slice(0,100)));
                                      setCloudOrders(prev=>prev.filter(o=>o.id!==ord.id));
                                    } catch(e){console.error(e);}
                                  }} style={{background:"#2a0a0a",border:"1px solid #5a1a1a",borderRadius:8,padding:"6px 8px",color:"#ff6b6b",fontSize:13,cursor:"pointer",flexShrink:0}}>🗑</button>
                                </div>
                              </div>
                              {/* Состав */}
                              <div style={{padding:"8px 14px",fontSize:11,color:mutedC,lineHeight:1.6}}>
                                {ord.address&&<div>📍 {ord.address}</div>}
                                <div>{(ord.items||[]).map((i:any)=>`${i.name} ×${i.qty}`).join(" · ")}</div>
                                {ord.comment&&<div style={{color:"#5ab4e8",marginTop:2}}>💬 {ord.comment}</div>}
                              </div>
                              {/* Кнопки статуса */}
                              <div style={{display:"flex",gap:6,padding:"8px 14px",borderTop:`1px solid ${brd}`}}>
                                {nextSt&&(
                                  <button onClick={()=>updateOrderStatus(ord.id, nextSt)}
                                    style={{flex:2,background:STATUS_CONFIG[nextSt].bg,border:`1px solid ${STATUS_CONFIG[nextSt].border}`,borderRadius:8,padding:"7px",color:STATUS_CONFIG[nextSt].color,fontFamily:"'Nunito',sans-serif",fontSize:11,fontWeight:800,cursor:"pointer"}}>
                                    {STATUS_NEXT_LABEL[st]}
                                  </button>
                                )}
                                {st!=="cancelled"&&st!=="delivered"&&(
                                  <button onClick={()=>updateOrderStatus(ord.id,"cancelled")}
                                    style={{flex:1,background:"#2a0a0a",border:"1px solid #5a1a1a",borderRadius:8,padding:"7px",color:"#ff6b6b",fontFamily:"'Nunito',sans-serif",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                                    Отменить
                                  </button>
                                )}
                                {(st==="delivered"||st==="cancelled")&&(
                                  <div style={{flex:1,textAlign:"center",fontSize:11,color:mutedC,padding:"7px"}}>
                                    {st==="delivered"?"✅ Завершён":"❌ Отменён"}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>);
                  })()
                )}
              </div>

              {popularSorted.length>0&&(
                <div style={{background:bgCard,borderRadius:16,border:`1px solid ${brd}`,overflow:"hidden"}}>
                  <div style={{padding:"12px 16px",borderBottom:`1px solid ${brd}`,fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700}}>ТОП БЛЮД</div>
                  {popularSorted.map(([name,count]:any,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:i<popularSorted.length-1?`1px solid ${brd}`:"none"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:24,height:24,borderRadius:"50%",background:i===0?"#f5c518":i===1?"#aaa":i===2?"#cd7f32":"#333",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:i<3?DARK:"#888"}}>{i+1}</div>
                        <span style={{fontSize:13,fontWeight:600}}>{name}</span>
                      </div>
                      <span style={{fontSize:13,fontWeight:800,color:YELLOW}}>{count} шт</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {adminTab==="menu"&&(
            <div>
              {/* Подтверждение удаления */}
              {confirmDelete&&(
                <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
                  <div style={{background:bgCard,borderRadius:20,padding:"28px 24px",textAlign:"center",maxWidth:320,width:"100%"}}>
                    <div style={{fontSize:36,marginBottom:12}}>🗑️</div>
                    <div style={{fontSize:15,fontWeight:800,marginBottom:6,color:clr}}>Удалить товар?</div>
                    <div style={{fontSize:13,color:mutedC,marginBottom:20}}>{confirmDelete.name}</div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>setConfirmDelete(null)} style={{flex:1,padding:"11px",borderRadius:12,border:`1px solid ${brd}`,background:"transparent",color:clr,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>Отмена</button>
                      <button onClick={()=>deleteMenuItem(confirmDelete.cat,confirmDelete.id)} style={{flex:1,padding:"11px",borderRadius:12,border:"none",background:"#ff4444",color:"#fff",fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:900,cursor:"pointer"}}>Удалить</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Форма редактирования */}
              {editItem&&(
                <div style={{background:bgCard,borderRadius:16,border:`2px solid ${YELLOW}`,padding:"16px",marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:800,color:YELLOW,marginBottom:12}}>✏️ Редактировать: {editItem.name}</div>
                  {[["Название","name"],["Цена (₸)","price"],["Заметка (напр. 10 шт)","note"],["Описание","desc"],["Фото URL","img"]].map(([label,field])=>(
                    <div key={field} style={{marginBottom:10}}>
                      <div style={{fontSize:9,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:4}}>{label.toUpperCase()}</div>
                      {field==="desc"
                        ? <textarea value={(editItem as any)[field]||""} onChange={e=>setEditItem({...editItem,[field]:e.target.value})} rows={2}
                            style={{width:"100%",padding:"9px 12px",background:bg,border:`1px solid ${brd}`,borderRadius:8,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                        : <input value={(editItem as any)[field]||""} onChange={e=>setEditItem({...editItem,[field]:field==="price"?Number(e.target.value):e.target.value})}
                            style={{width:"100%",padding:"9px 12px",background:bg,border:`1px solid ${brd}`,borderRadius:8,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                      }
                    </div>
                  ))}
                  {editItem.img&&<img src={editItem.img} style={{width:"100%",height:100,objectFit:"cover",borderRadius:8,marginBottom:10}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>}
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>updateMenuItem(editCat,editItem)} style={{flex:2,background:YELLOW,color:DARK,border:"none",padding:"10px",borderRadius:10,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:900,cursor:"pointer"}}>💾 Сохранить</button>
                    <button onClick={()=>setEditItem(null)} style={{flex:1,background:"transparent",color:mutedC,border:`1px solid ${brd}`,padding:"10px",borderRadius:10,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>Отмена</button>
                  </div>
                </div>
              )}

              {/* Форма добавления товара */}
              {addingToCat&&(
                <div style={{background:bgCard,borderRadius:16,border:`2px solid #4cff91`,padding:"16px",marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#4cff91",marginBottom:12}}>➕ Новый товар в {addingToCat}</div>
                  {[["Название *","name"],["Цена (₸) *","price"],["Заметка (напр. 10 шт)","note"],["Описание","desc"],["Фото URL","img"]].map(([label,field])=>(
                    <div key={field} style={{marginBottom:10}}>
                      <div style={{fontSize:9,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:4}}>{label.toUpperCase()}</div>
                      {field==="desc"
                        ? <textarea value={(newItem as any)[field]||""} onChange={e=>setNewItem({...newItem,[field]:e.target.value})} rows={2} placeholder={field==="desc"?"Описание блюда...":""}
                            style={{width:"100%",padding:"9px 12px",background:bg,border:`1px solid ${brd}`,borderRadius:8,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                        : <input value={(newItem as any)[field]||""} onChange={e=>setNewItem({...newItem,[field]:field==="price"?Number(e.target.value):e.target.value})} placeholder={field==="name"?"Название блюда":field==="price"?"0":""}
                            style={{width:"100%",padding:"9px 12px",background:bg,border:`1px solid ${brd}`,borderRadius:8,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                      }
                    </div>
                  ))}
                  {newItem.img&&<img src={newItem.img} style={{width:"100%",height:100,objectFit:"cover",borderRadius:8,marginBottom:10}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>}
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>addMenuItem(addingToCat)} disabled={!newItem.name||!newItem.price}
                      style={{flex:2,background:newItem.name&&newItem.price?"#4cff91":"#2a2a2a",color:newItem.name&&newItem.price?DARK:MUTED,border:"none",padding:"10px",borderRadius:10,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:900,cursor:newItem.name&&newItem.price?"pointer":"not-allowed"}}>
                      ➕ Добавить товар
                    </button>
                    <button onClick={()=>{setAddingToCat(null);setNewItem({});}} style={{flex:1,background:"transparent",color:mutedC,border:`1px solid ${brd}`,padding:"10px",borderRadius:10,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>Отмена</button>
                  </div>
                </div>
              )}

              {/* Список категорий и товаров */}
              {Object.entries(menuData).map(([cat,items])=>(
                <div key={cat} style={{marginBottom:20}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{fontSize:12,fontWeight:800,color:YELLOW,letterSpacing:2}}>{cat} <span style={{color:mutedC,fontSize:10,fontWeight:600}}>({items.length} поз.)</span></div>
                    <button onClick={()=>{setAddingToCat(cat);setEditItem(null);setNewItem({});}}
                      style={{background:"#0a2a0a",border:"1px solid #2a5a2a",borderRadius:8,padding:"5px 12px",color:"#4cff91",fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
                      ➕ Добавить
                    </button>
                  </div>
                  <div style={{background:bgCard,borderRadius:14,border:`1px solid ${brd}`,overflow:"hidden"}}>
                    {items.map((item,idx)=>(
                      <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:idx<items.length-1?`1px solid ${brd}`:"none",background:editItem?.id===item.id?darkMode?"#1a1a00":"#fffbe6":"transparent"}}>
                        <img src={item.img} style={{width:44,height:44,borderRadius:8,objectFit:"cover",flexShrink:0}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
                          <div style={{fontSize:12,color:YELLOW,fontWeight:800}}>{item.price.toLocaleString("ru-RU")} ₸ {item.note&&<span style={{fontSize:10,color:mutedC,fontWeight:400}}>· {item.note}</span>}</div>
                        </div>
                        <div style={{display:"flex",gap:6,flexShrink:0}}>
                          <button onClick={()=>{setEditItem({...item});setEditCat(cat);setAddingToCat(null);}}
                            style={{background:"#1a1a2a",border:`1px solid #2a2a5a`,borderRadius:8,padding:"6px 10px",color:"#5ab4e8",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>✏️</button>
                          <button onClick={()=>setConfirmDelete({cat,id:item.id,name:item.name})}
                            style={{background:"#2a0a0a",border:`1px solid #5a1a1a`,borderRadius:8,padding:"6px 10px",color:"#ff6b6b",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>🗑</button>
                        </div>
                      </div>
                    ))}
                    {items.length===0&&(
                      <div style={{padding:"20px",textAlign:"center",color:mutedC,fontSize:13}}>Нет товаров — добавьте первый ↑</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {adminTab==="deleted"&&adminRole==="owner"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700}}>УДАЛЁННЫЕ ЗАКАЗЫ</div>
                <button onClick={()=>{
                  if(!window.confirm("Очистить историю удалённых заказов?")) return;
                  localStorage.removeItem("paksushi_deleted_orders");
                  setDeletedOrders([]);
                }} style={{background:"#2a0a0a",border:"1px solid #5a1a1a",borderRadius:8,padding:"4px 10px",color:"#ff6b6b",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
                  Очистить
                </button>
              </div>
              {deletedOrders.length===0?(
                <div style={{background:bgCard,borderRadius:14,border:`1px solid ${brd}`,padding:"20px",textAlign:"center",color:mutedC,fontSize:13}}>
                  Удалённых заказов нет
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {deletedOrders.map((ord:any,i:number)=>(
                    <div key={i} style={{background:bgCard,borderRadius:14,border:"1px solid #5a1a1a",overflow:"hidden"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderBottom:"1px solid #3a1a1a"}}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:13,fontWeight:900,color:"#ff6b6b"}}>{ord.orderNumber}</span>
                            <span style={{fontSize:10,background:"#2a0a0a",border:"1px solid #5a1a1a",color:"#ff6b6b",padding:"1px 6px",borderRadius:8,fontWeight:700}}>❌ Удалён</span>
                          </div>
                          <div style={{fontSize:11,color:mutedC,marginTop:2}}>{ord.date} · {ord.name} · {ord.phone}</div>
                          <div style={{fontSize:10,color:"#ff6b6b",marginTop:2}}>Удалил: {ord.deletedBy==="owner"?"⭐ Владелец":"👤 Админ"} · {ord.deletedAt}</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:14,fontWeight:900,color:"#ff6b6b"}}>{(ord.total||0).toLocaleString("ru-RU")} ₸</div>
                          {ord.discount>0&&<div style={{fontSize:10,color:mutedC}}>−{(ord.discount||0).toLocaleString("ru-RU")} ₸</div>}
                        </div>
                      </div>
                      <div style={{padding:"8px 14px",fontSize:11,color:mutedC,lineHeight:1.6}}>
                        {ord.address&&<div>📍 {ord.address}</div>}
                        <div>{(ord.items||[]).map((i:any)=>`${i.name} ×${i.qty}`).join(" · ")}</div>
                        {ord.comment&&<div style={{color:"#5ab4e8",marginTop:2}}>💬 {ord.comment}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {adminTab==="clients"&&(
            <div>
              {Object.values(clients).length===0?(
                <div style={{textAlign:"center",padding:"40px",color:mutedC}}>Клиентов пока нет</div>
              ):(
                <div style={{background:bgCard,borderRadius:14,border:`1px solid ${brd}`,overflow:"hidden"}}>
                  <div style={{padding:"12px 16px",borderBottom:`1px solid ${brd}`,fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700}}>ЗАРЕГИСТРИРОВАННЫЕ КЛИЕНТЫ</div>
                  {Object.values(clients).map((c,idx,arr)=>(
                    <div key={c.phone} style={{padding:"12px 16px",borderBottom:idx<arr.length-1?`1px solid ${brd}`:"none"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:700}}>{c.name||"—"}</div>
                          <div style={{fontSize:12,color:mutedC}}>{c.phone}</div>
                          <div style={{fontSize:11,color:mutedC,marginTop:2}}>С {c.registeredAt}</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:13,fontWeight:800,color:YELLOW}}>⭐ {c.bonusPoints}</div>
                          <div style={{fontSize:11,color:mutedC}}>{c.orders} заказов</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── INFO ───
  if (screen==="info") return (
    <div style={{fontFamily:"'Nunito',sans-serif",background:bg,minHeight:"100vh",color:clr}}>
      <style>{css}</style>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <Header title="О нас" back="menu"/>
      <div style={{maxWidth:500,margin:"0 auto",padding:"20px 16px 60px"}} className="fadeIn">
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:80,height:80,borderRadius:"50%",background:"#e5a800",display:"flex",alignItems:"center",justifyContent:"center",fontSize:40,margin:"0 auto 12px"}}>🍣</div>
          <div style={{fontSize:22,fontWeight:900,color:YELLOW}}>ПАК СУШИ</div>
          <div style={{fontSize:13,color:mutedC,marginTop:4}}>Сарыағаш · Доставка еды</div>
        </div>

        <div style={{background:"linear-gradient(135deg,#1a1200,#2a1e00)",border:`1px solid #3a3000`,borderRadius:16,padding:"16px 18px",marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:900,color:YELLOW,marginBottom:10}}>🎁 Зарегистрируйся — получай бонусы!</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            {[["⭐","1 бонус за 100 ₸ заказа"],["📢","Акции первым в WhatsApp"],["🎯","Персональные предложения"],["💰","Накапливай и трать бонусы"]].map(([ic,tx],i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"8px 10px"}}>
                <span style={{fontSize:16}}>{ic}</span><span style={{fontSize:11,color:"#ddd",lineHeight:1.3}}>{tx}</span>
              </div>
            ))}
          </div>
          <button onClick={()=>setScreen("login")} style={{width:"100%",background:YELLOW,color:DARK,border:"none",padding:"10px",borderRadius:10,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:900,cursor:"pointer"}}>Войти / Зарегистрироваться →</button>
        </div>

        <div style={{background:bgCard,borderRadius:16,border:`1px solid ${brd}`,marginBottom:16,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${brd}`,fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700}}>КОНТАКТЫ</div>
          {[
            {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C9.61 21 3 14.39 3 6a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z" stroke={YELLOW} strokeWidth="2" strokeLinecap="round"/></svg>, label:"Телефон", value:"+7 705 721 05 05", href:`tel:+77057210505`},
            {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" stroke={YELLOW} strokeWidth="2"/></svg>, label:"Адрес", value:ADDRESS, href:MAPS_URL},
            {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={YELLOW} strokeWidth="2"/><path d="M12 7v5l3 3" stroke={YELLOW} strokeWidth="2" strokeLinecap="round"/></svg>, label:"Режим работы", value:"10:00 — 00:00, ежедневно", href:null},
          ].map((row,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderBottom:i<2?`1px solid ${brd}`:"none"}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:darkMode?"#1a1a00":"#fff8e8",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{row.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:mutedC,fontWeight:700,letterSpacing:1,marginBottom:2}}>{row.label}</div>
                {row.href?<a href={row.href} target="_blank" rel="noreferrer" style={{fontSize:13,fontWeight:700,color:YELLOW,textDecoration:"none"}}>{row.value}</a>:<div style={{fontSize:13,fontWeight:700}}>{row.value}</div>}
              </div>
            </div>
          ))}
        </div>

        <div style={{background:bgCard,borderRadius:16,border:`1px solid ${brd}`,marginBottom:16,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${brd}`,fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700}}>НА КАРТЕ</div>
          <div style={{position:"relative",width:"100%",paddingBottom:"56%",background:darkMode?"#1a1a1a":"#f0f0f0"}}>
            <iframe src={MAPS_EMBED} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",border:"none"}} loading="lazy" title="Карта ПАК СУШИ"/>
          </div>
          <a href={MAPS_URL} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"12px 16px",fontSize:13,fontWeight:700,color:YELLOW,textDecoration:"none",borderTop:`1px solid ${brd}`}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" stroke={YELLOW} strokeWidth="2"/></svg>
            Открыть в Google Maps
          </a>
        </div>

        <div style={{background:bgCard,borderRadius:16,border:`1px solid ${brd}`,marginBottom:20,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${brd}`,fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700}}>МЫ В СОЦСЕТЯХ</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr"}}>
            {[
              {icon:<IgIcon size={28}/>,label:"Instagram",color:"#e1306c",href:INSTAGRAM,bg:darkMode?"#2a0a1a":"#fff0f5"},
              {icon:<TkIcon size={28}/>,label:"TikTok",color:"#ffffff",href:TIKTOK,bg:darkMode?"#0a0a0a":"#f0f0f0"},
              {icon:<WaIcon size={28}/>,label:"WhatsApp",color:"#25d366",href:WA,bg:darkMode?"#0a2a0a":"#f0fff4"},
            ].map((s,i)=>(
              <a key={i} href={s.href} target="_blank" rel="noreferrer"
                style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"18px 8px",textDecoration:"none",background:s.bg,borderRight:i<2?`1px solid ${brd}`:"none"}}>
                <div style={{marginBottom:8}}>{s.icon}</div>
                <span style={{fontSize:11,fontWeight:800,color:s.color}}>{s.label}</span>
              </a>
            ))}
          </div>
        </div>

        <button onClick={()=>setScreen("menu")} style={{width:"100%",background:YELLOW,color:DARK,border:"none",padding:14,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:900,cursor:"pointer",marginBottom:10}}>🍣 Перейти к меню</button>
        <button onClick={()=>setScreen("admin")} style={{width:"100%",background:"transparent",color:mutedC,border:`1px solid ${brd}`,padding:10,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>⚙️ Панель администратора</button>
      </div>
    </div>
  );

  // ─── LOGIN ───
  if (screen==="login") return (
    <div style={{fontFamily:"'Nunito',sans-serif",background:bg,minHeight:"100vh",color:clr}}>
      <style>{css}</style>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <Header title="Мой профиль" back="menu"/>
      <div style={{maxWidth:400,margin:"0 auto",padding:"32px 16px"}} className="fadeIn">
        {currentClient ? (
          <div style={{textAlign:"center"}}>
            <div style={{width:72,height:72,borderRadius:"50%",background:"#0a2a0a",border:"2px solid #4cff91",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="#4cff91" strokeWidth="2"/><path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6" stroke="#4cff91" strokeWidth="2" strokeLinecap="round"/></svg>
            </div>
            <div style={{fontSize:18,fontWeight:900,marginBottom:4}}>{currentClient.name}</div>
            <div style={{fontSize:14,color:mutedC,marginBottom:24}}>{currentClient.phone}</div>
            <button onClick={()=>setScreen("profile")} style={{width:"100%",background:YELLOW,color:DARK,border:"none",padding:14,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:900,cursor:"pointer",marginBottom:10}}>Мой профиль</button>
            <button onClick={logout} style={{width:"100%",background:"transparent",color:"#ff6b6b",border:"1px solid #ff6b6b",padding:14,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:700,cursor:"pointer"}}>Выйти</button>
          </div>
        ) : (
          <LoginForm
            bg={bg} bgCard={bgCard} clr={clr} brd={brd} mutedC={mutedC}
            onLogin={async (ph:string, nm:string) => {
              // Ищем клиента в Firebase по телефону
              try {
                const r = await fetch(`${FS_BASE}/clients/${ph.replace(/\D/g,"")}?key=${FB_CONFIG.apiKey}`);
                if (r.ok) {
                  const d = await r.json();
                  const obj = d.fields ? Object.fromEntries(Object.entries(d.fields).map(([k,v]:any)=>[k,(v.stringValue||v.integerValue||v.booleanValue||"")])) : {};
                  const client = {name: obj.name||nm, phone:ph.replace(/\D/g,""), orders:Number(obj.orders)||0, bonusPoints:Number(obj.bonusPoints)||0, registeredAt:obj.registeredAt||new Date().toLocaleDateString("ru-RU")};
                  // Обновляем имя если новое
                  if (nm && nm !== obj.name) {
                    await fetch(`${FS_BASE}/clients/${ph.replace(/\D/g,"")}?key=${FB_CONFIG.apiKey}`, {
                      method:"PATCH", headers:{"Content-Type":"application/json"},
                      body: JSON.stringify({fields:{name:{stringValue:nm},phone:{stringValue:ph.replace(/\D/g,"")},orders:{integerValue:String(client.orders)},bonusPoints:{integerValue:String(client.bonusPoints)},registeredAt:{stringValue:client.registeredAt}}})
                    });
                  }
                  setCurrentClient(client);
                  setName(client.name);
                  setPhone(client.phone);
                  localStorage.setItem("paksushi_current_client", JSON.stringify(client));
                  setScreen("profile");
                } else {
                  // Новый клиент — создаём
                  const newClient = {name:nm, phone:ph.replace(/\D/g,""), orders:0, bonusPoints:0, registeredAt:new Date().toLocaleDateString("ru-RU")};
                  await fetch(`${FS_BASE}/clients/${ph.replace(/\D/g,"")}?key=${FB_CONFIG.apiKey}`, {
                    method:"PATCH", headers:{"Content-Type":"application/json"},
                    body: JSON.stringify({fields:{name:{stringValue:nm},phone:{stringValue:ph.replace(/\D/g,"")},orders:{integerValue:"0"},bonusPoints:{integerValue:"0"},registeredAt:{stringValue:newClient.registeredAt}}})
                  });
                  setCurrentClient(newClient);
                  setName(nm); setPhone(ph.replace(/\D/g,""));
                  localStorage.setItem("paksushi_current_client", JSON.stringify(newClient));
                  setScreen("profile");
                }
              } catch(e) {
                console.error(e);
                // Fallback — локальное сохранение
                const client = {name:nm, phone:ph.replace(/\D/g,""), orders:0, bonusPoints:0, registeredAt:new Date().toLocaleDateString("ru-RU")};
                setCurrentClient(client); setName(nm); setPhone(ph.replace(/\D/g,""));
                localStorage.setItem("paksushi_current_client", JSON.stringify(client));
                setScreen("profile");
              }
            }}
          />
        )}
      </div>
    </div>
  );

  if (screen==="profile"&&currentClient) return (
    <div style={{fontFamily:"'Nunito',sans-serif",background:bg,minHeight:"100vh",color:clr}}>
      <style>{css}</style>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <Header title="Мой профиль" back="menu"/>
      <div style={{maxWidth:460,margin:"0 auto",padding:"24px 16px 60px"}} className="fadeIn">
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:72,height:72,borderRadius:"50%",background:"#0a2a0a",border:"2px solid #4cff91",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="#4cff91" strokeWidth="2"/><path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6" stroke="#4cff91" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <div style={{fontSize:18,fontWeight:900}}>{currentClient.name||"Клиент"}</div>
          <div style={{fontSize:13,color:mutedC}}>{currentClient.phone}</div>
          <div style={{fontSize:11,color:mutedC,marginTop:4}}>С нами с {currentClient.registeredAt}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
          {[{label:"Заказов",icon:"🛒",value:currentClient.orders},{label:"Бонусов",icon:"⭐",value:currentClient.bonusPoints}].map((s,i)=>(
            <div key={i} style={{background:bgCard,border:`1px solid ${brd}`,borderRadius:14,padding:"16px",textAlign:"center"}}>
              <div style={{fontSize:26,marginBottom:4}}>{s.icon}</div>
              <div style={{fontSize:24,fontWeight:900,color:YELLOW}}>{s.value}</div>
              <div style={{fontSize:11,color:mutedC,fontWeight:700}}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{background:bgCard,borderRadius:14,border:`1px solid ${brd}`,padding:"16px",marginBottom:16}}>
          <div style={{fontSize:9,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:10}}>ВАШ ПРОФИЛЬ</div>
          <div style={{fontSize:11,color:mutedC,marginBottom:4}}>Имя</div>
          <input value={currentClient.name} onChange={e=>{const c=getClients();c[currentClient.phone].name=e.target.value;saveClients(c);setCurrentClient({...currentClient,name:e.target.value});setName(e.target.value);}} placeholder="Введите имя"
            style={{width:"100%",padding:"10px 12px",background:bg,border:`1px solid ${brd}`,borderRadius:10,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{background:darkMode?"#1a1200":"#fff8e8",border:`1px solid ${darkMode?"#3a3000":"#ffe0a0"}`,borderRadius:12,padding:"12px 14px",marginBottom:20,fontSize:12,color:darkMode?"#ccc":"#666",lineHeight:1.7}}>
          ⭐ За каждые <strong style={{color:clr}}>100 ₸</strong> — <strong style={{color:YELLOW}}>1 бонус</strong>.<br/>
          📢 Акции приходят в WhatsApp автоматически.
        </div>

        {/* История заказов */}
        {(() => {
          const history = getOrderHistory(currentClient.phone);
          if (history.length === 0) return null;
          return (
            <div style={{marginBottom:20}}>
              <div style={{fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:10}}>ИСТОРИЯ ЗАКАЗОВ</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {history.map((rec, idx) => (
                  <div key={rec.id} style={{background:bgCard,borderRadius:14,border:`1px solid ${brd}`,overflow:"hidden"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderBottom:`1px solid ${brd}`}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:800,color:clr}}>Заказ от {rec.date}</div>
                        <div style={{fontSize:11,color:mutedC,marginTop:2}}>{rec.items.length} позиций · {rec.items.reduce((s,i)=>s+i.qty,0)} шт</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:14,fontWeight:900,color:YELLOW}}>{rec.total.toLocaleString("ru-RU")} ₸</div>
                        {rec.discount>0&&<div style={{fontSize:10,color:"#4cff91"}}>−{rec.discount.toLocaleString("ru-RU")} ₸</div>}
                      </div>
                    </div>
                    <div style={{padding:"8px 14px"}}>
                      <div style={{fontSize:11,color:mutedC,marginBottom:8,lineHeight:1.6}}>
                        {rec.items.map(i=>`${i.name} ×${i.qty}`).join(" · ")}
                      </div>
                      <button onClick={()=>repeatOrder(rec)}
                        style={{width:"100%",background:YELLOW,color:DARK,border:"none",padding:"9px",borderRadius:10,fontFamily:"'Nunito',sans-serif",fontSize:12,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                        🔄 Повторить заказ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <button onClick={()=>setScreen("menu")} style={{width:"100%",background:YELLOW,color:DARK,border:"none",padding:14,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:900,cursor:"pointer",marginBottom:10}}>🍣 К меню</button>
        <button onClick={logout} style={{width:"100%",background:"transparent",color:"#ff6b6b",border:"1px solid #ff6b6b",padding:12,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>Выйти из аккаунта</button>
      </div>
    </div>
  );

  // ─── CONFIRM ───
  if (screen==="confirm") return (
    <div style={{fontFamily:"'Nunito',sans-serif",background:bg,minHeight:"100vh",color:clr}}>
      <style>{css}</style>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <Header title="Подтверждение" back="checkout"/>
      <div style={{maxWidth:460,margin:"0 auto",padding:"24px 16px 40px"}} className="fadeIn">
        {sent?(
          <div style={{textAlign:"center",padding:"48px 0"}}>
            <div style={{fontSize:64}}>🎉</div>
            <h2 style={{color:YELLOW,fontSize:22,fontWeight:900,margin:"16px 0 8px"}}>Заказ отправлен!</h2>
            {orderNumber&&(
              <div style={{background:"#1a1200",border:"2px solid #f5c518",borderRadius:16,padding:"14px 20px",margin:"16px auto",maxWidth:220}}>
                <div style={{fontSize:11,color:MUTED,fontWeight:700,letterSpacing:2,marginBottom:4}}>НОМЕР ВАШЕГО ЗАКАЗА</div>
                <div style={{fontSize:32,fontWeight:900,color:YELLOW,letterSpacing:4}}>{orderNumber}</div>
                <div style={{fontSize:10,color:MUTED,marginTop:4}}>Сообщите оператору при звонке</div>
              </div>
            )}
            <p style={{color:mutedC,fontSize:13,lineHeight:1.7}}>Менеджер свяжется с вами<br/>и пришлёт номер Kaspi Gold для оплаты</p>
          </div>
        ):(<>
          <div style={{background:bgCard,borderRadius:16,padding:"16px",border:`1px solid ${brd}`,marginBottom:20}}>
            <div style={{fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:10}}>ИТОГО К ОПЛАТЕ</div>
            {totalFood>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,color:mutedC}}>Еда</span><span style={{fontSize:13}}>{totalFood.toLocaleString("ru-RU")} ₸</span></div>}
            {totalDrinks>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,color:mutedC}}>Напитки</span><span style={{fontSize:13}}>{totalDrinks.toLocaleString("ru-RU")} ₸</span></div>}
            {discountSushiAmt>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,color:"#4cff91"}}>Скидка суши+пицца {discountSushi.label}</span><span style={{fontSize:13,color:"#4cff91"}}>−{discountSushiAmt.toLocaleString("ru-RU")} ₸</span></div>}
            {discountOtherAmt>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,color:"#4cff91"}}>Скидка бургеры/лаваш -10%</span><span style={{fontSize:13,color:"#4cff91"}}>−{discountOtherAmt.toLocaleString("ru-RU")} ₸</span></div>}
            {currentClient&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,color:YELLOW}}>⭐ +{Math.floor(totalFinal/100)} бонусов</span><span style={{fontSize:11,color:mutedC}}>будет начислено</span></div>}
            <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:`1px solid ${YELLOW}44`,marginTop:6}}>
              <span style={{fontSize:15,fontWeight:800}}>К оплате</span>
              <span style={{fontSize:22,fontWeight:900,color:YELLOW}}>{totalFinal.toLocaleString("ru-RU")} ₸</span>
            </div>
          </div>
          <div style={{background:darkMode?"#0a1a2a":"#e8f4ff",border:`1px solid ${darkMode?"#1a3a5a":"#b0d4f0"}`,borderRadius:14,padding:"14px 16px",marginBottom:20,fontSize:13,color:darkMode?"#5ab4e8":"#1a5a8a",lineHeight:1.7}}>
            💳 Оплата через Kaspi Gold.<br/><span style={{color:mutedC,fontSize:12}}>Номер карты пришлёт менеджер. Сумма: <strong style={{color:clr}}>{totalFinal.toLocaleString("ru-RU")} ₸</strong></span>
          </div>
          <button onClick={sendOrder} style={{width:"100%",background:YELLOW,color:DARK,border:"none",padding:16,borderRadius:14,cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:900}}>📲 ОТПРАВИТЬ ЗАКАЗ В WHATSAPP</button>
        </>)}
      </div>
    </div>
  );

  // ─── CHECKOUT ───
  if (screen==="checkout") return (
    <div style={{fontFamily:"'Nunito',sans-serif",background:bg,minHeight:"100vh",color:clr}}>
      <style>{css}</style>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <header style={{background:bgHdr,borderBottom:`1px solid ${brd}`,padding:"0 16px",height:56,display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:100}}>
        <button onClick={()=>setScreen("menu")} style={{background:"none",border:"none",color:YELLOW,fontSize:20,cursor:"pointer"}}>←</button>
        <span style={{fontSize:16,fontWeight:900,color:YELLOW}}>Оформление заказа</span>
        <button onClick={()=>setShowClear(true)} style={{marginLeft:"auto",background:"#2a0a0a",border:"1px solid #5a1a1a",borderRadius:10,padding:"5px 12px",color:"#ff6b6b",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>🗑 Очистить</button>
      </header>
      {showClear&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
          <div style={{background:bgCard,borderRadius:20,padding:"28px 24px",textAlign:"center",maxWidth:320,width:"100%"}}>
            <div style={{fontSize:40,marginBottom:12}}>🗑️</div>
            <div style={{fontSize:16,fontWeight:800,marginBottom:8,color:clr}}>Очистить корзину?</div>
            <div style={{fontSize:13,color:mutedC,marginBottom:24}}>Все добавленные блюда будут удалены</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setShowClear(false)} style={{flex:1,padding:"12px",borderRadius:12,border:`1px solid ${brd}`,background:"transparent",color:clr,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>Отмена</button>
              <button onClick={()=>{setOrder({});setShowClear(false);}} style={{flex:1,padding:"12px",borderRadius:12,border:"none",background:"#ff4444",color:"#fff",fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:900,cursor:"pointer"}}>Очистить</button>
            </div>
          </div>
        </div>
      )}
      <div style={{maxWidth:460,margin:"0 auto",padding:"20px 16px 40px"}} className="fadeIn">
        <div style={{background:bgCard,borderRadius:14,overflow:"hidden",border:`1px solid ${brd}`,marginBottom:20}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${brd}`,fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700}}>ВАШ ЗАКАЗ</div>
          {cartItems.map((item,idx)=>(
            <div key={item.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",borderBottom:idx<cartItems.length-1?`1px solid ${brd}`:"none",gap:10}}>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{item.name}</div><div style={{fontSize:11,color:mutedC,marginTop:2}}>{item.price.toLocaleString("ru-RU")} ₸ × {item.qty}</div></div>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <button onClick={()=>change(item.id,-1)} style={{width:24,height:24,borderRadius:"50%",border:`1.5px solid ${brd}`,background:"transparent",color:clr,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                <span style={{minWidth:14,textAlign:"center",fontSize:13,fontWeight:700,color:YELLOW}}>{item.qty}</span>
                <button onClick={()=>change(item.id,1)} style={{width:24,height:24,borderRadius:"50%",border:`1.5px solid ${YELLOW}`,background:YELLOW,color:DARK,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>+</button>
                <span style={{fontSize:13,fontWeight:700,minWidth:70,textAlign:"right"}}>{(item.price*item.qty).toLocaleString("ru-RU")} ₸</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:10}}>ВАШИ ДАННЫЕ</div>
        {([["Имя *","text",name,setName],["Телефон *","tel",phone,setPhone]] as const).map(([label,type,val,setVal])=>(
          <div key={label} style={{marginBottom:12}}>
            <div style={{fontSize:9,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:5}}>{label}</div>
            <input type={type} value={val} onChange={e=>(setVal as (v:string)=>void)(e.target.value)} style={{width:"100%",padding:"11px 14px",background:bgCard,border:`1.5px solid ${brd}`,borderRadius:10,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
          </div>
        ))}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:9,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:5}}>АДРЕС ДОСТАВКИ</div>
          <input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Улица, дом, квартира..." style={{width:"100%",padding:"11px 14px",background:bgCard,border:`1.5px solid ${brd}`,borderRadius:10,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:9,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:5}}>КОММЕНТАРИЙ</div>
          <textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Пожелания..." rows={3} style={{width:"100%",padding:"11px 14px",background:bgCard,border:`1.5px solid ${brd}`,borderRadius:10,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{background:bgCard,borderRadius:14,padding:"14px 16px",border:`1px solid ${brd}`,marginBottom:20}}>
          {totalFood>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:mutedC}}>Еда</span><span style={{fontSize:12}}>{totalFood.toLocaleString("ru-RU")} ₸</span></div>}
          {totalDrinks>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:mutedC}}>Напитки</span><span style={{fontSize:12}}>{totalDrinks.toLocaleString("ru-RU")} ₸</span></div>}
          {discountSushiAmt>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:"#4cff91"}}>Скидка суши+пицца {discountSushi.label}</span><span style={{fontSize:12,color:"#4cff91"}}>−{discountSushiAmt.toLocaleString("ru-RU")} ₸</span></div>}
          {discountOtherAmt>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:"#4cff91"}}>Скидка бургеры/лаваш -10%</span><span style={{fontSize:12,color:"#4cff91"}}>−{discountOtherAmt.toLocaleString("ru-RU")} ₸</span></div>}
          <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:`1px solid ${YELLOW}44`,marginTop:4}}>
            <span style={{fontSize:14,fontWeight:800}}>ИТОГО</span>
            <span style={{fontSize:22,fontWeight:900,color:YELLOW}}>{totalFinal.toLocaleString("ru-RU")} ₸</span>
          </div>
        </div>
        <button onClick={()=>{if(name&&phone)setScreen("confirm");}} style={{width:"100%",background:name&&phone?YELLOW:"#2a2a2a",color:name&&phone?DARK:mutedC,border:"none",padding:16,borderRadius:14,cursor:name&&phone?"pointer":"not-allowed",fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:900,transition:"all 0.2s"}}>
          {!name||!phone?"ЗАПОЛНИТЕ ИМЯ И ТЕЛЕФОН":"ДАЛЕЕ →"}
        </button>
      </div>
    </div>
  );

  // ─── MAIN MENU ───
  const displayMenu = filtered || {[activeTab]: menuData[activeTab]};
  return (
    <div style={{fontFamily:"'Nunito',sans-serif",background:bg,minHeight:"100vh",color:clr,maxWidth:"100vw",overflowX:"hidden"}}>
      <style>{css}</style>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <Header/>

      {/* Модалка товара */}
      {selectedItem&&<ItemModal/>}

      {/* СКИДКИ */}
      <div style={{background:darkMode?"#1a1200":"#fff8e8",borderBottom:`1px solid ${darkMode?"#2a2000":"#ffe0a0"}`,padding:"14px 16px"}}>
        <div style={{maxWidth:700,margin:"0 auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:10}}>
            <div>
              <div style={{fontSize:14,fontWeight:900,color:YELLOW,marginBottom:3}}>
                {discountSushi.pct===35?"Максимальная скидка 35%!":discountSushi.pct===30?"Скидка 30% активна!":discountSushi.pct===20?"Скидка 20% активна!":"Скидки на суши, пиццу и не только!"}
              </div>
              <div style={{fontSize:11,color:darkMode?"#aaa":"#888",lineHeight:1.6}}>
                {discountSushi.pct===35
                  ?"Суши+Пицца: -35% · Бургеры/Лаваш/Крылья: "+(discountOtherAmt>0?"-10% активна":"от 10 000 ₸ -10%")
                  :nextTier
                  ?`Суши+Пицца: ещё ${(nextTier.min-totalSushiPizza).toLocaleString("ru-RU")} ₸ до -${nextTier.label}`
                  :"Суши+Пицца: 6К=-20% · 10К=-30% · 20К=-35%"}
              </div>
              {totalOther>0&&totalOther<10000&&(
                <div style={{fontSize:10,color:"#ffaa00",marginTop:3}}>
                  Бургеры/Лаваш/Крылья: {(10000-totalOther).toLocaleString("ru-RU")} ₸ до скидки -10%
                </div>
              )}
              {discountOtherAmt>0&&(
                <div style={{fontSize:10,color:"#4cff91",marginTop:3}}>
                  Бургеры/Лаваш/Крылья: -10% активна (-{discountOtherAmt.toLocaleString("ru-RU")} ₸)
                </div>
              )}
            </div>
            <div style={{flexShrink:0}}>
              {discountSushi.pct>0?<div style={{fontSize:11,background:"#4cff9122",border:"1px solid #4cff9144",color:"#4cff91",padding:"4px 10px",borderRadius:20,fontWeight:800}}>−{discountAmt.toLocaleString("ru-RU")} ₸</div>:<div style={{fontSize:11,color:mutedC}}>{totalSushiPizza>0?totalFood.toLocaleString("ru-RU"):"—"} / 6 000 ₸</div>}
            </div>
          </div>
          <div style={{background:darkMode?"#2a2a2a":"#e5e5e5",borderRadius:8,height:7,overflow:"hidden",position:"relative"}}>
            <div style={{position:"absolute",left:"30%",top:0,bottom:0,width:1,background:darkMode?"#444":"#ccc"}}/>
            <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:1,background:darkMode?"#444":"#ccc"}}/>
            <div style={{width:`${progress}%`,height:"100%",background:discountSushi.pct>=30?"#4cff91":YELLOW,borderRadius:8,transition:"width 0.35s ease"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
            <span style={{fontSize:9,color:darkMode?"#444":"#bbb",fontWeight:700}}>0</span>
            <span style={{fontSize:9,color:discountSushi.pct>=20?YELLOW:mutedC,fontWeight:700}}>6К −20%</span>
            <span style={{fontSize:9,color:discountSushi.pct>=30?"#4cff91":mutedC,fontWeight:700}}>10К −30%</span>
            <span style={{fontSize:9,color:discountSushi.pct===35?"#4cff91":mutedC,fontWeight:700}}>20К −35%</span>
          </div>
        </div>
      </div>

      {/* ПОИСК */}
      <div style={{maxWidth:700,margin:"0 auto",padding:"12px 16px 0"}}>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:15,color:mutedC}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Найти блюдо..." style={{width:"100%",padding:"10px 36px",background:bgCard,border:`1.5px solid ${brd}`,borderRadius:24,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
          {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:mutedC,cursor:"pointer",fontSize:16}}>×</button>}
        </div>
      </div>

      {/* ТАБЫ */}
      {!search&&(
        <div style={{maxWidth:700,margin:"0 auto",padding:"10px 0 0"}}>
          <div style={{display:"flex",gap:6,overflowX:"auto",WebkitOverflowScrolling:"touch",padding:"0 16px 8px"}}>
            {Object.keys(menuData).map(cat=>(
              <button key={cat} onClick={()=>setActiveTab(cat)} style={{background:activeTab===cat?YELLOW:bgCard,color:activeTab===cat?DARK:mutedC,border:`1.5px solid ${activeTab===cat?YELLOW:brd}`,padding:"7px 14px",borderRadius:20,cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontSize:12,fontWeight:700,whiteSpace:"nowrap",flexShrink:0,transition:"all 0.18s"}}>{cat}</button>
            ))}
          </div>
        </div>
      )}

      {/* СПИСОК БЛЮД */}
      <div style={{maxWidth:700,margin:"0 auto",padding:"8px 16px 160px"}}>
        {Object.entries(displayMenu).map(([cat,items])=>(
          <div key={cat}>
            {search&&<div style={{fontSize:12,fontWeight:800,color:YELLOW,letterSpacing:2,margin:"16px 0 8px"}}>{cat}</div>}
            <div style={{background:bgCard,borderRadius:16,overflow:"hidden",border:`1px solid ${brd}`,marginBottom:16}}>
              {items.map((item,idx)=>{
                const q=order[item.id]||0, isActive=q>0, isHit=HITS.has(item.id), showDiscount=!item.isDrink&&discountSushi.pct>0;
                return (
                  <div key={item.id} onClick={()=>setSelectedItem(item)}
                    style={{display:"flex",alignItems:"center",padding:"10px 16px",borderBottom:idx<items.length-1?`1px solid ${brd}`:"none",gap:10,background:isActive?(darkMode?"#1e1a00":"#fffbe6"):"transparent",transition:"background 0.2s",cursor:"pointer"}}>
                    <div style={{position:"relative",flexShrink:0}}>
                      <img src={item.img} alt={item.name} style={{width:54,height:54,borderRadius:12,objectFit:"cover"}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>
                      {isHit&&<div style={{position:"absolute",top:-4,right:-4,background:"#ff8800",borderRadius:8,padding:"1px 5px",fontSize:8,fontWeight:900,color:"#fff"}}>ХИТ</div>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                        <span style={{fontSize:13,fontWeight:700,color:isActive?clr:darkMode?"#ddd":"#333"}}>{item.name}</span>
                        {item.isDrink&&<span style={{fontSize:9,background:"#1a2a3a",border:"1px solid #2a4a5a",color:"#5ab4e8",padding:"1px 6px",borderRadius:10,fontWeight:700}}>напиток</span>}
                        {showDiscount&&isActive&&<span style={{fontSize:9,background:"#0a2a0a",border:"1px solid #1a4a1a",color:"#4cff91",padding:"1px 6px",borderRadius:10,fontWeight:700}}>−{discountSushi.label}</span>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
                        {item.note&&<span style={{fontSize:10,color:mutedC}}>{item.note}</span>}
                        {item.note&&<span style={{fontSize:10,color:darkMode?"#333":"#ccc"}}>·</span>}
                        {showDiscount?(<><span style={{fontSize:11,color:darkMode?"#444":"#bbb",textDecoration:"line-through"}}>{item.price.toLocaleString("ru-RU")} ₸</span><span style={{fontSize:13,fontWeight:800,color:"#4cff91"}}>{Math.round(item.price*(1-discountSushi.pct/100)).toLocaleString("ru-RU")} ₸</span></>):(<span style={{fontSize:13,fontWeight:800,color:isActive?YELLOW:mutedC}}>{item.price.toLocaleString("ru-RU")} ₸</span>)}
                      </div>
                      {item.desc&&<div style={{fontSize:10,color:mutedC,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.desc}</div>}
                    </div>
                    <Qty item={item}/>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* НИЖНЯЯ ПАНЕЛЬ */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:150,background:`linear-gradient(transparent,${bg} 30%)`,padding:"8px 16px 16px"}}>
        <div style={{maxWidth:700,margin:"0 auto",display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <a href={INSTAGRAM} target="_blank" rel="noreferrer" style={{width:36,height:36,borderRadius:"50%",background:darkMode?"#2a0a1a":"#fff0f5",border:`1px solid ${brd}`,display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none",flexShrink:0}}><IgIcon size={20}/></a>
            <a href={TIKTOK} target="_blank" rel="noreferrer" style={{width:36,height:36,borderRadius:"50%",background:darkMode?"#0a0a0a":"#f0f0f0",border:`1px solid ${brd}`,display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none",flexShrink:0}}><TkIcon size={20}/></a>
            <a href={WA} target="_blank" rel="noreferrer" style={{width:36,height:36,borderRadius:"50%",background:darkMode?"#0a2a0a":"#f0fff4",border:`1px solid ${brd}`,display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none",flexShrink:0}}><WaIcon size={20}/></a>
            <div style={{flex:1}}/>
          </div>
          {cartCount===0?(
            <div style={{textAlign:"center",padding:"11px",background:bgCard,borderRadius:16,border:`1.5px dashed ${brd}`}}>
              <span style={{fontSize:12,color:mutedC,fontWeight:600}}>👆 Нажми на блюдо для деталей · от 6 000 ₸ скидка 20%!</span>
            </div>
          ):(
            <button onClick={()=>{if(isOpen)setScreen("checkout");}} style={{width:"100%",background:isOpen?YELLOW:"#444",color:DARK,border:"none",padding:"13px 20px",borderRadius:16,cursor:isOpen?"pointer":"not-allowed",fontFamily:"'Nunito',sans-serif",fontSize:15,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span>{!isOpen?"😴 Сейчас закрыто":discountSushi.pct>0?`🔥 Оформить со скидкой ${discountSushi.label}!`:"🛒 Оформить заказ"}</span>
              <div style={{textAlign:"right"}}>
                {discountSushi.pct>0&&<div style={{fontSize:10,opacity:0.6,textDecoration:"line-through"}}>{totalRaw.toLocaleString("ru-RU")} ₸</div>}
                <div style={{fontSize:15,fontWeight:900}}>{(totalRaw-discountAmt).toLocaleString("ru-RU")} ₸</div>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}import { useState, useMemo, useEffect } from "react";
// ─── Firebase через CDN (не требует npm install) ───
const FB_CONFIG = {
  apiKey: "AIzaSyByv-cxXkJT6iKay85ME-goVR16YUEU54Y",
  authDomain: "pak-sushi.firebaseapp.com",
  projectId: "pak-sushi",
  storageBucket: "pak-sushi.firebasestorage.app",
  messagingSenderId: "264463017591",
  appId: "1:264463017591:web:1125febdedc535524cc872",
};

// Firestore REST API — работает без npm пакета
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FB_CONFIG.projectId}/databases/(default)/documents`;

const saveMenuToCloud = async (menuData: any) => {
  try {
    const fields: any = {};
    const encoded = JSON.stringify(menuData);
    fields.data = { stringValue: encoded };
    fields.updatedAt = { timestampValue: new Date().toISOString() };
    await fetch(`${FS_BASE}/settings/menu?key=${FB_CONFIG.apiKey}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
  } catch(e) { console.error("Firebase save menu:", e); }
};

const loadMenuFromCloud = async (): Promise<any|null> => {
  try {
    const res = await fetch(`${FS_BASE}/settings/menu?key=${FB_CONFIG.apiKey}`);
    if (!res.ok) return null;
    const data = await res.json();
    const str = data?.fields?.data?.stringValue;
    if (str) return JSON.parse(str);
  } catch(e) { console.error("Firebase load menu:", e); }
  return null;
};

const saveOrderToCloud = async (orderData: any) => {
  try {
    const fields: any = {};
    Object.entries(orderData).forEach(([k, v]) => {
      if (typeof v === "string") fields[k] = { stringValue: v };
      else if (typeof v === "number") fields[k] = { integerValue: String(v) };
      else if (typeof v === "boolean") fields[k] = { booleanValue: v };
      else fields[k] = { stringValue: JSON.stringify(v) };
    });
    fields.createdAt = { timestampValue: new Date().toISOString() };
    await fetch(`${FS_BASE}/orders?key=${FB_CONFIG.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
  } catch(e) { console.error("Firebase save order:", e); }
};

const loadOrdersFromCloud = async (): Promise<any[]> => {
  try {
    const res = await fetch(`${FS_BASE}/orders?key=${FB_CONFIG.apiKey}&pageSize=50&orderBy=createdAt+desc`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.documents || []).map((d: any) => {
      const obj: any = { id: d.name?.split("/").pop() };
      Object.entries(d.fields || {}).forEach(([k, v]: any) => {
        obj[k] = v.stringValue ?? v.integerValue ?? v.booleanValue ?? v.timestampValue ?? "";
        if (k === "items" || k === "total" || k === "discount") {
          try { obj[k] = JSON.parse(obj[k]); } catch {}
        }
      });
      return obj;
    });
  } catch(e) { console.error("Firebase load orders:", e); return []; }
};

// Генерация уникального номера заказа: ПС-XXXX (порядковый)
const generateOrderNumber = (): string => {
  try {
    const current = parseInt(localStorage.getItem("paksushi_order_counter") || "1000");
    const next = current + 1;
    localStorage.setItem("paksushi_order_counter", String(next));
    return `ПС-${next}`;
  } catch {
    return `ПС-${Math.floor(1000 + Math.random() * 9000)}`;
  }
};

const YELLOW = "#f5c518";
const DARK = "#111111";
const MUTED = "#888";
const WA_NUMBER = "77057210505";
const WA = `https://wa.me/${WA_NUMBER}`;
const INSTAGRAM = "https://www.instagram.com/paksushi_saryagash?igsh=dnFnZmxpYm56OXJt";
const TIKTOK = "https://www.tiktok.com/@paksushi_saryagash7?_r=1&_t=ZS-94ktZD7aqPp";
const ADDRESS = "г. Сарыағаш, ул. Айбергенова 1 (рядом с рестораном Нарлен)";
const MAPS_URL = "https://maps.google.com/?q=41.0185,68.7145";
const MAPS_EMBED = "https://maps.google.com/maps?q=41.0185,68.7145&z=16&output=embed";
const ADMIN_PASSWORD = "paksushi2024";
const OWNER_PASSWORD = "202ZNB02";
const OPEN_HOUR = 9;
const OPEN_MINUTE = 30;
const CLOSE_HOUR = 24;

const DISCOUNT_TIERS = [
  { min:20000, pct:35, label:"35%" },
  { min:10000, pct:30, label:"30%" },
  { min:6000,  pct:20, label:"20%" },
  { min:0,     pct:0,  label:""   },
];
const getDiscount = (t: number) => { for (const d of DISCOUNT_TIERS) if (t >= d.min) return d; return DISCOUNT_TIERS[3]; };
const HITS = new Set([27, 28]);

// Статистика сайта
const getStats = () => {
  try { return JSON.parse(localStorage.getItem("paksushi_stats") || '{"visits":0,"orders":0,"totalRevenue":0,"popularItems":{}}'); } catch { return {visits:0,orders:0,totalRevenue:0,popularItems:{}}; }
};
const saveStats = (s: any) => localStorage.setItem("paksushi_stats", JSON.stringify(s));
const trackVisit = () => { const s=getStats(); s.visits=(s.visits||0)+1; saveStats(s); };
const trackOrder = (items: any[], total: number) => {
  const s=getStats(); s.orders=(s.orders||0)+1; s.totalRevenue=(s.totalRevenue||0)+total;
  if (!s.popularItems) s.popularItems={};
  items.forEach(i => { s.popularItems[i.name]=(s.popularItems[i.name]||0)+i.qty; });
  saveStats(s);
};

type OrderHistoryItem = { id:number; name:string; price:number; qty:number; isDrink?:boolean };
type OrderRecord = { id:string; date:string; items:OrderHistoryItem[]; total:number; discount:number };

const getClients = (): Record<string, {name:string;phone:string;orders:number;bonusPoints:number;registeredAt:string}> => {
  try { return JSON.parse(localStorage.getItem("paksushi_clients") || "{}"); } catch { return {}; }
};
const saveClients = (d: ReturnType<typeof getClients>) => localStorage.setItem("paksushi_clients", JSON.stringify(d));

// История заказов — хранится отдельно по номеру телефона
const getOrderHistory = (phone: string): OrderRecord[] => {
  try { return JSON.parse(localStorage.getItem(`paksushi_history_${phone}`) || "[]"); } catch { return []; }
};
const saveOrderHistory = (phone: string, history: OrderRecord[]) =>
  localStorage.setItem(`paksushi_history_${phone}`, JSON.stringify(history.slice(0, 20))); // храним последние 20

// Меню с хорошими фотографиями для каждой позиции
type MenuItem = { id:number; name:string; price:number; isDrink?:boolean; noDiscount?:boolean; img:string; note?:string; desc?:string };
type MenuData = Record<string, MenuItem[]>;

const DEFAULT_MENU: MenuData = {
  "🍣 Суши": [
    { id:1,  name:"Цезарь classic",        price:1890, note:"10 шт", desc:"Нежный ролл с крабом, огурцом и сливочным сыром", img:"https://loremflickr.com/400/300/sushi,roll?lock=1" },
    { id:2,  name:"Америка",               price:1990, note:"10 шт", desc:"Ролл с лососем, авокадо и сливочным сыром Philadelphia", img:"https://loremflickr.com/400/300/sushi,salmon?lock=2" },
    { id:3,  name:"Цезарь запечённый",     price:1990, note:"10 шт", desc:"Запечённый ролл с крабом и сыром под соусом", img:"https://loremflickr.com/400/300/sushi,baked?lock=3" },
    { id:4,  name:"Сяке Темпура",          price:2190, note:"10 шт", desc:"Хрустящий ролл с лососем в темпуре", img:"https://loremflickr.com/400/300/sushi,tempura?lock=4" },
    { id:5,  name:"Филадельфия",           price:2190, note:"10 шт", desc:"Классика: лосось, сливочный сыр, огурец", img:"https://loremflickr.com/400/300/philadelphia,sushi?lock=5" },
    { id:6,  name:"Канада",                price:2090, note:"10 шт", desc:"Ролл с угрём, огурцом и сливочным сыром", img:"https://loremflickr.com/400/300/sushi,roll?lock=6" },
    { id:7,  name:"Унаги Темпура",         price:1990, note:"10 шт", desc:"Запечённый угорь в хрустящей темпуре", img:"https://loremflickr.com/400/300/sushi,eel?lock=7" },
    { id:8,  name:"Аляска",                price:1890, note:"10 шт", desc:"Ролл с лососем, огурцом и тобико", img:"https://loremflickr.com/400/300/sushi,alaska?lock=8" },
    { id:9,  name:"Калифорния с крабом",   price:1890, note:"10 шт", desc:"Классическая Калифорния с крабовым мясом и авокадо", img:"https://loremflickr.com/400/300/california,roll?lock=9" },
    { id:10, name:"Калифорния с лососем",  price:2090, note:"10 шт", desc:"Калифорния с нежным лососем и авокадо", img:"https://loremflickr.com/400/300/sushi,salmon?lock=10" },
    { id:11, name:"Калифорния запечённый", price:1990, note:"10 шт", desc:"Запечённая Калифорния с тягучим сыром", img:"https://loremflickr.com/400/300/sushi,baked?lock=11" },
    { id:12, name:"Бонита",                price:1790, note:"10 шт", desc:"Ролл с тунцом, огурцом и соусом спайси", img:"https://loremflickr.com/400/300/sushi,roll?lock=12" },
    { id:13, name:"Сингапур",              price:2090, note:"10 шт", desc:"Острый ролл с креветкой темпура и соусом", img:"https://loremflickr.com/400/300/sushi,shrimp?lock=13" },
    { id:14, name:"Капа маки",             price:890,  note:"10 шт", desc:"Простой ролл с огурцом — лёгкий и свежий", img:"https://loremflickr.com/400/300/cucumber,roll?lock=14" },
    { id:15, name:"Капа маки с лососем",   price:2190, note:"10 шт", desc:"Ролл с огурцом и нежным лососем", img:"https://loremflickr.com/400/300/sushi,salmon?lock=15" },
    { id:16, name:"Дракон с помидором",    price:1890, note:"10 шт", desc:"Ролл-дракон с угрём и свежим томатом", img:"https://loremflickr.com/400/300/sushi,dragon?lock=16" },
    { id:17, name:"Сяке Темпура",          price:2190, note:"10 шт", desc:"Запечённый лосось в темпуре с сырным соусом", img:"https://loremflickr.com/400/300/sushi,tempura?lock=17" },
    { id:18, name:"Саше пончик лосось",    price:2190, note:"10 шт", desc:"Пышный пончик-ролл с нежным лососем", img:"https://loremflickr.com/400/300/sushi,salmon?lock=18" },
    { id:19, name:"Саше пончик куриный",   price:1990, note:"10 шт", desc:"Пышный пончик-ролл с куриным филе", img:"https://loremflickr.com/400/300/sushi,chicken?lock=19" },
    { id:20, name:"Гункан",                price:1290, note:"10 шт", desc:"Традиционный гункан с лососем и икрой", img:"https://loremflickr.com/400/300/gunkan,sushi?lock=20" },
  ],
  "🍔 Бургер": [
    { id:21, name:"Бургер куриный",        price:1190, noDiscount:true, desc:"Сочная куриная котлета, салат, томат, соус", img:"https://loremflickr.com/400/300/chicken,burger?lock=21" },
    { id:22, name:"Чизбургер куриный",     price:1390, noDiscount:true, desc:"Куриная котлета с плавленым сыром чеддер", img:"https://loremflickr.com/400/300/cheeseburger,chicken?lock=22" },
    { id:23, name:"Биг Чизбургер куриный", price:1690, noDiscount:true, desc:"Двойная куриная котлета с двойным сыром", img:"https://loremflickr.com/400/300/burger,big?lock=23" },
    { id:24, name:"Бургер говяжий",        price:1290, noDiscount:true, desc:"Сочная говяжья котлета 100% мясо, соус", img:"https://loremflickr.com/400/300/beef,burger?lock=24" },
    { id:25, name:"Чизбургер говяжий",     price:1490, noDiscount:true, desc:"Говяжья котлета с сыром и маринованным огурцом", img:"https://loremflickr.com/400/300/cheeseburger,beef?lock=25" },
    { id:26, name:"Биг чизбургер говяжий", price:1790, noDiscount:true, desc:"Двойная говяжья котлета с двойным сыром чеддер", img:"https://loremflickr.com/400/300/burger,double?lock=26" },
  ],
  "🫓 Лаваш": [
    { id:27, name:"Лаваш куриный",         price:1290, noDiscount:true, desc:"Хрустящий лаваш с куриным филе, свежими овощами и фри внутри", img:"https://loremflickr.com/400/300/lavash,wrap?lock=27" },
    { id:28, name:"Лаваш куриный сыр",     price:1390, noDiscount:true, desc:"Лаваш с куриным филе, сыром, овощами и фри", img:"https://loremflickr.com/400/300/wrap,cheese?lock=28" },
  ],
  "🍗 Крылышки": [
    { id:31, name:"Крылышки 8 шт",  price:1490, noDiscount:true, desc:"Хрустящие куриные крылышки в фирменном соусе", img:"https://loremflickr.com/400/300/chicken,wings?lock=31" },
    { id:32, name:"Крылышки 16 шт", price:2790, noDiscount:true, desc:"Хрустящие куриные крылышки в фирменном соусе, большая порция", img:"https://loremflickr.com/400/300/chicken,wings?lock=32" },
    { id:33, name:"Крылышки 24 шт", price:4280, noDiscount:true, desc:"Хрустящие крылышки — идеально для компании", img:"https://loremflickr.com/400/300/wings,crispy?lock=33" },
    { id:34, name:"Крылышки 32 шт", price:5580, noDiscount:true, desc:"Максимальная порция для большой компании", img:"https://loremflickr.com/400/300/chicken,wings?lock=34" },
  ],
  "🍟 Снэки": [
    { id:35, name:"Фри",                  price:700,  noDiscount:true, desc:"Золотистая картошка фри, хрустящая снаружи", img:"https://loremflickr.com/400/300/french,fries?lock=35" },
    { id:36, name:"Картофельные шарики",  price:700,  noDiscount:true, desc:"Хрустящие шарики из картофельного пюре", img:"https://loremflickr.com/400/300/potato,balls?lock=36" },
    { id:37, name:"Нагетсы 8 шт",         price:1490, noDiscount:true, desc:"Сочные куриные нагетсы в панировке", img:"https://loremflickr.com/400/300/chicken,nuggets?lock=37" },
    { id:38, name:"Корн дог 5 шт",        price:1290, noDiscount:true, desc:"Сосиски в кукурузном тесте на палочке", img:"https://loremflickr.com/400/300/corn,dog?lock=38" },
    { id:39, name:"Сырные палочки 6 шт",  price:1290, noDiscount:true, desc:"Хрустящие палочки с тягучим сыром внутри", img:"https://loremflickr.com/400/300/mozzarella,sticks?lock=39" },
    { id:40, name:"Соус",                 price:150,  noDiscount:true, desc:"Фирменный соус на выбор: чесночный, острый, барбекю", img:"https://loremflickr.com/400/300/sauce,dip?lock=40" },
  ],
  "🍕 Пицца": [
    { id:41, name:"Маргарита", price:2090, desc:"Томатный соус, моцарелла, свежий базилик", img:"https://loremflickr.com/400/300/pizza,margherita?lock=41" },
    { id:42, name:"4 сезона",  price:2390, desc:"Четыре начинки: грибы, ветчина, артишоки, оливки", img:"https://loremflickr.com/400/300/pizza,seasons?lock=42" },
    { id:43, name:"Пепперони", price:2090, desc:"Острая пепперони с моцареллой и томатным соусом", img:"https://loremflickr.com/400/300/pepperoni,pizza?lock=43" },
    { id:44, name:"Сырный",    price:1890, desc:"Четыре вида сыра: моцарелла, чеддер, пармезан, рикотта", img:"https://loremflickr.com/400/300/pizza,cheese?lock=44" },
    { id:45, name:"Куриная",   price:2090, desc:"Курица гриль, болгарский перец, лук, моцарелла", img:"https://loremflickr.com/400/300/chicken,pizza?lock=45" },
  ],
  "🥤 Напитки": [
    { id:46, name:"Фанта 1л",    price:700, isDrink:true, desc:"Апельсиновая газировка Fanta, 1 литр", img:"https://loremflickr.com/400/300/fanta,orange?lock=46" },
    { id:47, name:"Кола 1л",     price:700, isDrink:true, desc:"Классическая Coca-Cola, 1 литр", img:"https://loremflickr.com/400/300/cola,drink?lock=47" },
    { id:48, name:"Фьюс-ти 1л",  price:700, isDrink:true, desc:"Холодный чай Fuze Tea с лимоном или персиком, 1 литр", img:"https://loremflickr.com/400/300/iced,tea?lock=48" },
    { id:49, name:"Макси чай 1л", price:700, isDrink:true, desc:"Освежающий холодный чай Maxi, 1 литр", img:"https://loremflickr.com/400/300/tea,cold?lock=49" },
    { id:50, name:"Пепси 1л",    price:700, isDrink:true, desc:"Классическая Pepsi Cola, 1 литр", img:"https://loremflickr.com/400/300/pepsi,drink?lock=50" },
    { id:51, name:"Пико сок 1л", price:800, isDrink:true, desc:"Натуральный сок Piko, 1 литр — яблоко, апельсин или вишня", img:"https://loremflickr.com/400/300/juice,fruit?lock=51" },
    { id:52, name:"Фанта 2л",    price:900, isDrink:true, desc:"Апельсиновая газировка Fanta, 2 литра", img:"https://loremflickr.com/400/300/fanta,orange?lock=52" },
    { id:53, name:"Кола 2л",     price:900, isDrink:true, desc:"Классическая Coca-Cola, 2 литра", img:"https://loremflickr.com/400/300/coca,cola?lock=53" },
    { id:54, name:"Макси чай 2л", price:900, isDrink:true, desc:"Холодный чай Maxi, 2 литра", img:"https://loremflickr.com/400/300/tea,cold?lock=54" },
    { id:55, name:"Горилла",     price:600, isDrink:true, desc:"Энергетический напиток Gorilla, заряд бодрости", img:"https://loremflickr.com/400/300/energy,drink?lock=55" },
    { id:56, name:"Диззи",       price:600, isDrink:true, desc:"Энергетический напиток Dizzy", img:"https://loremflickr.com/400/300/energy,drink?lock=56" },
    { id:57, name:"Чай бокал",   price:150, isDrink:true, desc:"Горячий чай в бокале — чёрный или зелёный", img:"https://loremflickr.com/400/300/hot,tea?lock=57" },
    { id:58, name:"Чай чайник",  price:300, isDrink:true, desc:"Горячий чай в чайнике для двоих", img:"https://loremflickr.com/400/300/tea,pot?lock=58" },
    { id:59, name:"Кофе бокал",  price:200, isDrink:true, desc:"Ароматный кофе Americano или Cappuccino", img:"https://loremflickr.com/400/300/coffee,cup?lock=59" },
    { id:60, name:"Кофе 3в1",    price:300, isDrink:true, desc:"Растворимый кофе 3в1 с молоком и сахаром", img:"https://loremflickr.com/400/300/coffee,instant?lock=60" },
    { id:61, name:"Айран",       price:250, isDrink:true, desc:"Освежающий кисломолочный напиток Айран", img:"https://loremflickr.com/400/300/ayran,yogurt?lock=61" },
  ],
};

const loadMenu = (): MenuData => {
  try {
    const saved = localStorage.getItem("paksushi_menu");
    if (saved) return JSON.parse(saved);
  } catch {}
  return DEFAULT_MENU;
};
const saveMenuData = (m: MenuData) => {
  localStorage.setItem("paksushi_menu", JSON.stringify(m));
  saveMenuToCloud(m); // также сохраняем в Firebase
};

const TIME_SLOTS: string[] = [];
for (let h=10; h<24; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2,"0")}:00`);
  if (h<23) TIME_SLOTS.push(`${String(h).padStart(2,"0")}:30`);
}

const css = `
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;background:#111}
  @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .fadeIn{animation:fadeIn 0.25s ease}
  @keyframes slideUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:none}}
  .slideUp{animation:slideUp 0.3s ease}
  @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(245,197,24,0.5)}50%{box-shadow:0 0 0 10px rgba(245,197,24,0)}}
  .pulse{animation:pulse 1.4s infinite}
  @keyframes bounce{0%{transform:scale(1)}30%{transform:scale(1.4)}60%{transform:scale(0.9)}100%{transform:scale(1)}}
  .bounce{animation:bounce 0.35s ease}
  ::-webkit-scrollbar{width:3px}
  ::-webkit-scrollbar-thumb{background:#333;border-radius:3px}
  .row:active{background:#1e1e00!important}
  input::placeholder{color:#444}
  textarea::placeholder{color:#444}
  textarea{resize:none}
  select{appearance:none;-webkit-appearance:none}
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:500;display:flex;align-items:flex-end;justify-content:center}
  .modal-sheet{width:100%;max-width:600px;max-height:90vh;overflow-y:auto;border-radius:24px 24px 0 0}
`;

const IgIcon = ({size=22}:{size?:number}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="2" y="2" width="20" height="20" rx="5.5" stroke="url(#igG)" strokeWidth="2"/>
    <circle cx="12" cy="12" r="4.5" stroke="url(#igG)" strokeWidth="2"/>
    <circle cx="17.5" cy="6.5" r="1.2" fill="#e1306c"/>
    <defs><linearGradient id="igG" x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
      <stop stopColor="#f09433"/><stop offset="0.5" stopColor="#dc2743"/><stop offset="1" stopColor="#bc1888"/>
    </linearGradient></defs>
  </svg>
);
const TkIcon = ({size=22}:{size?:number}) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.77a8.18 8.18 0 0 0 4.78 1.52V6.83a4.85 4.85 0 0 1-1.01-.14z" fill="white"/>
  </svg>
);
const WaIcon = ({size=22}:{size?:number}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.413A9.953 9.953 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm-1.087 5.5c-.193-.44-.397-.449-.58-.457l-.494-.006c-.174 0-.454.065-.691.327-.238.262-.908.887-.908 2.162s.929 2.508 1.058 2.681c.13.174 1.79 2.856 4.409 3.893 2.183.862 2.62.69 3.092.647.473-.044 1.524-.623 1.738-1.225.215-.601.215-1.117.15-1.225-.064-.108-.237-.173-.496-.302-.26-.13-1.524-.752-1.762-.838-.237-.086-.41-.13-.582.13-.173.26-.668.838-.819 1.011-.15.173-.302.194-.56.065-.26-.13-1.097-.404-2.09-1.29-.773-.69-1.295-1.54-1.447-1.8-.151-.26-.016-.4.114-.53.116-.116.26-.302.389-.453.13-.15.173-.26.26-.432.086-.174.043-.326-.022-.455-.064-.13-.562-1.41-.795-1.944z" fill="#25d366"/>
  </svg>
);

type Screen = "menu"|"info"|"login"|"profile"|"checkout"|"confirm"|"admin";
type Client = {name:string;phone:string;orders:number;bonusPoints:number;registeredAt:string};

export default function App() {
  const [menuData, setMenuData]   = useState<MenuData>(() => loadMenu());
  const [order,     setOrder]     = useState<Record<number,number>>({});
  const [activeTab, setActiveTab] = useState("🍣 Суши");
  const [search,    setSearch]    = useState("");
  const [screen,    setScreen]    = useState<Screen>("menu");
  const [name,      setName]      = useState("");
  const [phone,     setPhone]     = useState("");
  const [address,   setAddress]   = useState("");
  const [comment,   setComment]   = useState("");
  const [animId,    setAnimId]    = useState<number|null>(null);
  const [sent,      setSent]      = useState(false);
  const [darkMode,  setDarkMode]  = useState(true);
  const [showClear, setShowClear] = useState(false);
  const [cartBounce,setCartBounce]= useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem|null>(null);

  // Логин клиента

  const [currentClient, setCurrentClient] = useState<(Client&{phone:string})|null>(null);

  // Админ
  const [adminPass,     setAdminPass]     = useState("");
  const [adminRole,     setAdminRole]     = useState<""|"admin"|"owner">("");
  const [adminTab,      setAdminTab]      = useState<"stats"|"menu"|"clients"|"deleted">("stats");
  const [deletedOrders, setDeletedOrders] = useState<any[]>([]);
  const [editItem,      setEditItem]      = useState<MenuItem|null>(null);
  const [editCat,       setEditCat]       = useState("");
  const [addingToCat,   setAddingToCat]   = useState<string|null>(null);
  const [newItem,       setNewItem]       = useState<Partial<MenuItem>>({});
  const [confirmDelete, setConfirmDelete] = useState<{cat:string;id:number;name:string}|null>(null);

  const [orderNumber, setOrderNumber] = useState("");
  const [cloudOrders, setCloudOrders] = useState<any[]>([]);

  useEffect(() => {
    trackVisit();
    // Загрузить меню из Firebase при старте
    loadMenuFromCloud().then(cloudMenu => {
      if (cloudMenu) {
        setMenuData(cloudMenu);
        localStorage.setItem("paksushi_menu", JSON.stringify(cloudMenu));
      }
    });
    // Восстановить клиента из localStorage при загрузке
    try {
      const saved = localStorage.getItem("paksushi_current_client");
      if (saved) {
        const client = JSON.parse(saved);
        setCurrentClient(client);
        setName(client.name||"");
        setPhone(client.phone||"");
        // Обновить данные из Firebase
        fetch(`${FS_BASE}/clients/${client.phone}?key=${FB_CONFIG.apiKey}`)
          .then(r=>r.ok?r.json():null)
          .then(d=>{
            if(d&&d.fields){
              const obj = Object.fromEntries(Object.entries(d.fields).map(([k,v]:any)=>[k,(v.stringValue||v.integerValue||"")]));
              const updated = {name:obj.name||client.name, phone:client.phone, orders:Number(obj.orders)||client.orders, bonusPoints:Number(obj.bonusPoints)||client.bonusPoints, registeredAt:obj.registeredAt||client.registeredAt};
              setCurrentClient(updated);
              setName(updated.name);
              localStorage.setItem("paksushi_current_client", JSON.stringify(updated));
            }
          }).catch(()=>{});
      }
    } catch(e){}
  }, []);

  // Компонент формы входа
  const LoginForm = ({bg:_bg,bgCard:_bgCard,clr:_clr,brd:_brd,mutedC:_mutedC,onLogin}:any) => {
    const [lPhone, setLPhone] = useState("");
    const [lName,  setLName]  = useState("");
    const [step,   setStep]   = useState<"phone"|"name">("phone");
    const [loading,setLoading]= useState(false);

    const checkPhone = async () => {
      if (lPhone.replace(/\D/g,"").length < 10) return;
      setLoading(true);
      try {
        const r = await fetch(`${FS_BASE}/clients/${lPhone.replace(/\D/g,"")}?key=${FB_CONFIG.apiKey}`);
        if (r.ok) {
          const d = await r.json();
          const savedName = d.fields?.name?.stringValue||"";
          if (savedName) {
            // Клиент уже зарегистрирован — сразу входим
            onLogin(lPhone, savedName);
          } else {
            setStep("name");
          }
        } else {
          setStep("name");
        }
      } catch { setStep("name"); }
      setLoading(false);
    };

    return (
      <div>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:72,height:72,borderRadius:"50%",background:darkMode?"#1a1a00":"#fff8e8",border:`2px solid ${YELLOW}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke={YELLOW} strokeWidth="2"/><path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6" stroke={YELLOW} strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <div style={{fontSize:20,fontWeight:900,marginBottom:8,color:clr}}>{step==="phone"?"Войти / Зарегистрироваться":"Как вас зовут?"}</div>
          <div style={{fontSize:13,color:mutedC,lineHeight:1.6}}>{step==="phone"?"Введите номер телефона":"Введите ваше имя для заказов"}</div>
        </div>

        <div style={{background:darkMode?"#1a1200":"#fff8e8",border:`1px solid ${darkMode?"#3a3000":"#ffe0a0"}`,borderRadius:12,padding:"12px 14px",marginBottom:20}}>
          {[["⭐","Бонусы за каждый заказ"],["📢","Акции и спецпредложения"],["🔄","История заказов на любом устройстве"]].map(([ic,tx],i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:i<2?8:0}}>
              <span style={{fontSize:16}}>{ic}</span><span style={{fontSize:12,color:darkMode?"#ccc":"#555"}}>{tx}</span>
            </div>
          ))}
        </div>

        {step==="phone"?(
          <>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:9,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:6}}>НОМЕР ТЕЛЕФОНА</div>
              <input type="tel" value={lPhone} onChange={e=>setLPhone(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&checkPhone()}
                placeholder="+7 705 000 00 00" autoFocus
                style={{width:"100%",padding:"13px 16px",background:bgCard,border:`1.5px solid ${brd}`,borderRadius:12,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:16,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <button onClick={checkPhone} disabled={lPhone.replace(/\D/g,"").length<10||loading}
              style={{width:"100%",background:lPhone.replace(/\D/g,"").length>=10?YELLOW:"#333",color:lPhone.replace(/\D/g,"").length>=10?DARK:MUTED,border:"none",padding:14,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:900,cursor:lPhone.replace(/\D/g,"").length>=10?"pointer":"not-allowed"}}>
              {loading?"Проверяем...":"Продолжить →"}
            </button>
          </>
        ):(
          <>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:9,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:6}}>ВАШЕ ИМЯ</div>
              <input type="text" value={lName} onChange={e=>setLName(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&lName.trim()&&onLogin(lPhone,lName.trim())}
                placeholder="Например: Асель" autoFocus
                style={{width:"100%",padding:"13px 16px",background:bgCard,border:`1.5px solid ${brd}`,borderRadius:12,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:16,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <button onClick={()=>lName.trim()&&onLogin(lPhone,lName.trim())} disabled={!lName.trim()}
              style={{width:"100%",background:lName.trim()?YELLOW:"#333",color:lName.trim()?DARK:MUTED,border:"none",padding:14,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:900,cursor:lName.trim()?"pointer":"not-allowed",marginBottom:10}}>
              ✅ Готово
            </button>
            <button onClick={()=>setStep("phone")}
              style={{width:"100%",background:"transparent",color:mutedC,border:`1px solid ${brd}`,padding:12,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>← Изменить номер</button>
          </>
        )}
      </div>
    );
  };

  const now    = new Date();
  const hour   = now.getHours();
  const isOpen = (hour > OPEN_HOUR || (hour === OPEN_HOUR && now.getMinutes() >= OPEN_MINUTE)) && hour < CLOSE_HOUR;

  const bg     = darkMode ? "#111111" : "#f5f5f0";
  const bgCard = darkMode ? "#1a1a1a" : "#ffffff";
  const bgHdr  = darkMode ? "#000000" : "#ffffff";
  const clr    = darkMode ? "#ffffff" : "#111111";
  const brd    = darkMode ? "#222222" : "#e5e5e5";
  const mutedC = darkMode ? "#888888" : "#999999";

  const allItems = useMemo(() => Object.values(menuData).flat(), [menuData]);
  const cartItems   = useMemo(() => Object.entries(order).filter(([,q])=>q>0).map(([id,qty])=>({...allItems.find(i=>i.id===+id)!,qty})), [order,allItems]);
  // ─── Суммы по категориям ───
  // Суши + Пицца (скидка 20/30/35%)
  const totalSushiPizza  = useMemo(() => cartItems.filter(i=>!i.isDrink&&!i.noDiscount).reduce((s,i)=>s+i.price*i.qty,0), [cartItems]);
  // Бургеры + Лаваш + Крылышки + Снэки (скидка 10% от 10 000 ₸)
  const totalOther       = useMemo(() => cartItems.filter(i=>!i.isDrink&&!!i.noDiscount).reduce((s,i)=>s+i.price*i.qty,0), [cartItems]);
  const totalFood        = totalSushiPizza + totalOther;
  const totalDrinks      = useMemo(() => cartItems.filter(i=>i.isDrink).reduce((s,i)=>s+i.price*i.qty,0), [cartItems]);
  const totalRaw         = totalFood + totalDrinks;
  // ─── Скидки ───
  // Суши+Пицца: 20/30/35% от их суммы
  const discountSushi    = getDiscount(totalSushiPizza);
  const discountSushiAmt = Math.round(totalSushiPizza * discountSushi.pct / 100);
  // Бургеры+др: 10% если их сумма >= 10 000 ₸ (независимо от суши)
  const discountOtherAmt = totalOther >= 10000 ? Math.round(totalOther * 0.10) : 0;
  // Итоговая скидка
  const discountAmt      = discountSushiAmt + discountOtherAmt;
  const totalFinal       = totalRaw - discountAmt;
  const cartCount        = useMemo(() => Object.values(order).reduce((s,q)=>s+q,0), [order]);
  const nextTier         = DISCOUNT_TIERS.find(t=>t.pct>discountSushi.pct&&t.min>totalSushiPizza);
  const progress    = Math.min(100,(totalSushiPizza/20000)*100);

  const filtered = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const res: MenuData = {};
    Object.entries(menuData).forEach(([cat,items]) => {
      const f = items.filter(i=>i.name.toLowerCase().includes(q));
      if (f.length) res[cat]=f;
    });
    return res;
  }, [search, menuData]);

  const change = (id:number, delta:number) => {
    setAnimId(id); setTimeout(()=>setAnimId(null),350);
    if (delta>0){setCartBounce(true);setTimeout(()=>setCartBounce(false),400);}
    setOrder(prev=>{
      const cur=prev[id]||0, next=Math.max(0,cur+delta);
      if (next===0){const{[id]:_,...rest}=prev;return rest;}
      return{...prev,[id]:next};
    });
  };



  const logout = () => {
    setCurrentClient(null);
    setName("");
    setPhone("");
    localStorage.removeItem("paksushi_current_client");
  };

  const sendOrder = () => {
    if (!name||!phone) return;
    const ordNum = generateOrderNumber();
    setOrderNumber(ordNum);
    const foodLines  = cartItems.filter(i=>!i.isDrink).map(i=>`- ${i.name}${i.note?` (${i.note})`:""} x${i.qty} = ${(i.price*i.qty).toLocaleString("ru-RU")} T`).join("\n");
    const drinkLines = cartItems.filter(i=> i.isDrink).map(i=>`- ${i.name} x${i.qty} = ${(i.price*i.qty).toLocaleString("ru-RU")} T`).join("\n");
    const msg = [
      `ПАК СУШИ Сарыагаш`,
      ``,
      `Номер заказа: *${ordNum}*`,
      ``,
      `Имя: ${name}`,
      `Тел: ${phone}`,
      address ? `Адрес: ${address}` : "",
      `Оплата: Kaspi Gold (номер пришлет менеджер)`,
      currentClient ? `Клиент: ${currentClient.name||name} | бонусов: ${currentClient.bonusPoints+Math.floor(totalFinal/100)}` : "",
      ``,
      foodLines ? `Еда:\n${foodLines}` : "",
      drinkLines ? `Напитки:\n${drinkLines}` : "",
      ``,
      discountSushiAmt > 0 ? `Скидка суши+пицца ${discountSushi.label}: -${discountSushiAmt.toLocaleString("ru-RU")} T` : "",
      discountOtherAmt > 0 ? `Скидка бургеры/лаваш -10%: -${discountOtherAmt.toLocaleString("ru-RU")} T` : "",
      `ИТОГО: ${totalFinal.toLocaleString("ru-RU")} T`,
      comment ? `Комментарий: ${comment}` : "",
      ``,
      `Код заказа: ${ordNum}`,
      `Заказ с сайта: paksushi-sary.com`,
    ].filter(Boolean).join("\n");
    window.open(`${WA}?text=${encodeURIComponent(msg)}`, "_blank");
    trackOrder(cartItems, totalFinal);
    // Сохранить в Firebase
    saveOrderToCloud({
      orderNumber: ordNum,
      name, phone, address, comment,
      items: cartItems.map(i=>({id:i.id,name:i.name,price:i.price,qty:i.qty,isDrink:!!i.isDrink})),
      total: totalFinal,
      discount: discountAmt,
      discountSushi: discountSushiAmt,
      discountOther: discountOtherAmt,
      discountPct: discountSushi.pct,
      clientPhone: currentClient?.phone || null,
      date: new Date().toLocaleString("ru-RU", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}),
      status: "new",
    });
    // Сохранить историю если клиент залогинен
    if (currentClient) {
      const ph = currentClient.phone;
      const history = getOrderHistory(ph);
      const record: OrderRecord = {
        id: ordNum,
        date: new Date().toLocaleString("ru-RU", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}),
        items: cartItems.map(i=>({id:i.id,name:i.name,price:i.price,qty:i.qty,isDrink:i.isDrink})),
        total: totalFinal,
        discount: discountAmt,
      };
      saveOrderHistory(ph, [record, ...history]);
      const pph = currentClient.phone;
      const updatedClient = {...currentClient, orders: currentClient.orders+1, bonusPoints: currentClient.bonusPoints+Math.floor(totalFinal/100), name};
      setCurrentClient(updatedClient);
      localStorage.setItem("paksushi_current_client", JSON.stringify(updatedClient));
      // Сохранить в Firebase
      fetch(`${FS_BASE}/clients/${pph}?key=${FB_CONFIG.apiKey}`, {
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({fields:{name:{stringValue:name},phone:{stringValue:pph},orders:{integerValue:String(updatedClient.orders)},bonusPoints:{integerValue:String(updatedClient.bonusPoints)},registeredAt:{stringValue:currentClient.registeredAt}}})
      }).catch(()=>{});
    }
    setSent(true);
    setTimeout(()=>{setOrder({});setScreen("menu");setSent(false);setOrderNumber("");setName(currentClient?.name||"");setAddress("");setComment("");}, 4000);
  };

  const repeatOrder = (record: OrderRecord) => {
    const newOrder: Record<number,number> = {};
    record.items.forEach(i => { newOrder[i.id] = (newOrder[i.id]||0) + i.qty; });
    setOrder(newOrder);
    setScreen("menu");
  };

  // Обновление пункта меню
  const updateMenuItem = (cat: string, item: MenuItem) => {
    const updated = {...menuData, [cat]: menuData[cat].map(i=>i.id===item.id?item:i)};
    setMenuData(updated); saveMenuData(updated); setEditItem(null);
  };

  const deleteMenuItem = (cat: string, id: number) => {
    const updated = {...menuData, [cat]: menuData[cat].filter(i=>i.id!==id)};
    setMenuData(updated); saveMenuData(updated); setConfirmDelete(null);
  };

  const addMenuItem = (cat: string) => {
    if (!newItem.name || !newItem.price) return;
    const allIds = Object.values(menuData).flat().map(i=>i.id);
    const maxId = allIds.length ? Math.max(...allIds) : 0;
    const item: MenuItem = {
      id: maxId + 1,
      name: newItem.name!,
      price: Number(newItem.price),
      desc: newItem.desc || "",
      img: newItem.img || `https://loremflickr.com/400/300/food?lock=${maxId+1}`,
      isDrink: cat === "🥤 Напитки",
      note: newItem.note || undefined,
    };
    const updated = {...menuData, [cat]: [...menuData[cat], item]};
    setMenuData(updated); saveMenuData(updated);
    setAddingToCat(null); setNewItem({});
  };

  const Qty = ({item}:{item:MenuItem}) => {
    const q=order[item.id]||0, isAnim=animId===item.id;
    const [editing, setEditing] = useState(false);
    const [inputVal, setInputVal] = useState("");
    return (
      <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
        {q>0&&<button onClick={e=>{e.stopPropagation();change(item.id,-1);}} className={isAnim?"bounce":""} style={{width:30,height:30,borderRadius:"50%",border:`1.5px solid ${brd}`,background:"transparent",color:clr,fontSize:17,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>−</button>}
        {q>0&&(
          editing ? (
            <input
              type="number" value={inputVal} autoFocus
              onChange={e=>setInputVal(e.target.value)}
              onBlur={()=>{
                const n=parseInt(inputVal);
                if(!isNaN(n)&&n>=0){
                  const diff=n-q;
                  if(diff!==0) change(item.id,diff);
                }
                setEditing(false); setInputVal("");
              }}
              onKeyDown={e=>{
                if(e.key==="Enter"){(e.target as HTMLInputElement).blur();}
                if(e.key==="Escape"){setEditing(false);setInputVal("");}
              }}
              onClick={e=>e.stopPropagation()}
              style={{width:40,textAlign:"center",fontSize:14,fontWeight:800,color:YELLOW,background:darkMode?"#2a2000":"#fff8e0",border:`1.5px solid ${YELLOW}`,borderRadius:8,padding:"2px 4px",outline:"none",fontFamily:"'Nunito',sans-serif"}}
            />
          ) : (
            <span
              onClick={e=>{e.stopPropagation();setEditing(true);setInputVal(String(q));}}
              style={{minWidth:20,textAlign:"center",fontSize:14,fontWeight:800,color:YELLOW,cursor:"text",borderBottom:`1px dashed ${YELLOW}`,paddingBottom:1}}
              title="Нажмите чтобы ввести количество"
            >{q}</span>
          )
        )}
        <button onClick={e=>{e.stopPropagation();change(item.id,1);}} className={isAnim?"bounce":""} style={{width:30,height:30,borderRadius:"50%",border:`1.5px solid ${YELLOW}`,background:q>0?YELLOW:"transparent",color:q>0?DARK:clr,fontSize:19,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,transition:"all 0.15s"}}>+</button>
      </div>
    );
  };

  // Модалка товара
  const ItemModal = () => {
    if (!selectedItem) return null;
    const q = order[selectedItem.id]||0;
    return (
      <div className="modal-overlay" onClick={()=>setSelectedItem(null)}>
        <div className="modal-sheet slideUp" style={{background:bgCard}} onClick={e=>e.stopPropagation()}>
          <img src={selectedItem.img} alt={selectedItem.name} style={{width:"100%",height:220,objectFit:"cover",borderRadius:"24px 24px 0 0"}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>
          <div style={{padding:"20px 20px 32px"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
              <div>
                <div style={{fontSize:20,fontWeight:900,color:clr,marginBottom:4}}>{selectedItem.name}</div>
                {selectedItem.note&&<div style={{fontSize:12,color:"#5ab4e8",fontWeight:700}}>{selectedItem.note}</div>}
              </div>
              <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                {!selectedItem.isDrink&&discountSushi.pct>0&&<div style={{fontSize:12,color:mutedC,textDecoration:"line-through"}}>{selectedItem.price.toLocaleString("ru-RU")} ₸</div>}
                <div style={{fontSize:22,fontWeight:900,color:YELLOW}}>{(!selectedItem.isDrink&&discountSushi.pct>0?Math.round(selectedItem.price*(1-discountSushi.pct/100)):selectedItem.price).toLocaleString("ru-RU")} ₸</div>
              </div>
            </div>
            {selectedItem.desc&&<div style={{fontSize:14,color:mutedC,lineHeight:1.7,marginBottom:20}}>{selectedItem.desc}</div>}
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
                {q>0&&<button onClick={()=>change(selectedItem.id,-1)} style={{width:40,height:40,borderRadius:"50%",border:`2px solid ${brd}`,background:"transparent",color:clr,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>−</button>}
                {q>0&&<span style={{fontSize:18,fontWeight:900,color:YELLOW,minWidth:24,textAlign:"center"}}>{q}</span>}
              </div>
              <button onClick={()=>change(selectedItem.id,1)} style={{flex:2,background:YELLOW,color:DARK,border:"none",padding:"13px",borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:15,fontWeight:900,cursor:"pointer"}}>
                {q>0?"+ Ещё один":"+ В корзину"} — {(!selectedItem.isDrink&&discountSushi.pct>0?Math.round(selectedItem.price*(1-discountSushi.pct/100)):selectedItem.price).toLocaleString("ru-RU")} ₸
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const todayStr = new Date().toISOString().split("T")[0];

  const Header = ({title,back}:{title?:string;back?:Screen}) => (
    <header style={{background:bgHdr,borderBottom:`1px solid ${brd}`,position:"sticky",top:0,zIndex:200,boxShadow:"0 2px 16px rgba(0,0,0,0.25)"}}>
      <div style={{maxWidth:700,margin:"0 auto",padding:"0 16px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {back&&<button onClick={()=>setScreen(back)} style={{background:"none",border:"none",color:YELLOW,fontSize:20,cursor:"pointer",marginRight:2}}>←</button>}
          {!back&&(
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:"#e5a800",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🍣</div>
              <div>
                <div style={{fontSize:15,fontWeight:900,letterSpacing:1,color:YELLOW,lineHeight:1}}>ПАК СУШИ</div>
                <div style={{fontSize:9,color:mutedC,letterSpacing:1}}>САРЫАҒАШ</div>
                <div style={{display:"flex",alignItems:"center",gap:4,marginTop:1}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:isOpen?"#4cff91":"#ff4444"}}/>
                  <span style={{fontSize:8,color:isOpen?"#4cff91":"#ff4444",fontWeight:700}}>{isOpen?"Открыто · до 00:00":"Закрыто · с 9:30"}</span>
                </div>
              </div>
            </div>
          )}
          {title&&<span style={{fontSize:16,fontWeight:900,color:YELLOW}}>{title}</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button onClick={()=>setDarkMode(!darkMode)} style={{width:30,height:30,borderRadius:"50%",border:`1px solid ${brd}`,background:"transparent",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{darkMode?"☀️":"🌙"}</button>
          {!back&&(<>
            <button onClick={()=>setScreen(currentClient?"profile":"login")} style={{width:30,height:30,borderRadius:"50%",border:`1px solid ${currentClient?"#4cff91":brd}`,background:currentClient?"#0a2a0a":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke={currentClient?"#4cff91":mutedC} strokeWidth="2"/><path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6" stroke={currentClient?"#4cff91":mutedC} strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
            <button onClick={()=>setScreen("info")} style={{width:30,height:30,borderRadius:"50%",border:`1px solid ${brd}`,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={mutedC} strokeWidth="2"/><path d="M12 11v5" stroke={mutedC} strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="7.5" r="1" fill={mutedC}/></svg>
            </button>
            {cartCount>0&&<button onClick={()=>setScreen("checkout")} className={cartBounce?"bounce pulse":"pulse"} style={{background:YELLOW,color:DARK,border:"none",padding:"7px 13px",borderRadius:20,cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontSize:12,fontWeight:800,display:"flex",alignItems:"center",gap:5}}>🛒 {cartCount} · {(totalRaw-discountAmt).toLocaleString("ru-RU")} ₸</button>}
          </>)}
        </div>
      </div>
    </header>
  );

  // ─── ADMIN ───
  if (screen==="admin") {
    if (!adminRole) return (
      <div style={{fontFamily:"'Nunito',sans-serif",background:bg,minHeight:"100vh",color:clr}}>
        <style>{css}</style>
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
        <Header title="🔒 Вход в панель" back="menu"/>
        <div style={{maxWidth:400,margin:"0 auto",padding:"60px 16px"}} className="fadeIn">
          <div style={{textAlign:"center",marginBottom:32}}>
            <div style={{fontSize:50,marginBottom:12}}>🔐</div>
            <div style={{fontSize:20,fontWeight:900,marginBottom:8}}>Панель управления</div>
            <div style={{fontSize:13,color:mutedC}}>Введите пароль для входа</div>
          </div>
          <input type="password" value={adminPass} onChange={e=>setAdminPass(e.target.value)}
            onKeyDown={e=>{
              if(e.key==="Enter"){
                if(adminPass===OWNER_PASSWORD) setAdminRole("owner");
                else if(adminPass===ADMIN_PASSWORD) setAdminRole("admin");
                else alert("Неверный пароль");
              }
            }}
            placeholder="Пароль" autoFocus
            style={{width:"100%",padding:"13px 16px",background:bgCard,border:`1.5px solid ${brd}`,borderRadius:12,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:16,outline:"none",boxSizing:"border-box",marginBottom:16}}/>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button onClick={()=>{
              if(adminPass===OWNER_PASSWORD) setAdminRole("owner");
              else if(adminPass===ADMIN_PASSWORD) setAdminRole("admin");
              else alert("Неверный пароль");
            }} style={{width:"100%",background:YELLOW,color:DARK,border:"none",padding:14,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:900,cursor:"pointer"}}>
              Войти
            </button>
          </div>

        </div>
      </div>
    );
    const stats = getStats();
    const clients = getClients();
    const popularSorted = Object.entries(stats.popularItems||{}).sort((a:any,b:any)=>b[1]-a[1]).slice(0,10);

    return (
      <div style={{fontFamily:"'Nunito',sans-serif",background:bg,minHeight:"100vh",color:clr}}>
        <style>{css}</style>
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
        <Header title="⚙️ Панель" back="menu"/>
        {/* Табы */}
        <div style={{maxWidth:700,margin:"0 auto",padding:"12px 16px 0"}}>
          {/* Роль */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:11,background:adminRole==="owner"?"#1a1200":"#0a1a2a",border:`1px solid ${adminRole==="owner"?"#3a3000":"#1a3a5a"}`,borderRadius:10,padding:"4px 10px",color:adminRole==="owner"?YELLOW:"#5ab4e8",fontWeight:800}}>
              {adminRole==="owner"?"⭐ Владелец":"👤 Администратор"}
            </div>
            <button onClick={()=>{setAdminRole("");setAdminPass("");}} style={{background:"transparent",border:`1px solid ${brd}`,borderRadius:8,padding:"4px 10px",color:mutedC,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
              Выйти
            </button>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {(["stats","menu","clients",...(adminRole==="owner"?["deleted"]:[])]).map((t:any)=>(
              <button key={t} onClick={()=>{
                if(t==="deleted"&&adminRole==="owner"){
                  const saved = JSON.parse(localStorage.getItem("paksushi_deleted_orders")||"[]");
                  setDeletedOrders(saved);
                }
                setAdminTab(t);
              }}
                style={{flex:1,minWidth:"40%",padding:"8px",borderRadius:10,border:`1px solid ${brd}`,background:adminTab===t?YELLOW:bgCard,color:adminTab===t?DARK:mutedC,fontFamily:"'Nunito',sans-serif",fontSize:11,fontWeight:800,cursor:"pointer"}}>
                {t==="stats"?"📊 Статистика":t==="menu"?"🍣 Меню":t==="clients"?"👥 Клиенты":"🗑 Удалённые"}
              </button>
            ))}
          </div>
        </div>

        <div style={{maxWidth:700,margin:"0 auto",padding:"16px 16px 60px"}} className="fadeIn">
          {adminTab==="stats"&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
                {[
                  {label:"Посещений сайта",value:stats.visits||0,icon:"👁"},
                  {label:"Заказов",value:stats.orders||0,icon:"🛒"},
                  {label:"Выручка ₸",value:(stats.totalRevenue||0).toLocaleString("ru-RU"),icon:"💰"},
                  {label:"Клиентов",value:Object.keys(clients).length,icon:"👥"},
                ].map((s,i)=>(
                  <div key={i} style={{background:bgCard,border:`1px solid ${brd}`,borderRadius:14,padding:"16px",textAlign:"center"}}>
                    <div style={{fontSize:26,marginBottom:6}}>{s.icon}</div>
                    <div style={{fontSize:20,fontWeight:900,color:YELLOW}}>{s.value}</div>
                    <div style={{fontSize:10,color:mutedC,fontWeight:700,marginTop:2}}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Последние заказы из Firebase */}
              <div style={{marginBottom:20}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700}}>ПОСЛЕДНИЕ ЗАКАЗЫ (FIREBASE)</div>
  <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>loadOrdersFromCloud().then(setCloudOrders)}
                    style={{background:"#1a1a2a",border:`1px solid ${brd}`,borderRadius:8,padding:"4px 10px",color:"#5ab4e8",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
                    🔄 Обновить
                  </button>
                  <button onClick={()=>{
                    if(!window.confirm("Сбросить всю статистику? Это нельзя отменить!")) return;
                    saveStats({visits:0,orders:0,totalRevenue:0,popularItems:{}});
                    localStorage.setItem("paksushi_order_counter","1000");
                    setCloudOrders([]);
                    alert('✅ Статистика сброшена!');
                  }} style={{background:"#2a0a0a",border:"1px solid #5a1a1a",borderRadius:8,padding:"4px 10px",color:"#ff6b6b",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
                    🗑 Сбросить
                  </button>
                </div>
                </div>
                {cloudOrders.length===0?(
                  <div style={{background:bgCard,borderRadius:14,border:`1px solid ${brd}`,padding:"20px",textAlign:"center",color:mutedC,fontSize:13}}>
                    Нажмите "Обновить" чтобы загрузить заказы
                  </div>
                ):(
                  (() => {
                    const STATUS_CONFIG: Record<string,{label:string;color:string;bg:string;border:string}> = {
                      "new":       {label:"🆕 Новый",      color:"#5ab4e8", bg:"#0a1a2a", border:"#1a3a5a"},
                      "paid":      {label:"💳 Оплачен",    color:"#4cff91", bg:"#0a2a0a", border:"#1a4a1a"},
                      "cooking":   {label:"🍳 Готовится",  color:"#ffaa00", bg:"#2a1a00", border:"#4a3a00"},
                      "delivered": {label:"✅ Доставлен",  color:"#aaa",    bg:"#1a1a1a", border:"#2a2a2a"},
                      "cancelled": {label:"❌ Отменён",    color:"#ff6b6b", bg:"#2a0a0a", border:"#5a1a1a"},
                    };
                    const STATUS_NEXT: Record<string,string> = {
                      "new":"paid", "paid":"cooking", "cooking":"delivered"
                    };
                    const STATUS_NEXT_LABEL: Record<string,string> = {
                      "new":"Отметить оплаченным →",
                      "paid":"Готовится →",
                      "cooking":"Доставлен →",
                    };
                    const updateOrderStatus = async (ordId:string, newStatus:string) => {
                      try {
                        await fetch(`${FS_BASE}/orders/${ordId}?key=${FB_CONFIG.apiKey}&updateMask.fieldPaths=status`, {
                          method:"PATCH",
                          headers:{"Content-Type":"application/json"},
                          body: JSON.stringify({fields:{status:{stringValue:newStatus}}}),
                        });
                        setCloudOrders(prev=>prev.map(o=>o.id===ordId?{...o,status:newStatus}:o));
                      } catch(e){console.error(e);}
                    };
                    // Счётчики по статусам
                    const counts: Record<string,number> = {};
                    cloudOrders.forEach(o=>{ const s=o.status||"new"; counts[s]=(counts[s]||0)+1; });
                    const paidRevenue = cloudOrders.filter(o=>o.status==="paid"||o.status==="cooking"||o.status==="delivered").reduce((s:number,o:any)=>s+(o.total||0),0);
                    return (<>
                      {/* Сводка */}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                        <div style={{background:"#0a2a0a",border:"1px solid #1a4a1a",borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:900,color:"#4cff91"}}>{paidRevenue.toLocaleString("ru-RU")} ₸</div>
                          <div style={{fontSize:10,color:mutedC,marginTop:2}}>💳 Реальная выручка</div>
                        </div>
                        <div style={{background:bgCard,border:`1px solid ${brd}`,borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:900,color:YELLOW}}>{cloudOrders.filter(o=>o.status==="new"||!o.status).length}</div>
                          <div style={{fontSize:10,color:mutedC,marginTop:2}}>🆕 Новых заказов</div>
                        </div>
                      </div>
                      {/* Список заказов */}
                      <div style={{display:"flex",flexDirection:"column",gap:10}}>
                        {cloudOrders.slice(0,30).map((ord:any)=>{
                          const st = ord.status||"new";
                          const cfg = STATUS_CONFIG[st]||STATUS_CONFIG["new"];
                          const nextSt = STATUS_NEXT[st];
                          return (
                            <div key={ord.id} style={{background:bgCard,borderRadius:14,border:`1px solid ${brd}`,overflow:"hidden"}}>
                              {/* Шапка заказа */}
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderBottom:`1px solid ${brd}`}}>
                                <div style={{flex:1}}>
                                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                                    <span style={{fontSize:13,fontWeight:900,color:YELLOW}}>{ord.orderNumber}</span>
                                    <span style={{fontSize:10,background:cfg.bg,border:`1px solid ${cfg.border}`,color:cfg.color,padding:"1px 7px",borderRadius:8,fontWeight:700}}>{cfg.label}</span>
                                  </div>
                                  <div style={{fontSize:11,color:mutedC,marginTop:2}}>{ord.date} · {ord.name} · {ord.phone}</div>
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                                  <div style={{textAlign:"right"}}>
                                    <div style={{fontSize:14,fontWeight:900,color:YELLOW}}>{(ord.total||0).toLocaleString("ru-RU")} ₸</div>
                                    {ord.discount>0&&<div style={{fontSize:10,color:"#4cff91"}}>−{(ord.discount||0).toLocaleString("ru-RU")} ₸</div>}
                                  </div>
                                  <button onClick={async()=>{
                                    if(!window.confirm(`Удалить заказ ${ord.orderNumber}?`)) return;
                                    try {
                                      await fetch(`${FS_BASE}/orders/${ord.id}?key=${FB_CONFIG.apiKey}`,{method:"DELETE"});
                                      // Сохранить в историю удалённых
                                      const deleted = JSON.parse(localStorage.getItem("paksushi_deleted_orders")||"[]");
                                      deleted.unshift({...ord, deletedAt: new Date().toLocaleString("ru-RU"), deletedBy: adminRole});
                                      localStorage.setItem("paksushi_deleted_orders", JSON.stringify(deleted.slice(0,100)));
                                      setCloudOrders(prev=>prev.filter(o=>o.id!==ord.id));
                                    } catch(e){console.error(e);}
                                  }} style={{background:"#2a0a0a",border:"1px solid #5a1a1a",borderRadius:8,padding:"6px 8px",color:"#ff6b6b",fontSize:13,cursor:"pointer",flexShrink:0}}>🗑</button>
                                </div>
                              </div>
                              {/* Состав */}
                              <div style={{padding:"8px 14px",fontSize:11,color:mutedC,lineHeight:1.6}}>
                                {ord.address&&<div>📍 {ord.address}</div>}
                                <div>{(ord.items||[]).map((i:any)=>`${i.name} ×${i.qty}`).join(" · ")}</div>
                                {ord.comment&&<div style={{color:"#5ab4e8",marginTop:2}}>💬 {ord.comment}</div>}
                              </div>
                              {/* Кнопки статуса */}
                              <div style={{display:"flex",gap:6,padding:"8px 14px",borderTop:`1px solid ${brd}`}}>
                                {nextSt&&(
                                  <button onClick={()=>updateOrderStatus(ord.id, nextSt)}
                                    style={{flex:2,background:STATUS_CONFIG[nextSt].bg,border:`1px solid ${STATUS_CONFIG[nextSt].border}`,borderRadius:8,padding:"7px",color:STATUS_CONFIG[nextSt].color,fontFamily:"'Nunito',sans-serif",fontSize:11,fontWeight:800,cursor:"pointer"}}>
                                    {STATUS_NEXT_LABEL[st]}
                                  </button>
                                )}
                                {st!=="cancelled"&&st!=="delivered"&&(
                                  <button onClick={()=>updateOrderStatus(ord.id,"cancelled")}
                                    style={{flex:1,background:"#2a0a0a",border:"1px solid #5a1a1a",borderRadius:8,padding:"7px",color:"#ff6b6b",fontFamily:"'Nunito',sans-serif",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                                    Отменить
                                  </button>
                                )}
                                {(st==="delivered"||st==="cancelled")&&(
                                  <div style={{flex:1,textAlign:"center",fontSize:11,color:mutedC,padding:"7px"}}>
                                    {st==="delivered"?"✅ Завершён":"❌ Отменён"}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>);
                  })()
                )}
              </div>

              {popularSorted.length>0&&(
                <div style={{background:bgCard,borderRadius:16,border:`1px solid ${brd}`,overflow:"hidden"}}>
                  <div style={{padding:"12px 16px",borderBottom:`1px solid ${brd}`,fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700}}>ТОП БЛЮД</div>
                  {popularSorted.map(([name,count]:any,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:i<popularSorted.length-1?`1px solid ${brd}`:"none"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:24,height:24,borderRadius:"50%",background:i===0?"#f5c518":i===1?"#aaa":i===2?"#cd7f32":"#333",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:i<3?DARK:"#888"}}>{i+1}</div>
                        <span style={{fontSize:13,fontWeight:600}}>{name}</span>
                      </div>
                      <span style={{fontSize:13,fontWeight:800,color:YELLOW}}>{count} шт</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {adminTab==="menu"&&(
            <div>
              {/* Подтверждение удаления */}
              {confirmDelete&&(
                <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
                  <div style={{background:bgCard,borderRadius:20,padding:"28px 24px",textAlign:"center",maxWidth:320,width:"100%"}}>
                    <div style={{fontSize:36,marginBottom:12}}>🗑️</div>
                    <div style={{fontSize:15,fontWeight:800,marginBottom:6,color:clr}}>Удалить товар?</div>
                    <div style={{fontSize:13,color:mutedC,marginBottom:20}}>{confirmDelete.name}</div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>setConfirmDelete(null)} style={{flex:1,padding:"11px",borderRadius:12,border:`1px solid ${brd}`,background:"transparent",color:clr,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>Отмена</button>
                      <button onClick={()=>deleteMenuItem(confirmDelete.cat,confirmDelete.id)} style={{flex:1,padding:"11px",borderRadius:12,border:"none",background:"#ff4444",color:"#fff",fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:900,cursor:"pointer"}}>Удалить</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Форма редактирования */}
              {editItem&&(
                <div style={{background:bgCard,borderRadius:16,border:`2px solid ${YELLOW}`,padding:"16px",marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:800,color:YELLOW,marginBottom:12}}>✏️ Редактировать: {editItem.name}</div>
                  {[["Название","name"],["Цена (₸)","price"],["Заметка (напр. 10 шт)","note"],["Описание","desc"],["Фото URL","img"]].map(([label,field])=>(
                    <div key={field} style={{marginBottom:10}}>
                      <div style={{fontSize:9,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:4}}>{label.toUpperCase()}</div>
                      {field==="desc"
                        ? <textarea value={(editItem as any)[field]||""} onChange={e=>setEditItem({...editItem,[field]:e.target.value})} rows={2}
                            style={{width:"100%",padding:"9px 12px",background:bg,border:`1px solid ${brd}`,borderRadius:8,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                        : <input value={(editItem as any)[field]||""} onChange={e=>setEditItem({...editItem,[field]:field==="price"?Number(e.target.value):e.target.value})}
                            style={{width:"100%",padding:"9px 12px",background:bg,border:`1px solid ${brd}`,borderRadius:8,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                      }
                    </div>
                  ))}
                  {editItem.img&&<img src={editItem.img} style={{width:"100%",height:100,objectFit:"cover",borderRadius:8,marginBottom:10}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>}
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>updateMenuItem(editCat,editItem)} style={{flex:2,background:YELLOW,color:DARK,border:"none",padding:"10px",borderRadius:10,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:900,cursor:"pointer"}}>💾 Сохранить</button>
                    <button onClick={()=>setEditItem(null)} style={{flex:1,background:"transparent",color:mutedC,border:`1px solid ${brd}`,padding:"10px",borderRadius:10,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>Отмена</button>
                  </div>
                </div>
              )}

              {/* Форма добавления товара */}
              {addingToCat&&(
                <div style={{background:bgCard,borderRadius:16,border:`2px solid #4cff91`,padding:"16px",marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#4cff91",marginBottom:12}}>➕ Новый товар в {addingToCat}</div>
                  {[["Название *","name"],["Цена (₸) *","price"],["Заметка (напр. 10 шт)","note"],["Описание","desc"],["Фото URL","img"]].map(([label,field])=>(
                    <div key={field} style={{marginBottom:10}}>
                      <div style={{fontSize:9,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:4}}>{label.toUpperCase()}</div>
                      {field==="desc"
                        ? <textarea value={(newItem as any)[field]||""} onChange={e=>setNewItem({...newItem,[field]:e.target.value})} rows={2} placeholder={field==="desc"?"Описание блюда...":""}
                            style={{width:"100%",padding:"9px 12px",background:bg,border:`1px solid ${brd}`,borderRadius:8,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                        : <input value={(newItem as any)[field]||""} onChange={e=>setNewItem({...newItem,[field]:field==="price"?Number(e.target.value):e.target.value})} placeholder={field==="name"?"Название блюда":field==="price"?"0":""}
                            style={{width:"100%",padding:"9px 12px",background:bg,border:`1px solid ${brd}`,borderRadius:8,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                      }
                    </div>
                  ))}
                  {newItem.img&&<img src={newItem.img} style={{width:"100%",height:100,objectFit:"cover",borderRadius:8,marginBottom:10}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>}
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>addMenuItem(addingToCat)} disabled={!newItem.name||!newItem.price}
                      style={{flex:2,background:newItem.name&&newItem.price?"#4cff91":"#2a2a2a",color:newItem.name&&newItem.price?DARK:MUTED,border:"none",padding:"10px",borderRadius:10,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:900,cursor:newItem.name&&newItem.price?"pointer":"not-allowed"}}>
                      ➕ Добавить товар
                    </button>
                    <button onClick={()=>{setAddingToCat(null);setNewItem({});}} style={{flex:1,background:"transparent",color:mutedC,border:`1px solid ${brd}`,padding:"10px",borderRadius:10,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>Отмена</button>
                  </div>
                </div>
              )}

              {/* Список категорий и товаров */}
              {Object.entries(menuData).map(([cat,items])=>(
                <div key={cat} style={{marginBottom:20}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{fontSize:12,fontWeight:800,color:YELLOW,letterSpacing:2}}>{cat} <span style={{color:mutedC,fontSize:10,fontWeight:600}}>({items.length} поз.)</span></div>
                    <button onClick={()=>{setAddingToCat(cat);setEditItem(null);setNewItem({});}}
                      style={{background:"#0a2a0a",border:"1px solid #2a5a2a",borderRadius:8,padding:"5px 12px",color:"#4cff91",fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
                      ➕ Добавить
                    </button>
                  </div>
                  <div style={{background:bgCard,borderRadius:14,border:`1px solid ${brd}`,overflow:"hidden"}}>
                    {items.map((item,idx)=>(
                      <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:idx<items.length-1?`1px solid ${brd}`:"none",background:editItem?.id===item.id?darkMode?"#1a1a00":"#fffbe6":"transparent"}}>
                        <img src={item.img} style={{width:44,height:44,borderRadius:8,objectFit:"cover",flexShrink:0}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
                          <div style={{fontSize:12,color:YELLOW,fontWeight:800}}>{item.price.toLocaleString("ru-RU")} ₸ {item.note&&<span style={{fontSize:10,color:mutedC,fontWeight:400}}>· {item.note}</span>}</div>
                        </div>
                        <div style={{display:"flex",gap:6,flexShrink:0}}>
                          <button onClick={()=>{setEditItem({...item});setEditCat(cat);setAddingToCat(null);}}
                            style={{background:"#1a1a2a",border:`1px solid #2a2a5a`,borderRadius:8,padding:"6px 10px",color:"#5ab4e8",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>✏️</button>
                          <button onClick={()=>setConfirmDelete({cat,id:item.id,name:item.name})}
                            style={{background:"#2a0a0a",border:`1px solid #5a1a1a`,borderRadius:8,padding:"6px 10px",color:"#ff6b6b",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>🗑</button>
                        </div>
                      </div>
                    ))}
                    {items.length===0&&(
                      <div style={{padding:"20px",textAlign:"center",color:mutedC,fontSize:13}}>Нет товаров — добавьте первый ↑</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {adminTab==="deleted"&&adminRole==="owner"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700}}>УДАЛЁННЫЕ ЗАКАЗЫ</div>
                <button onClick={()=>{
                  if(!window.confirm("Очистить историю удалённых заказов?")) return;
                  localStorage.removeItem("paksushi_deleted_orders");
                  setDeletedOrders([]);
                }} style={{background:"#2a0a0a",border:"1px solid #5a1a1a",borderRadius:8,padding:"4px 10px",color:"#ff6b6b",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
                  Очистить
                </button>
              </div>
              {deletedOrders.length===0?(
                <div style={{background:bgCard,borderRadius:14,border:`1px solid ${brd}`,padding:"20px",textAlign:"center",color:mutedC,fontSize:13}}>
                  Удалённых заказов нет
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {deletedOrders.map((ord:any,i:number)=>(
                    <div key={i} style={{background:bgCard,borderRadius:14,border:"1px solid #5a1a1a",overflow:"hidden"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderBottom:"1px solid #3a1a1a"}}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:13,fontWeight:900,color:"#ff6b6b"}}>{ord.orderNumber}</span>
                            <span style={{fontSize:10,background:"#2a0a0a",border:"1px solid #5a1a1a",color:"#ff6b6b",padding:"1px 6px",borderRadius:8,fontWeight:700}}>❌ Удалён</span>
                          </div>
                          <div style={{fontSize:11,color:mutedC,marginTop:2}}>{ord.date} · {ord.name} · {ord.phone}</div>
                          <div style={{fontSize:10,color:"#ff6b6b",marginTop:2}}>Удалил: {ord.deletedBy==="owner"?"⭐ Владелец":"👤 Админ"} · {ord.deletedAt}</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:14,fontWeight:900,color:"#ff6b6b"}}>{(ord.total||0).toLocaleString("ru-RU")} ₸</div>
                          {ord.discount>0&&<div style={{fontSize:10,color:mutedC}}>−{(ord.discount||0).toLocaleString("ru-RU")} ₸</div>}
                        </div>
                      </div>
                      <div style={{padding:"8px 14px",fontSize:11,color:mutedC,lineHeight:1.6}}>
                        {ord.address&&<div>📍 {ord.address}</div>}
                        <div>{(ord.items||[]).map((i:any)=>`${i.name} ×${i.qty}`).join(" · ")}</div>
                        {ord.comment&&<div style={{color:"#5ab4e8",marginTop:2}}>💬 {ord.comment}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {adminTab==="clients"&&(
            <div>
              {Object.values(clients).length===0?(
                <div style={{textAlign:"center",padding:"40px",color:mutedC}}>Клиентов пока нет</div>
              ):(
                <div style={{background:bgCard,borderRadius:14,border:`1px solid ${brd}`,overflow:"hidden"}}>
                  <div style={{padding:"12px 16px",borderBottom:`1px solid ${brd}`,fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700}}>ЗАРЕГИСТРИРОВАННЫЕ КЛИЕНТЫ</div>
                  {Object.values(clients).map((c,idx,arr)=>(
                    <div key={c.phone} style={{padding:"12px 16px",borderBottom:idx<arr.length-1?`1px solid ${brd}`:"none"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:700}}>{c.name||"—"}</div>
                          <div style={{fontSize:12,color:mutedC}}>{c.phone}</div>
                          <div style={{fontSize:11,color:mutedC,marginTop:2}}>С {c.registeredAt}</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:13,fontWeight:800,color:YELLOW}}>⭐ {c.bonusPoints}</div>
                          <div style={{fontSize:11,color:mutedC}}>{c.orders} заказов</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── INFO ───
  if (screen==="info") return (
    <div style={{fontFamily:"'Nunito',sans-serif",background:bg,minHeight:"100vh",color:clr}}>
      <style>{css}</style>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <Header title="О нас" back="menu"/>
      <div style={{maxWidth:500,margin:"0 auto",padding:"20px 16px 60px"}} className="fadeIn">
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:80,height:80,borderRadius:"50%",background:"#e5a800",display:"flex",alignItems:"center",justifyContent:"center",fontSize:40,margin:"0 auto 12px"}}>🍣</div>
          <div style={{fontSize:22,fontWeight:900,color:YELLOW}}>ПАК СУШИ</div>
          <div style={{fontSize:13,color:mutedC,marginTop:4}}>Сарыағаш · Доставка еды</div>
        </div>

        <div style={{background:"linear-gradient(135deg,#1a1200,#2a1e00)",border:`1px solid #3a3000`,borderRadius:16,padding:"16px 18px",marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:900,color:YELLOW,marginBottom:10}}>🎁 Зарегистрируйся — получай бонусы!</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            {[["⭐","1 бонус за 100 ₸ заказа"],["📢","Акции первым в WhatsApp"],["🎯","Персональные предложения"],["💰","Накапливай и трать бонусы"]].map(([ic,tx],i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"8px 10px"}}>
                <span style={{fontSize:16}}>{ic}</span><span style={{fontSize:11,color:"#ddd",lineHeight:1.3}}>{tx}</span>
              </div>
            ))}
          </div>
          <button onClick={()=>setScreen("login")} style={{width:"100%",background:YELLOW,color:DARK,border:"none",padding:"10px",borderRadius:10,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:900,cursor:"pointer"}}>Войти / Зарегистрироваться →</button>
        </div>

        <div style={{background:bgCard,borderRadius:16,border:`1px solid ${brd}`,marginBottom:16,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${brd}`,fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700}}>КОНТАКТЫ</div>
          {[
            {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C9.61 21 3 14.39 3 6a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z" stroke={YELLOW} strokeWidth="2" strokeLinecap="round"/></svg>, label:"Телефон", value:"+7 705 721 05 05", href:`tel:+77057210505`},
            {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" stroke={YELLOW} strokeWidth="2"/></svg>, label:"Адрес", value:ADDRESS, href:MAPS_URL},
            {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={YELLOW} strokeWidth="2"/><path d="M12 7v5l3 3" stroke={YELLOW} strokeWidth="2" strokeLinecap="round"/></svg>, label:"Режим работы", value:"10:00 — 00:00, ежедневно", href:null},
          ].map((row,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderBottom:i<2?`1px solid ${brd}`:"none"}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:darkMode?"#1a1a00":"#fff8e8",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{row.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:mutedC,fontWeight:700,letterSpacing:1,marginBottom:2}}>{row.label}</div>
                {row.href?<a href={row.href} target="_blank" rel="noreferrer" style={{fontSize:13,fontWeight:700,color:YELLOW,textDecoration:"none"}}>{row.value}</a>:<div style={{fontSize:13,fontWeight:700}}>{row.value}</div>}
              </div>
            </div>
          ))}
        </div>

        <div style={{background:bgCard,borderRadius:16,border:`1px solid ${brd}`,marginBottom:16,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${brd}`,fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700}}>НА КАРТЕ</div>
          <div style={{position:"relative",width:"100%",paddingBottom:"56%",background:darkMode?"#1a1a1a":"#f0f0f0"}}>
            <iframe src={MAPS_EMBED} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",border:"none"}} loading="lazy" title="Карта ПАК СУШИ"/>
          </div>
          <a href={MAPS_URL} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"12px 16px",fontSize:13,fontWeight:700,color:YELLOW,textDecoration:"none",borderTop:`1px solid ${brd}`}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" stroke={YELLOW} strokeWidth="2"/></svg>
            Открыть в Google Maps
          </a>
        </div>

        <div style={{background:bgCard,borderRadius:16,border:`1px solid ${brd}`,marginBottom:20,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${brd}`,fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700}}>МЫ В СОЦСЕТЯХ</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr"}}>
            {[
              {icon:<IgIcon size={28}/>,label:"Instagram",color:"#e1306c",href:INSTAGRAM,bg:darkMode?"#2a0a1a":"#fff0f5"},
              {icon:<TkIcon size={28}/>,label:"TikTok",color:"#ffffff",href:TIKTOK,bg:darkMode?"#0a0a0a":"#f0f0f0"},
              {icon:<WaIcon size={28}/>,label:"WhatsApp",color:"#25d366",href:WA,bg:darkMode?"#0a2a0a":"#f0fff4"},
            ].map((s,i)=>(
              <a key={i} href={s.href} target="_blank" rel="noreferrer"
                style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"18px 8px",textDecoration:"none",background:s.bg,borderRight:i<2?`1px solid ${brd}`:"none"}}>
                <div style={{marginBottom:8}}>{s.icon}</div>
                <span style={{fontSize:11,fontWeight:800,color:s.color}}>{s.label}</span>
              </a>
            ))}
          </div>
        </div>

        <button onClick={()=>setScreen("menu")} style={{width:"100%",background:YELLOW,color:DARK,border:"none",padding:14,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:900,cursor:"pointer",marginBottom:10}}>🍣 Перейти к меню</button>
        <button onClick={()=>setScreen("admin")} style={{width:"100%",background:"transparent",color:mutedC,border:`1px solid ${brd}`,padding:10,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>⚙️ Панель администратора</button>
      </div>
    </div>
  );

  // ─── LOGIN ───
  if (screen==="login") return (
    <div style={{fontFamily:"'Nunito',sans-serif",background:bg,minHeight:"100vh",color:clr}}>
      <style>{css}</style>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <Header title="Мой профиль" back="menu"/>
      <div style={{maxWidth:400,margin:"0 auto",padding:"32px 16px"}} className="fadeIn">
        {currentClient ? (
          <div style={{textAlign:"center"}}>
            <div style={{width:72,height:72,borderRadius:"50%",background:"#0a2a0a",border:"2px solid #4cff91",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="#4cff91" strokeWidth="2"/><path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6" stroke="#4cff91" strokeWidth="2" strokeLinecap="round"/></svg>
            </div>
            <div style={{fontSize:18,fontWeight:900,marginBottom:4}}>{currentClient.name}</div>
            <div style={{fontSize:14,color:mutedC,marginBottom:24}}>{currentClient.phone}</div>
            <button onClick={()=>setScreen("profile")} style={{width:"100%",background:YELLOW,color:DARK,border:"none",padding:14,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:900,cursor:"pointer",marginBottom:10}}>Мой профиль</button>
            <button onClick={logout} style={{width:"100%",background:"transparent",color:"#ff6b6b",border:"1px solid #ff6b6b",padding:14,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:700,cursor:"pointer"}}>Выйти</button>
          </div>
        ) : (
          <LoginForm
            bg={bg} bgCard={bgCard} clr={clr} brd={brd} mutedC={mutedC}
            onLogin={async (ph:string, nm:string) => {
              // Ищем клиента в Firebase по телефону
              try {
                const r = await fetch(`${FS_BASE}/clients/${ph.replace(/\D/g,"")}?key=${FB_CONFIG.apiKey}`);
                if (r.ok) {
                  const d = await r.json();
                  const obj = d.fields ? Object.fromEntries(Object.entries(d.fields).map(([k,v]:any)=>[k,(v.stringValue||v.integerValue||v.booleanValue||"")])) : {};
                  const client = {name: obj.name||nm, phone:ph.replace(/\D/g,""), orders:Number(obj.orders)||0, bonusPoints:Number(obj.bonusPoints)||0, registeredAt:obj.registeredAt||new Date().toLocaleDateString("ru-RU")};
                  // Обновляем имя если новое
                  if (nm && nm !== obj.name) {
                    await fetch(`${FS_BASE}/clients/${ph.replace(/\D/g,"")}?key=${FB_CONFIG.apiKey}`, {
                      method:"PATCH", headers:{"Content-Type":"application/json"},
                      body: JSON.stringify({fields:{name:{stringValue:nm},phone:{stringValue:ph.replace(/\D/g,"")},orders:{integerValue:String(client.orders)},bonusPoints:{integerValue:String(client.bonusPoints)},registeredAt:{stringValue:client.registeredAt}}})
                    });
                  }
                  setCurrentClient(client);
                  setName(client.name);
                  setPhone(client.phone);
                  localStorage.setItem("paksushi_current_client", JSON.stringify(client));
                  setScreen("profile");
                } else {
                  // Новый клиент — создаём
                  const newClient = {name:nm, phone:ph.replace(/\D/g,""), orders:0, bonusPoints:0, registeredAt:new Date().toLocaleDateString("ru-RU")};
                  await fetch(`${FS_BASE}/clients/${ph.replace(/\D/g,"")}?key=${FB_CONFIG.apiKey}`, {
                    method:"PATCH", headers:{"Content-Type":"application/json"},
                    body: JSON.stringify({fields:{name:{stringValue:nm},phone:{stringValue:ph.replace(/\D/g,"")},orders:{integerValue:"0"},bonusPoints:{integerValue:"0"},registeredAt:{stringValue:newClient.registeredAt}}})
                  });
                  setCurrentClient(newClient);
                  setName(nm); setPhone(ph.replace(/\D/g,""));
                  localStorage.setItem("paksushi_current_client", JSON.stringify(newClient));
                  setScreen("profile");
                }
              } catch(e) {
                console.error(e);
                // Fallback — локальное сохранение
                const client = {name:nm, phone:ph.replace(/\D/g,""), orders:0, bonusPoints:0, registeredAt:new Date().toLocaleDateString("ru-RU")};
                setCurrentClient(client); setName(nm); setPhone(ph.replace(/\D/g,""));
                localStorage.setItem("paksushi_current_client", JSON.stringify(client));
                setScreen("profile");
              }
            }}
          />
        )}
      </div>
    </div>
  );

  if (screen==="profile"&&currentClient) return (
    <div style={{fontFamily:"'Nunito',sans-serif",background:bg,minHeight:"100vh",color:clr}}>
      <style>{css}</style>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <Header title="Мой профиль" back="menu"/>
      <div style={{maxWidth:460,margin:"0 auto",padding:"24px 16px 60px"}} className="fadeIn">
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:72,height:72,borderRadius:"50%",background:"#0a2a0a",border:"2px solid #4cff91",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="#4cff91" strokeWidth="2"/><path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6" stroke="#4cff91" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <div style={{fontSize:18,fontWeight:900}}>{currentClient.name||"Клиент"}</div>
          <div style={{fontSize:13,color:mutedC}}>{currentClient.phone}</div>
          <div style={{fontSize:11,color:mutedC,marginTop:4}}>С нами с {currentClient.registeredAt}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
          {[{label:"Заказов",icon:"🛒",value:currentClient.orders},{label:"Бонусов",icon:"⭐",value:currentClient.bonusPoints}].map((s,i)=>(
            <div key={i} style={{background:bgCard,border:`1px solid ${brd}`,borderRadius:14,padding:"16px",textAlign:"center"}}>
              <div style={{fontSize:26,marginBottom:4}}>{s.icon}</div>
              <div style={{fontSize:24,fontWeight:900,color:YELLOW}}>{s.value}</div>
              <div style={{fontSize:11,color:mutedC,fontWeight:700}}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{background:bgCard,borderRadius:14,border:`1px solid ${brd}`,padding:"16px",marginBottom:16}}>
          <div style={{fontSize:9,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:10}}>ВАШ ПРОФИЛЬ</div>
          <div style={{fontSize:11,color:mutedC,marginBottom:4}}>Имя</div>
          <input value={currentClient.name} onChange={e=>{const c=getClients();c[currentClient.phone].name=e.target.value;saveClients(c);setCurrentClient({...currentClient,name:e.target.value});setName(e.target.value);}} placeholder="Введите имя"
            style={{width:"100%",padding:"10px 12px",background:bg,border:`1px solid ${brd}`,borderRadius:10,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{background:darkMode?"#1a1200":"#fff8e8",border:`1px solid ${darkMode?"#3a3000":"#ffe0a0"}`,borderRadius:12,padding:"12px 14px",marginBottom:20,fontSize:12,color:darkMode?"#ccc":"#666",lineHeight:1.7}}>
          ⭐ За каждые <strong style={{color:clr}}>100 ₸</strong> — <strong style={{color:YELLOW}}>1 бонус</strong>.<br/>
          📢 Акции приходят в WhatsApp автоматически.
        </div>

        {/* История заказов */}
        {(() => {
          const history = getOrderHistory(currentClient.phone);
          if (history.length === 0) return null;
          return (
            <div style={{marginBottom:20}}>
              <div style={{fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:10}}>ИСТОРИЯ ЗАКАЗОВ</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {history.map((rec, idx) => (
                  <div key={rec.id} style={{background:bgCard,borderRadius:14,border:`1px solid ${brd}`,overflow:"hidden"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderBottom:`1px solid ${brd}`}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:800,color:clr}}>Заказ от {rec.date}</div>
                        <div style={{fontSize:11,color:mutedC,marginTop:2}}>{rec.items.length} позиций · {rec.items.reduce((s,i)=>s+i.qty,0)} шт</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:14,fontWeight:900,color:YELLOW}}>{rec.total.toLocaleString("ru-RU")} ₸</div>
                        {rec.discount>0&&<div style={{fontSize:10,color:"#4cff91"}}>−{rec.discount.toLocaleString("ru-RU")} ₸</div>}
                      </div>
                    </div>
                    <div style={{padding:"8px 14px"}}>
                      <div style={{fontSize:11,color:mutedC,marginBottom:8,lineHeight:1.6}}>
                        {rec.items.map(i=>`${i.name} ×${i.qty}`).join(" · ")}
                      </div>
                      <button onClick={()=>repeatOrder(rec)}
                        style={{width:"100%",background:YELLOW,color:DARK,border:"none",padding:"9px",borderRadius:10,fontFamily:"'Nunito',sans-serif",fontSize:12,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                        🔄 Повторить заказ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <button onClick={()=>setScreen("menu")} style={{width:"100%",background:YELLOW,color:DARK,border:"none",padding:14,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:900,cursor:"pointer",marginBottom:10}}>🍣 К меню</button>
        <button onClick={logout} style={{width:"100%",background:"transparent",color:"#ff6b6b",border:"1px solid #ff6b6b",padding:12,borderRadius:14,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>Выйти из аккаунта</button>
      </div>
    </div>
  );

  // ─── CONFIRM ───
  if (screen==="confirm") return (
    <div style={{fontFamily:"'Nunito',sans-serif",background:bg,minHeight:"100vh",color:clr}}>
      <style>{css}</style>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <Header title="Подтверждение" back="checkout"/>
      <div style={{maxWidth:460,margin:"0 auto",padding:"24px 16px 40px"}} className="fadeIn">
        {sent?(
          <div style={{textAlign:"center",padding:"48px 0"}}>
            <div style={{fontSize:64}}>🎉</div>
            <h2 style={{color:YELLOW,fontSize:22,fontWeight:900,margin:"16px 0 8px"}}>Заказ отправлен!</h2>
            {orderNumber&&(
              <div style={{background:"#1a1200",border:"2px solid #f5c518",borderRadius:16,padding:"14px 20px",margin:"16px auto",maxWidth:220}}>
                <div style={{fontSize:11,color:MUTED,fontWeight:700,letterSpacing:2,marginBottom:4}}>НОМЕР ВАШЕГО ЗАКАЗА</div>
                <div style={{fontSize:32,fontWeight:900,color:YELLOW,letterSpacing:4}}>{orderNumber}</div>
                <div style={{fontSize:10,color:MUTED,marginTop:4}}>Сообщите оператору при звонке</div>
              </div>
            )}
            <p style={{color:mutedC,fontSize:13,lineHeight:1.7}}>Менеджер свяжется с вами<br/>и пришлёт номер Kaspi Gold для оплаты</p>
          </div>
        ):(<>
          <div style={{background:bgCard,borderRadius:16,padding:"16px",border:`1px solid ${brd}`,marginBottom:20}}>
            <div style={{fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:10}}>ИТОГО К ОПЛАТЕ</div>
            {totalFood>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,color:mutedC}}>Еда</span><span style={{fontSize:13}}>{totalFood.toLocaleString("ru-RU")} ₸</span></div>}
            {totalDrinks>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,color:mutedC}}>Напитки</span><span style={{fontSize:13}}>{totalDrinks.toLocaleString("ru-RU")} ₸</span></div>}
            {discountSushiAmt>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,color:"#4cff91"}}>Скидка суши+пицца {discountSushi.label}</span><span style={{fontSize:13,color:"#4cff91"}}>−{discountSushiAmt.toLocaleString("ru-RU")} ₸</span></div>}
            {discountOtherAmt>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,color:"#4cff91"}}>Скидка бургеры/лаваш -10%</span><span style={{fontSize:13,color:"#4cff91"}}>−{discountOtherAmt.toLocaleString("ru-RU")} ₸</span></div>}
            {currentClient&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,color:YELLOW}}>⭐ +{Math.floor(totalFinal/100)} бонусов</span><span style={{fontSize:11,color:mutedC}}>будет начислено</span></div>}
            <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:`1px solid ${YELLOW}44`,marginTop:6}}>
              <span style={{fontSize:15,fontWeight:800}}>К оплате</span>
              <span style={{fontSize:22,fontWeight:900,color:YELLOW}}>{totalFinal.toLocaleString("ru-RU")} ₸</span>
            </div>
          </div>
          <div style={{background:darkMode?"#0a1a2a":"#e8f4ff",border:`1px solid ${darkMode?"#1a3a5a":"#b0d4f0"}`,borderRadius:14,padding:"14px 16px",marginBottom:20,fontSize:13,color:darkMode?"#5ab4e8":"#1a5a8a",lineHeight:1.7}}>
            💳 Оплата через Kaspi Gold.<br/><span style={{color:mutedC,fontSize:12}}>Номер карты пришлёт менеджер. Сумма: <strong style={{color:clr}}>{totalFinal.toLocaleString("ru-RU")} ₸</strong></span>
          </div>
          <button onClick={sendOrder} style={{width:"100%",background:YELLOW,color:DARK,border:"none",padding:16,borderRadius:14,cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:900}}>📲 ОТПРАВИТЬ ЗАКАЗ В WHATSAPP</button>
        </>)}
      </div>
    </div>
  );

  // ─── CHECKOUT ───
  if (screen==="checkout") return (
    <div style={{fontFamily:"'Nunito',sans-serif",background:bg,minHeight:"100vh",color:clr}}>
      <style>{css}</style>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <header style={{background:bgHdr,borderBottom:`1px solid ${brd}`,padding:"0 16px",height:56,display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:100}}>
        <button onClick={()=>setScreen("menu")} style={{background:"none",border:"none",color:YELLOW,fontSize:20,cursor:"pointer"}}>←</button>
        <span style={{fontSize:16,fontWeight:900,color:YELLOW}}>Оформление заказа</span>
        <button onClick={()=>setShowClear(true)} style={{marginLeft:"auto",background:"#2a0a0a",border:"1px solid #5a1a1a",borderRadius:10,padding:"5px 12px",color:"#ff6b6b",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>🗑 Очистить</button>
      </header>
      {showClear&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
          <div style={{background:bgCard,borderRadius:20,padding:"28px 24px",textAlign:"center",maxWidth:320,width:"100%"}}>
            <div style={{fontSize:40,marginBottom:12}}>🗑️</div>
            <div style={{fontSize:16,fontWeight:800,marginBottom:8,color:clr}}>Очистить корзину?</div>
            <div style={{fontSize:13,color:mutedC,marginBottom:24}}>Все добавленные блюда будут удалены</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setShowClear(false)} style={{flex:1,padding:"12px",borderRadius:12,border:`1px solid ${brd}`,background:"transparent",color:clr,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,cursor:"pointer"}}>Отмена</button>
              <button onClick={()=>{setOrder({});setShowClear(false);}} style={{flex:1,padding:"12px",borderRadius:12,border:"none",background:"#ff4444",color:"#fff",fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:900,cursor:"pointer"}}>Очистить</button>
            </div>
          </div>
        </div>
      )}
      <div style={{maxWidth:460,margin:"0 auto",padding:"20px 16px 40px"}} className="fadeIn">
        <div style={{background:bgCard,borderRadius:14,overflow:"hidden",border:`1px solid ${brd}`,marginBottom:20}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${brd}`,fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700}}>ВАШ ЗАКАЗ</div>
          {cartItems.map((item,idx)=>(
            <div key={item.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",borderBottom:idx<cartItems.length-1?`1px solid ${brd}`:"none",gap:10}}>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{item.name}</div><div style={{fontSize:11,color:mutedC,marginTop:2}}>{item.price.toLocaleString("ru-RU")} ₸ × {item.qty}</div></div>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <button onClick={()=>change(item.id,-1)} style={{width:24,height:24,borderRadius:"50%",border:`1.5px solid ${brd}`,background:"transparent",color:clr,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                <span style={{minWidth:14,textAlign:"center",fontSize:13,fontWeight:700,color:YELLOW}}>{item.qty}</span>
                <button onClick={()=>change(item.id,1)} style={{width:24,height:24,borderRadius:"50%",border:`1.5px solid ${YELLOW}`,background:YELLOW,color:DARK,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>+</button>
                <span style={{fontSize:13,fontWeight:700,minWidth:70,textAlign:"right"}}>{(item.price*item.qty).toLocaleString("ru-RU")} ₸</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{fontSize:10,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:10}}>ВАШИ ДАННЫЕ</div>
        {([["Имя *","text",name,setName],["Телефон *","tel",phone,setPhone]] as const).map(([label,type,val,setVal])=>(
          <div key={label} style={{marginBottom:12}}>
            <div style={{fontSize:9,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:5}}>{label}</div>
            <input type={type} value={val} onChange={e=>(setVal as (v:string)=>void)(e.target.value)} style={{width:"100%",padding:"11px 14px",background:bgCard,border:`1.5px solid ${brd}`,borderRadius:10,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
          </div>
        ))}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:9,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:5}}>АДРЕС ДОСТАВКИ</div>
          <input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Улица, дом, квартира..." style={{width:"100%",padding:"11px 14px",background:bgCard,border:`1.5px solid ${brd}`,borderRadius:10,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:9,letterSpacing:2,color:mutedC,fontWeight:700,marginBottom:5}}>КОММЕНТАРИЙ</div>
          <textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Пожелания..." rows={3} style={{width:"100%",padding:"11px 14px",background:bgCard,border:`1.5px solid ${brd}`,borderRadius:10,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{background:bgCard,borderRadius:14,padding:"14px 16px",border:`1px solid ${brd}`,marginBottom:20}}>
          {totalFood>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:mutedC}}>Еда</span><span style={{fontSize:12}}>{totalFood.toLocaleString("ru-RU")} ₸</span></div>}
          {totalDrinks>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:mutedC}}>Напитки</span><span style={{fontSize:12}}>{totalDrinks.toLocaleString("ru-RU")} ₸</span></div>}
          {discountSushiAmt>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:"#4cff91"}}>Скидка суши+пицца {discountSushi.label}</span><span style={{fontSize:12,color:"#4cff91"}}>−{discountSushiAmt.toLocaleString("ru-RU")} ₸</span></div>}
          {discountOtherAmt>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:"#4cff91"}}>Скидка бургеры/лаваш -10%</span><span style={{fontSize:12,color:"#4cff91"}}>−{discountOtherAmt.toLocaleString("ru-RU")} ₸</span></div>}
          <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:`1px solid ${YELLOW}44`,marginTop:4}}>
            <span style={{fontSize:14,fontWeight:800}}>ИТОГО</span>
            <span style={{fontSize:22,fontWeight:900,color:YELLOW}}>{totalFinal.toLocaleString("ru-RU")} ₸</span>
          </div>
        </div>
        <button onClick={()=>{if(name&&phone)setScreen("confirm");}} style={{width:"100%",background:name&&phone?YELLOW:"#2a2a2a",color:name&&phone?DARK:mutedC,border:"none",padding:16,borderRadius:14,cursor:name&&phone?"pointer":"not-allowed",fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:900,transition:"all 0.2s"}}>
          {!name||!phone?"ЗАПОЛНИТЕ ИМЯ И ТЕЛЕФОН":"ДАЛЕЕ →"}
        </button>
      </div>
    </div>
  );

  // ─── MAIN MENU ───
  const displayMenu = filtered || {[activeTab]: menuData[activeTab]};
  return (
    <div style={{fontFamily:"'Nunito',sans-serif",background:bg,minHeight:"100vh",color:clr,maxWidth:"100vw",overflowX:"hidden"}}>
      <style>{css}</style>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <Header/>

      {/* Модалка товара */}
      {selectedItem&&<ItemModal/>}

      {/* СКИДКИ */}
      <div style={{background:darkMode?"#1a1200":"#fff8e8",borderBottom:`1px solid ${darkMode?"#2a2000":"#ffe0a0"}`,padding:"14px 16px"}}>
        <div style={{maxWidth:700,margin:"0 auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:10}}>
            <div>
              <div style={{fontSize:14,fontWeight:900,color:YELLOW,marginBottom:3}}>
                {discountSushi.pct===35?"Максимальная скидка 35%!":discountSushi.pct===30?"Скидка 30% активна!":discountSushi.pct===20?"Скидка 20% активна!":"Скидки на суши, пиццу и не только!"}
              </div>
              <div style={{fontSize:11,color:darkMode?"#aaa":"#888",lineHeight:1.6}}>
                {discountSushi.pct===35
                  ?"Суши+Пицца: -35% · Бургеры/Лаваш/Крылья: "+(discountOtherAmt>0?"-10% активна":"от 10 000 ₸ -10%")
                  :nextTier
                  ?`Суши+Пицца: ещё ${(nextTier.min-totalSushiPizza).toLocaleString("ru-RU")} ₸ до -${nextTier.label}`
                  :"Суши+Пицца: 6К=-20% · 10К=-30% · 20К=-35%"}
              </div>
              {totalOther>0&&totalOther<10000&&(
                <div style={{fontSize:10,color:"#ffaa00",marginTop:3}}>
                  Бургеры/Лаваш/Крылья: {(10000-totalOther).toLocaleString("ru-RU")} ₸ до скидки -10%
                </div>
              )}
              {discountOtherAmt>0&&(
                <div style={{fontSize:10,color:"#4cff91",marginTop:3}}>
                  Бургеры/Лаваш/Крылья: -10% активна (-{discountOtherAmt.toLocaleString("ru-RU")} ₸)
                </div>
              )}
            </div>
            <div style={{flexShrink:0}}>
              {discountSushi.pct>0?<div style={{fontSize:11,background:"#4cff9122",border:"1px solid #4cff9144",color:"#4cff91",padding:"4px 10px",borderRadius:20,fontWeight:800}}>−{discountAmt.toLocaleString("ru-RU")} ₸</div>:<div style={{fontSize:11,color:mutedC}}>{totalSushiPizza>0?totalFood.toLocaleString("ru-RU"):"—"} / 6 000 ₸</div>}
            </div>
          </div>
          <div style={{background:darkMode?"#2a2a2a":"#e5e5e5",borderRadius:8,height:7,overflow:"hidden",position:"relative"}}>
            <div style={{position:"absolute",left:"30%",top:0,bottom:0,width:1,background:darkMode?"#444":"#ccc"}}/>
            <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:1,background:darkMode?"#444":"#ccc"}}/>
            <div style={{width:`${progress}%`,height:"100%",background:discountSushi.pct>=30?"#4cff91":YELLOW,borderRadius:8,transition:"width 0.35s ease"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
            <span style={{fontSize:9,color:darkMode?"#444":"#bbb",fontWeight:700}}>0</span>
            <span style={{fontSize:9,color:discountSushi.pct>=20?YELLOW:mutedC,fontWeight:700}}>6К −20%</span>
            <span style={{fontSize:9,color:discountSushi.pct>=30?"#4cff91":mutedC,fontWeight:700}}>10К −30%</span>
            <span style={{fontSize:9,color:discountSushi.pct===35?"#4cff91":mutedC,fontWeight:700}}>20К −35%</span>
          </div>
        </div>
      </div>

      {/* ПОИСК */}
      <div style={{maxWidth:700,margin:"0 auto",padding:"12px 16px 0"}}>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:15,color:mutedC}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Найти блюдо..." style={{width:"100%",padding:"10px 36px",background:bgCard,border:`1.5px solid ${brd}`,borderRadius:24,color:clr,fontFamily:"'Nunito',sans-serif",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
          {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:mutedC,cursor:"pointer",fontSize:16}}>×</button>}
        </div>
      </div>

      {/* ТАБЫ */}
      {!search&&(
        <div style={{maxWidth:700,margin:"0 auto",padding:"10px 0 0"}}>
          <div style={{display:"flex",gap:6,overflowX:"auto",WebkitOverflowScrolling:"touch",padding:"0 16px 8px"}}>
            {Object.keys(menuData).map(cat=>(
              <button key={cat} onClick={()=>setActiveTab(cat)} style={{background:activeTab===cat?YELLOW:bgCard,color:activeTab===cat?DARK:mutedC,border:`1.5px solid ${activeTab===cat?YELLOW:brd}`,padding:"7px 14px",borderRadius:20,cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontSize:12,fontWeight:700,whiteSpace:"nowrap",flexShrink:0,transition:"all 0.18s"}}>{cat}</button>
            ))}
          </div>
        </div>
      )}

      {/* СПИСОК БЛЮД */}
      <div style={{maxWidth:700,margin:"0 auto",padding:"8px 16px 160px"}}>
        {Object.entries(displayMenu).map(([cat,items])=>(
          <div key={cat}>
            {search&&<div style={{fontSize:12,fontWeight:800,color:YELLOW,letterSpacing:2,margin:"16px 0 8px"}}>{cat}</div>}
            <div style={{background:bgCard,borderRadius:16,overflow:"hidden",border:`1px solid ${brd}`,marginBottom:16}}>
              {items.map((item,idx)=>{
                const q=order[item.id]||0, isActive=q>0, isHit=HITS.has(item.id), showDiscount=!item.isDrink&&discountSushi.pct>0;
                return (
                  <div key={item.id} onClick={()=>setSelectedItem(item)}
                    style={{display:"flex",alignItems:"center",padding:"10px 16px",borderBottom:idx<items.length-1?`1px solid ${brd}`:"none",gap:10,background:isActive?(darkMode?"#1e1a00":"#fffbe6"):"transparent",transition:"background 0.2s",cursor:"pointer"}}>
                    <div style={{position:"relative",flexShrink:0}}>
                      <img src={item.img} alt={item.name} style={{width:54,height:54,borderRadius:12,objectFit:"cover"}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>
                      {isHit&&<div style={{position:"absolute",top:-4,right:-4,background:"#ff8800",borderRadius:8,padding:"1px 5px",fontSize:8,fontWeight:900,color:"#fff"}}>ХИТ</div>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                        <span style={{fontSize:13,fontWeight:700,color:isActive?clr:darkMode?"#ddd":"#333"}}>{item.name}</span>
                        {item.isDrink&&<span style={{fontSize:9,background:"#1a2a3a",border:"1px solid #2a4a5a",color:"#5ab4e8",padding:"1px 6px",borderRadius:10,fontWeight:700}}>напиток</span>}
                        {showDiscount&&isActive&&<span style={{fontSize:9,background:"#0a2a0a",border:"1px solid #1a4a1a",color:"#4cff91",padding:"1px 6px",borderRadius:10,fontWeight:700}}>−{discountSushi.label}</span>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
                        {item.note&&<span style={{fontSize:10,color:mutedC}}>{item.note}</span>}
                        {item.note&&<span style={{fontSize:10,color:darkMode?"#333":"#ccc"}}>·</span>}
                        {showDiscount?(<><span style={{fontSize:11,color:darkMode?"#444":"#bbb",textDecoration:"line-through"}}>{item.price.toLocaleString("ru-RU")} ₸</span><span style={{fontSize:13,fontWeight:800,color:"#4cff91"}}>{Math.round(item.price*(1-discountSushi.pct/100)).toLocaleString("ru-RU")} ₸</span></>):(<span style={{fontSize:13,fontWeight:800,color:isActive?YELLOW:mutedC}}>{item.price.toLocaleString("ru-RU")} ₸</span>)}
                      </div>
                      {item.desc&&<div style={{fontSize:10,color:mutedC,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.desc}</div>}
                    </div>
                    <Qty item={item}/>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* НИЖНЯЯ ПАНЕЛЬ */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:150,background:`linear-gradient(transparent,${bg} 30%)`,padding:"8px 16px 16px"}}>
        <div style={{maxWidth:700,margin:"0 auto",display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <a href={INSTAGRAM} target="_blank" rel="noreferrer" style={{width:36,height:36,borderRadius:"50%",background:darkMode?"#2a0a1a":"#fff0f5",border:`1px solid ${brd}`,display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none",flexShrink:0}}><IgIcon size={20}/></a>
            <a href={TIKTOK} target="_blank" rel="noreferrer" style={{width:36,height:36,borderRadius:"50%",background:darkMode?"#0a0a0a":"#f0f0f0",border:`1px solid ${brd}`,display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none",flexShrink:0}}><TkIcon size={20}/></a>
            <a href={WA} target="_blank" rel="noreferrer" style={{width:36,height:36,borderRadius:"50%",background:darkMode?"#0a2a0a":"#f0fff4",border:`1px solid ${brd}`,display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none",flexShrink:0}}><WaIcon size={20}/></a>
            <div style={{flex:1}}/>
          </div>
          {cartCount===0?(
            <div style={{textAlign:"center",padding:"11px",background:bgCard,borderRadius:16,border:`1.5px dashed ${brd}`}}>
              <span style={{fontSize:12,color:mutedC,fontWeight:600}}>👆 Нажми на блюдо для деталей · от 6 000 ₸ скидка 20%!</span>
            </div>
          ):(
            <button onClick={()=>{if(isOpen)setScreen("checkout");}} style={{width:"100%",background:isOpen?YELLOW:"#444",color:DARK,border:"none",padding:"13px 20px",borderRadius:16,cursor:isOpen?"pointer":"not-allowed",fontFamily:"'Nunito',sans-serif",fontSize:15,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span>{!isOpen?"😴 Сейчас закрыто":discountSushi.pct>0?`🔥 Оформить со скидкой ${discountSushi.label}!`:"🛒 Оформить заказ"}</span>
              <div style={{textAlign:"right"}}>
                {discountSushi.pct>0&&<div style={{fontSize:10,opacity:0.6,textDecoration:"line-through"}}>{totalRaw.toLocaleString("ru-RU")} ₸</div>}
                <div style={{fontSize:15,fontWeight:900}}>{(totalRaw-discountAmt).toLocaleString("ru-RU")} ₸</div>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
