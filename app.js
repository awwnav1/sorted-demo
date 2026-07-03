/* Family planner - data bundled in data.js, shared state via /api/state */
/* 2026-07-02: merged Month into Week and Kitchen into Recipes, quick capture on Today,
   review nudge, plan B, horizon list, brain dump in review, baby autosave, safer reset */
(function() {
  'use strict';

  var D = window.PLANNER_DATA || {};
  var WEEK = D.week,
    RECIPES = D.recipes || [],
    SHOPPING = D.shopping || [];
  var FREEZER = D.freezer || {
      items: []
    },
    EXPOSURES = D.exposures || {
      foods: []
    },
    STAPLES = D.staples || [];
  var STOCK = D.stock || {
    ingredients: [],
    snacks: [],
    household: []
  };
  var CAL = D.calendar || {
    events: []
  };
  var HORIZON = D.horizon || [];
  var state = {
    shop: {},
    customShop: [],
    nextList: [],
    actions: {},
    tasks: [],
    logistics: {},
    reactions: {},
    staples: {},
    review: {},
    seededWeeks: {},
    remindersDone: {},
    paymentsDone: {},
    rolledWeek: null,
    removedStock: {},
    baby: {},
    babyTodo: null,
    shoppingVersion: null
  };
  var remote = false,
    saveTimer = null;
  var calRef = null,
    editingTask = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function el(id) {
    return document.getElementById(id);
  }

  function todayISO() {
    var n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  }

  function addDays(iso, k) {
    var d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + k);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function linkify(title, recipe) {
    return recipe ? '<span class="recipe-link" data-recipe="' + esc(recipe) + '">' + esc(title) + '</span>' : esc(title);
  }

  function fmtNice(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  /* ---------- rotating banner quote ---------- */
  var QUOTES = [
    'Ready to take on the day',
    'Let’s win the week',
    'One day at a time, you’ve got this',
    'Small steps, big week',
    'Make today count',
    'Calm, organised, ready',
    'A fresh start every morning',
    'You are doing a brilliant job',
    'Steady and sorted',
    'Today is a good day to begin',
    'Progress, not perfection',
    'Deep breath — you’ve got this',
    'Plan the work, then work the plan',
    'Little and often wins'
  ];

  function pickQuote() {
    var n = new Date();
    var dayNum = Math.floor((n - new Date(n.getFullYear(), 0, 0)) / 86400000);
    return QUOTES[dayNum % QUOTES.length];
  }

  /* ---------- baby age + developmental milestones (CDC) ---------- */
  function ageParts(dobISO, todayIso) {
    var dob = new Date(dobISO + 'T12:00:00');
    var n = new Date(todayIso + 'T12:00:00');
    var months = (n.getFullYear() - dob.getFullYear()) * 12 + (n.getMonth() - dob.getMonth());
    var anchor = new Date(dob);
    anchor.setMonth(dob.getMonth() + months);
    if (n < anchor) {
      months--;
      anchor = new Date(dob);
      anchor.setMonth(dob.getMonth() + months);
    }
    var weeks = Math.floor((n - anchor) / (7 * 86400000));
    return {
      months: months,
      weeks: weeks
    };
  }

  function ageLabel(p) {
    if (p.months < 12) {
      var m = p.months + ' month' + (p.months === 1 ? '' : 's');
      var w = p.weeks + ' week' + (p.weeks === 1 ? '' : 's');
      return m + ', ' + w;
    }
    var yrs = Math.floor(p.months / 12);
    var rem = p.months % 12;
    var ys = yrs + ' year' + (yrs === 1 ? '' : 's');
    return rem ? ys + ', ' + rem + ' month' + (rem === 1 ? '' : 's') : ys;
  }

  function monthsAfter(dobISO, k) {
    var d = new Date(dobISO + 'T12:00:00');
    d.setMonth(d.getMonth() + k);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Source: CDC "Learn the Signs. Act Early." milestone checklists (reviewed May 2026).
  var MILESTONES = [{
    upTo: 9,
    label: '9 months',
    url: 'https://www.cdc.gov/act-early/milestones/9-months.html',
    groups: [
      ['Social and emotional', ['Is shy, clingy or fearful around strangers', 'Shows several facial expressions, like happy, sad, angry and surprised', 'Looks when you call his name', 'Reacts when you leave (looks, reaches for you or cries)', 'Smiles or laughs when you play peek-a-boo']],
      ['Language and communication', ['Makes a lot of different sounds like “mamama” and “babababa”', 'Lifts arms up to be picked up']],
      ['Cognitive', ['Looks for objects when dropped out of sight', 'Bangs two things together']],
      ['Movement and physical', ['Gets to a sitting position by himself', 'Moves things from one hand to the other', 'Uses fingers to “rake” food towards himself', 'Sits without support']]
    ]
  }, {
    upTo: 12,
    label: '1 year',
    url: 'https://www.cdc.gov/act-early/milestones/1-year.html',
    groups: [
      ['Social and emotional', ['Plays games with you, like pat-a-cake']],
      ['Language and communication', ['Waves “bye-bye”', 'Calls a parent “mama” or “dada” or another special name', 'Understands “no” (pauses briefly or stops when you say it)']],
      ['Cognitive', ['Puts something in a container, like a block in a cup', 'Looks for things he sees you hide']],
      ['Movement and physical', ['Pulls up to stand', 'Walks, holding on to furniture', 'Drinks from a cup without a lid, as you hold it', 'Picks things up between thumb and pointer finger']]
    ]
  }, {
    upTo: 18,
    label: '18 months',
    url: 'https://www.cdc.gov/act-early/milestones/18-months.html',
    groups: [
      ['Social and emotional', ['Moves away from you, but looks to make sure you are close by', 'Points to show you something interesting', 'Puts hands out for you to wash them', 'Looks at a few pages in a book with you', 'Helps you dress him by pushing his arm through a sleeve or lifting a foot']],
      ['Language and communication', ['Tries to say three or more words besides “mama” or “dada”', 'Follows one-step directions without gestures, like “give it to me”']],
      ['Cognitive', ['Copies you doing chores, like sweeping with a broom', 'Plays with toys in a simple way, like pushing a toy car']],
      ['Movement and physical', ['Walks without holding on to anyone or anything', 'Scribbles', 'Drinks from an open cup and may spill', 'Feeds himself with his fingers', 'Tries to use a spoon', 'Climbs on and off a couch or chair without help']]
    ]
  }];

  function milestoneBand(months) {
    for (var i = 0; i < MILESTONES.length; i++) {
      if (months <= MILESTONES[i].upTo) return MILESTONES[i];
    }
    return MILESTONES[MILESTONES.length - 1];
  }

  /* ---------- jump from Today items to the Household to-do list ---------- */
  function jumpToTask(id) {
    goTo('household');
    setTimeout(function() {
      var anchor = el('todo-section');
      if (anchor) anchor.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
      if (id) {
        var inp = document.querySelector('[data-task="' + id + '"]');
        var row = inp && inp.closest('.task-item');
        if (row) {
          row.classList.add('flash');
          setTimeout(function() {
            row.classList.remove('flash');
          }, 2200);
        }
      }
    }, 70);
  }

  /* ---------- weekly rollover (runs once per new plan week) ----------
     When Claude publishes a new week (new week_commencing), tidy the
     shared state: drop completed to-dos, clear last week's shopping ticks
     and any ticked one-off items, and reset the weekly done-flags. */
  function rollWeek() {
    var wc = WEEK && WEEK.week_commencing;
    if (!wc || state.rolledWeek === wc) return;
    if (state.rolledWeek == null) {
      // First load after this update: adopt the current week without wiping
      // anything already on the go.
      state.rolledWeek = wc;
      persist();
      return;
    }
    state.tasks = (state.tasks || []).filter(function(tk) {
      return !tk.done;
    });
    state.customShop = (state.customShop || []).filter(function(c) {
      return !state.shop[c.id];
    });
    state.shop = {};
    state.actions = {};
    state.remindersDone = {};
    state.paymentsDone = {};
    state.rolledWeek = wc;
    persist();
  }

  /* ---------- new shopping list published -> clear last week's ticks ----------
     Triggers whenever data.js carries a new shoppingVersion. Removes bought
     one-off items, clears all ticks, keeps unticked added items. */
  function syncShoppingVersion() {
    var v = D.shoppingVersion;
    if (v == null || state.shoppingVersion === v) return;
    state.customShop = (state.customShop || []).filter(function(c) {
      return !state.shop[c.id];
    });
    state.shop = {};
    state.shoppingVersion = v;
    persist();
  }

  function logiFor(day) {
    var o = state.logistics[day.date] || {};
    return {
      maya: o.maya || day.logistics.maya,
      tom: o.tom || day.logistics.tom,
      dropoff: o.dropoff || day.logistics.dropoff,
      pickup: o.pickup || day.logistics.pickup
    };
  }

  /* ---------- shared state sync ---------- */
  function setPill(cls, txt) {
    var p = el('sync-pill');
    p.className = 'sync-pill ' + cls;
    p.title = txt;
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem('planner-state');
      if (raw) state = Object.assign(state, JSON.parse(raw));
    } catch (e) {}
  }

  function persist() {
    try {
      localStorage.setItem('planner-state', JSON.stringify(state));
    } catch (e) {}
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(pushRemote, 800);
  }

  function pushRemote() {
    if (!remote) return;
    fetch('api/state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(state)
      })
      .then(function(r) {
        setPill(r.ok ? 'on' : 'err', r.ok ? 'Synced' : 'Sync failed');
      })
      .catch(function() {
        setPill('err', 'Sync failed');
      });
  }

  function pullRemote(initial) {
    return fetch('api/state').then(function(r) {
      if (!r.ok) throw new Error('no api');
      return r.json();
    }).then(function(data) {
      remote = true;
      if (data && typeof data === 'object' && Object.keys(data).length) state = Object.assign(state, data);
      setPill('on', 'Synced across devices');
    }).catch(function() {
      remote = false;
      setPill('', initial ? 'Device-only mode: connect Upstash Redis on Vercel for shared sync' : 'Offline');
    });
  }

  /* ---------- tabs ---------- */
  var tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(function(btn) {
    btn.addEventListener('click', function() {
      tabs.forEach(function(b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      document.querySelectorAll('.page').forEach(function(p) {
        p.classList.remove('active');
      });
      el('page-' + btn.dataset.page).classList.add('active');
      window.scrollTo({
        top: 0
      });
    });
  });

  function goTo(page) {
    tabs.forEach(function(b) {
      b.classList.toggle('active', b.dataset.page === page);
    });
    document.querySelectorAll('.page').forEach(function(p) {
      p.classList.remove('active');
    });
    el('page-' + page).classList.add('active');
  }

  /* ---------- greeting ---------- */
  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? 'Good morning' : (h < 17 ? 'Good afternoon' : 'Good evening');
  }

  /* ---------- seed this week's to-do list once ---------- */
  function seedTasks() {
    if (!(WEEK.seedTasks && WEEK.seedTasks.length)) return;
    state.seededWeeks = state.seededWeeks || {};
    if (state.seededWeeks[WEEK.week_commencing]) return;
    WEEK.seedTasks.forEach(function(s, i) {
      state.tasks.push({
        id: 'seed-' + WEEK.week_commencing + '-' + i,
        title: s.title,
        owner: s.owner || 'Either',
        done: false
      });
    });
    state.seededWeeks[WEEK.week_commencing] = true;
    persist();
  }

  /* ---------- what's on ---------- */
  function eventsBlock(day) {
    if (!day.events || !day.events.length) return '';
    return '<div class="events-row">' + day.events.map(function(ev) {
      return '<div class="event-line"><span>' + esc(ev) + '</span></div>';
    }).join('') + '</div>';
  }

  /* ---------- horizon: remember-ahead items inside their lead window ---------- */
  function horizonDue() {
    var t = todayISO();
    return HORIZON.filter(function(h) {
      if (!h.date || h.date < t) return false;
      var lead = (h.lead_weeks || 2) * 7;
      return addDays(h.date, -lead) <= t;
    });
  }

  function horizonCard() {
    var due = horizonDue();
    if (!due.length) return '';
    return '<div class="section-kicker">Coming up, worth sorting early</div><div class="card">' +
      due.map(function(h) {
        return '<div class="stock-row"><span class="stock-name" style="flex:2">' + esc(h.item) + '</span>' +
          '<span class="stock-meta">' + esc(fmtNice(h.date)) + '</span>' +
          (h.owner ? '<span class="owner-chip ' + esc(String(h.owner).toLowerCase()) + '">' + esc(h.owner) + '</span>' : '') +
          '</div>';
      }).join('') + '</div>';
  }

  /* ---------- Sunday review nudge (shown Fri to Sun until next week's review is saved) ---------- */
  function reviewNudge() {
    var t = todayISO();
    var dow = new Date(t + 'T12:00:00').getDay(); // 0 Sun, 5 Fri, 6 Sat
    if (!(dow === 0 || dow === 5 || dow === 6)) return '';
    var nextWC = addDays(WEEK.week_commencing, 7);
    var saved = state.review[nextWC];
    if (saved && saved.saved_at) return '';
    return '<div class="card accent"><div class="head-row"><h3>Sunday review</h3></div>' +
      '<p class="page-intro" style="margin-bottom:10px">Not saved yet. Five minutes now and next week plans itself.</p>' +
      '<button class="pill-btn" data-gotoreview="1">Do the review</button></div>';
  }

  function overviewCard() {
    var html = '';
    if (WEEK.planB) {
      html += '<div class="note"><b>Plan B:</b> ' + esc(WEEK.planB) + '. If the day falls apart, dinner is already decided.</div>';
    }
    if (WEEK.reminders && WEEK.reminders.length) {
      html += '<div class="section-kicker">Needs sorting this week</div><div class="card accent"><ul>' +
        WEEK.reminders.map(function(r) {
          return '<li class="jump" data-jumptodo="1">' + esc(r) + '</li>';
        }).join('') + '</ul></div>';
    }
    if (WEEK.payments && WEEK.payments.length) {
      html += '<div class="section-kicker">Payments</div><div class="card"><ul>' +
        WEEK.payments.map(function(p) {
          return '<li><b>' + esc(p.who) + '</b> ' + esc(p.amount) + ' · ' + esc(p.when) + '</li>';
        }).join('') +
        '</ul>' + (WEEK.payments_note ? '<div class="note">' + esc(WEEK.payments_note) + '</div>' : '') + '</div>';
    }
    return html;
  }

  /* ---------- today ---------- */
  function logiChips(day, editable) {
    var l = logiFor(day);

    function chip(name, where) {
      var cls = where === 'office' ? 'away' : (where === 'road' ? 'road' : '');
      return '<span class="logi-chip ' + cls + '"><b>' + name + '</b> ' + esc(where) + '</span>';
    }
    var html = '<div class="logi-row">' + chip('Maya', l.maya) + chip('Tom', l.tom);
    if (day.carer || day.childminder) {
      html += '<span class="logi-chip care"><b>Alfie with</b> ' + esc(day.carer || 'the childminder') + '</span>';
      if (l.dropoff || l.pickup) {
        html += '<span class="logi-chip"><b>Drop-off</b> ' + (editable ? sel('dropoff', day.date, l.dropoff) : esc(l.dropoff || '-')) + '</span>';
        html += '<span class="logi-chip"><b>Pick-up</b> ' + (editable ? sel('pickup', day.date, l.pickup) : esc(l.pickup || '-')) + '</span>';
      }
    } else {
      html += '<span class="logi-chip">All together, no childminder</span>';
    }
    return html + '</div>';
  }

  function sel(field, date, val) {
    var opts = ['Maya', 'Tom'].map(function(o) {
      return '<option' + (o === val ? ' selected' : '') + '>' + o + '</option>';
    }).join('');
    return '<select class="logi-select" data-field="' + field + '" data-date="' + date + '">' + opts + '</select>';
  }

  function renderToday() {
    var t = todayISO();
    var q = pickQuote().split(' ');
    var last = q.pop();
    el('greeting').innerHTML = esc(q.join(' ')) + ' <i>' + esc(last) + '</i>';
    var day = WEEK.days.find(function(d) {
      return d.date === t;
    });
    var preamble = '';
    if (!day) {
      day = WEEK.days[0];
      preamble = '<div class="note">The plan week starts on ' + esc(day.label) + '. Showing day one until then.</div>';
    }
    var lSub = logiFor(day);
    var subBits = [];
    if (day.carer || day.childminder) subBits.push('Alfie is with ' + (day.carer || 'the childminder'));
    if (lSub.tom && lSub.tom !== 'home') subBits.push('Tom is ' + (lSub.tom === 'office' ? 'at the office' : 'on the road'));
    if (lSub.maya && lSub.maya !== 'home') subBits.push('Maya is ' + (lSub.maya === 'office' ? 'at the office' : 'on the road'));
    var subEl = el('header-sub');
    if (subEl) {
      var subTxt = day.label + '. ';
      if (subBits.length) subTxt += subBits.join(', ') + '. ';
      if (day.events && day.events.length) {
        subTxt += day.events.join(' · ');
      } else if (!subBits.length) {
        var dowSub = new Date(day.date + 'T12:00:00').getDay();
        subTxt += (dowSub === 0 || dowSub === 6) ? 'Everyone together today.' : 'Maya and Tom both working from home.';
      }
      subEl.textContent = subTxt;
    }
    var html = preamble;
    html += reviewNudge();
    html += '<div class="card today-card"><div class="head-row"><h3>' + esc(day.label) + '</h3>' +
      (day.date === t ? '<span class="today-chip">Today</span>' : '') + '</div>';
    html += logiChips(day, true);
    html += eventsBlock(day);
    html += day.meals.map(function(m) {
      return '<div class="week-row"><span class="week-slot">' + esc(m.slot) + '</span><span>' + linkify(m.title, m.recipe) + '</span></div>';
    }).join('');
    html += '</div>';

    html += overviewCard();

    if (day.actions && day.actions.length) {
      html += '<div class="section-kicker">To do today</div><div class="card accent">' + day.actions.map(function(a, i) {
        var key = day.date + '-' + i;
        var done = state.actions[key] ? ' checked' : '';
        return '<label class="task-item' + (done ? ' done' : '') + '"><input class="checkbox" type="checkbox" data-action="' + key + '"' + done + '><span class="task-title jump" data-jumptodo="1">' + esc(a) + '</span></label>';
      }).join('') + '</div>';
    }
    var open = (state.tasks || []).filter(function(tk) {
      return !tk.done;
    });
    if (open.length) {
      html += '<div class="section-kicker">Open tasks</div><div class="card">' + open.slice(0, 6).map(function(tk) {
        return '<div class="task-item"><input class="checkbox" type="checkbox" data-task="' + esc(tk.id) + '" aria-label="' + esc(tk.title) + '"><span class="task-title jump" data-gototask="' + esc(tk.id) + '">' + esc(tk.title) + '</span><span class="owner-chip ' + esc(tk.owner.toLowerCase()) + '">' + esc(tk.owner) + '</span></div>';
      }).join('') + '</div>';
    }
    html += horizonCard();
    el('today-root').innerHTML = html;
  }

  /* ---------- week ---------- */
  function weekOverview() {
    state.remindersDone = state.remindersDone || {};
    state.paymentsDone = state.paymentsDone || {};
    var html = '';
    var open = (state.tasks || []).filter(function(tk) {
      return !tk.done;
    });
    if (open.length) {
      html += '<div class="section-kicker">Tasks</div><div class="card">' + open.map(function(tk) {
        return '<label class="task-item"><input class="checkbox" type="checkbox" data-task="' + esc(tk.id) + '" aria-label="' + esc(tk.title) + '"><span class="task-title">' + esc(tk.title) + '</span><span class="owner-chip ' + esc(tk.owner.toLowerCase()) + '">' + esc(tk.owner) + '</span></label>';
      }).join('') + '</div>';
    }
    if (WEEK.reminders && WEEK.reminders.length) {
      html += '<div class="section-kicker">Needs sorting this week</div><div class="card accent">' + WEEK.reminders.map(function(r, i) {
        var key = 'rem-' + i,
          done = state.remindersDone[key];
        return '<label class="task-item' + (done ? ' done' : '') + '"><input class="checkbox" type="checkbox" data-rem="' + key + '"' + (done ? ' checked' : '') + '><span class="task-title">' + esc(r) + '</span></label>';
      }).join('') + '</div>';
    }
    if (WEEK.payments && WEEK.payments.length) {
      html += '<div class="section-kicker">Payments</div><div class="card">' + WEEK.payments.map(function(p, i) {
        var key = 'pay-' + i,
          done = state.paymentsDone[key];
        return '<label class="task-item' + (done ? ' done' : '') + '"><input class="checkbox" type="checkbox" data-pay="' + key + '"' + (done ? ' checked' : '') + '><span class="task-title"><b>' + esc(p.who) + '</b> ' + esc(p.amount) + ' · ' + esc(p.when) + '</span></label>';
      }).join('') + (WEEK.payments_note ? '<div class="note">' + esc(WEEK.payments_note) + '</div>' : '') + '</div>';
    }
    html += horizonCard();
    return html;
  }

  function renderWeek() {
    var t = todayISO();
    var html = WEEK.days.map(function(d) {
      var isToday = d.date === t;
      var isPast = d.date < t;
      var body = logiChips(d, true) +
        eventsBlock(d) +
        d.meals.map(function(m) {
          return '<div class="week-row"><span class="week-slot">' + esc(m.slot) + '</span><span>' + linkify(m.title, m.recipe) + '</span></div>';
        }).join('');
      return '<div class="card daycard' + (isToday ? ' today-card' : '') + (isPast ? ' collapsed' : '') + '">' +
        '<div class="head-row daycard-head" data-collapse><h3>' + esc(d.label) + '</h3>' +
        (isToday ? '<span class="today-chip">Today</span>' : '') +
        '<span class="chev">▾</span></div>' +
        '<div class="daycard-body">' + body + '</div></div>';
    }).join('');
    html += weekOverview();
    el('week-root').innerHTML = html;
  }

  /* ---------- month ahead ---------- */
  function renderMonth() {
    var t = todayISO();
    if (!calRef) {
      var n0 = new Date(t + 'T12:00:00');
      calRef = new Date(n0.getFullYear(), n0.getMonth(), 1);
    }
    if (!document.getElementById('cal-style')) {
      var stEl = document.createElement('style');
      stEl.id = 'cal-style';
      stEl.textContent = '.cal-head{display:flex;align-items:center;justify-content:space-between;margin:2px 0 12px}.cal-head h3{margin:0}.cal-nav{border:none;background:var(--oat);color:var(--ink);border-radius:10px;font-size:18px;width:38px;height:38px;cursor:pointer}.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.cal-dow{text-align:center;font-size:11px;font-weight:700;color:var(--ink-faint);padding:2px 0}.cal-cell{min-height:60px;background:var(--oat);border-radius:10px;padding:4px 3px;overflow:hidden}.cal-cell.empty{background:transparent}.cal-cell.today{outline:2px solid var(--ink)}.cal-num{font-size:12px;font-weight:700;color:var(--ink-soft)}.cal-ev{display:block;font-size:10px;line-height:1.3;border-radius:5px;padding:1px 4px;margin-top:2px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cal-ev.maya{background:var(--raspberry)}.cal-ev.tom{background:var(--blueberry)}.cal-ev.fam{background:var(--teal)}.cal-legend{display:flex;gap:10px;margin-top:12px;font-size:12px}.cal-legend .cal-ev{display:inline-block;color:#fff}';
      document.head.appendChild(stEl);
    }
    el('month-intro').textContent = CAL.synced ? ('From your and Tom’s calendars, synced ' + CAL.synced + '. Use the arrows to browse months, or scroll down for the full list of everything in the calendar.') : '';
    var y = calRef.getFullYear(),
      m = calRef.getMonth();
    var byDate = {};
    (CAL.events || []).forEach(function(e) {
      (byDate[e.date] = byDate[e.date] || []).push(e);
    });
    var first = new Date(y, m, 1);
    var startDow = (first.getDay() + 6) % 7;
    var daysInMonth = new Date(y, m + 1, 0).getDate();

    function pad(n) {
      return String(n).padStart(2, '0');
    }

    function iso(d) {
      return y + '-' + pad(m + 1) + '-' + pad(d);
    }
    var cells = [];
    for (var i = 0; i < startDow; i++) cells.push(0);
    for (var d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(0);
    var dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var monthName = calRef.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric'
    });
    var html = '<div class="card">';
    html += '<div class="cal-head"><button class="cal-nav" data-cal-nav="-1" aria-label="Previous month">‹</button><h3>' + esc(monthName) + '</h3><button class="cal-nav" data-cal-nav="1" aria-label="Next month">›</button></div>';
    html += '<div class="cal-grid">' + dow.map(function(x) {
      return '<div class="cal-dow">' + x + '</div>';
    }).join('') + '</div>';
    html += '<div class="cal-grid">' + cells.map(function(c) {
      if (!c) return '<div class="cal-cell empty"></div>';
      var dISO = iso(c),
        evs = byDate[dISO] || [],
        today = dISO === t;
      return '<div class="cal-cell' + (today ? ' today' : '') + '"><div class="cal-num">' + c + '</div>' +
        evs.map(function(e) {
          var who = (e.who || '').toLowerCase();
          var cls = who === 'tom' ? 'tom' : (who === 'maya' ? 'maya' : 'fam');
          return '<span class="cal-ev ' + cls + '" title="' + esc(e.title) + '">' + (e.all_day ? '' : esc(e.time || '') + ' ') + esc(e.title) + '</span>';
        }).join('') + '</div>';
    }).join('') + '</div>';
    html += '<div class="cal-legend"><span class="cal-ev maya">Maya</span><span class="cal-ev tom">Tom</span><span class="cal-ev fam">Family</span></div>';
    html += '</div>';

    // Full agenda: every event in the calendar, regardless of which month is shown
    var allEvents = (CAL.events || []).slice().sort(function(a, b) {
      var ka = a.date + 'T' + (a.all_day ? '00:00' : (a.time || '99:99'));
      var kb = b.date + 'T' + (b.all_day ? '00:00' : (b.time || '99:99'));
      return ka < kb ? -1 : (ka > kb ? 1 : 0);
    });
    if (allEvents.length) {
      html += '<div class="section-kicker">Everything in the calendar</div><div class="card">' +
        allEvents.map(function(e) {
          var who = (e.who || '').toLowerCase();
          var cls = who === 'tom' ? 'tom' : (who === 'maya' ? 'maya' : 'fam');
          var dd = new Date(e.date + 'T12:00:00');
          var dlabel = dd.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
          var when = e.all_day ? 'all day' : esc(e.time || '');
          var past = e.date < t ? ' style="opacity:.5"' : '';
          return '<div class="stock-row"' + past + '><span class="stock-name">' + esc(dlabel) + '</span>' +
            '<span class="stock-meta">' + when + '</span>' +
            '<span class="stock-name" style="flex:2">' + esc(e.title) + '</span>' +
            '<span class="cal-ev ' + cls + '" style="flex:none">' + esc(e.who || '') + '</span></div>';
        }).join('') + '</div>';
    }

    el('month-root').innerHTML = html;
  }

  /* ---------- shopping ---------- */
  function shopGroups() {
    var groups = SHOPPING.map(function(cat, ci) {
      return {
        name: cat.cat,
        items: cat.items.map(function(it, ii) {
          return {
            key: 's' + ci + '-' + ii,
            name: it[0],
            note: it[1],
            custom: false
          };
        })
      };
    });
    if (state.customShop && state.customShop.length) {
      groups.push({
        name: 'Added by you',
        items: state.customShop.map(function(c) {
          return {
            key: c.id,
            name: c.name,
            note: '',
            custom: true
          };
        })
      });
    }
    return groups;
  }

  function renderShopping() {
    var groups = shopGroups();
    el('shop-root').innerHTML = groups.map(function(g, gi) {
      var rows = g.items.map(function(it) {
        var done = state.shop[it.key];
        return '<label class="shop-item' + (done ? ' done' : '') + '"><input class="checkbox" type="checkbox" data-shop="' + esc(it.key) + '"' + (done ? ' checked' : '') + ' aria-label="' + esc(it.name) + '"><span><span class="item-name">' + esc(it.name) + '</span>' +
          (it.note ? ' <span class="item-note">' + esc(it.note) + '</span>' : '') +
          (it.custom ? '<span class="custom-flag">added</span>' : '') + '</span>' +
          (it.custom ? '<button class="del-btn" data-delshop="' + esc(it.key) + '" aria-label="Remove item">✕</button>' : '') +
          '</label>';
      }).join('');
      return '<div class="shop-cat"><div class="shop-cat-head"><h3>' + esc(g.name) + '</h3><span class="shop-count" id="gcount-' + gi + '"></span></div>' + rows + '</div>';
    }).join('');
    updateCounts();
  }

  function updateCounts() {
    var groups = shopGroups();
    var total = 0,
      done = 0;
    groups.forEach(function(g, gi) {
      var d = g.items.filter(function(it) {
        return state.shop[it.key];
      }).length;
      total += g.items.length;
      done += d;
      var c = el('gcount-' + gi);
      if (c) c.textContent = d + ' of ' + g.items.length;
    });
    var pct = total ? Math.round(done / total * 100) : 0;
    el('shop-progress').style.width = pct + '%';
    el('shop-progress-label').textContent = done + ' of ' + total + (pct === 100 ? ' · all done' : '');
  }
  el('add-shop-form').addEventListener('submit', function(e) {
    e.preventDefault();
    var name = el('add-shop-name').value.trim();
    if (!name) return;
    state.customShop.push({
      id: 'c' + Date.now(),
      name: name
    });
    el('add-shop-name').value = '';
    persist();
    renderShopping();
  });
  el('reset-shop-btn').addEventListener('click', function() {
    if (!window.confirm('Clear every tick on the shared list, for both of you?')) return;
    state.shop = {};
    state.customShop = (state.customShop || []).filter(function(c) {
      return true;
    });
    persist();
    renderShopping();
  });
  el('hide-done-btn').addEventListener('click', function(e) {
    var on = document.body.classList.toggle('hide-done');
    e.target.classList.toggle('active', on);
    e.target.textContent = on ? 'Show ticked items' : 'Hide ticked items';
  });

  /* ---------- quick capture on Today ---------- */
  var quickForm = el('quick-form');
  if (quickForm) quickForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var name = el('quick-name').value.trim();
    if (!name) return;
    if (el('quick-kind').value === 'shop') {
      state.customShop.push({
        id: 'c' + Date.now(),
        name: name
      });
      renderShopping();
    } else {
      state.tasks.push({
        id: 't' + Date.now(),
        title: name,
        owner: 'Either',
        when: 'this_week',
        done: false
      });
      renderHousehold();
      renderWeek();
    }
    el('quick-name').value = '';
    persist();
    renderToday();
  });

  /* ---------- kitchen / prep ---------- */
  function renderPrep() {
    var t = todayISO();
    var b = WEEK.batch;
    var html = '<div class="card accent daycard"><div class="head-row daycard-head" data-collapse><h3>' + esc(b.title) + '</h3><span class="tag batch">' + esc(b.duration) + '</span><span class="chev">▾</span></div><div class="daycard-body"><ul>' +
      b.items.map(function(it) {
        if (!it.recipe) return '<li>' + esc(it.text) + '</li>';
        var words = it.text.split(' ');
        return '<li><span class="recipe-link" data-recipe="' + esc(it.recipe) + '"><b>' + esc(words.slice(0, 5).join(' ')) + '</b></span> ' + esc(words.slice(5).join(' ')) + '</li>';
      }).join('') +
      '</ul><div class="note">' + esc(b.note) + '</div></div></div>';
    html += WEEK.days.map(function(d, i) {
      var isToday = d.date === t;
      var isPast = d.date < t;
      var body = '<ul>' +
        d.meals.map(function(m) {
          return '<li>' + esc(m.slot) + ': ' + linkify(m.title, m.recipe) + '</li>';
        }).join('') +
        (d.actions || []).map(function(a) {
          return '<li>' + esc(a) + '</li>';
        }).join('') +
        '</ul>';
      return '<div class="card daycard' + (isToday ? ' today-card' : '') + (isPast ? ' collapsed' : '') + '">' +
        '<div class="head-row daycard-head" data-collapse><span class="day-label">' + (isToday ? 'Today' : 'Day ' + (i + 1)) + '</span><h3>' + esc(d.label) + '</h3>' +
        '<span class="chev">▾</span></div>' +
        '<div class="daycard-body">' + body + '</div></div>';
    }).join('');
    html += '<div class="card daycard"><div class="head-row daycard-head" data-collapse><h3>Packing for the childminder</h3><span class="chev">▾</span></div><div class="daycard-body"><ul><li>Send lunches cold in an insulated bag with an ice pack, with a note to reheat until piping hot and cool to warm before serving.</li><li>Defrosted food must be used within 24 hours and never refrozen.</li><li>Pop a labelled spoon and bib in the bag so nothing gets mixed up.</li></ul></div></div>';
    el('prep-root').innerHTML = html;
  }

  /* ---------- recipes ---------- */
  function audienceFor(meal) {
    if (meal === 'family') return {
      cls: 'family',
      label: 'Family'
    };
    if (meal === 'adults') return {
      cls: 'adults',
      label: 'Adults'
    };
    return {
      cls: 'alfie',
      label: 'Alfie'
    };
  }

  function recipeCard(r) {
    var aud = audienceFor(r.meal);
    return '<article class="recipe" id="recipe-' + esc(r.id) + '" data-meal="' + esc(r.meal) + '">' +
      '<button class="recipe-toggle" aria-expanded="false">' +
      '<span class="splodge ' + esc(r.meal) + '" aria-hidden="true"></span>' +
      '<span class="recipe-title-wrap"><span class="tag ' + aud.cls + '">' + aud.label + '</span>' +
      '<h3>' + esc(r.title) + '</h3><div class="recipe-sub">' + esc(r.sub) + '</div></span>' +
      '<span class="chev">▾</span></button>' +
      '<div class="recipe-body">' +
      '<div class="r-section r-ing"><h4>Ingredients</h4><ul>' + r.ingredients.map(function(i) {
        return '<li>' + esc(i) + '</li>';
      }).join('') + '</ul></div>' +
      '<div class="r-section r-dir"><h4>Directions</h4><ol>' + r.directions.map(function(d) {
        return '<li>' + esc(d) + '</li>';
      }).join('') + '</ol></div>' +
      '<div class="serve-store-grid">' +
      '<div class="r-section r-serve"><h4>How to serve</h4><p>' + esc(r.serve) + '</p></div>' +
      '<div class="r-section r-store"><h4>How to store</h4><p>' + esc(r.store) + '</p></div>' +
      '</div></div></article>';
  }

  function renderRecipes() {
    el('recipes-intro').textContent = 'Tap a recipe to open it. Each one shows ingredients, directions, how to serve at ' + WEEK.baby_age_months + ' months, and how to store. He is a confident self-feeder, so meals at home lean on finger food; childminder pots stay spoonable.';
    var order = [
      ['breakfast', 'Breakfast'],
      ['lunch', 'Lunch'],
      ['dinner', 'Dinner'],
      ['family', 'Family meals'],
      ['adults', 'Adults']
    ];
    el('recipe-root').innerHTML = order.map(function(grp) {
      var items = RECIPES.filter(function(r) {
        return r.meal === grp[0];
      });
      if (!items.length) return '';
      return '<div class="recipe-group" data-group="' + grp[0] + '"><div class="section-kicker">' + esc(grp[1]) + '</div>' +
        items.map(recipeCard).join('') + '</div>';
    }).join('');
    document.querySelectorAll('.recipe-toggle').forEach(function(tg) {
      tg.addEventListener('click', function() {
        var card = tg.closest('.recipe');
        var open = card.classList.toggle('open');
        tg.setAttribute('aria-expanded', open);
      });
    });
  }
  document.querySelectorAll('#filter-row .filter-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#filter-row .filter-btn').forEach(function(b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      var f = btn.dataset.filter;
      document.querySelectorAll('.recipe-group').forEach(function(grp) {
        grp.style.display = (f === 'all' || grp.dataset.group === f) ? '' : 'none';
      });
      document.querySelectorAll('.recipe').forEach(function(card) {
        card.style.display = (f === 'all' || card.dataset.meal === f) ? '' : 'none';
      });
    });
  });

  function openRecipe(id) {
    var card = el('recipe-' + id);
    if (!card) return;
    goTo('recipes');
    document.querySelectorAll('#filter-row .filter-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.filter === 'all');
    });
    document.querySelectorAll('.recipe-group').forEach(function(g) {
      g.style.display = '';
    });
    document.querySelectorAll('.recipe').forEach(function(c) {
      c.style.display = '';
      if (c !== card && c.classList.contains('open')) {
        c.classList.remove('open');
        c.querySelector('.recipe-toggle').setAttribute('aria-expanded', 'false');
      }
    });
    card.classList.add('open');
    card.querySelector('.recipe-toggle').setAttribute('aria-expanded', 'true');
    setTimeout(function() {
      card.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 80);
  }

  /* ---------- household ---------- */
  function stapleStatus(name) {
    return state.staples[name] || 'in_stock';
  }

  function isRemoved(kind, item) {
    return !!(state.removedStock && state.removedStock[kind + '|' + item]);
  }

  function stockRows(list, kind) {
    list = (list || []).filter(function(it) {
      return !isRemoved(kind, it.item);
    });
    if (!list.length) return '<p>Nothing logged yet.</p>';
    return list.map(function(it) {
      return '<div class="stock-row"><span class="stock-name">' + esc(it.item) + '</span>' +
        (it.qty ? '<span class="stock-meta">' + esc(it.qty) + '</span>' : '') +
        (it.due ? '<span class="useby soon">' + esc(it.due) + '</span>' : '') +
        '<button class="del-btn" data-delstock="' + esc(kind + '|' + it.item) + '" aria-label="Remove ' + esc(it.item) + '">✕</button>' +
        '</div>';
    }).join('');
  }

  function stockBlock() {
    var s = STOCK || {};
    var html = '';
    html += '<div class="section-kicker">In the house</div><div class="card">' +
      stockRows(s.ingredients, 'ingredients') +
      '<div class="note">' + (s.source ? 'From ' + esc(s.source) + '. ' : '') +
      'Logged from your receipts. Cooking this week and the Sunday review draw it down. Tap ✕ to remove anything you have used up.</div></div>';
    if (s.snacks && s.snacks.length) {
      html += '<div class="section-kicker">Snacks and treats</div><div class="card">' + stockRows(s.snacks, 'snacks') + '</div>';
    }
    if (s.household && s.household.length) {
      var due = s.household.filter(function(it) {
        return it.due;
      });
      html += '<div class="section-kicker">Household and baby supplies</div><div class="card">' + stockRows(s.household, 'household') +
        '<div class="note">' + (due.length ? 'Items in amber are predicted to run low soon, based on how often you rebuy them. ' :
          'Reorder predictions appear here once there are a few receipts to learn from. ') +
        'Anything flagged is added to the next shop.</div></div>';
    }
    return html;
  }

  function renderHousehold() {
    var t = todayISO();
    var soonCut = addDays(t, 14);

    function taskRow(tk) {
      if (editingTask === tk.id) {
        return '<div class="task-item">' +
          '<input id="edit-title-' + esc(tk.id) + '" value="' + esc(tk.title) + '" maxlength="120" style="flex:1;min-width:0;padding:6px 8px;border:1px solid #ccc;border-radius:8px;font:inherit">' +
          '<select class="logi-select" id="edit-owner-' + esc(tk.id) + '">' + ['Either', 'Maya', 'Tom'].map(function(o) {
            return '<option' + (o === tk.owner ? ' selected' : '') + '>' + o + '</option>';
          }).join('') +
          '</select>' +
          '<button class="pill-btn" data-savetask="' + esc(tk.id) + '">Save</button>' +
          '<button class="del-btn" data-canceltask="1" aria-label="Cancel edit">✕</button></div>';
      }
      var toLater = (tk.when || 'this_week') !== 'later';
      var moveTo = toLater ? 'later' : 'this_week';
      var moveLbl = toLater ? 'Move to Later' : 'Move to This week';
      return '<div class="task-item' + (tk.done ? ' done' : '') + '">' +
        '<input class="checkbox" type="checkbox" data-task="' + esc(tk.id) + '"' + (tk.done ? ' checked' : '') + ' aria-label="' + esc(tk.title) + '">' +
        '<span class="task-title">' + esc(tk.title) + '</span>' +
        '<span class="owner-chip ' + esc(tk.owner.toLowerCase()) + '">' + esc(tk.owner) + '</span>' +
        '<button class="del-btn move-btn" data-movetask="' + esc(tk.id) + '" data-moveto="' + moveTo + '" aria-label="' + moveLbl + '" title="' + moveLbl + '">' + (toLater ? '↓' : '↑') + '</button>' +
        '<button class="del-btn" data-edittask="' + esc(tk.id) + '" aria-label="Edit task">✎</button>' +
        '<button class="del-btn" data-del="' + esc(tk.id) + '" aria-label="Delete task">✕</button></div>';
    }

    function ordered(list) {
      return list.slice().sort(function(a, b) {
        return (a.done ? 1 : 0) - (b.done ? 1 : 0);
      });
    }
    var allTasks = state.tasks || [];
    var thisWeek = ordered(allTasks.filter(function(tk) {
      return (tk.when || 'this_week') !== 'later';
    }));
    var later = ordered(allTasks.filter(function(tk) {
      return (tk.when || 'this_week') === 'later';
    }));

    var html = '<div id="todo-section"><div class="section-kicker">To-do list — this week</div>';
    html += '<form id="task-form" class="add-form">' +
      '<input type="text" id="task-title" placeholder="Add a task, e.g. book the 12 month jabs" maxlength="120" required>' +
      '<select id="task-owner"><option>Either</option><option>Maya</option><option>Tom</option></select>' +
      '<select id="task-when"><option value="this_week">This week</option><option value="later">Later</option></select>' +
      '<button type="submit" class="pill-btn">Add</button></form>';
    html += '<div class="card">' + (thisWeek.length ? thisWeek.map(taskRow).join('') :
      '<p class="page-intro" style="margin:0">Nothing on this week’s list. Lovely.</p>') + '</div>';
    html += '<div class="section-kicker">Later</div>';
    html += '<div class="card">' + (later.length ? later.map(taskRow).join('') :
      '<p class="page-intro" style="margin:0">Nothing parked for later. Use the ↓ button to move a task here.</p>') + '</div></div>';

    html += '<div class="section-kicker">Next shopping list</div>';
    html += '<form id="next-form" class="add-form">' +
      '<input type="text" id="next-name" placeholder="Running low? e.g. butter" maxlength="80" required>' +
      '<button type="submit" class="pill-btn">Add</button></form>';
    html += '<div class="card">' + ((state.nextList && state.nextList.length) ? state.nextList.map(function(n) {
        return '<div class="task-item"><span class="task-title">' + esc(n.name) + '</span>' +
          '<button class="del-btn" data-delnext="' + esc(n.id) + '" aria-label="Remove">✕</button></div>';
      }).join('') : '<p class="page-intro" style="margin:0">Nothing waiting. Anything you add here goes straight onto next week’s shopping list.</p>') +
      '<div class="note">These are picked up automatically when next week’s plan is generated.</div></div>';

    var freezerItems = (FREEZER.items || []).filter(function(it) {
      return !isRemoved('freezer', it.item);
    });
    html += '<div class="section-kicker">Freezer</div><div class="card">' +
      (freezerItems.length ? freezerItems.map(function(it) {
        var soon = it.use_by && it.use_by <= soonCut;
        return '<div class="stock-row"><span class="stock-name">' + esc(it.item) + '</span>' +
          '<span class="stock-meta">' + it.portions + ' × ' + esc(it.for) + '</span>' +
          '<span class="useby' + (soon ? ' soon' : '') + '">use by ' + esc(it.use_by) + '</span>' +
          (it.notes ? '<span class="stock-meta">' + esc(it.notes) + '</span>' : '') +
          '<button class="del-btn" data-delstock="' + esc('freezer|' + it.item) + '" aria-label="Remove ' + esc(it.item) + '">✕</button>' + '</div>';
      }).join('') : '<p>The freezer record is empty.</p>') +
      '<div class="note">Updated ' + esc(FREEZER.updated) + ' from the weekly plan. If real life has eaten something, note it in the Sunday review.</div></div>';

    html += stockBlock();

    html += '<div class="section-kicker">Cupboard staples</div><div class="card"><div class="staple-grid">' +
      STAPLES.map(function(s) {
        var st = stapleStatus(s);
        return '<button type="button" class="staple-chip ' + (st === 'in_stock' ? '' : st) + '" data-staple="' + esc(s) + '">' + esc(s) + '</button>';
      }).join('') +
      '</div><div class="legend">Tap to cycle: in stock → <b>low</b> → <b>out</b>. Anything low or out is restocked on the next plan’s shopping list.</div></div>';

    el('household-root').innerHTML = html;

    el('task-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var title = el('task-title').value.trim();
      if (!title) return;
      state.tasks.push({
        id: 't' + Date.now(),
        title: title,
        owner: el('task-owner').value,
        when: el('task-when') ? el('task-when').value : 'this_week',
        done: false
      });
      persist();
      renderHousehold();
      renderToday();
    });
    el('next-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var name = el('next-name').value.trim();
      if (!name) return;
      state.nextList.push({
        id: 'n' + Date.now(),
        name: name
      });
      persist();
      renderHousehold();
    });
  }

  /* ---------- baby ---------- */
  function babyField(key) {
    var b = D.baby || {};
    var sb = state.baby || {};
    return sb[key] !== undefined ? sb[key] : (b[key] || '');
  }

  function multilineCard(title, key, note) {
    return '<div class="card"><h3>' + esc(title) + '</h3>' +
      '<textarea class="review-textarea baby-text" data-baby="' + key + '">' + esc(babyField(key)) + '</textarea>' +
      (note ? '<div class="note">' + esc(note) + '</div>' : '') + '</div>';
  }

  function renderBaby() {
    var b = D.baby || {};
    var name = b.name || 'Alfie';
    var dob = b.dob || '2025-08-12';
    var t = todayISO();
    var p = ageParts(dob, t);
    if (el('baby-heading')) el('baby-heading').textContent = name;

    var html = '<div class="card today-card"><div class="head-row"><h3>' + esc(name) + '</h3>' +
      '<span class="today-chip">' + esc(ageLabel(p)) + '</span></div></div>';

    // Favourite foods + foods not liked
    html += multilineCard('Favourite foods', 'favourites', 'One per line.');
    html += multilineCard('Foods not liked', 'dislikes', 'Not a never-serve list. When a food is not a hit, offer it again in a different format rather than dropping it.');

    // Schedule
    html += multilineCard('Schedule', 'schedule', 'Bottles, meals and naps. One per line.');

    // Upcoming (computed from date of birth)
    var firstBday = monthsAfter(dob, 12);
    var upcoming = [
      ['First birthday', fmtNice(firstBday)],
      ['12 month immunisations', 'around the first birthday (check HSE schedule)'],
      ['Move to whole cows’ milk as the main drink', 'from 12 months'],
      ['Settle to about 3 milk feeds (roughly 350–400 ml a day)', 'around 12 months'],
      ['Move from bottles towards an open or free-flow cup', 'by about 12 months'],
      ['Keep the daily vitamin D drops going', 'all year']
    ];
    html += '<div class="card"><h3>Upcoming</h3>' + upcoming.map(function(u) {
      return '<div class="stock-row"><span class="stock-name" style="flex:2">' + esc(u[0]) + '</span><span class="stock-meta">' + esc(u[1]) + '</span></div>';
    }).join('') + '</div>';

    html += '<div class="legend">Edits here save automatically.</div>';

    // Long-term to-do (tickable list), seeded once from data.js
    if (!state.babyTodo) {
      var seed = (D.baby && D.baby.longterm) || [];
      if (typeof seed === 'string') seed = seed.split('\n');
      state.babyTodo = seed.map(function(s) {
        return String(s).trim();
      }).filter(function(s) {
        return s && s.charAt(0) !== '[';
      }).map(function(s, i) {
        return {
          id: 'bt' + Date.now() + i,
          title: s,
          done: false
        };
      });
      persist();
    }
    var babyTodo = state.babyTodo;
    html += '<div class="section-kicker">Long-term to-do</div>';
    html += '<form id="babytodo-form" class="add-form">' +
      '<input type="text" id="babytodo-title" placeholder="Add a long-term to-do, e.g. register for Montessori" maxlength="120" required>' +
      '<button type="submit" class="pill-btn">Add</button></form>';
    var bt = babyTodo.slice().sort(function(a, b) {
      return (a.done ? 1 : 0) - (b.done ? 1 : 0);
    });
    html += '<div class="card">' + (bt.length ? bt.map(function(it) {
      return '<div class="task-item' + (it.done ? ' done' : '') + '">' +
        '<input class="checkbox" type="checkbox" data-babytodo="' + esc(it.id) + '"' + (it.done ? ' checked' : '') + ' aria-label="' + esc(it.title) + '">' +
        '<span class="task-title">' + esc(it.title) + '</span>' +
        '<button class="del-btn" data-delbabytodo="' + esc(it.id) + '" aria-label="Delete">✕</button></div>';
    }).join('') : '<p class="page-intro" style="margin:0">Nothing on the long-term list yet.</p>') + '</div>';

    // Milestones (CDC) for the current age band + transitions
    var band = milestoneBand(p.months);
    html += '<div class="section-kicker">Milestones around ' + esc(band.label) + '</div><div class="card">' +
      '<div class="note">Things most babies can do by ' + esc(band.label) + ' (CDC, 75% of children). A guide, not a test — chat to your GP or public health nurse with any concerns.</div>' +
      band.groups.map(function(g) {
        return '<h4 style="margin:12px 0 4px">' + esc(g[0]) + '</h4><ul style="margin:0">' +
          g[1].map(function(item) {
            return '<li>' + esc(item) + '</li>';
          }).join('') + '</ul>';
      }).join('') +
      '<div class="note">Source: <a href="' + esc(band.url) + '" target="_blank" rel="noopener">CDC Learn the Signs. Act Early.</a></div></div>';

    // Recently introduced foods (keeps the rolling exposure record working)
    if (EXPOSURES.foods && EXPOSURES.foods.length) {
      html += '<div class="section-kicker">Recently introduced</div><div class="card">' + EXPOSURES.foods.map(function(f) {
        var r = state.reactions[f.food] !== undefined ? state.reactions[f.food] : (f.reaction || '');
        return '<div class="stock-row"><span class="stock-name">' + esc(f.food) + '</span>' +
          '<span class="stock-meta">first offered ' + esc(f.first_offered) + '</span>' +
          '<input class="reaction-input" data-food="' + esc(f.food) + '" placeholder="Reaction? e.g. loved it" value="' + esc(r) + '"></div>';
      }).join('') + '<div class="note">Reactions you type here are saved and fed back into the rolling record.</div></div>';
    }

    el('baby-root').innerHTML = html;

    var btForm = el('babytodo-form');
    if (btForm) btForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var title = el('babytodo-title').value.trim();
      if (!title) return;
      state.babyTodo = state.babyTodo || [];
      state.babyTodo.push({
        id: 'bt' + Date.now(),
        title: title,
        done: false
      });
      persist();
      renderBaby();
    });
  }

  /* ---------- review ---------- */
  function getWho() {
    try {
      return localStorage.getItem('planner-who') || '';
    } catch (e) {
      return '';
    }
  }

  function setWho(w) {
    try {
      localStorage.setItem('planner-who', w);
    } catch (e) {}
  }

  function stampLabel(s) {
    return s && s.by ? esc(s.by) + ', ' + esc(String(s.at || '').slice(0, 10)) : '';
  }

  function renderReview() {
    var nextWC = addDays(WEEK.week_commencing, 7);
    var saved = state.review[nextWC] || {};
    var who = getWho();
    var eb = saved.edited_by || {};

    function sectionStamp(key) {
      return eb[key] ? ' <span class="custom-flag">last edit: ' + stampLabel(eb[key]) + '</span>' : '';
    }
    var dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday'];

    function opt(list, val) {
      return list.map(function(o) {
        return '<option' + (o === val ? ' selected' : '') + '>' + o + '</option>';
      }).join('');
    }
    var rows = dayNames.map(function(dn, i) {
      var d = (saved.days && saved.days[i]) || {};
      return '<div class="review-day"><b>' + dn + '</b>' +
        '<select class="logi-select" data-rev="maya-' + i + '">' + opt(['Maya home', 'Maya office', 'Maya road'], d.maya || 'Maya home') + '</select>' +
        '<select class="logi-select" data-rev="tom-' + i + '">' + opt(['Tom home', 'Tom office', 'Tom road'], d.tom || (i === 1 || i === 3 ? 'Tom office' : 'Tom home')) + '</select>' +
        '<select class="logi-select hide-sm" data-rev="drop-' + i + '">' + opt(['Drop: Tom', 'Drop: Maya'], d.drop || 'Drop: Tom') + '</select>' +
        '<select class="logi-select hide-sm" data-rev="pick-' + i + '">' + opt(['Pick: Maya', 'Pick: Tom'], d.pick || 'Pick: Maya') + '</select></div>';
    }).join('');
    el('review-root').innerHTML =
      '<div class="card"><label class="review-head">Filling this in as</label>' +
      '<div class="filter-row" style="margin-top:8px">' + ['Maya', 'Tom'].map(function(n) {
        return '<button type="button" class="filter-btn' + (who === n ? ' active' : '') + '" data-who="' + n + '">' + n + '</button>';
      }).join('') +
      '</div>' + (who ? '' : '<div class="note" id="rev-who-hint">Tap your name so your edits are tagged and merged, not overwritten.</div>') + '</div>' +
      '<div class="card accent"><h3>Next week’s logistics (w/c ' + esc(nextWC) + ')</h3>' + sectionStamp('logistics') +
      '<div class="review-day review-head"><span>Day</span><span>Maya</span><span>Tom</span><span class="hide-sm">Drop-off</span><span class="hide-sm">Pick-up</span></div>' +
      rows +
      '<div style="margin-top:12px"><label class="review-head">Childminder exceptions (holidays, granny days, classes)' + sectionStamp('exceptions') + '</label>' +
      '<textarea class="review-textarea" id="rev-exceptions" placeholder="e.g. childminder closed Friday, baby at granny’s">' + esc(saved.exceptions || '') + '</textarea></div></div>' +
      '<div class="card"><h3>How did the food week go?</h3>' +
      '<label class="review-head">Skipped, refused or swapped meals' + sectionStamp('food') + '</label>' +
      '<textarea class="review-textarea" id="rev-food" placeholder="e.g. skipped the fritters, not keen on the butter beans (try them blended next time), tagine was a hit">' + esc(saved.food || '') + '</textarea>' +
      '<div class="note">If he was not keen on something, note it here. We will not drop it, just offer it again in a different format.</div>' +
      '<label class="review-head" style="display:block;margin-top:10px">Ran out of or running low, to restock' + sectionStamp('ran_out') + '</label>' +
      '<textarea class="review-textarea" id="rev-ran-out" placeholder="e.g. used the last of the red lentils, low on porridge oats">' + esc(saved.ran_out || '') + '</textarea>' +
      '<label class="review-head" style="display:block;margin-top:10px">Freezer corrections' + sectionStamp('freezer') + '</label>' +
      '<textarea class="review-textarea" id="rev-freezer" placeholder="e.g. we ate one ragu portion at the weekend">' + esc(saved.freezer || '') + '</textarea>' +
      '<label class="review-head" style="display:block;margin-top:10px">Plans and events for next week, and anything else' + sectionStamp('notes') + '</label>' +
      '<textarea class="review-textarea" id="rev-notes" placeholder="e.g. visitors Saturday, day trip Wednesday, keep Sunday cook short">' + esc(saved.notes || '') + '</textarea>' +
      '<label class="review-head" style="display:block;margin-top:10px">Anything circling in your head? Park it here' + sectionStamp('braindump') + '</label>' +
      '<textarea class="review-textarea" id="rev-braindump" placeholder="One per line: swimming lessons?, present for Niamh, car insurance renewal. Claude sorts each one into a task, the shopping list, the calendar or the horizon list when it plans the week.">' + esc(saved.braindump || '') + '</textarea>' +
      '<button class="pill-btn" id="rev-save" style="margin-top:14px">Save review</button>' +
      '<div class="saved-note" id="rev-saved">Saved. Next week’s plan will be built from this.</div></div>';

    el('rev-save').addEventListener('click', function() {
      var whoNow = getWho();
      var prev = state.review[nextWC] || {};
      var newDays = dayNames.map(function(_, i) {
        function v(sel) {
          var n = document.querySelector('[data-rev="' + sel + '-' + i + '"]');
          return n ? n.value : '';
        }
        return {
          maya: v('maya'),
          tom: v('tom'),
          drop: v('drop'),
          pick: v('pick')
        };
      });
      var fields = {
        exceptions: el('rev-exceptions').value,
        food: el('rev-food').value,
        ran_out: el('rev-ran-out').value,
        freezer: el('rev-freezer').value,
        notes: el('rev-notes').value,
        braindump: el('rev-braindump').value
      };
      var stamp = whoNow ? {
        by: whoNow,
        at: new Date().toISOString()
      } : null;
      var changedKeys = {};
      ['exceptions', 'food', 'ran_out', 'freezer', 'notes', 'braindump'].forEach(function(k) {
        if ((prev[k] || '') !== fields[k]) changedKeys[k] = true;
      });
      var daysChanged = JSON.stringify(prev.days || []) !== JSON.stringify(newDays);

      function finish(base) {
        base = base || {};
        var merged = Object.assign({}, base);
        var editedBy = Object.assign({}, base.edited_by || {});
        ['exceptions', 'food', 'ran_out', 'freezer', 'notes', 'braindump'].forEach(function(k) {
          if (changedKeys[k]) {
            merged[k] = fields[k];
            if (stamp) editedBy[k] = stamp;
          } else if (!(k in merged)) merged[k] = fields[k];
        });
        if (daysChanged) {
          merged.days = newDays;
          if (stamp) editedBy.logistics = stamp;
        } else if (!merged.days) merged.days = newDays;
        merged.edited_by = editedBy;
        merged.saved_by = whoNow;
        merged.saved_at = new Date().toISOString();
        state.review[nextWC] = merged;
        persist();
        el('rev-saved').style.display = 'block';
        renderReview();
      }

      if (remote) {
        fetch('api/state').then(function(r) {
            return r.ok ? r.json() : null;
          })
          .then(function(data) {
            finish(data && data.review && data.review[nextWC] ? data.review[nextWC] : prev);
          })
          .catch(function() {
            finish(prev);
          });
      } else {
        finish(prev);
      }
    });
  }

  /* ---------- delegated events ---------- */
  document.addEventListener('click', function(e) {
    var link = e.target.closest('.recipe-link');
    if (link && link.dataset.recipe) {
      e.preventDefault();
      openRecipe(link.dataset.recipe);
      return;
    }
    var coll = e.target.closest('[data-collapse]');
    if (coll) {
      var dc = coll.closest('.daycard');
      if (dc) dc.classList.toggle('collapsed');
      return;
    }
    var jt = e.target.closest('[data-gototask]');
    if (jt) {
      e.preventDefault();
      jumpToTask(jt.dataset.gototask);
      return;
    }
    var jl = e.target.closest('[data-jumptodo]');
    if (jl) {
      e.preventDefault();
      jumpToTask(null);
      return;
    }
    var gr = e.target.closest('[data-gotoreview]');
    if (gr) {
      e.preventDefault();
      goTo('review');
      window.scrollTo({
        top: 0
      });
      return;
    }
    var mv = e.target.closest('[data-movetask]');
    if (mv) {
      e.preventDefault();
      var mtk = state.tasks.find(function(x) {
        return x.id === mv.dataset.movetask;
      });
      if (mtk) {
        mtk.when = mv.dataset.moveto;
        persist();
        renderHousehold();
      }
      return;
    }
    var dst = e.target.closest('[data-delstock]');
    if (dst) {
      e.preventDefault();
      state.removedStock = state.removedStock || {};
      state.removedStock[dst.dataset.delstock] = 1;
      persist();
      renderHousehold();
      return;
    }
    var dbt = e.target.closest('[data-delbabytodo]');
    if (dbt) {
      e.preventDefault();
      state.babyTodo = (state.babyTodo || []).filter(function(it) {
        return it.id !== dbt.dataset.delbabytodo;
      });
      persist();
      renderBaby();
      return;
    }
    var navc = e.target.closest('[data-cal-nav]');
    if (navc) {
      if (calRef) calRef.setMonth(calRef.getMonth() + parseInt(navc.dataset.calNav, 10));
      renderMonth();
      return;
    }
    var et = e.target.closest('[data-edittask]');
    if (et) {
      editingTask = et.dataset.edittask;
      renderHousehold();
      return;
    }
    var ct = e.target.closest('[data-canceltask]');
    if (ct) {
      editingTask = null;
      renderHousehold();
      return;
    }
    var sv = e.target.closest('[data-savetask]');
    if (sv) {
      var sid = sv.dataset.savetask;
      var titleEl = el('edit-title-' + sid),
        ownerEl = el('edit-owner-' + sid);
      var stk = state.tasks.find(function(x) {
        return x.id === sid;
      });
      if (stk && titleEl) {
        var nv = titleEl.value.trim();
        if (nv) stk.title = nv;
        if (ownerEl) stk.owner = ownerEl.value;
      }
      editingTask = null;
      persist();
      renderHousehold();
      renderToday();
      renderWeek();
      return;
    }
    var del = e.target.closest('[data-del]');
    if (del) {
      state.tasks = state.tasks.filter(function(tk) {
        return tk.id !== del.dataset.del;
      });
      persist();
      renderHousehold();
      renderToday();
      return;
    }
    var dn = e.target.closest('[data-delnext]');
    if (dn) {
      state.nextList = state.nextList.filter(function(n) {
        return n.id !== dn.dataset.delnext;
      });
      persist();
      renderHousehold();
      return;
    }
    var ds = e.target.closest('[data-delshop]');
    if (ds) {
      e.preventDefault();
      state.customShop = state.customShop.filter(function(c) {
        return c.id !== ds.dataset.delshop;
      });
      delete state.shop[ds.dataset.delshop];
      persist();
      renderShopping();
      return;
    }
    var w = e.target.closest('[data-who]');
    if (w) {
      setWho(w.dataset.who);
      // Update the name buttons in place instead of re-rendering, so anything
      // already typed into the review boxes is not wiped.
      document.querySelectorAll('[data-who]').forEach(function(b) {
        b.classList.toggle('active', b.dataset.who === w.dataset.who);
      });
      var hint = el('rev-who-hint');
      if (hint) hint.style.display = 'none';
      return;
    }
    var st = e.target.closest('[data-staple]');
    if (st) {
      var cur = stapleStatus(st.dataset.staple);
      var next = cur === 'in_stock' ? 'low' : (cur === 'low' ? 'out' : 'in_stock');
      state.staples[st.dataset.staple] = next;
      st.className = 'staple-chip ' + (next === 'in_stock' ? '' : next);
      persist();
      return;
    }
  });
  document.addEventListener('change', function(e) {
    var t = e.target;
    if (t.dataset.shop) {
      if (t.checked) state.shop[t.dataset.shop] = 1;
      else delete state.shop[t.dataset.shop];
      t.closest('.shop-item').classList.toggle('done', t.checked);
      updateCounts();
      persist();
      return;
    }
    if (t.dataset.action) {
      if (t.checked) state.actions[t.dataset.action] = 1;
      else delete state.actions[t.dataset.action];
      t.closest('.task-item').classList.toggle('done', t.checked);
      persist();
      return;
    }
    if (t.dataset.task) {
      var tk = state.tasks.find(function(x) {
        return x.id === t.dataset.task;
      });
      if (tk) {
        tk.done = t.checked;
        persist();
        renderHousehold();
        renderToday();
        renderWeek();
      }
      return;
    }
    if (t.dataset.rem) {
      if (t.checked) state.remindersDone[t.dataset.rem] = 1;
      else delete state.remindersDone[t.dataset.rem];
      t.closest('.task-item').classList.toggle('done', t.checked);
      persist();
      return;
    }
    if (t.dataset.pay) {
      if (t.checked) state.paymentsDone[t.dataset.pay] = 1;
      else delete state.paymentsDone[t.dataset.pay];
      t.closest('.task-item').classList.toggle('done', t.checked);
      persist();
      return;
    }
    if (t.dataset.field && t.dataset.date) {
      var o = state.logistics[t.dataset.date] || {};
      o[t.dataset.field] = t.value;
      state.logistics[t.dataset.date] = o;
      persist();
      return;
    }
    if (t.dataset.babytodo) {
      var bit = (state.babyTodo || []).find(function(x) {
        return x.id === t.dataset.babytodo;
      });
      if (bit) {
        bit.done = t.checked;
        persist();
        renderBaby();
      }
      return;
    }
    if (t.dataset.food !== undefined && t.classList.contains('reaction-input')) {
      state.reactions[t.dataset.food] = t.value;
      persist();
      return;
    }
    if (t.classList && t.classList.contains('baby-text')) {
      state.baby = state.baby || {};
      state.baby[t.dataset.baby] = t.value;
      persist();
      return;
    }
  });

  /* ---------- boot ---------- */
  function renderAll() {
    renderToday();
    renderWeek();
    renderMonth();
    renderShopping();
    renderPrep();
    renderRecipes();
    renderHousehold();
    renderBaby();
    renderReview();
  }
  if (!WEEK) {
    el('today-root').innerHTML = '<div class="card"><p>Could not load this week’s data: data.js is missing or broken.</p></div>';
  } else {
    var eyebrowEl = el('eyebrow');
    if (eyebrowEl) eyebrowEl.textContent = 'Sorted · week of ' + fmtNice(WEEK.week_commencing);
    loadLocal();
    rollWeek();
    seedTasks();
    renderAll();
    pullRemote(true).then(function() {
      // Run the shopping-version reset only after the shared state has loaded,
      // so we clear last week's ticks even when they come back from sync.
      rollWeek();
      syncShoppingVersion();
      seedTasks();
      renderAll();
    });
  }
})();
