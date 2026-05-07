require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { setupDB } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/classes',    require('./routes/classes'));
app.use('/api/techniques', require('./routes/techniques'));
app.use('/api/chains',     require('./routes/chains'));
app.use('/api/gameplans',  require('./routes/gameplans'));
app.use('/api/clips',      require('./routes/clips'));
app.use('/api/recommend',     require('./routes/recommend'));
app.use('/api/enhance-memo', require('./routes/enhance-memo'));
app.use('/api/coach',      require('./routes/coach'));
app.use('/api',            require('./routes/profile'));

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (/\.(js|css|html)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

const PORT = process.env.PORT || 3000;
setupDB().then(() => {
  app.listen(PORT, () => console.log(`BJJ API 서버 실행중 :${PORT}`));
}).catch(e => { console.error('DB 초기화 실패:', e); process.exit(1); });
