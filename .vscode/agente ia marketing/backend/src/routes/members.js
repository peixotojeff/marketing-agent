const express = require('express');
const router = express.Router();
const db = require('../db');
const clickUpService = require('../services/clickup');

// Get all members
router.get('/', async (req, res) => {
  try {
    const members = await db.query(
      `SELECT m.*,
              COUNT(CASE WHEN t.status NOT IN ('closed', 'complete') THEN 1 END) as active_tasks,
              COUNT(CASE WHEN t.sla_status = 'violated' THEN 1 END) as overdue_tasks
       FROM members m
       LEFT JOIN tasks t ON m.id = t.assigned_to
       WHERE m.is_active = 1
       GROUP BY m.id
       ORDER BY m.name`
    );
    res.json(members);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single member
router.get('/:id', async (req, res) => {
  try {
    const member = await db.get(
      `SELECT m.*,
              COUNT(CASE WHEN t.status NOT IN ('closed', 'complete') THEN 1 END) as active_tasks,
              COUNT(CASE WHEN t.sla_status = 'violated' THEN 1 END) as overdue_tasks
       FROM members m
       LEFT JOIN tasks t ON m.id = t.assigned_to
       WHERE m.id = ?`,
      [req.params.id]
    );
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json(member);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get member's tasks
router.get('/:id/tasks', async (req, res) => {
  try {
    const tasks = await db.query(
      `SELECT * FROM tasks WHERE assigned_to = ? ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update member specialty/department
router.put('/:id', async (req, res) => {
  try {
    const { specialty, department, max_capacity } = req.body;
    const updates = [];
    const params = [];
    if (specialty !== undefined) { updates.push('specialty = ?'); params.push(specialty); }
    if (department !== undefined) { updates.push('department = ?'); params.push(department); }
    if (max_capacity !== undefined) { updates.push('max_capacity = ?'); params.push(max_capacity); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id);
    await db.run(`UPDATE members SET ${updates.join(', ')} WHERE id = ?`, params);

    const member = await db.get('SELECT * FROM members WHERE id = ?', [req.params.id]);
    res.json(member);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get workload by department
router.get('/workload/by-department', async (req, res) => {
  try {
    const { department } = req.query;
    if (!department) {
      // All departments
      const workload = await db.query(
        `SELECT m.id, m.name, m.department, m.max_capacity,
                COUNT(CASE WHEN t.status NOT IN ('closed', 'complete') THEN 1 END) as current_tasks,
                m.max_capacity - COUNT(CASE WHEN t.status NOT IN ('closed', 'complete') THEN 1 END) as available_capacity
         FROM members m
         LEFT JOIN tasks t ON m.id = t.assigned_to AND t.status NOT IN ('closed', 'complete')
         WHERE m.is_active = 1
         GROUP BY m.id
         ORDER BY m.department, available_capacity DESC`
      );
      return res.json(workload);
    }

    const workload = await clickUpService.getMemberWorkloadByDepartment(department);
    res.json(workload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger sync
router.post('/sync', async (req, res) => {
  try {
    await clickUpService.syncMembers();
    res.json({ success: true, message: 'Members synced from ClickUp' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
