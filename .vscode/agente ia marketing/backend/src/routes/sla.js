const express = require('express');
const router = express.Router();
const db = require('../db');
const clickUpService = require('../services/clickup');

// Get all active SLA violations
router.get('/violations', async (req, res) => {
  try {
    const violations = await db.query(
      `SELECT v.*, t.name as task_name, t.priority, t.due_date,
              m.name as member_name
       FROM sla_violations v
       LEFT JOIN tasks t ON v.task_id = t.id
       LEFT JOIN members m ON v.member_id = m.id
       WHERE v.resolved = 0
       ORDER BY v.detected_at DESC`
    );
    res.json(violations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get SLA stats
router.get('/stats', async (req, res) => {
  try {
    const totalViolations = await db.get(
      `SELECT COUNT(*) as count FROM sla_violations`
    );
    const activeViolations = await db.get(
      `SELECT COUNT(*) as count FROM sla_violations WHERE resolved = 0`
    );
    const onTrackTasks = await db.get(
      `SELECT COUNT(*) as count FROM tasks WHERE sla_status = 'on_track' AND status NOT IN ('closed', 'complete')`
    );

    res.json({
      totalViolations: totalViolations?.count || 0,
      activeViolations: activeViolations?.count || 0,
      onTrackTasks: onTrackTasks?.count || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Run SLA check manually
router.post('/check', async (req, res) => {
  try {
    const violated = await clickUpService.checkOverdueTasks();
    res.json({ success: true, violationsFound: violated.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resolve a violation
router.put('/violations/:id/resolve', async (req, res) => {
  try {
    await db.run(
      `UPDATE sla_violations SET resolved = 1, resolved_at = datetime('now') WHERE id = ?`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
