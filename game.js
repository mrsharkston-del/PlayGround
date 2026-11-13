/* Poker Quest: Medieval Mayhem - Balatro-like poker roguelike */
(function(){
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

let W=0,H=0,dpr=1;
function resize(){
  dpr = Math.min(window.devicePixelRatio||1,2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W*dpr; canvas.height = H*dpr;
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize', resize); resize();

// ---------- Utilities ----------
const suits = ['Swords','Shields','Potions','Skulls'];
const suitColor = {Swords:'#222', Shields:'#1a3a1a', Potions:'#6b1a6b', Skulls:'#8b1a1a'};
const suitSym = {Swords:'♠', Shields:'♣', Potions:'♥', Skulls:'♦'};
// map to classic for readability
const suitGlyph = {Swords:'♠', Shields:'♣', Potions:'♥', Skulls:'♦'};
const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
function rankValue(r){ const i=ranks.indexOf(r); return i+2; } // 2..14
function isFace(r){ return r==='J'||r==='Q'||r==='K'; }
function chipValue(r){ if(r==='A')return 11; if(isFace(r))return 10; return parseInt(r); }

function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function msg(t, dur=1400){ const el=document.getElementById('msg'); el.textContent=t; el.classList.add('show'); clearTimeout(msg._t); msg._t=setTimeout(()=>el.classList.remove('show'),dur); }

// ---------- Card model ----------
function makeCard(suit,rank){
  return {suit,rank,id:Math.random().toString(36).slice(2),enh:'none',ed:'none',seal:'none',debuffed:false,faceDown:false};
}
function newDeck(){
  const d=[];
  for(const s of suits) for(const r of ranks) d.push(makeCard(s,r));
  return shuffle(d);
}

// ---------- Hand evaluation ----------
const handTypes = ['High Card','Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush','Royal Flush'];
const baseChips = {'High Card':5,'Pair':10,'Two Pair':20,'Three of a Kind':30,'Straight':30,'Flush':35,'Full House':40,'Four of a Kind':60,'Straight Flush':100,'Royal Flush':100};
const baseMult = {'High Card':1,'Pair':2,'Two Pair':2,'Three of a Kind':3,'Straight':4,'Flush':4,'Full House':4,'Four of a Kind':7,'Straight Flush':8,'Royal Flush':8};

function evaluateHand(cards, ctx){
  // ctx: {fourFingers, ...}
  const four = ctx && ctx.fourFingers;
  const n = cards.length;
  if(n===0) return null;
  // wild handling: cards with enh wild can be any suit
  // Build list of possible suits/ranks per card
  // For simplicity, evaluate with wilds as flexible: a wild card can adopt any suit/rank to maximize.
  // We'll do a search over wild assignments if few wilds.
  const wilds = cards.filter(c=>c.enh==='wild');
  const nonWild = cards.filter(c=>c.enh!=='wild');

  // Try all suit/rank assignments for wilds? Too many. Simpler: treat wild as matching any suit for flush, and any rank for pairs/straights via duplicate? Balatro wild can be any rank/suit but not duplicate rank? Actually wild card can be any rank/suit. To keep simple, handle flush/straight with wilds heuristically: if wild present, allow flush if (max suit count + wilds) >=5 (for 5 cards) etc. And straights: wilds can fill gaps.
  // Given complexity, implement standard evaluation on non-wild plus wilds as jokers that can become any card. We'll brute force small: enumerate for each wild a candidate from a set of (suit,rank) among existing? Instead, simpler: wildcards count as flexible: for pairs, wilds can match any rank; for flush, wilds any suit; for straight, wilds fill.
  // We'll implement a robust-ish evaluation by dynamic assignment via recursion for up to 2 wilds (max hand 5, wilds rare).
  
  // First, if no wilds, standard.
  function standardEval(cardList){
    // cardList: array of {suit,rank}
    const n=cardList.length;
    const rankCounts={};
    const suitCounts={};
    for(const c of cardList){ rankCounts[c.rank]=(rankCounts[c.rank]||0)+1; suitCounts[c.suit]=(suitCounts[c.suit]||0)+1; }
    const ranksSorted = cardList.map(c=>rankValue(c.rank)).sort((a,b)=>a-b);
    // flush
    let isFlush = Object.values(suitCounts).some(v=>v>=5) || (four && Object.values(suitCounts).some(v=>v>=4) && n>=4);
    // Actually flush requires all 5 same suit. For 4 fingers, 4 cards flush. Handle count threshold by n.
    // For hand with n cards, flush if all same suit and n>=5 (or fourFingers and n>=4)
    const maxSuit = Math.max(...Object.values(suitCounts));
    if(four){ if(maxSuit>=4 && n>=4) isFlush=true; else if(maxSuit<n || maxSuit<5) isFlush = (maxSuit===n && n>=5); }
    else { isFlush = (maxSuit===n && n>=5); }
    // straight
    function isStraight(vals, need){
      const uniq=[...new Set(vals)].sort((a,b)=>a-b);
      // A low straight: A as 1
      let arr=uniq.slice();
      if(arr.includes(14)) arr=[1,...arr];
      // check consecutive run of length need
      let run=1,maxrun=1;
      for(let i=1;i<arr.length;i++){
        if(arr[i]===arr[i-1]+1) run++; else if(arr[i]!==arr[i-1]) run=1;
        maxrun=Math.max(maxrun,run);
      }
      // four fingers: 4 consecutive
      const target = four?4:5;
      if(n<target) return false;
      // need at least target cards forming straight; for n>5, Balatro still straight if 5 subset. We'll check if any 5 consecutive among uniq
      // simpler: maxrun>=target
      return maxrun>=target;
    }
    const need = four?4:5;
    const isStr = isStraight(ranksSorted, need) && n>=need;
    // For hand type determination, if n<5 and not fourFingers, can't be straight/flush/full? Balatro plays up to 5; we enforce <=5 selection, but could play 3 cards -> high/pair/etc. Fine.

    // counts
    const countVals = Object.values(rankCounts).sort((a,b)=>b-a);
    // four of a kind
    let type=null; let scoringRanks=new Set();
    if(countVals[0]>=4){ type='Four of a Kind'; for(const r in rankCounts) if(rankCounts[r]>=4) scoringRanks.add(r); }
    else if(countVals[0]>=3 && countVals[1]>=2){ type='Full House'; scoringRanks=new Set(Object.keys(rankCounts)); }
    else if(isFlush && isStr){ 
      // royal? if ranks include 10,J,Q,K,A
      const royal = [10,11,12,13,14].every(v=>ranksSorted.includes(v));
      type = royal && n>=5 ? 'Royal Flush' : 'Straight Flush';
      scoringRanks=new Set(cards.map(c=>c.rank));
    }
    else if(isFlush){ type='Flush'; scoringRanks=new Set(cards.map(c=>c.rank)); }
    else if(isStr){ type='Straight'; scoringRanks=new Set(cards.map(c=>c.rank)); }
    else if(countVals[0]>=3){ type='Three of a Kind'; for(const r in rankCounts) if(rankCounts[r]>=3) scoringRanks.add(r); }
    else if(countVals[0]>=2 && countVals[1]>=2){ type='Two Pair'; for(const r in rankCounts) if(rankCounts[r]>=2) scoringRanks.add(r); }
    else if(countVals[0]>=2){ type='Pair'; for(const r in rankCounts) if(rankCounts[r]>=2) scoringRanks.add(r); }
    else { type='High Card'; 
      // highest rank
      let maxr = ranksSorted[ranksSorted.length-1];
      // find card rank with that value
      const rc = cardList.find(c=>rankValue(c.rank)===maxr);
      scoringRanks.add(rc.rank);
    }
    // scoring cards
    const scoringCards = cardList.filter(c=>scoringRanks.has(c.rank));
    // For high card only one; for flush/straight all played (already all in scoringRanks? we set all ranks, yes all cards)
    return {type, scoringCards, all:cardList};
  }

  if(wilds.length===0) return standardEval(cards);

  // Wild handling: try assigning each wild to best. Brute force over possible ranks/suits is heavy.
  // Simplified: wilds can be treated as: for flush, they count toward any suit; for straight, fill; for pairs, they can pair with most common rank.
  // We'll implement by trying a set of "candidate" assignments: for each wild, try joining the most common rank or suit.
  // Practical approach: generate a few variants:
  // 1. Pair-focused: wild becomes copy of most frequent rank's suit? 
  // Instead, do recursive search over a limited candidate set of ranks (existing ranks in hand + A) and suits (existing + first).
  const candRanks = [...new Set(cards.map(c=>c.rank))].concat(['A','K','Q']);
  const candSuits = [...new Set(cards.map(c=>c.suit))];
  if(candSuits.length===0) candSuits.push(suits[0]);

  let best=null;
  function rec(i, acc){
    if(i===wilds.length){
      const res = standardEval(acc.concat(nonWild));
      if(!best || rankIndex(res.type)>rankIndex(best.type)) best=res;
      // tie-break by scoring cards count
      return;
    }
    for(const r of candRanks){
      for(const s of candSuits){
        const wc = {suit:s, rank:r};
        rec(i+1, acc.concat([wc]));
      }
    }
  }
  rec(0, []);
  if(!best) best = standardEval(cards.map(c=>({suit:c.suit,rank:c.rank})));
  // Map scoringCards back to original wild cards? They are in acc; standardEval returns card objects from acc+nonWild. Need map to original cards for scoring chips. Wild card itself scores as its assigned? In Balatro wild scores as the card it becomes? Actually wild card retains its rank/suit? Hmm. Simpler: treat original wild card as scoring if included. We'll just mark all wilds as scoring when hand type uses all/their rank. To keep chips, use original card chipValue (wild usually base). We'll return scoringCards as original cards whose rank in scoringRanks OR wild cards (include them). 
  const scSet = new Set(best.scoringCards.map(c=>c.rank));
  const scoringOriginal = cards.filter(c=>{
    if(c.enh==='wild') return true; // wild scores
    return scSet.has(c.rank);
  });
  // But for high card, only one; ensure not too many wilds. Fine.
  return {type:best.type, scoringCards:scoringOriginal, all:cards};
}

function rankIndex(t){ return handTypes.indexOf(t); }

// ---------- Jokers ----------
// Each joker: {id,name,desc,price,rarity,apply(ctx)} 
// ctx fields mutable: chips,mult,xmult; also handType, played, held, G, scoringCards
const jokerDefs = [
 {id:'jolly',name:'Jolly Jester',desc:'+8 Mult if Pair',price:4,apply:ctx=>{ if(['Pair','Two Pair','Three of a Kind','Full House','Four of a Kind'].includes(ctx.handType)) ctx.mult+=8; }},
 {id:'zany',name:'Zany Zany',desc:'+12 Mult if Three of a Kind',price:5,apply:ctx=>{ if(['Three of a Kind','Full House','Four of a Kind'].includes(ctx.handType)) ctx.mult+=12; }},
 {id:'mad',name:'Mad Monk',desc:'+10 Mult if Two Pair',price:5,apply:ctx=>{ if(ctx.handType==='Two Pair') ctx.mult+=10; }},
 {id:'crazy',name:'Crazy Crusader',desc:'+12 Mult if Straight',price:5,apply:ctx=>{ if(ctx.handType.includes('Straight')) ctx.mult+=12; }},
 {id:'droll',name:'Droll Druid',desc:'+10 Mult if Flush',price:5,apply:ctx=>{ if(ctx.handType.includes('Flush')) ctx.mult+=10; }},
 {id:'sly',name:'Sly Squire',desc:'+50 Chips if Pair',price:3,apply:ctx=>{ if(['Pair','Two Pair','Three of a Kind','Full House','Four of a Kind'].includes(ctx.handType)) ctx.chips+=50; }},
 {id:'wily',name:'Wily Wizard',desc:'+100 Chips if Three of a Kind',price:6,apply:ctx=>{ if(['Three of a Kind','Full House','Four of a Kind'].includes(ctx.handType)) ctx.chips+=100; }},
 {id:'clever',name:'Clever Cleric',desc:'+80 Chips if Two Pair',price:4,apply:ctx=>{ if(ctx.handType==='Two Pair') ctx.chips+=80; }},
 {id:'devious',name:'Devious Duke',desc:'+100 Chips if Straight',price:6,apply:ctx=>{ if(ctx.handType.includes('Straight')) ctx.chips+=100; }},
 {id:'crafty',name:'Crafty Cobbler',desc:'+80 Chips if Flush',price:4,apply:ctx=>{ if(ctx.handType.includes('Flush')) ctx.chips+=80; }},
 {id:'greedy',name:'Greedy Goblin',desc:'Scored Diamonds +3 Mult',price:5,suit:'Potions',apply:ctx=>{ for(const c of ctx.scoringCards){ if(c.suit==='Potions') ctx.mult+=3; } }},
 {id:'lusty',name:'Lusty Lich',desc:'Scored Hearts +3 Mult',price:5,suit:'Skulls',apply:ctx=>{ for(const c of ctx.scoringCards){ if(c.suit==='Skulls') ctx.mult+=3; } }}, // flavor mismatch ok
 {id:'wrathful',name:'Wrathful Warlock',desc:'Scored Spades +3 Mult',price:5,suit:'Swords',apply:ctx=>{ for(const c of ctx.scoringCards){ if(c.suit==='Swords') ctx.mult+=3; } }},
 {id:'gluttonous',name:'Gluttonous Giant',desc:'Scored Clubs +3 Mult',price:5,suit:'Shields',apply:ctx=>{ for(const c of ctx.scoringCards){ if(c.suit==='Shields') ctx.mult+=3; } }},
 {id:'half',name:'Half-Pint',desc:'+20 Mult if <=3 cards played',price:5,apply:ctx=>{ if(ctx.played.length<=3) ctx.mult+=20; }},
 {id:'banner',name:'Battle Banner',desc:'+30 Chips per discard left',price:5,apply:ctx=>{ ctx.chips += 30*(G.discardsLeft||0); }},
 {id:'mystic',name:'Mystic Summit',desc:'+15 Mult if 0 discards left',price:5,apply:ctx=>{ if(G.discardsLeft===0) ctx.mult+=15; }},
 {id:'abstract',name:'Abstract Art',desc:'+3 Mult per Joker',price:6,apply:ctx=>{ ctx.mult += 3*G.jokers.length; }},
 {id:'icecream',name:'Ice Cream',desc:'+100 Chips, -5 per hand',price:5, state:{chips:100}, apply:ctx=>{ const j=G.jokers.find(x=>x.id==='icecream'); if(j){ ctx.chips += j.state.chips; j.state.chips=Math.max(0,j.state.chips-5); } }},
 {id:'bluejoker',name:'Blue Bard',desc:'+2 Chips per card in deck',price:5,apply:ctx=>{ ctx.chips += 2*(G.deck?G.deck.length:0); }},
 {id:'greenjoker',name:'Green Goblin',desc:'+1 Mult per hand, -1 per discard',price:5, state:{mult:0}, apply:ctx=>{ const j=G.jokers.find(x=>x.id==='greenjoker'); if(j){ ctx.mult += j.state.mult; } }},
 {id:'square',name:'Square Shield',desc:'+4 Chips if exactly 4 cards',price:4,apply:ctx=>{ if(ctx.played.length===4) ctx.chips+=4; }},
 {id:'fib',name:'Fibonacci',desc:'A,2,3,5,8 give +8 Mult',price:6,apply:ctx=>{ const good=new Set(['A','2','3','5','8']); for(const c of ctx.scoringCards){ if(good.has(c.rank)) ctx.mult+=8; } }},
 {id:'scary',name:'Scary Face',desc:'Face cards +30 Chips',price:5,apply:ctx=>{ for(const c of ctx.scoringCards){ if(isFace(c.rank)) ctx.chips+=30; } }},
 {id:'smiley',name:'Smiley Face',desc:'Face cards +5 Mult',price:4,apply:ctx=>{ for(const c of ctx.scoringCards){ if(isFace(c.rank)) ctx.mult+=5; } }},
 {id:'even',name:'Even Steven',desc:'Even ranks +4 Mult',price:4,apply:ctx=>{ const evens=new Set(['2','4','6','8','10','Q']); for(const c of ctx.scoringCards){ if(evens.has(c.rank)) ctx.mult+=4; } }},
 {id:'oddtodd',name:'Odd Todd',desc:'Odd ranks +31 Chips',price:4,apply:ctx=>{ const odds=new Set(['3','5','7','9','A','J','K']); for(const c of ctx.scoringCards){ if(odds.has(c.rank)) ctx.chips+=31; } }},
 {id:'scholar',name:'Scholar',desc:'Aces +20 Chips +4 Mult',price:4,apply:ctx=>{ for(const c of ctx.scoringCards){ if(c.rank==='A'){ ctx.chips+=20; ctx.mult+=4;} } }},
 {id:'duo',name:'The Duo',desc:'X2 Mult if Pair',price:8,apply:ctx=>{ if(['Pair','Two Pair','Three of a Kind','Full House','Four of a Kind'].includes(ctx.handType)) ctx.xmult*=2; }},
 {id:'trio',name:'The Trio',desc:'X2 Mult if Three of a Kind',price:8,apply:ctx=>{ if(['Three of a Kind','Full House','Four of a Kind'].includes(ctx.handType)) ctx.xmult*=2; }},
 {id:'family',name:'The Family',desc:'X2 Mult if Full House',price:8,apply:ctx=>{ if(ctx.handType==='Full House') ctx.xmult*=2; }},
 {id:'order',name:'The Order',desc:'X2 Mult if Straight',price:8,apply:ctx=>{ if(ctx.handType.includes('Straight')) ctx.xmult*=2; }},
 {id:'tribe',name:'The Tribe',desc:'X2 Mult if Flush',price:8,apply:ctx=>{ if(ctx.handType.includes('Flush')) ctx.xmult*=2; }},
 {id:'arrowhead',name:'Arrowhead',desc:'Scored Spades +50 Chips',price:5,apply:ctx=>{ for(const c of ctx.scoringCards){ if(c.suit==='Swords') ctx.chips+=50; } }},
 {id:'onyx',name:'Onyx Agate',desc:'Scored Clubs +7 Mult',price:5,apply:ctx=>{ for(const c of ctx.scoringCards){ if(c.suit==='Shields') ctx.mult+=7; } }},
 {id:'roughgem',name:'Rough Gem',desc:'Scored Diamonds +$1',price:5,apply:ctx=>{ for(const c of ctx.scoringCards){ if(c.suit==='Potions') G.money+=1; } }},
 {id:'bloodstone',name:'Bloodstone',desc:'Hearts 1 in 3: X1.5 Mult',price:5,apply:ctx=>{ for(const c of ctx.scoringCards){ if(c.suit==='Skulls' && Math.random()<1/3) ctx.xmult*=1.5; } }},
 {id:'gros',name:'Gros Michel',desc:'+15 Mult. 1 in 6 destroyed end of round',price:6, apply:ctx=>{ ctx.mult+=15; }, endRound:()=>{ const j=G.jokers.find(x=>x.id==='gros'); if(j && Math.random()<1/6){ G.jokers=G.jokers.filter(x=>x.id!=='gros'); msg('Gros Michel slipped on a banana!'); } } },
 {id:'supernova',name:'Supernova',desc:'+Mult equal to hand plays',price:5,apply:ctx=>{ ctx.mult += (G.handPlayCounts[ctx.handType]||0); }},
 {id:'ridethebus',name:'Ride the Bus',desc:'+1 Mult per hand without face cards; reset on face',price:5, state:{mult:0}, apply:ctx=>{ const j=G.jokers.find(x=>x.id==='ridethebus'); if(j) ctx.mult += (j.state.mult||0); }},
 {id:'icecream2',name:'Sorcerer Scoop',desc:'+100 Chips, -5 each hand',price:5, state:{chips:100}, apply:ctx=>{ const j=G.jokers.find(x=>x.id==='icecream2'); if(j){ ctx.chips+=j.state.chips; j.state.chips=Math.max(0,j.state.chips-5);} } },
];

// We'll use a curated shop pool (subset)
const shopJokerPool = jokerDefs;

function makeJoker(id){ const def=jokerDefs.find(d=>d.id===id); if(!def) return null; const j=JSON.parse(JSON.stringify(def)); if(def.state) j.state=JSON.parse(JSON.stringify(def.state)); // functions lost! need reattach
  // Reattach apply from def
  j.apply=def.apply; j.endRound=def.endRound;
  return j;
}

// Better: store defs and instantiate by copying data but keeping functions
function instantiateJoker(def){
  const j = {id:def.id,name:def.name,desc:def.desc,price:def.price,rarity:def.rarity,suit:def.suit,state:def.state?JSON.parse(JSON.stringify(def.state)):undefined};
  j.apply = def.apply.bind(null);
  if(def.endRound) j.endRound = def.endRound.bind(null);
  return j;
}

// ---------- Planets ----------
const planetDefs = [
 {id:'pluto',name:'Pluto',hand:'High Card',chips:10,mult:1,price:3},
 {id:'mercury',name:'Mercury',hand:'Pair',chips:15,mult:1,price:3},
 {id:'uranus',name:'Uranus',hand:'Two Pair',chips:20,mult:1,price:3},
 {id:'venus',name:'Venus',hand:'Three of a Kind',chips:20,mult:2,price:3},
 {id:'saturn',name:'Saturn',hand:'Straight',chips:30,mult:3,price:3},
 {id:'jupiter',name:'Jupiter',hand:'Flush',chips:15,mult:2,price:3},
 {id:'earth',name:'Earth',hand:'Full House',chips:25,mult:2,price:3},
 {id:'mars',name:'Mars',hand:'Four of a Kind',chips:30,mult:3,price:3},
 {id:'neptune',name:'Neptune',hand:'Straight Flush',chips:40,mult:4,price:3},
 {id:'planetx',name:'Planet X',hand:'Royal Flush',chips:40,mult:4,price:3},
];

// ---------- Tarots (simple) ----------
const tarotDefs = [
 {id:'magician',name:'The Magician',desc:'Enhance 1 card to Lucky',price:3, target:1, apply:(card)=>{card.enh='lucky';}},
 {id:'empress',name:'The Empress',desc:'Enhance 2 cards to Mult',price:3, target:2, apply:(card)=>{card.enh='mult';}},
 {id:'hierophant',name:'The Hierophant',desc:'Enhance 2 cards to Bonus',price:3, target:2, apply:(card)=>{card.enh='bonus';}},
 {id:'lovers',name:'The Lovers',desc:'Enhance 1 card to Wild',price:3, target:1, apply:(card)=>{card.enh='wild';}},
 {id:'chariot',name:'The Chariot',desc:'Enhance 1 card to Steel',price:3, target:1, apply:(card)=>{card.enh='steel';}},
 {id:'justice',name:'Justice',desc:'Enhance 1 card to Glass',price:3, target:1, apply:(card)=>{card.enh='glass';}},
 {id:'devil',name:'The Devil',desc:'Enhance 1 card to Gold',price:3, target:1, apply:(card)=>{card.enh='gold';}},
 {id:'tower',name:'The Tower',desc:'Enhance 1 card to Stone',price:3, target:1, apply:(card)=>{card.enh='stone';}},
];

// ---------- Vouchers ----------
const voucherDefs = [
 {id:'overstock',name:'Overstock',desc:'+1 shop slot',price:8, apply:()=>{ G.shopSlots++; }},
 {id:'clearance',name:'Clearance Sale',desc:'25% off shop',price:8, apply:()=>{ G.discount=true; }},
 {id:'tarotmerchant',name:'Tarot Merchant',desc:'Tarot cards appear in shop',price:8, apply:()=>{ G.hasTarot=true; }},
 {id:'planetmerchant',name:'Planet Merchant',desc:'Planet cards appear in shop',price:8, apply:()=>{ G.hasPlanet=true; }},
 {id:'seedmoney',name:'Seed Money',desc:'Interest cap +$10',price:8, apply:()=>{ G.interestCap+=10; }},
 {id:'grabber',name:'Grabber',desc:'+1 hand per round',price:8, apply:()=>{ G.baseHands++; }},
 {id:'wasteful',name:'Wasteful',desc:'+1 discard per round',price:8, apply:()=>{ G.baseDiscards++; }},
 {id:'paintbrush',name:'Paint Brush',desc:'+1 hand size',price:8, apply:()=>{ G.handSize++; }},
 {id:'crystalball',name:'Crystal Ball',desc:'+1 consumable slot',price:8, apply:()=>{ G.consSlots++; }},
];

// ---------- Game State ----------
const G = {
  phase:'menu',
  ante:1,
  money:4,
  jokers:[],
  consumables:[],
  vouchers:[],
  ownedVouchers:new Set(),
  handLevels:{},
  handPlayCounts:{},
  deck:[],
  discardPile:[],
  hand:[],
  selected:new Set(),
  discardsLeft:3,
  handsLeft:4,
  baseHands:4,
  baseDiscards:3,
  handSize:8,
  consSlots:2,
  jokerSlots:5,
  shopSlots:2,
  discount:false,
  hasTarot:false,
  hasPlanet:true,
  interestCap:5,
  score:0,
  currentBlind:null, // {name,target,reward,type,bossMod}
  blindIndex:0, // 0 small,1 big,2 boss
  bossMod:null,
  rerollCost:1,
  rerollCount:0,
  targetMode:null, // for consumable
  pendingConsumable:null,
  anims:[],
  floatTexts:[],
  playing:false,
  handTypePlayedThisRound:new Set(),
  handSizeThisRound:8,
};

for(const t of handTypes){ G.handLevels[t]=1; }

function baseChipsFor(type){ return baseChips[type] + (G.handLevels[type]-1)*10; }
function baseMultFor(type){ return baseMult[type] + (G.handLevels[type]-1)*1; }

// ---------- Blinds ----------
function blindTarget(ante, idx){
  // idx 0 small,1 big,2 boss
  const small = Math.round(300*Math.pow(1.8,ante-1));
  const mults=[1,1.5,2];
  return Math.round(small*mults[idx]);
}
const bossMods = [
 {id:'needle',name:'The Needle',desc:'Only 1 hand allowed',apply:()=>{G.handsLeft=1;}},
 {id:'water',name:'The Water',desc:'No discards',apply:()=>{G.discardsLeft=0;}},
 {id:'plant',name:'The Plant',desc:'Face cards debuffed',apply:()=>{}, debuff:(c)=>isFace(c.rank)},
 {id:'manacle',name:'The Manacle',desc:'-1 hand size',apply:()=>{G.handSizeThisRound=Math.max(1,G.handSize-1);}},
 {id:'eye',name:'The Eye',desc:'Cannot repeat hand type',apply:()=>{}, repeat:true},
 {id:'club',name:'The Club',desc:'Clubs debuffed? actually Shields',apply:()=>{}, debuff:(c)=>c.suit==='Shields'},
 {id:'goad',name:'The Goad',desc:'Spades debuffed',apply:()=>{}, debuff:(c)=>c.suit==='Swords'},
 {id:'head',name:'The Head',desc:'Hearts debuffed',apply:()=>{}, debuff:(c)=>c.suit==='Skulls'},
 {id:'window',name:'The Window',desc:'Diamonds debuffed',apply:()=>{}, debuff:(c)=>c.suit==='Potions'},
 {id:'wall',name:'The Wall',desc:'Extra large target, 4 hands',apply:()=>{G.handsLeft=4;}, targetMult:4},
 {id:'wheel',name:'The Wheel',desc:'1 in 7 cards face down',apply:()=>{}},
 {id:'mouth',name:'The Mouth',desc:'Can only play one hand type',apply:()=>{}, repeat:true},
 {id:'fish',name:'The Fish',desc:'Cards drawn face down',apply:()=>{}},
 {id:'arm',name:'The Arm',desc:'Decrease level of played hand',apply:()=>{}, arm:true},
 {id:'ox',name:'The Ox',desc:'Playing most played hand sets money to 0',apply:()=>{}},
 {id:'pillar',name:'The Pillar',desc:'Cards in hand with Enhancements debuffed? skip',apply:()=>{}},
];
function pickBossMod(){ return bossMods[Math.floor(Math.random()*bossMods.length)]; }

function startBlind(){
  G.phase='play';
  const names=['Small Blind','Big Blind','Boss Blind'];
  const idx=G.blindIndex;
  let target=blindTarget(G.ante,idx);
  let bossMod=null;
  if(idx===2){
    bossMod=pickBossMod();
    if(bossMod.targetMult) target*=bossMod.targetMult;
  }
  G.currentBlind={name:names[idx],target,reward: idx===0?3:idx===1?4:5, type:['small','big','boss'][idx], bossMod};
  G.score=0;
  G.discardsLeft=G.baseDiscards;
  G.handsLeft=G.baseHands;
  G.handSizeThisRound=G.handSize;
  G.bossMod=bossMod;
  G.handTypePlayedThisRound=new Set();
  G.playing=true;
  if(bossMod && bossMod.apply) bossMod.apply();
  // debuff setup handled in draw/debuff
  G.deck=newDeck();
  G.discardPile=[];
  G.hand=[];
  drawToHand(G.handSizeThisRound);
  applyDebuffs();
  msg(G.currentBlind.name+' — target '+target);
}

function drawToHand(n){
  while(G.hand.length < n && (G.deck.length>0 || G.discardPile.length>0)){
    if(G.deck.length===0){ G.deck=shuffle(G.discardPile.slice()); G.discardPile=[]; }
    const c=G.deck.pop();
    G.hand.push(c);
  }
}

function applyDebuffs(){
  const bm=G.bossMod;
  if(!bm) return;
  if(bm.debuff){ for(const c of G.hand){ c.debuffed = bm.debuff(c); } }
  if(bm.id==='wheel'){ for(const c of G.hand){ if(Math.random()<1/7) c.faceDown=true; } }
  if(bm.id==='fish'){ for(const c of G.hand){ c.faceDown=true; } }
}

// ---------- Scoring ----------
function cardChips(c){
  if(c.enh==='stone') return 50;
  if(c.enh==='bonus') return chipValue(c.rank)+30;
  return chipValue(c.rank);
}
function cardMult(c){
  if(c.enh==='mult') return 4; // +mult? Balatro +4 mult
  return 0;
}

function scorePlayed(playedCards){
  // debuff boss
  const ctxPlay = playedCards.map(c=>({...c}));
  // debuffed cards contribute 0 chips/mult but count for hand type? In Balatro debuffed cards don't score chips but still count for hand. We'll evaluate hand type using all played (including debuffed) but scoringCards excludes debuffed? Actually debuffed scoring cards score 0. We'll handle: scoringCards filtered to non-debuffed for chip contribution, but hand type evaluation uses all.
  const fourFingers = G.jokers.some(j=>j.id==='fourfingers');
  const evalRes = evaluateHand(playedCards, {fourFingers});
  const handType = evalRes.type;
  // check boss repeat
  if(G.bossMod && G.bossMod.repeat){
    if(G.handTypePlayedThisRound.has(handType)){
      msg('Cannot repeat hand type!'); return null;
    }
  }
  // check arm: decrease level
  // base
  let chips = baseChipsFor(handType);
  let mult = baseMultFor(handType);
  // card chips
  const scoringSet = new Set(evalRes.scoringCards.map(c=>c.id));
  for(const c of playedCards){
    if(c.debuffed) continue;
    if(!scoringSet.has(c.id)) continue;
    if(c.enh==='stone'){ chips += 50; continue; } // stone no rank
    if(c.enh!=='wild') chips += chipValue(c.rank);
    if(c.enh==='bonus') chips += 30;
    if(c.enh==='mult') mult += 4;
    if(c.enh==='lucky'){ if(Math.random()<1/5) mult+=20; if(Math.random()<1/15){ G.money+=20; msg('Lucky! +$20'); } }
    if(c.enh==='gold'){ /* gold gives $3 if held at end of round; scoring no */ }
    if(c.seal==='red') { /* retrigger handled separately */ }
  }
  // steel held cards: X1.5 mult per steel in hand (not played) - apply later
  // jokers
  const ctx = {
    handType, played:playedCards, held:G.hand.filter(c=>!playedCards.includes(c)),
    scoringCards: playedCards.filter(c=>scoringSet.has(c.id) && !c.debuffed),
    chips, mult, xmult:1,
  };
  // evaluate jokers
  for(const j of G.jokers){
    try { j.apply(ctx); } catch(e){ console.error(e); }
  }
  // steel in hand: x1.5 each
  for(const c of ctx.held){
    if(c.enh==='steel' && !c.debuffed) ctx.xmult*=1.5;
  }
  // glass: X2 mult but breaks (remove card from deck? just mark; simpler remove from game)
  for(const c of ctx.scoringCards){
    if(c.enh==='glass'){ ctx.xmult*=2; c._break=true; }
  }
  chips = ctx.chips; mult=ctx.mult; let xmult=ctx.xmult;
  const total = Math.round(chips*mult*xmult);
  // record
  G.handPlayCounts[handType]=(G.handPlayCounts[handType]||0)+1;
  if(G.ridethebusState!==undefined){}
  // ride the bus logic
  const ride = G.jokers.find(j=>j.id==='ridethebus');
  if(ride){
    const hasFace = playedCards.some(c=>isFace(c.rank));
    if(hasFace){ ride.state.mult=0; }
    else { ride.state.mult += 1; }
  }
  // green joker logic
  const green = G.jokers.find(j=>j.id==='greenjoker');
  if(green){ green.state.mult = (green.state.mult||0)+1; }
  // ice cream decrement handled in apply already
  // gros end round handled later
  // business card money
  // (implement simple: face cards 1 in 2 give $2)
  const biz = G.jokers.find(j=>j.id==='businesscard');
  if(biz){ for(const c of ctx.scoringCards){ if(isFace(c.rank) && Math.random()<0.5){ G.money+=2; } } }
  // rough gem money
  // arrowhead etc already in jokers list? arrowhead/onyx included as jokers yes.
  // gold: $3 per gold card held at end of round? We'll give now $3 per scored gold? Balatro gold gives $3 when scored. 
  for(const c of ctx.scoringCards){ if(c.enh==='gold'){ G.money+=3; } }
  // discard glass broken cards
  for(const c of playedCards){ if(c._break){ /* remove from hand? already played to discard; mark not reusable? we'll just leave */ } }
  // ox: if played most played hand, money=0
  const ox = G.jokers.find(j=>j.id==='ox');
  if(ox){
    // find most played hand type
    let max=0,maxt=null; for(const t in G.handPlayCounts){ if(G.handPlayCounts[t]>max){max=G.handPlayCounts[t];maxt=t;} }
    if(maxt===handType){ G.money=0; msg('The Ox gores your wallet!'); }
  }
  // arm: decrease level of played hand
  if(G.bossMod && G.bossMod.id==='arm'){
    if(G.handLevels[handType]>1) G.handLevels[handType]--;
  }
  return {handType, chips, mult, xmult, total, scoringCards:ctx.scoringCards};
}

// ---------- Animations ----------
function addFloat(x,y,text,color='#ffe9b0'){
  G.floatTexts.push({x,y,text,color,life:1});
}
function animateScore(playedCards, res){
  // move played cards to discard after
  G.score += res.total;
  G.handsLeft--;
  if(G.bossMod && G.bossMod.id==='eye'){ G.handTypePlayedThisRound.add(res.handType); }
  // green joker decrement on discard? green loses mult per discard, not hand. fine.
  // money interest? at end of round
  // discards played cards
  for(const c of playedCards){
    G.discardPile.push(c);
  }
  G.hand = G.hand.filter(c=>!playedCards.includes(c));
  // draw back to hand size
  drawToHand(G.handSizeThisRound);
  applyDebuffsPostDraw();
  // glass break removal already in discard; remove broken from discard? skip
  // end round check
  checkBlindEnd();
}

function applyDebuffsPostDraw(){
  const bm=G.bossMod;
  if(bm && bm.debuff){
    for(const c of G.hand){ if(c.debuffed===undefined) c.debuffed=false; c.debuffed = bm.debuff(c); }
  }
  if(bm && (bm.id==='wheel'||bm.id==='fish')){
    for(const c of G.hand){ if(Math.random()< (bm.id==='wheel'?1/7:1)) c.faceDown=true; else c.faceDown=false; }
  }
}

function checkBlindEnd(){
  if(G.score >= G.currentBlind.target){
    // win blind
    winBlind();
  } else if(G.handsLeft<=0){
    // lose if score<target
    if(G.score < G.currentBlind.target){
      gameOver();
    } else winBlind();
  }
}

function winBlind(){
  G.playing=false;
  // money reward
  G.money += G.currentBlind.reward;
  // interest
  const interest = Math.min(Math.floor(G.money/5), G.interestCap/5? G.interestCap :5);
  // Balatro interest: $1 per $5, max $5 (+vouchers). We'll do min(floor(money/5),5) plus voucher cap/5
  const cap = G.interestCap; // dollars cap? We'll treat cap as max interest dollars
  const interestDollars = Math.min(Math.floor(G.money/5), cap);
  G.money += interestDollars;
  // gros end round
  for(const j of [...G.jokers]) if(j.endRound) j.endRound();
  // green joker: -1 per discard left? Balatro green: -1 mult per discard remaining? Actually green joker +1 per hand, -1 per discard. We tracked discards? We'll subtract remaining discards
  const green = G.jokers.find(j=>j.id==='greenjoker');
  if(green){ green.state.mult = Math.max(0,(green.state.mult||0) - G.discardsLeft); }
  // ice cream already decremented per hand
  // move to next blind
  G.blindIndex++;
  if(G.blindIndex>2){
    G.blindIndex=0;
    G.ante++;
    if(G.ante>8){ winGame(); return; }
  }
  // open shop
  openShop();
}

function gameOver(){
  G.phase='gameover';
  G.playing=false;
  const goMsgs=['The dragon ate your poker chips.','Your jester tripped on a banana.','The king demands a rematch.','Even the bard is laughing.','Better luck in the next life.'];
  showOverlay('Game Over', goMsgs[Math.floor(Math.random()*goMsgs.length)]+' Ante '+G.ante+'. Score '+G.score+'/'+G.currentBlind.target,'Restart');
}

function winGame(){
  G.phase='win';
  G.playing=false;
  showOverlay('Victory!','You conquered all 8 antes! The kingdom is yours. Gold, glory, and a very confused dragon.','Play Again');
}

function showOverlay(title,desc,btn){
  const o=document.getElementById('overlay');
  o.style.display='flex';
  o.innerHTML=`<div class="box panel"><h1>${title}</h1><p>${desc}</p><button class="btn" id="startbtn" style="margin-top:12px">${btn}</button></div>`;
  document.getElementById('startbtn').onclick=()=>{ o.style.display='none'; resetRun(); startBlind(); };
}

function resetRun(){
  G.ante=1; G.money=4; G.jokers=[]; G.consumables=[]; G.vouchers=[]; G.ownedVouchers=new Set();
  for(const t of handTypes) G.handLevels[t]=1;
  G.handPlayCounts={};
  G.baseHands=4; G.baseDiscards=3; G.handSize=8; G.consSlots=2; G.jokerSlots=5; G.shopSlots=2; G.discount=false; G.hasTarot=false; G.hasPlanet=true; G.interestCap=5; G.rerollCost=1; G.rerollCount=0; G.blindIndex=0; G.phase='play';
  G.selected=new Set();
}

// ---------- Shop ----------
function priceOf(p){ return G.discount ? Math.ceil(p*0.75) : p; }
function openShop(){
  G.phase='shop';
  const shop=document.getElementById('shop');
  shop.style.display='flex';
  document.getElementById('shopmoney').textContent='Money: $'+G.money;
  document.getElementById('rerollcost').textContent=G.rerollCost;
  buildShop();
}
function buildShop(){
  const container=document.getElementById('shopitems');
  container.innerHTML='';
  const items=[];
  // jokers
  for(let i=0;i<G.shopSlots;i++){
    const def = shopJokerPool[Math.floor(Math.random()*shopJokerPool.length)];
    items.push({type:'joker', def, price:def.price});
  }
  // planets
  if(G.hasPlanet){
    for(let i=0;i<1;i++){
      const p = planetDefs[Math.floor(Math.random()*planetDefs.length)];
      items.push({type:'planet', def:p, price:p.price});
    }
  }
  // tarot
  if(G.hasTarot){
    const t = tarotDefs[Math.floor(Math.random()*tarotDefs.length)];
    items.push({type:'tarot', def:t, price:t.price});
  }
  // voucher
  const unowned = voucherDefs.filter(v=>!G.ownedVouchers.has(v.id));
  if(unowned.length){
    const v = unowned[Math.floor(Math.random()*unowned.length)];
    items.push({type:'voucher', def:v, price:v.price});
  }
  // packs? skip
  for(const it of items){
    const div=document.createElement('div');
    div.className='carditem';
    const nm = it.def.name; const desc = it.def.desc || (it.def.hand? 'Level up '+it.def.hand:'');
    const pr = priceOf(it.price);
    div.innerHTML=`<h4>${nm}</h4><p>${desc}</p><p style="color:#d4a017;font-weight:700">$${pr}</p><button class="btn" style="width:100%">Buy</button>`;
    div.querySelector('button').onclick=()=>buyItem(it,pr);
    container.appendChild(div);
  }
}
function buyItem(it,pr){
  if(G.money<pr){ msg('Not enough money'); return; }
  if(it.type==='joker'){
    if(G.jokers.length>=G.jokerSlots){ msg('Joker slots full'); return; }
    G.money-=pr;
    G.jokers.push(instantiateJoker(it.def));
    msg('Bought '+it.def.name);
  } else if(it.type==='planet'){
    G.money-=pr;
    G.handLevels[it.def.hand]=(G.handLevels[it.def.hand]||1)+1;
    msg(it.def.hand+' leveled up!');
  } else if(it.type==='tarot'){
    if(G.consumables.length>=G.consSlots){ msg('Consumable slots full'); return; }
    G.money-=pr;
    G.consumables.push(JSON.parse(JSON.stringify(it.def)));
    msg('Bought '+it.def.name);
  } else if(it.type==='voucher'){
    G.money-=pr;
    G.ownedVouchers.add(it.def.id);
    it.def.apply();
    msg('Voucher: '+it.def.name);
  }
  document.getElementById('shopmoney').textContent='Money: $'+G.money;
  // remove item? rebuild
  buildShop();
}
document.getElementById('reroll').onclick=()=>{
  const c=G.rerollCost;
  if(G.money<c){ msg('Not enough money'); return; }
  G.money-=c; G.rerollCost+=1; G.rerollCount++;
  document.getElementById('shopmoney').textContent='Money: $'+G.money;
  document.getElementById('rerollcost').textContent=G.rerollCost;
  buildShop();
};
document.getElementById('leaveshop').onclick=()=>{
  document.getElementById('shop').style.display='none';
  // next blind
  if(G.ante>8){ winGame(); return; }
  startBlind();
};

// ---------- Input handling ----------
// Map click to card index
function getCardRects(){
  // returns array of {x,y,w,h,card,index,area}
  const rects=[];
  const handY = H*0.78;
  const cardW = Math.min(90, W/9);
  const cardH = cardW*1.4;
  const total = G.hand.length;
  const spacing = Math.min(cardW*0.75, (W*0.9)/Math.max(1,total));
  const startX = (W - (total-1)*spacing - cardW)/2;
  for(let i=0;i<total;i++){
    const c=G.hand[i];
    const selected = G.selected.has(i);
    const lift = selected? -28 : 0;
    const rot = (i - (total-1)/2)*0.05;
    const arcY = Math.abs(rot)*30;
    rects.push({x:startX+i*spacing, y:handY+lift+arcY, w:cardW, h:cardH, card:c, index:i, area:'hand', rot});
  }
  return rects;
}

let hoverIdx=-1;
canvas.addEventListener('mousemove', e=>{
  const r=getCardRects();
  hoverIdx=-1;
  for(const rc of r){
    if(e.offsetX>=rc.x && e.offsetX<=rc.x+rc.w && e.offsetY>=rc.y && e.offsetY<=rc.y+rc.h){ hoverIdx=rc.index; }
  }
});
function handlePointer(px,py){
  if(G.phase!=='play' || !G.playing) return;
  if(G.targetMode){
    const r=getCardRects();
    for(const rc of r){
      if(px>=rc.x && px<=rc.x+rc.w && py>=rc.y && py<=rc.y+rc.h){
        applyConsumableToCard(rc.index);
        return;
      }
    }
    msg('Tap a card');
    return;
  }
  const r=getCardRects();
  for(const rc of r){
    if(px>=rc.x && px<=rc.x+rc.w && py>=rc.y && py<=rc.y+rc.h){
      toggleSelect(rc.index);
      return;
    }
  }
}
canvas.addEventListener('click', e=>handlePointer(e.offsetX,e.offsetY));
canvas.addEventListener('touchend', e=>{
  const t=e.changedTouches[0];
  const rect=canvas.getBoundingClientRect();
  handlePointer(t.clientX-rect.left, t.clientY-rect.top);
  e.preventDefault();
}, {passive:false});

function toggleSelect(i){
  if(G.selected.has(i)) G.selected.delete(i);
  else {
    if(G.selected.size>=5){ msg('Max 5 cards'); return; }
    G.selected.add(i);
  }
}

// Buttons in topbar
function buildTopbar(){
  const tb=document.getElementById('topbar');
  tb.innerHTML='';
  const chips = (label)=>{ const d=document.createElement('div'); d.className='chip'; d.textContent=label; return d; };
  tb.appendChild(chips('Ante '+G.ante));
  tb.appendChild(chips(G.currentBlind?G.currentBlind.name:''));
  tb.appendChild(chips('Score '+G.score+'/'+(G.currentBlind?G.currentBlind.target:0)));
  tb.appendChild(chips('Hands '+G.handsLeft));
  tb.appendChild(chips('Discards '+G.discardsLeft));
  tb.appendChild(chips('$'+G.money));
  // action buttons
  const play=document.createElement('button'); play.className='btn'; play.textContent='Play Hand'; play.onclick=playHand; tb.appendChild(play);
  const disc=document.createElement('button'); disc.className='btn secondary'; disc.textContent='Discard'; disc.onclick=discardSelected; tb.appendChild(disc);
  const sort=document.createElement('button'); sort.className='btn secondary'; sort.textContent='Sort'; sort.onclick=sortHand; tb.appendChild(sort);
  // jokers display
  // consumables
  if(G.consumables.length){
    for(let i=0;i<G.consumables.length;i++){
      const c=G.consumables[i];
      const b=document.createElement('button'); b.className='btn secondary'; b.textContent=c.name; b.onclick=()=>useConsumable(i); tb.appendChild(b);
    }
  }
  // joker sell buttons small
  for(let i=0;i<G.jokers.length;i++){
    const j=G.jokers[i];
    const b=document.createElement('button'); b.className='btn secondary'; b.style.fontSize='11px'; b.textContent=j.name+' ($'+Math.floor(j.price/2)+')'; b.onclick=()=>{ G.money+=Math.floor(j.price/2); G.jokers.splice(i,1); msg('Sold '+j.name); buildTopbar(); }; tb.appendChild(b);
  }
}
function sortHand(){
  const order={rank:0};
  G.hand.sort((a,b)=>rankValue(a.rank)-rankValue(b.rank) || suits.indexOf(a.suit)-suits.indexOf(b.suit));
  G.selected.clear();
}

function playHand(){
  if(!G.playing) return;
  if(G.selected.size===0){ msg('Select cards'); return; }
  const played = [...G.selected].sort((a,b)=>a-b).map(i=>G.hand[i]);
  // debuff check: stone etc ok
  // boss: manacle already
  // evaluate
  const res = scorePlayed(played);
  if(!res){ 
    // invalid (repeat hand type) 
    return; 
  }
  // handle glass break: remove broken cards from future? they go to discard; mark them so they aren't redrawn? Balatro glass breaks and is destroyed. We'll remove from discard pile.
  const broken = played.filter(c=>c._break);
  // remove broken from discard later: we push all played then filter discardPile
  // animate
  G.floatTexts.push({x:W/2,y:H*0.4,text:res.handType+'! +'+res.total,color:'#ffe9b0',life:1.5});
  // apply score
  G.score += res.total;
  // remove glass broken from discard: don't push them
  for(const c of played){
    if(!c._break) G.discardPile.push(c);
  }
  G.hand = G.hand.filter(c=>!played.includes(c));
  G.handsLeft--;
  if(G.bossMod && G.bossMod.id==='eye'){ G.handTypePlayedThisRound.add(res.handType); }
  // ride the bus state already
  // draw
  drawToHand(G.handSizeThisRound);
  applyDebuffsPostDraw();
  G.selected.clear();
  // check end
  checkBlindEnd();
  buildTopbar();
}

function discardSelected(){
  if(!G.playing) return;
  if(G.discardsLeft<=0){ msg('No discards left'); return; }
  if(G.selected.size===0){ msg('Select cards'); return; }
  const played=[...G.selected].sort((a,b)=>a-b).map(i=>G.hand[i]);
  // green joker -1 per discard? Balatro green loses 1 mult per discard. We'll decrement green state by number discarded? Actually green: +1 mult per hand, -1 per discard. We'll subtract played.length? Balatro subtracts 1 per discard action. Do 1.
  const green=G.jokers.find(j=>j.id==='greenjoker');
  if(green){ green.state.mult=Math.max(0,(green.state.mult||0)-1); }
  for(const c of played) G.discardPile.push(c);
  G.hand=G.hand.filter(c=>!played.includes(c));
  G.discardsLeft--;
  drawToHand(G.handSizeThisRound);
  applyDebuffsPostDraw();
  G.selected.clear();
  buildTopbar();
}

function useConsumable(i){
  const c=G.consumables[i];
  if(c.target){
    G.targetMode={...c, remaining:c.target, idx:i};
    msg('Click '+c.target+' card(s) to enhance');
  }
}
function applyConsumableToCard(idx){
  const t=G.targetMode;
  const c=G.consumables[t.idx];
  const card=G.hand[idx];
  c.apply(card);
  t.remaining--;
  if(t.remaining<=0){
    G.consumables.splice(t.idx,1);
    G.targetMode=null;
    msg('Enhanced!');
  } else {
    G.targetMode.remaining=t.remaining;
    msg('Click '+(t.remaining)+' more card(s)');
  }
  buildTopbar();
}

// ---------- Rendering ----------
function drawCard(x,y,w,h,card,opts={}){
  const rot = opts.rot||0;
  ctx.save();
  if(rot){ ctx.translate(x+w/2,y+h/2); ctx.rotate(rot); ctx.translate(-w/2,-h/2); x=0; y=0; }
  // fake 3D: shadow
  // shadow
  ctx.fillStyle='rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x+w/2,y+h+4,w*0.45,6,0,0,Math.PI*2);
  ctx.fill();
  // card body
  const r=8;
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
  // background
  if(card.faceDown){
    ctx.fillStyle='#3a2a6a';
  } else {
    ctx.fillStyle='#f5ecd9';
  }
  ctx.fill();
  ctx.strokeStyle='#8b6a2a'; ctx.lineWidth=1.5; ctx.stroke();
  // enhancement tint
  if(card.enh && card.enh!=='none'){
    const tints={bonus:'#ffe08a',mult:'#ff9a9a',wild:'#c9a8ff',glass:'#a8e0ff',steel:'#b0b0b0',stone:'#888',lucky:'#ffe9b0',gold:'#ffd700'};
    ctx.fillStyle=tints[card.enh]||'rgba(255,255,255,0.2)';
    ctx.globalAlpha=0.25; ctx.fill(); ctx.globalAlpha=1;
  }
  if(card.debuffed){
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fill();
  }
  if(!card.faceDown){
    // rank & suit
    const col = (card.suit==='Potions'||card.suit==='Skulls') ? '#8b1a1a' : '#1a1a1a';
    ctx.fillStyle=col;
    ctx.font='bold '+Math.round(w*0.28)+'px serif';
    ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.fillText(card.rank, x+6, y+4);
    ctx.font=Math.round(w*0.22)+'px serif';
    ctx.fillText(suitGlyph[card.suit], x+6, y+4+Math.round(w*0.28));
    // center big suit
    ctx.font='bold '+Math.round(w*0.45)+'px serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.globalAlpha=0.85;
    ctx.fillText(suitGlyph[card.suit], x+w/2, y+h/2);
    ctx.globalAlpha=1;
    // bottom right
    ctx.font='bold '+Math.round(w*0.22)+'px serif';
    ctx.textAlign='right'; ctx.textBaseline='bottom';
    ctx.fillText(card.rank, x+w-6, y+h-4);
  } else {
    // pattern
    ctx.fillStyle='rgba(255,255,255,0.15)';
    for(let i=0;i<4;i++){
      ctx.fillRect(x+8+i* (w-16)/4, y+8, (w-16)/4-2, h-16);
    }
  }
  // seal dot
  if(card.seal && card.seal!=='none'){
    ctx.fillStyle='#d4a017';
    ctx.beginPath(); ctx.arc(x+w-10,y+10,4,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function render(){
  ctx.clearRect(0,0,W,H);
  // background table
  const grad=ctx.createRadialGradient(W/2,H/2,50,W/2,H/2,Math.max(W,H));
  grad.addColorStop(0,'#3a2410'); grad.addColorStop(1,'#120804');
  ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
  // wood planks
  ctx.strokeStyle='rgba(0,0,0,0.2)'; ctx.lineWidth=1;
  for(let i=0;i<8;i++){ ctx.beginPath(); ctx.moveTo(0,i*H/8); ctx.lineTo(W,i*H/8); ctx.stroke(); }

  if(G.phase==='menu') return;

  // scoring area
  ctx.fillStyle='rgba(0,0,0,0.25)';
  ctx.fillRect(W*0.15,H*0.25,W*0.7,H*0.25);
  ctx.strokeStyle='rgba(107,74,26,0.5)'; ctx.strokeRect(W*0.15,H*0.25,W*0.7,H*0.25);
  ctx.fillStyle='#c9a878'; ctx.font='14px sans-serif'; ctx.textAlign='center';
  ctx.fillText('Play area', W/2, H*0.23);

  // jokers row (top)
  const jw=Math.min(70,W/8), jh=jw*1.2;
  const jstart=(W - G.jokers.length*jw*1.1)/2;
  for(let i=0;i<G.jokers.length;i++){
    const j=G.jokers[i];
    const x=jstart+i*jw*1.1, y=H*0.06;
    ctx.fillStyle='#2a1a0a'; ctx.strokeStyle='#6b4a1a'; ctx.lineWidth=1.5;
    ctx.fillRect(x,y,jw,jh); ctx.strokeRect(x,y,jw,jh);
    ctx.fillStyle='#ffe9b0'; ctx.font='bold 10px sans-serif'; ctx.textAlign='center';
    ctx.fillText(j.name.slice(0,10), x+jw/2, y+14);
    ctx.font='9px sans-serif'; ctx.fillStyle='#c9a878';
    // wrap desc roughly
    ctx.fillText(j.desc.slice(0,16), x+jw/2, y+jh/2);
  }

  // hand
  const rects=getCardRects();
  for(const rc of rects){
    const sel=G.selected.has(rc.index);
    if(sel){
      ctx.shadowColor='rgba(212,160,23,0.8)'; ctx.shadowBlur=12;
    }
    drawCard(rc.x,rc.y,rc.w,rc.h,rc.card,{rot:rc.rot});
    ctx.shadowBlur=0;
    if(hoverIdx===rc.index){
      ctx.strokeStyle='rgba(255,255,255,0.4)'; ctx.lineWidth=2; ctx.strokeRect(rc.x-2,rc.y-2,rc.w+4,rc.h+4);
    }
  }

  // float texts
  for(let i=G.floatTexts.length-1;i>=0;i--){
    const f=G.floatTexts[i];
    f.life -= 0.016;
    f.y -= 0.6;
    if(f.life<=0){ G.floatTexts.splice(i,1); continue; }
    ctx.globalAlpha=Math.max(0,f.life);
    ctx.fillStyle=f.color; ctx.font='bold 22px sans-serif'; ctx.textAlign='center';
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha=1;
  }

  // target mode hint
  if(G.targetMode){
    ctx.fillStyle='rgba(255,233,176,0.9)'; ctx.font='bold 16px sans-serif'; ctx.textAlign='center';
    ctx.fillText('Click a card to enhance', W/2, H*0.62);
  }
}

let last=performance.now();
function loop(now){
  const dt=now-last; last=now;
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- Start ----------
document.getElementById('startbtn').onclick=()=>{
  document.getElementById('overlay').style.display='none';
  resetRun(); startBlind();
};
document.getElementById('startbtn')?.click;

// initial
// no auto start
window.G=G; window.bossMods=bossMods; window.isFace=isFace; window.rankValue=rankValue; window.playHand=playHand; window.discardSelected=discardSelected; window.winBlind=winBlind; window.useConsumable=useConsumable; window.buildShop=buildShop; window.openShop=openShop; window.applyConsumableToCard=applyConsumableToCard; window.drawToHand=drawToHand; window.applyDebuffs=applyDebuffs; window.gameOver=gameOver; window.resetRun=resetRun; window.jokerDefs=jokerDefs; window.tarotDefs=tarotDefs; window.planetDefs=planetDefs; window.voucherDefs=voucherDefs; window.instantiateJoker=instantiateJoker; window.winGame=winGame; window.startBlind=startBlind; window.checkBlindEnd=checkBlindEnd; 
})();
