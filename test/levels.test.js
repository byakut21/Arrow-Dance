// Seviye testi: her seviye tahtada, çakışmasız ve çözülebilir olmalı.
const L = require('../app/src/main/assets/www/levels.js');
let bad = 0;
for (let n = 1; n <= 400; n++) {
  const err = L.validate(L.generateLevel(n));
  if (err) { console.error(`Seviye ${n}: ${err}`); bad++; }
}
if (bad) { console.error(`${bad} hatalı seviye`); process.exit(1); }
console.log('400 seviye geçerli ✓');
