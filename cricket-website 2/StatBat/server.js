const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 8000;
const HOST = '0.0.0.0';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, 'Homepage')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Homepage/index.html'));
});

const fetchHTML = async (url) => {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    },
    timeout: 12000
  });
  return response.data;
};

const parseCricketScore = ($) => {
  const getText = (selector) => $(selector).first().text().trim() || '';
  const getAny = (...selectors) => {
    for (const sel of selectors) {
      const t = $(sel).first().text().trim();
      if (t) return t;
    }
    return '';
  };

  const liveStatuses = [
    '.cb-text-inprogress',
    '.cb-text-stumps',
    '.cb-text-lunch',
    '.cb-text-inningsbreak',
    '.cb-text-tea',
    '.cb-text-rain',
    '.cb-text-wetoutfield',
    '.cb-text-delay'
  ];

  const allStatusSelectors = [
    '.cb-col.cb-col-100.cb-min-stts.cb-text-complete',
    '.cb-text-inprogress',
    '.cb-col.cb-col-100.cb-font-18.cb-toss-sts.cb-text-abandon',
    '.cb-text-stumps',
    '.cb-text-lunch',
    '.cb-text-inningsbreak',
    '.cb-text-tea',
    '.cb-text-rain',
    '.cb-text-wetoutfield',
    '.cb-text-delay',
    '.cb-col.cb-col-100.cb-font-18.cb-toss-sts',
    '.cb-min-stts'
  ];

  const isLive = liveStatuses.some(sel => $(sel).first().text().trim() !== '');

  const matchUpdate = allStatusSelectors
    .map((selector) => $(selector).first().text().trim())
    .find((status) => status) || '';

  const matchDateElement = $('span[itemprop="startDate"]').attr('content');
  const matchDate = matchDateElement && new Date(matchDateElement).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: true
  });

  const rawTitle = getText('h1.cb-nav-hdr');
  const title = rawTitle
    .replace(' - Live Cricket Score, Commentary', '')
    .replace(' - Live Cricket Score', '')
    .trim();

  const livescore = getAny('.cb-font-20.text-bold', '.cb-ovr-flo.cb-font-20.text-bold');
  const runrate = getAny('.cb-font-12.cb-text-gray', '.cb-text-gray.cb-font-12');

  const tossInfo = getText('.cb-toss-sts');


  let startTime = '';
  try {
    const rawHtml = $.html();
    const dtIdx = rawHtml.indexOf('Date &amp; Time:');
    if (dtIdx > -1) {
      const section = rawHtml.slice(dtIdx, dtIdx + 300);

      const plain = section
        .replace(/<!--.*?-->/gs, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const m = plain.match(/(Today|Tomorrow|[A-Z][a-z]+\s+\d{1,2})[\s,]*(\d{1,2}:\d{2}\s*[AP]M)/i);
      if (m) {
        startTime = `${m[1]}, ${m[2]}`;
      } else {
        const justTime = plain.match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
        if (justTime) startTime = justTime[1];
      }
    }
  } catch (_) {}

  return {
    title,
    update: matchUpdate,
    tossInfo,
    matchDate: matchDate || '',
    startTime,
    livescore,
    runrate,
    isLive
  };
};

app.get('/score', async (req, res) => {
  const id = req.query.id;
  if (!id) {
    return res.status(400).json({ error: 'Match ID is required' });
  }
  try {
    const url = `https://www.cricbuzz.com/live-cricket-scores/${id}`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const matchData = parseCricketScore($);
    res.json(matchData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch match data. The match may not be live yet.' });
  }
});


app.get('/match-detail', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Match ID required' });

  try {
    const html = await fetchHTML(`https://www.cricbuzz.com/live-cricket-scores/${id}/`);
    const $ = cheerio.load(html);


    const rawH1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
    const title = rawH1
      .replace(/\s*-\s*(Live Cricket Score|Commentary).*$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

  
    const metaTitle = $('title').text().replace(/\s+/g, ' ').trim();


    const statusSelectors = [
      '.cb-text-complete', '.cb-text-inprogress', '.cb-text-stumps',
      '.cb-text-lunch', '.cb-text-inningsbreak', '.cb-text-tea',
      '.cb-text-rain', '.cb-text-wetoutfield', '.cb-text-delay',
      '.cb-col.cb-col-100.cb-min-stts', '.cb-min-stts',
      '.cb-col.cb-col-100.cb-font-18.cb-toss-sts'
    ];
    let update = '';
    for (const sel of statusSelectors) {
      const t = $(sel).first().text().trim();
      if (t) { update = t; break; }
    }

    const tossInfo = $('.cb-toss-sts').first().text().trim();
    const isLive = [
      '.cb-text-inprogress', '.cb-text-stumps', '.cb-text-lunch',
      '.cb-text-tea', '.cb-text-inningsbreak'
    ].some(s => $(s).first().text().trim() !== '');

   
    let startTime = '';
    try {
      const dtIdx = html.indexOf('Date &amp; Time:');
      if (dtIdx > -1) {
        const section = html.slice(dtIdx, dtIdx + 300)
          .replace(/<!--.*?-->/gs, '').replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        const m = section.match(/(Today|Tomorrow|[A-Z][a-z]+\s+\d{1,2})[\s,]*(\d{1,2}:\d{2}\s*[AP]M)/i);
        if (m) startTime = `${m[1]}, ${m[2]}`;
      }
    } catch (_) {}

    
    const batters = [];
    const bowlers = [];
    let parsingBowlers = false;

    $('[class*="scorecard-bat-grid"]').each((_, el) => {
      
      const cells = $(el).children().map((_, c) => $(c).text().replace(/\s+/g, ' ').trim()).get();
      if (!cells.length) return;

      const first = cells[0] || '';
     
      if (/^Batter/i.test(first) || first === 'R') { parsingBowlers = false; return; }
      if (/^Bowler/i.test(first) || first === 'O') { parsingBowlers = true; return; }
      if (/^Key Stats/i.test(first)) return;

      if (parsingBowlers && cells.length >= 2) {
        bowlers.push({
          name: first.replace(/\s*\*\s*$/, '').trim(),
          overs: cells[1] || '', maidens: cells[2] || '',
          runs: cells[3] || '', wickets: cells[4] || '', econ: cells[5] || ''
        });
      } else if (!parsingBowlers && cells.length >= 2) {
        batters.push({
          name: first.replace(/\s*\*\s*$/, '').trim(),
          runs: cells[1] || '', balls: cells[2] || '',
          fours: cells[3] || '', sixes: cells[4] || '', sr: cells[5] || '',
          onStrike: first.includes('*')
        });
      }
    });


    const inningsScores = [];
    $('[class*="cb-font-20"]').each((_, el) => {
      const t = $(el).text().trim();
      if (t && /\d/.test(t)) inningsScores.push(t);
    });


    const effectivelyLive = isLive || batters.length > 0 || bowlers.length > 0;

    res.json({
      title,
      metaTitle,
      update,
      tossInfo,
      isLive: effectivelyLive,
      startTime,
      batters,
      bowlers,
      inningsScores
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch match details' });
  }
});

app.get('/live-matches', async (req, res) => {
  try {
    const html = await fetchHTML('https://www.cricbuzz.com/cricket-match/live-scores');
    const $ = cheerio.load(html);

    const matches = [];
    const seen = new Set();

    $('a[href*="/live-cricket-scores/"]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const titleAttr = $(el).attr('title') || '';

      const idMatch = href.match(/\/live-cricket-scores\/(\d+)\//);
      if (!idMatch) return;

      const id = idMatch[1];
      if (seen.has(id)) return;
      seen.add(id);

      const parts = titleAttr.split(' - ');
      const matchName = (parts[0] || '').trim();
      const status = (parts[1] || '').trim();

      if (!matchName) return;

      const statusLower = status.toLowerCase();
      let category = 'upcoming';
      if (!status || statusLower === '') {
        category = 'live';
      } else if (
        statusLower.includes('won') ||
        statusLower.includes('complete') ||
        statusLower.includes('abandon') ||
        statusLower.includes('tie') ||
        statusLower.includes('draw')
      ) {
        category = 'completed';
      } else if (
        statusLower.includes('preview') ||
        statusLower.includes('upcoming') ||
        statusLower.includes('scheduled')
      ) {
        category = 'upcoming';
      } else {
        category = 'live';
      }

      matches.push({ id, title: matchName, status, category });
    });


    const PAUSED_KEYWORDS = ['stumps', 'lunch', 'tea', 'innings break', 'rain', 'wet outfield', 'delay', 'bad light'];
    const liveMatches = matches.filter(m => {
      if (m.category !== 'live') return false;
      const s = (m.status || '').toLowerCase();
      return !PAUSED_KEYWORDS.some(p => s.includes(p));
    });

    const upcomingMatches = matches.filter(m => m.category === 'upcoming');

    const [scoredLive, timedUpcoming] = await Promise.all([
      Promise.all(
        liveMatches.slice(0, 6).map(async (match) => {
          try {
            const url = `https://www.cricbuzz.com/live-cricket-scores/${match.id}`;
            const matchHtml = await fetchHTML(url);
            const $m = cheerio.load(matchHtml);
            const scoreData = parseCricketScore($m);
         
            if (!scoreData.title) {
              const h1 = $m('h1').first().text().replace(/\s+/g, ' ')
                .replace(/\s*-\s*(Live Cricket Score|Commentary).*$/i, '').trim();
              scoreData.title = h1 || match.title;
            }
           
            const metaScore = $m('title').text().replace(/\s+/g, ' ').trim();
            return { ...match, ...scoreData, metaScore };
          } catch {
            return match;
          }
        })
      ),
      Promise.all(
        upcomingMatches.slice(0, 6).map(async (match) => {
          try {
            const url = `https://www.cricbuzz.com/live-cricket-scores/${match.id}`;
            const matchHtml = await fetchHTML(url);
            const $m = cheerio.load(matchHtml);
            const data = parseCricketScore($m);
            const metaScore = $m('title').text().replace(/\s+/g, ' ').trim();
            return { ...match, startTime: data.startTime, tossInfo: data.tossInfo, metaScore };
          } catch {
            return match;
          }
        })
      )
    ]);

    const allMatchesCategorized = matches.map(m => {
      const scored = scoredLive.find(s => s.id === m.id);
      if (scored) return scored;
      const timed = timedUpcoming.find(t => t.id === m.id);
      if (timed) return timed;
      return m;
    });

    res.json({
      liveNow: scoredLive,
      allMatches: allMatchesCategorized
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch live matches' });
  }
});


const LEAGUE_CONFIG = {
  ipl: {
    seriesId: 9241,
    slug: 'indian-premier-league-2026',
    name: 'Indian Premier League 2026',
    shortName: 'IPL 2026',
    keywords: ['ipl', 'indian premier league', 'kkr', 'mi', 'csk', 'rcb', 'srh', 'dc', 'gt', 'lsg', 'rr', 'pbks',
      'kolkata', 'mumbai', 'chennai', 'royal challengers', 'sunrisers', 'delhi', 'gujarat', 'lucknow', 'rajasthan', 'punjab']
  },
  psl: {
    seriesId: 11537,
    slug: 'pakistan-super-league-2026',
    name: 'Pakistan Super League 2026',
    shortName: 'PSL 2026',
    keywords: ['psl', 'pakistan super league', 'karachi', 'lahore', 'quetta', 'peshawar', 'multan', 'islamabad']
  },
  county1: {
    seriesId: 11408,
    slug: 'county-championship-division-one-2026',
    name: 'County Championship Division One 2026',
    shortName: 'County Div 1',
    keywords: ['county championship', 'county div 1', 'division one', 'surrey', 'kent', 'hampshire', 'lancashire', 'warwickshire', 'yorkshire', 'nottinghamshire', 'worcestershire', 'durham', 'middlesex', 'somerset']
  },
  county2: {
    seriesId: 11416,
    slug: 'county-championship-division-two-2026',
    name: 'County Championship Division Two 2026',
    shortName: 'County Div 2',
    keywords: ['county div 2', 'division two', 'gloucestershire', 'derbyshire', 'essex', 'leicestershire', 'northamptonshire', 'glamorgan', 'sussex', 'leicestershire']
  },
  bpl: {
    seriesId: 11328,
    slug: 'bangladesh-premier-league-2025-26',
    name: 'Bangladesh Premier League 2025-26',
    shortName: 'BPL 2025-26',
    keywords: ['bpl', 'bangladesh premier league', 'rangpur', 'chattogram', 'comilla', 'dhaka', 'rajshahi', 'sylhet', 'khulna', 'durdanto', 'royals', 'challengers']
  },
  npl: {
    seriesId: 11190,
    slug: 'nepal-premier-league-2025',
    name: 'Nepal Premier League 2025',
    shortName: 'NPL 2025',
    keywords: ['npl', 'nepal premier league', 'janakpur', 'pokhara', 'chitwan', 'bagmati', 'lumbini', 'sudurpaschim', 'koshi', 'gandaki']
  },
  hundredw: {
    seriesId: 11504,
    slug: 'the-hundred-womens-competition-2026',
    name: "The Hundred Women's 2026",
    shortName: "Hundred Women's",
    keywords: ["the hundred", "hundred women", "oval invincibles", "london spirit", "manchester originals", "trent rockets", "southern brave", "welsh fire", "northern superchargers", "birmingham phoenix"]
  },
  iccwt20q: {
    seriesId: 11399,
    slug: 'icc-womens-t20-world-cup-global-qualifier-2026',
    name: "ICC Women's T20 WC Qualifier 2026",
    shortName: "WT20 Qualifier",
    keywords: ['icc women', 't20 world cup qualifier', 'netherlands', 'scotland', 'thailand', 'nepal', 'zimbabwe', 'bangladesh women', 'ireland women', 'usa women', 'png women', 'namibia']
  },
  accwomen: {
    seriesId: 11452,
    slug: 'acc-womens-asia-cup-rising-stars-2026',
    name: "ACC Women's Asia Cup Rising Stars 2026",
    shortName: "ACC Women's Asia Cup",
    keywords: ['acc women', 'asia cup rising stars', 'bangladesh women', 'sri lanka women', 'thailand women', 'malaysia women', 'india women', 'pakistan women', 'uae women', 'nepal women']
  },
  iccwt20c: {
    seriesId: 12015,
    slug: 'icc-womens-t20i-challenge-trophy-2026',
    name: "ICC Women's T20I Challenge Trophy 2026",
    shortName: "WT20I Challenge",
    keywords: ['icc women challenge', 't20i challenge trophy', 'usa women', 'rwanda women', 'nepal women', 'italy women', 'vanuatu women']
  },


  bbl: {
    seriesId: 10289,
    slug: 'big-bash-league-2025-26',
    name: 'Big Bash League 2025-26',
    shortName: 'BBL 2025-26',
    keywords: ['bbl', 'big bash', 'sydney sixers', 'sydney thunder', 'melbourne stars', 'melbourne renegades', 'perth scorchers', 'adelaide strikers', 'brisbane heat', 'hobart hurricanes']
  },
  wbbl: {
    seriesId: 10405,
    slug: 'womens-big-bash-league-2025',
    name: "Women's Big Bash League 2025",
    shortName: 'WBBL 2025',
    keywords: ['wbbl', 'women big bash', 'sydney sixers women', 'sydney thunder women', 'melbourne stars women', 'melbourne renegades women', 'perth scorchers women', 'adelaide strikers women', 'brisbane heat women', 'hobart hurricanes women']
  },
  sa20: {
    seriesId: 10394,
    slug: 'sa20-2025-26',
    name: 'SA20 2025-26',
    shortName: 'SA20',
    keywords: ['sa20', 'mi cape town', 'joburg super kings', 'pretoria capitals', 'sunrisers eastern cape', 'durban super giants', 'paarl royals']
  },
  cpl: {
    seriesId: 9575,
    slug: 'caribbean-premier-league-2025',
    name: 'Caribbean Premier League 2025',
    shortName: 'CPL 2025',
    keywords: ['cpl', 'caribbean premier league', 'trinbago knight riders', 'guyana amazon warriors', 'barbados royals', 'saint lucia kings', 'saint kitts nevis patriots', 'antigua barbuda falcons']
  },
  wcpl: {
    seriesId: 10141,
    slug: 'womens-caribbean-premier-league-2025',
    name: "Women's Caribbean Premier League 2025",
    shortName: 'WCPL 2025',
    keywords: ['wcpl', 'women caribbean premier', 'trinbago knight riders women', 'guyana amazon warriors women', 'barbados royals women']
  },
  ilt20: {
    seriesId: 12037,
    slug: 'international-league-t20-2026',
    name: 'International League T20 2026',
    shortName: 'ILT20 2026',
    keywords: ['ilt20', 'international league t20', 'mi emirates', 'dubai capitals', 'sharjah warriors', 'desert vipers', 'abu dhabi knight riders', 'gulf giants']
  },
  mlc: {
    seriesId: 11793,
    slug: 'major-league-cricket-2026',
    name: 'Major League Cricket 2026',
    shortName: 'MLC 2026',
    keywords: ['mlc', 'major league cricket', 'mi new york', 'texas super kings', 'washington freedom', 'los angeles knight riders', 'san francisco unicorns', 'seattle orcas']
  },
  blast: {
    seriesId: 11284,
    slug: 't20-blast-2026',
    name: 'T20 Blast 2026 (Vitality Blast)',
    shortName: 'T20 Blast 2026',
    keywords: ['t20 blast', 'vitality blast', 'surrey', 'lancashire', 'yorkshire', 'hampshire', 'somerset', 'essex', 'sussex', 'durham', 'birmingham bears', 'northamptonshire steelbacks', 'nottinghamshire', 'kent spitfires', 'gloucestershire', 'glamorgan', 'derbyshire falcons', 'leicestershire foxes', 'middlesex', 'worcestershire rapids']
  },
  hundredm: {
    seriesId: 11493,
    slug: 'the-hundred-mens-competition-2026',
    name: "The Hundred Men's 2026",
    shortName: "Hundred Men's",
    keywords: ["the hundred men", "oval invincibles", "london spirit", "manchester originals", "trent rockets", "southern brave", "welsh fire", "northern superchargers", "birmingham phoenix"]
  },
  wpl: {
    seriesId: 11275,
    slug: 'womens-premier-league-2026',
    name: "Women's Premier League 2026",
    shortName: 'WPL 2026',
    keywords: ['wpl', 'women premier league', 'mumbai indians women', 'royal challengers bengaluru women', 'delhi capitals women', 'gujarat giants women', 'up warriorz']
  },
  smash: {
    seriesId: 10763,
    slug: 'super-smash-2025-26',
    name: 'Super Smash 2025-26',
    shortName: 'Super Smash',
    keywords: ['super smash', 'auckland aces', 'canterbury kings', 'central stags', 'northern brave', 'otago volts', 'wellington firebirds']
  },
  tnpl: {
    seriesId: 9866,
    slug: 'tamil-nadu-premier-league-2025',
    name: 'Tamil Nadu Premier League 2025',
    shortName: 'TNPL 2025',
    keywords: ['tnpl', 'tamil nadu premier', 'chepauk super gillies', 'lyca kovai kings', 'dindigul dragons', 'salem spartans', 'siechem madurai', 'idream tiruppur', 'nellai royal kings', 'ruby trichy warriors']
  },
  maharaja: {
    seriesId: 10515,
    slug: 'maharaja-trophy-ksca-t20-2025',
    name: 'Maharaja Trophy KSCA T20 2025',
    shortName: 'Maharaja KSCA T20',
    keywords: ['maharaja trophy', 'ksca t20', 'bengaluru blasters', 'mysore warriors', 'hubli tigers', 'mangaluru dragons', 'gulbarga mystics', 'shivamogga lions', 'bijapur bulls']
  }
};

const slugToName = (slug) =>
  slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const fetchLeagueStandings = async (seriesId, slug) => {
  const url = `https://www.cricbuzz.com/cricket-series/${seriesId}/${slug}/points-table`;
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);


  const teamNames = [];
  $('a[href*="/cricket-team/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/\/cricket-team\/([^/]+)\//);
    if (m) {
      const full = slugToName(m[1]);
      if (!teamNames.find(t => t.full === full)) {
        teamNames.push({ abbr: $(el).text().trim().replace(/\s*\([^)]+\)\s*$/, ''), full });
      }
    }
  });

  const teams = [];
  let dataRowIdx = 0;
  $('.point-table-grid').each((i, row) => {
    const cells = $(row).find('div[class*="flex"]')
      .map((_, el) => $(el).text().trim()).get().filter(t => t);
    const posNum = parseInt(cells[0]);
    if (cells.length >= 6 && i > 0 && posNum >= 1) {
      const info = teamNames[dataRowIdx] || { abbr: '?', full: 'Unknown' };
      if (info.abbr === '?') { dataRowIdx++; return; }
      teams.push({
        pos:      parseInt(cells[0]) || dataRowIdx + 1,
        abbr:     info.abbr,
        name:     info.full,
        played:   parseInt(cells[1]) || 0,
        won:      parseInt(cells[2]) || 0,
        lost:     parseInt(cells[3]) || 0,
        noResult: parseInt(cells[4]) || 0,
        pts:      parseInt(cells[5]) || 0,
        nrr:      cells[6] || '0.000'
      });
      dataRowIdx++;
    }
  });
  return teams;
};

const fetchLeagueFixtures = async (seriesId, slug) => {
  const url = `https://www.cricbuzz.com/cricket-series/${seriesId}/${slug}/matches`;
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  const fixtures = [];
  const seen = new Set();

  $('a[href*="/live-cricket-scores/"]').each((_, el) => {
    const href  = $(el).attr('href') || '';
    const title = $(el).attr('title') || '';
    const idM   = href.match(/\/live-cricket-scores\/(\d+)\//);
    if (!idM) return;
    const id = idM[1];
    if (seen.has(id)) return;
    seen.add(id);

    const parts  = title.split(' - ');
    const name   = (parts[0] || '').trim();
    const status = (parts[1] || '').trim();
    if (!name) return;

    const sl = status.toLowerCase();
    let category = 'upcoming';
    if (!status || sl === 'live') category = 'live';
    else if (sl.includes('won') || sl.includes('complete') || sl.includes('tie') || sl.includes('draw') || sl.includes('abandon')) category = 'completed';
    else if (sl.includes('preview') || sl.includes('upcoming') || sl.includes('scheduled')) category = 'upcoming';
    else if (sl.includes('stumps') || sl.includes('inprogress') || sl.includes('lunch') || sl.includes('tea')) category = 'live';

    fixtures.push({ id, title: name, status, category });
  });

  return fixtures;
};

app.get('/leagues', async (req, res) => {
  const { league = 'ipl' } = req.query;
  const config = LEAGUE_CONFIG[league.toLowerCase()];
  if (!config) return res.status(400).json({ error: `Unknown league. Use: ${Object.keys(LEAGUE_CONFIG).join(', ')}` });

  try {
    const [standings, fixtures] = await Promise.all([
      fetchLeagueStandings(config.seriesId, config.slug),
      fetchLeagueFixtures(config.seriesId, config.slug)
    ]);

    const formMap = {};
    [...fixtures].reverse().forEach(f => {
      if (f.category !== 'completed' || !f.status) return;
      const result = f.status;
      const sl = result.toLowerCase();


      let resultType = null;
      let winner = null;
      if (/\btied\b/.test(sl)) {
        resultType = 'T';
      } else if (/\bdrawn?\b|\bdraw\b/.test(sl)) {
        resultType = 'D';
      } else if (/\babandon|\bno result|\brain/.test(sl)) {
        resultType = 'NR';
      } else {
        const winM = result.match(/^(\S+)\s+won/i);
        if (winM) { resultType = 'WIN'; winner = winM[1].toLowerCase(); }
      }
      if (!resultType) return;

      standings.forEach(team => {
        const abbr = team.abbr.toLowerCase().replace(/\s+/g, '');
        const fullWords = team.name.toLowerCase().split(/\s+/);
        const titleL = f.title.toLowerCase();

        const isInvolved = titleL.includes(abbr) || fullWords.some(w => w.length >= 4 && titleL.includes(w));
        if (!isInvolved) return;
        if (!formMap[team.abbr]) formMap[team.abbr] = [];
        if (formMap[team.abbr].length >= 6) return;

        if (resultType === 'T' || resultType === 'D' || resultType === 'NR') {
          formMap[team.abbr].push(resultType);
        } else if (resultType === 'WIN' && winner) {
          const isWinner = winner.includes(abbr) || fullWords.some(w => w.length >= 3 && winner.includes(w.slice(0, 3)));
          formMap[team.abbr].push(isWinner ? 'W' : 'L');
        }
      });
    });

    standings.forEach(t => { t.form = (formMap[t.abbr] || []).reverse(); });

    res.json({
      league: config.name,
      shortName: config.shortName,
      standings,
      fixtures: fixtures.slice(0, 30)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch league data. Please try again.' });
  }
});

const ESPN_TEAM_IDS = {
  'Afghanistan': 40,
  'Australia': 2,
  'Bangladesh': 25,
  'England': 1,
  'India': 6,
  'Ireland': 29,
  'New Zealand': 5,
  'Pakistan': 7,
  'South Africa': 3,
  'Sri Lanka': 8,
  'West Indies': 4,
  'Zimbabwe': 9,
  'Scotland': 30,
  'Netherlands': 15,
  'Nepal': 32,
  'Oman': 28,
  'USA': 11,
  'Canada': 17,
  'Kenya': 26,
  'UAE': 8,
  'Namibia': 37,
  'Papua New Guinea': 27
};

const ESPN_FORMAT_CLASS = {
  'test': 1,
  'odi': 2,
  't20': 3,
  't20i': 3
};

const FORMAT_LABEL = {
  'test': 'Test',
  'odi': 'ODI',
  't20': 'T20I',
  't20i': 'T20I'
};

const fetchH2HStats = async (teamId, oppId, formatClass) => {
  const url = `https://stats.espncricinfo.com/ci/engine/stats/index.html?class=${formatClass};filter=advanced;opposition=${oppId};team=${teamId};template=results;type=team`;
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  let stats = null;
  $('.engineTable').each((i, table) => {
    const text = $(table).text();
    if (text.includes('Mat') && text.includes('Won') && text.includes('Lost') && text.includes('HS')) {
      const rows = $(table).find('tr');
      rows.each((ri, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 13) {
          const mat = parseInt($(cells[2]).text().trim());
          if (!isNaN(mat) && mat > 0) {
            stats = {
              matches: mat,
              won: parseInt($(cells[3]).text().trim()) || 0,
              lost: parseInt($(cells[4]).text().trim()) || 0,
              tied: parseInt($(cells[5]).text().trim()) || 0,
              noResult: parseInt($(cells[6]).text().trim()) || 0,
              avgRunRate: parseFloat($(cells[9]).text().trim()) || 0,
              highScore: $(cells[11]).text().trim() || 'N/A',
              lowScore: $(cells[12]).text().trim() || 'N/A',
              span: $(cells[1]).text().trim() || ''
            };
          }
        }
      });
    }
  });
  return stats;
};

app.get('/h2h', async (req, res) => {
  const { team1, team2, format = 'odi' } = req.query;

  if (!team1 || !team2) {
    return res.status(400).json({ error: 'Both team1 and team2 are required' });
  }
  if (team1 === team2) {
    return res.status(400).json({ error: 'Teams must be different' });
  }

  const id1 = ESPN_TEAM_IDS[team1];
  const id2 = ESPN_TEAM_IDS[team2];

  if (!id1) return res.status(400).json({ error: `No stats available for "${team1}"` });
  if (!id2) return res.status(400).json({ error: `No stats available for "${team2}"` });

  const formatClass = ESPN_FORMAT_CLASS[format.toLowerCase()] || 2;

  try {
    const [stats1, stats2] = await Promise.all([
      fetchH2HStats(id1, id2, formatClass),
      fetchH2HStats(id2, id1, formatClass)
    ]);

    if (!stats1 && !stats2) {
      return res.status(404).json({ error: `No head-to-head ${format.toUpperCase()} data found between ${team1} and ${team2}` });
    }

    const totalMatches = stats1 ? stats1.matches : (stats2 ? stats2.matches : 0);

    res.json({
      team1: {
        name: team1,
        matches: totalMatches,
        won: stats1 ? stats1.won : 0,
        lost: stats1 ? stats1.lost : 0,
        tied: stats1 ? stats1.tied : 0,
        noResult: stats1 ? stats1.noResult : 0,
        winRate: totalMatches > 0 ? ((stats1 ? stats1.won : 0) / (totalMatches - (stats1 ? stats1.noResult : 0)) * 100).toFixed(1) : '0.0',
        avgRunRate: stats1 ? stats1.avgRunRate : 0,
        highScore: stats1 ? stats1.highScore : 'N/A',
        lowScore: stats1 ? stats1.lowScore : 'N/A',
        span: stats1 ? stats1.span : ''
      },
      team2: {
        name: team2,
        matches: totalMatches,
        won: stats2 ? stats2.won : 0,
        lost: stats2 ? stats2.lost : 0,
        tied: stats2 ? stats2.tied : 0,
        noResult: stats2 ? stats2.noResult : 0,
        winRate: totalMatches > 0 ? ((stats2 ? stats2.won : 0) / (totalMatches - (stats2 ? stats2.noResult : 0)) * 100).toFixed(1) : '0.0',
        avgRunRate: stats2 ? stats2.avgRunRate : 0,
        highScore: stats2 ? stats2.highScore : 'N/A',
        lowScore: stats2 ? stats2.lowScore : 'N/A',
        span: stats2 ? stats2.span : ''
      },
      format: FORMAT_LABEL[format.toLowerCase()] || format.toUpperCase(),
      source: 'ESPN Cricinfo Statsguru'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch head-to-head statistics. Please try again.' });
  }
});


const CRICBUZZ_TEAMS = [
  { name: 'India',        id: 2,  slug: 'india' },
  { name: 'Australia',    id: 4,  slug: 'australia' },
  { name: 'England',      id: 9,  slug: 'england' },
  { name: 'Pakistan',     id: 3,  slug: 'pakistan' },
  { name: 'South Africa', id: 11, slug: 'south-africa' },
  { name: 'New Zealand',  id: 13, slug: 'new-zealand' },
  { name: 'Sri Lanka',    id: 5,  slug: 'sri-lanka' },
  { name: 'West Indies',  id: 10, slug: 'west-indies' },
  { name: 'Bangladesh',   id: 6,  slug: 'bangladesh' },
  { name: 'Afghanistan',  id: 96, slug: 'afghanistan' },
  { name: 'Zimbabwe',     id: 12, slug: 'zimbabwe' },
  { name: 'Ireland',      id: 27, slug: 'ireland' }
];

const memCache = new Map();
const cacheGet = (k, ttlMs) => {
  const e = memCache.get(k);
  if (!e) return null;
  if (Date.now() - e.t > ttlMs) { memCache.delete(k); return null; }
  return e.d;
};
const cacheSet = (k, d) => memCache.set(k, { d, t: Date.now() });

const fetchTeamRoster = async (team) => {
  const key = `roster:${team.id}`;
  const cached = cacheGet(key, 6 * 60 * 60 * 1000); // 6 hours
  if (cached) return cached;

  const html = await fetchHTML(`https://www.cricbuzz.com/cricket-team/${team.slug}/${team.id}/players`);
  const $ = cheerio.load(html);
  const players = [];
  const seen = new Set();

  $('a[href*="/profiles/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/\/profiles\/(\d+)\/([^/]+)/);
    if (!m) return;
    const id = m[1];
    if (seen.has(id)) return;
    const name = $(el).text().trim().replace(/\s+/g, ' ');
    if (!name || name.length > 60) return;
    seen.add(id);
    players.push({ id, slug: m[2], name, country: team.name });
  });


  players.sort((a, b) => a.name.localeCompare(b.name));
  cacheSet(key, players);
  return players;
};

app.get('/players-all', async (_req, res) => {
  try {
    const results = await Promise.allSettled(CRICBUZZ_TEAMS.map(fetchTeamRoster));
    const grouped = {};
    let total = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value.length) {
        grouped[CRICBUZZ_TEAMS[i].name] = r.value;
        total += r.value.length;
      }
    });
    if (total === 0) return res.status(502).json({ error: 'Could not load any rosters from Cricbuzz' });
    res.json({
      teams: Object.keys(grouped),
      grouped,
      total,
      source: 'Cricbuzz'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load player rosters' });
  }
});

const FORMAT_KEY_MAP = {
  test: 'Test', odi: 'ODI', t20i: 'T20', t20: 'T20', ipl: 'IPL'
};

const parseCareerTable = ($, table) => {
  const rows = [];
  $(table).find('tr').each((_, tr) => {
    const cells = [];
    $(tr).find('th, td').each((__, c) => cells.push($(c).text().trim()));
    if (cells.length) rows.push(cells);
  });
  if (rows.length < 2) return null;
  const formats = rows[0].slice(1);
  const stats = {};
  formats.forEach(f => { if (f) stats[f] = {}; });
  rows.slice(1).forEach(row => {
    const k = row[0];
    if (!k) return;
    row.slice(1).forEach((v, i) => {
      const f = formats[i];
      if (f && stats[f]) stats[f][k] = v;
    });
  });
  return stats;
};

const fetchPlayerProfile = async (id, slug) => {
  const key = `profile:${id}`;
  const cached = cacheGet(key, 30 * 60 * 1000); // 30 min
  if (cached) return cached;

  const safeSlug = slug || 'x';
  const html = await fetchHTML(`https://www.cricbuzz.com/profiles/${id}/${safeSlug}`);
  const $ = cheerio.load(html);


  const personal = {};
  $('h3').filter((_, el) => $(el).text().trim() === 'PERSONAL INFORMATION')
    .first()
    .parent()
    .find('div.w-1\\/3')
    .each((_, el) => {
      const k = $(el).text().trim();
      const v = $(el).next().text().trim().replace(/\s+/g, ' ');
      if (k && v && k.length <= 30 && v.length <= 120 && !personal[k]) personal[k] = v;
    });

  
  let image = '';
  $('img').each((_, el) => {
    if (image) return;
    const src = $(el).attr('src') || '';
    const alt = ($(el).attr('alt') || '').toLowerCase();
    if (src.includes('static.cricbuzz.com') &&
        (alt === safeSlug || src.includes(`/${safeSlug}.`) ||
         alt.replace(/[^a-z]/g, '') === safeSlug.replace(/[^a-z]/g, ''))) {
      image = src.split('?')[0] + '?d=high&p=de';
    }
  });
  if (!image) {
    const og = $('meta[property="og:image"]').attr('content');
    if (og) image = og;
  }


  let name = $('title').first().text()
    .replace(/\s*Profile\b.*$/i, '')
    .replace(/\s*-\s*ICC\b.*$/i, '')
    .replace(/\s*\|\s*Cricbuzz.*$/i, '')
    .replace(/\s*-\s*Cricbuzz.*$/i, '')
    .trim();
  if (!name || name.length > 60) {
    name = safeSlug.split('-').map(w => w[0] ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
  }

 
  let country = '';
  const teamsBlock = $('h3').filter((_, el) => $(el).text().trim() === 'TEAMS').first().parent();
  if (teamsBlock.length) {
    const teamsText = teamsBlock.text().replace(/\s+/g, ' ').replace(/^TEAMS\s*/i, '').trim();
    const parts = teamsText.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    for (const p of parts) {
      const hit = CRICBUZZ_TEAMS.find(c => c.name === p);
      if (hit) { country = hit.name; break; }
    }
  }


  let battingStats = null;
  let bowlingStats = null;
  $('table').each((_, t) => {
    const txt = $(t).text();
    if (!battingStats && txt.includes('Highest') && txt.includes('SR') && txt.includes('100s')) {
      battingStats = parseCareerTable($, t);
    } else if (!bowlingStats && txt.includes('Wickets') && txt.includes('Eco') && txt.includes('Maidens')) {
      bowlingStats = parseCareerTable($, t);
    }
  });


  const rankings = {};
  const iccBlock = $('h3').filter((_, el) => $(el).text().trim() === 'ICC RANKINGS').first().parent();
  if (iccBlock.length) {
    iccBlock.find('table').each((_, table) => {
      const rows = [];
      $(table).find('tr').each((_, tr) => {
        const cells = [];
        $(tr).find('th, td').each((__, c) => cells.push($(c).text().trim()));
        if (cells.length) rows.push(cells);
      });
      if (rows.length < 2) return;
      const header = rows[0].map(h => h.toLowerCase());
      const fmtIdx = header.findIndex(h => h.includes('format'));
      const curIdx = header.findIndex(h => h.includes('current'));
      const bestIdx = header.findIndex(h => h.includes('best'));
      if (fmtIdx === -1 || curIdx === -1) return;
      rows.slice(1).forEach(row => {
        const fmt = row[fmtIdx];
        if (!fmt) return;
        rankings[fmt] = rankings[fmt] || {};
        rankings[fmt].current = row[curIdx] || '--';
        if (bestIdx !== -1) rankings[fmt].best = row[bestIdx] || '--';
      });
    });
  }


  const recentForm = { batting: [], bowling: [] };
  const rfBlock = $('h3').filter((_, el) => $(el).text().trim() === 'RECENT FORM').first().parent();
  if (rfBlock.length) {
    rfBlock.children().each((_, section) => {
      const $sec = $(section);
      const label = $sec.find('div').filter((_, d) => {
        const t = $(d).text().trim();
        return t === 'BATTING' || t === 'BOWLING';
      }).first().text().trim();
      if (label !== 'BATTING' && label !== 'BOWLING') return;

      const target = label === 'BATTING' ? recentForm.batting : recentForm.bowling;
      $sec.find('a').each((_, a) => {
        const cells = $(a).children('div').slice(0, 4)
          .map((_, d) => $(d).text().replace(/\s+/g, ' ').trim()).get();
        if (cells.length < 4 || !cells[0]) return;
        const fmt = (cells[2] || '').replace(/^T20$/, 'T20I');
        if (label === 'BATTING') {
          target.push({ score: cells[0], opponent: cells[1], format: fmt, date: cells[3] });
        } else {
          target.push({ figures: cells[0].replace(/-/g, '/'), opponent: cells[1], format: fmt, date: cells[3] });
        }
      });
    });
  }
  recentForm.batting = recentForm.batting.slice(0, 10);
  recentForm.bowling = recentForm.bowling.slice(0, 10);


  let bio = '';
  $('h3').filter((_, el) => $(el).text().trim() === 'SUMMARY').each((_, el) => {
    if (bio) return;
    let txt = $(el).parent().text().replace(/\s+/g, ' ').trim();
    txt = txt.replace(/^(SUMMARY\s*)+/i, '').trim();
    if (txt.length > 60) bio = txt;
  });
  if (bio.length > 200) {
    const half = Math.floor(bio.length / 2);
    const a = bio.slice(0, half).trim();
    const b = bio.slice(half).trim();
    if (a && b && (a === b || a.startsWith(b.slice(0, 80)))) bio = a;
  }

 
  let teamsList = [];
  if (teamsBlock.length) {
    const teamsText = teamsBlock.text().replace(/\s+/g, ' ').replace(/^TEAMS\s*/i, '').trim();
    teamsList = teamsText.split(/[,;]/).map(s => s.trim()).filter(s => s && s.length < 60);
  }


  const careerInfo = {};
  $('h3').filter((_, el) => $(el).text().trim() === 'Career Information').each((_, el) => {
    const raw = $(el).parent().text().replace(/\s+/g, ' ').replace(/^Career Information\s*/i, '').trim();
    const fmtRegex = /(test|odi|t20|ipl|cl)Debut/gi;
    const idxs = [];
    let m;
    while ((m = fmtRegex.exec(raw)) !== null) idxs.push({ fmt: m[1].toLowerCase(), pos: m.index });
    idxs.forEach((entry, i) => {
      const start = entry.pos;
      const end = (i + 1 < idxs.length) ? idxs[i + 1].pos : raw.length;
      const chunk = raw.slice(start, end);
      const dbMatch = chunk.match(/Debutvs\s+([^,]+),\s+([\d-]+),\s+([^]+?)Last Played/i);
      const lpMatch = chunk.match(/Last Playedvs\s+([^,]+),\s+([\d-]+),\s+(.+)$/i);
      const display = entry.fmt === 't20' ? 'T20I' : entry.fmt === 'cl' ? 'CL T20' : entry.fmt.toUpperCase();
      careerInfo[display] = {
        debut: dbMatch ? { opponent: dbMatch[1].trim(), date: dbMatch[2].trim(), venue: dbMatch[3].trim() } : null,
        lastPlayed: lpMatch ? { opponent: lpMatch[1].trim(), date: lpMatch[2].trim(), venue: lpMatch[3].trim() } : null
      };
    });
  });


  const news = [];
  $('h3').filter((_, el) => $(el).text().trim() === 'Related Articles').each((_, el) => {
    if (news.length) return;
    $(el).parent().find('a').each((_, a) => {
      const title = $(a).text().replace(/\s+/g, ' ').trim();
      const href = $(a).attr('href') || '';
      if (!title || title.length < 10 || !href.includes('/cricket-news/')) return;
      const url = href.startsWith('http') ? href : `https://www.cricbuzz.com${href}`;
      if (news.some(n => n.url === url)) return;
      news.push({ title, url });
    });
  });
  const newsTrimmed = news.slice(0, 6);

 
  let age = null;
  const bornStr = personal['Born'] || '';
  const fullDate = bornStr.match(/([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})/);
  const yearOnly = bornStr.match(/\b(19|20)\d{2}\b/);
  if (fullDate) {
    const dob = new Date(`${fullDate[1]} ${fullDate[2]}, ${fullDate[3]}`);
    if (!isNaN(dob.getTime())) {
      const now = new Date();
      age = now.getFullYear() - dob.getFullYear();
      if (now.getMonth() < dob.getMonth() ||
          (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
    }
  } else if (yearOnly) {
    age = new Date().getFullYear() - parseInt(yearOnly[0], 10);
  }

  const data = {
    id, slug: safeSlug, name, country, image, personal,
    age,
    battingStats, bowlingStats, rankings, recentForm,
    bio, teamsList, careerInfo, news: newsTrimmed,
    profileUrl: `https://www.cricbuzz.com/profiles/${id}/${safeSlug}`
  };
  cacheSet(key, data);
  return data;
};

app.get('/player-detail', async (req, res) => {
  const { id, slug } = req.query;
  if (!id || !/^\d+$/.test(id)) return res.status(400).json({ error: 'Valid player id required' });
  try {
    const data = await fetchPlayerProfile(id, slug);
    res.json(data);
  } catch (err) {
    console.error('player-detail error:', err && err.stack || err);
    res.status(500).json({ error: 'Failed to fetch player profile' });
  }
});

app.get('/player-compare', async (req, res) => {
  const { id1, id2, slug1, slug2 } = req.query;
  if (!id1 || !id2) return res.status(400).json({ error: 'Both player ids are required' });
  if (!/^\d+$/.test(id1) || !/^\d+$/.test(id2)) return res.status(400).json({ error: 'Player ids must be numeric' });
  if (id1 === id2) return res.status(400).json({ error: 'Players must be different' });
  try {
    const [p1, p2] = await Promise.all([
      fetchPlayerProfile(id1, slug1),
      fetchPlayerProfile(id2, slug2)
    ]);
    res.json({
      player1: p1,
      player2: p2,
      source: 'Cricbuzz',
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch player comparison' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Resource not found' });
});

app.listen(PORT, HOST, () => {
  console.log(`StatBat server running on http://${HOST}:${PORT}`);
});