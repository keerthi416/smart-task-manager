const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const { dbGet, dbAll, dbRun } = require('./db');
const { startScheduler } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ==========================================
// VALIDATION HELPERS
// ==========================================
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim());
}

/**
 * Validates password complexity:
 * - Minimum 8 characters in length
 * - Contains at least one uppercase letter (A-Z)
 * - Contains at least one special character (@, #, $, %, !, &, etc.)
 * - Contains letters and numbers
 * - No spaces allowed
 */
function isValidPassword(pass) {
  if (!pass || typeof pass !== 'string') return false;
  if (pass.length < 8) return false;
  if (/\s/.test(pass)) return false; // No spaces allowed
  if (!/[A-Z]/.test(pass)) return false; // Must contain 1 uppercase letter
  if (!/[0-9]/.test(pass)) return false; // Must contain numbers
  if (!/[a-zA-Z]/.test(pass)) return false; // Must contain letters
  if (!/[^a-zA-Z0-9]/.test(pass)) return false; // Must contain 1 special character
  return true;
}

const PASSWORD_ERROR_MSG = "Password must be at least 8 characters long, contain 1 uppercase letter, 1 special character, numbers, and no spaces.";

// ==========================================
// AUTH REST API ROUTES
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Full Name is required' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid E-mail' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ error: PASSWORD_ERROR_MSG });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existingUser = await dbGet(`SELECT id FROM users WHERE email = ?`, [cleanEmail]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already registered. Please login.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password.trim(), salt);

    await dbRun(
      `INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)`,
      [name.trim(), cleanEmail, passwordHash]
    );

    return res.status(201).json({
      success: true,
      message: 'Account created successfully! Please login with your credentials.'
    });
  } catch (err) {
    console.error('Registration API Error:', err);
    return res.status(500).json({ error: 'Server error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid E-mail' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await dbGet(`SELECT * FROM users WHERE email = ?`, [cleanEmail]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password.trim(), user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    return res.json({
      success: true,
      user: {
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Login API Error:', err);
    return res.status(500).json({ error: 'Server error during login' });
  }
});

// ==========================================
// TASK REST API ROUTES
// ==========================================
app.get('/api/tasks', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'] || req.query.email;
    if (!userEmail) {
      return res.status(400).json({ error: 'User email header required' });
    }

    const tasks = await dbAll(
      `SELECT * FROM tasks WHERE user_email = ? ORDER BY created_at DESC`,
      [userEmail.toLowerCase()]
    );

    // Format tasks for client
    const formatted = tasks.map(t => ({
      id: t.id,
      user_email: t.user_email,
      title: t.title,
      priority: t.priority,
      dueTimestamp: t.due_timestamp,
      completed: Boolean(t.completed),
      status: t.status,
      notified1h: Boolean(t.notified_1h),
      notifiedDue: Boolean(t.notified_due),
      notifiedOverdue: Boolean(t.notified_overdue)
    }));

    return res.json(formatted);
  } catch (err) {
    console.error('Fetch Tasks Error:', err);
    return res.status(500).json({ error: 'Server error fetching tasks' });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { user_email, title, priority, dueTimestamp } = req.body;

    if (!user_email || !title || !dueTimestamp) {
      return res.status(400).json({ error: 'Task title, user email, and due timestamp are required' });
    }

    const taskId = 'task-' + Date.now();
    const cleanEmail = user_email.trim().toLowerCase();

    await dbRun(
      `INSERT INTO tasks (id, user_email, title, priority, due_timestamp, completed, status) VALUES (?, ?, ?, ?, ?, 0, 'pending')`,
      [taskId, cleanEmail, title.trim(), priority || 'Medium', dueTimestamp]
    );

    const newTask = await dbGet(`SELECT * FROM tasks WHERE id = ?`, [taskId]);
    return res.status(201).json({
      id: newTask.id,
      user_email: newTask.user_email,
      title: newTask.title,
      priority: newTask.priority,
      dueTimestamp: newTask.due_timestamp,
      completed: Boolean(newTask.completed),
      status: newTask.status
    });
  } catch (err) {
    console.error('Create Task Error:', err);
    return res.status(500).json({ error: 'Server error creating task' });
  }
});

app.patch('/api/tasks/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const task = await dbGet(`SELECT * FROM tasks WHERE id = ?`, [id]);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const newCompleted = task.completed ? 0 : 1;
    let newStatus = 'pending';

    if (newCompleted) {
      newStatus = 'completed';
    } else {
      const dueMs = new Date(task.due_timestamp).getTime();
      newStatus = Date.now() > dueMs ? 'overdue' : 'pending';
    }

    await dbRun(
      `UPDATE tasks SET completed = ?, status = ? WHERE id = ?`,
      [newCompleted, newStatus, id]
    );

    const updated = await dbGet(`SELECT * FROM tasks WHERE id = ?`, [id]);
    return res.json({
      id: updated.id,
      completed: Boolean(updated.completed),
      status: updated.status
    });
  } catch (err) {
    console.error('Toggle Task Error:', err);
    return res.status(500).json({ error: 'Server error updating task' });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun(`DELETE FROM tasks WHERE id = ?`, [id]);
    return res.json({ success: true, id });
  } catch (err) {
    console.error('Delete Task Error:', err);
    return res.status(500).json({ error: 'Server error deleting task' });
  }
});

// ==========================================
// EMAIL LOGS API ROUTE
// ==========================================
app.get('/api/email-logs', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'] || req.query.email;
    if (!userEmail) {
      return res.status(400).json({ error: 'User email required' });
    }

    const logs = await dbAll(
      `SELECT * FROM email_logs WHERE user_email = ? ORDER BY sent_at DESC`,
      [userEmail.toLowerCase()]
    );

    return res.json(logs);
  } catch (err) {
    console.error('Fetch Email Logs Error:', err);
    return res.status(500).json({ error: 'Server error fetching email logs' });
  }
});

// Serve Single-Page App index.html for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server & Background Scheduler
app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`Smart Task Manager Server running on http://localhost:${PORT}`);
  console.log(`==================================================\n`);
  startScheduler();
});
