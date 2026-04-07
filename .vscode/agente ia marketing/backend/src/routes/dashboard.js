const express = require('express');
const router = express.Router();
const clickUpService = require('../services/clickup');

// Dashboard overview
router.get('/', async (req, res) => {
  try {
    const data = await clickUpService.getDashboardData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bottleneck analysis
router.get('/bottlenecks', async (req, res) => {
  try {
    const analysis = await clickUpService.getBottleneckAnalysis();
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Agent activity log
router.get('/logs', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const db = require('../db');
    const logs = await db.query(
      `SELECT * FROM agent_logs ORDER BY created_at DESC LIMIT ?`,
      [parseInt(limit)]
    );
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger sync
router.post('/sync', async (req, res) => {
  try {
    const clickUpService = require('../services/clickup');
    await Promise.all([
      clickUpService.syncMembers(),
      clickUpService.syncTasks()
    ]);
    res.json({ success: true, message: 'Synced from ClickUp' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
