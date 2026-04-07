const express = require('express');
const router = express.Router();
const db = require('../db');
const clickUpService = require('../services/clickup');

// Get all tasks
router.get('/', async (req, res) => {
  try {
    const { status, department, assigned_to } = req.query;
    let sql = `SELECT t.*, m.name as assignee_name, m.department as assignee_dept
               FROM tasks t LEFT JOIN members m ON t.assigned_to = m.id WHERE 1=1`;
    const params = [];

    if (status) { sql += ` AND t.status = ?`; params.push(status); }
    if (department) { sql += ` AND t.department = ?`; params.push(department); }
    if (assigned_to) { sql += ` AND t.assigned_to = ?`; params.push(assigned_to); }
    if (assigned_to === 'null') { sql += ` AND t.assigned_to IS NULL`; params.length = 0; }

    sql += ` ORDER BY t.priority DESC, t.created_at DESC`;
    const tasks = await db.query(sql, params);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unassigned tasks
router.get('/unassigned', async (req, res) => {
  try {
    const tasks = await clickUpService.getUnassignedTasks();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single task
router.get('/:id', async (req, res) => {
  try {
    const task = await db.get(
      `SELECT t.*, m.name as assignee_name, m.department as assignee_dept
       FROM tasks t LEFT JOIN members m ON t.assigned_to = m.id
       WHERE t.id = ?`,
      [req.params.id]
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auto-distribute a single task
router.post('/:id/distribute', async (req, res) => {
  try {
    const task = await db.get(`SELECT * FROM tasks WHERE id = ?`, [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.assigned_to) return res.status(400).json({ error: 'Task already assigned' });

    // Get members from the same department or general
    const department = task.department || 'general';
    const members = await clickUpService.getMemberWorkloadByDepartment(department);

    // If no members in that department, try all members
    const candidateMembers = members.length > 0 ? members : await db.query(
      `SELECT m.id, m.name, m.max_capacity,
              COUNT(t.id) as current_tasks,
              m.max_capacity - COUNT(t.id) as available_capacity
       FROM members m
       LEFT JOIN tasks t ON m.id = t.assigned_to AND t.status NOT IN ('closed', 'complete')
       WHERE m.is_active = 1
       GROUP BY m.id
       ORDER BY available_capacity DESC`
    );

    if (candidateMembers.length === 0) {
      return res.status(400).json({ error: 'No active members available' });
    }

    // Find best match: member with most available capacity
    const bestMatch = candidateMembers.find(m => m.available_capacity > 0);
    if (!bestMatch) {
      return res.status(400).json({
        error: 'All members at max capacity',
        members: candidateMembers
      });
    }

    // Priority-based distribution: highest priority tasks go to least loaded members
    const availableMembers = candidateMembers.filter(m => m.available_capacity > 0);
    const target = availableMembers[0];

    const reason = `Auto-distributed: department=${department}, priority=${task.priority}, ${target.available_capacity} slots available`;
    const result = await clickUpService.assignTask(task.id, target.id, reason);

    res.json({ ...result, taskName: task.name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Distribute all unassigned tasks
router.post('/distribute-all', async (req, res) => {
  try {
    const unassigned = await clickUpService.getUnassignedTasks();
    const results = [];

    for (const task of unassigned) {
      const department = task.department;

      const departmentMembers = await clickUpService.getMemberWorkloadByDepartment(department);
      const members = departmentMembers.length > 0 ? departmentMembers : await db.query(
        `SELECT m.id, m.name, m.max_capacity,
                COUNT(t.id) as current_tasks,
                m.max_capacity - COUNT(t.id) as available_capacity
         FROM members m
         LEFT JOIN tasks t ON m.id = t.assigned_to AND t.status NOT IN ('closed', 'complete')
         WHERE m.is_active = 1
         GROUP BY m.id
         ORDER BY available_capacity DESC`
      );

      const available = members.filter(m => m.available_capacity > 0);
      if (available.length > 0) {
        const target = available[0];
        const reason = `Bulk distribution: department=${department}`;
        const result = await clickUpService.assignTask(task.id, target.id, reason);
        results.push({ taskId: task.id, taskName: task.name, ...result });
      } else {
        results.push({ taskId: task.id, taskName: task.name, success: false, error: 'No capacity' });
      }
    }

    const assigned = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({ total: unassigned.length, assigned, failed, details: results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manually assign a task
router.post('/:id/assign', async (req, res) => {
  try {
    const { member_id } = req.body;
    if (!member_id) return res.status(400).json({ error: 'member_id is required' });

    const task = await db.get(`SELECT * FROM tasks WHERE id = ?`, [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const reason = `Manual assignment`;
    const result = await clickUpService.assignTask(task.id, member_id, reason);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reassign task
router.post('/:id/reassign', async (req, res) => {
  try {
    const { member_id } = req.body;
    if (!member_id) return res.status(400).json({ error: 'member_id is required' });

    const task = await db.get(`SELECT * FROM tasks WHERE id = ?`, [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const member = await db.get('SELECT * FROM members WHERE id = ?', [member_id]);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    // Update assignment
    await db.run(`UPDATE tasks SET assigned_to = ? WHERE id = ?`, [member_id, task.id]);

    const workload = await clickUpService.getCurrentWorkload(member_id);
    await db.run(
      `INSERT INTO task_assignments (task_id, member_id, assigned_at, assigned_by, reason, workload_at_assignment)
       VALUES (?, ?, datetime('now'), 'reassign', 'Reassigned by user', ?)`,
      [task.id, member_id, workload]
    );

    // Update in ClickUp
    try {
      await clickUpService.clickUpClient.put(`/task/${task.clickup_id || task.id}`, {
        assignees: { add: [member_id] }
      });
    } catch (e) {
      console.error('Failed to update ClickUp:', e.message);
    }

    res.json({ success: true, taskId: task.id, assignedTo: member.name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
