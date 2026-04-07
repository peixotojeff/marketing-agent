require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const db = require('./db');
const clickUpService = require('./services/clickup');
const taskRouter = require('./routes/tasks');
const memberRouter = require('./routes/members');
const dashboardRouter = require('./routes/dashboard');
const slaRouter = require('./routes/sla');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/tasks', taskRouter);
app.use('/api/members', memberRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/sla', slaRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SLA checker cron job
const SLA_INTERVAL = process.env.SLA_CHECK_INTERVAL_MINUTES || 30;
cron.schedule(`*/${SLA_INTERVAL} * * * *`, async () => {
  console.log('Running SLA check...');
  await clickUpService.checkOverdueTasks();
});

// Sync tasks cron job (every 10 minutes)
cron.schedule('*/10 * * * *', async () => {
  console.log('Syncing tasks from ClickUp...');
  await clickUpService.syncTasks();
});

async function start() {
  await db.initialize();
  await clickUpService.syncMembers();
  await clickUpService.syncTasks();

  app.listen(PORT, () => {
    console.log(`Marketing Agent Backend running on port ${PORT}`);
  });
}

start();
