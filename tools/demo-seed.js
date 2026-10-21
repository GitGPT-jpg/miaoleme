// 路演演示数据种子：写入本机 store（不影响已生成的猫形象与骨骼部件）
// 用法：node tools/demo-seed.js [--restore]
const fs = require('fs');
const os = require('os');
const path = require('path');

const STORE = path.join(os.homedir(), 'Library/Application Support/miaoleme/zerobreak-store.json');
const BACKUP = '/tmp/miaoleme-store-before-demo.json';

const now = Date.now();
const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
})();

function main() {
  const raw = JSON.parse(fs.readFileSync(STORE, 'utf-8'));
  if (process.argv.includes('--restore')) {
    if (!fs.existsSync(BACKUP)) return console.log('没有演示备份');
    fs.copyFileSync(BACKUP, STORE);
    return console.log('已恢复演示前的数据');
  }
  fs.copyFileSync(STORE, BACKUP);
  const next = Object.assign({}, raw, {
    form: 'custom',
    theme: 'light',
    quiet: false,
    meetings: [
      { id: 'demo-m1', title: '路演彩排', ts: now + 6 * 60 * 1000 }
    ],
    ddls: [
      { id: 'demo-d1', title: '提交路演材料', ts: now + 2 * 60 * 60 * 1000 }
    ],
    notifiedMeetings: [],
    notifiedDdls: [],
    stats: Object.assign({}, raw.stats, {
      intimacy: 12,
      waterDone: 8,
      pomodoroDone: 4,
      petDaily: { date: today, count: 0 },
      lastPetTs: 0
    }),
    mealMenus: {
      lunch: ['黄焖鸡', '麻辣烫', '牛肉面', '寿司', '轻食', '炒饭'],
      dinner: ['火锅', '烧烤', '炒菜', '饺子', '披萨', '粥']
    },
    games: { rps: { win: 5, lose: 3, draw: 2 } },
    feed: Object.assign({}, raw.feed, {
      waterRequest: false,
      mealRequest: false,
      mealSlot: null,
      mealRequestDate: '',
      mealSnoozeUntil: 0
    }),
    water: Object.assign({}, raw.water, { enabled: true, intervalMin: 45, lastRemindTs: now }),
    pomo: null
  });
  fs.writeFileSync(STORE, JSON.stringify(next, null, 2));
  console.log('演示数据已写入：会议 +6 分钟、DDL +2 小时、菜单/战绩/统计已填充');
  console.log('恢复：node tools/demo-seed.js --restore');
}

main();
