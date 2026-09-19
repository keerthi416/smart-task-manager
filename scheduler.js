const cron = require('node-cron');
const { dbAll, dbRun } = require('./db');
const { sendEmail } = require('./mailer');

function startScheduler() {
  console.log('[Scheduler] Background Task & Email Worker initialized (running check every 15 seconds)...');

  // Check database every 15 seconds for exact timing
  cron.schedule('*/15 * * * * *', async () => {
    try {
      await checkTasksAndSendEmails();
    } catch (err) {
      console.error('[Scheduler] Error during task check:', err.message);
    }
  });
}

async function checkTasksAndSendEmails() {
  const now = new Date();
  const nowMs = now.getTime();

  // Fetch all pending/incomplete tasks
  const tasks = await dbAll(`SELECT * FROM tasks WHERE completed = 0`);
  if (!tasks || tasks.length === 0) return;

  for (const task of tasks) {
    const dueTime = new Date(task.due_timestamp).getTime();
    const diffMs = dueTime - nowMs;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    // STAGE 1: 1-Hour Prior Email Reminder
    // Rule: Sent 1 hour prior to task deadline
    // Subject: Reminder: Task Due in 1 Hour - [Task Name]
    // Body: Hello, this is a reminder that you have to complete your task "[Task Name]" in 1 hour.
    if (diffMinutes >= 55 && diffMinutes <= 60 && task.notified_1h === 0) {
      const subject = `Reminder: Task Due in 1 Hour - ${task.title}`;
      const body = `Hello, this is a reminder that you have to complete your task "${task.title}" in 1 hour.`;

      const result = await sendEmail({ to: task.user_email, subject, text: body });
      if (result.success) {
        await dbRun(`UPDATE tasks SET notified_1h = 1 WHERE id = ?`, [task.id]);
        await dbRun(
          `INSERT INTO email_logs (user_email, subject, body, type) VALUES (?, ?, ?, ?)`,
          [task.user_email, subject, body, 'reminder_1h']
        );
      }
    }

    // STAGE 2: Task Due Time Email
    // Rule: Sent at the exact task deadline
    // Subject: Task Due Now - [Task Name]
    // Body: It is time to perform your task "[Task Name]".
    if (diffMinutes >= -1 && diffMinutes <= 0 && task.notified_due === 0) {
      const subject = `Task Due Now - ${task.title}`;
      const body = `It is time to perform your task "${task.title}".`;

      const result = await sendEmail({ to: task.user_email, subject, text: body });
      if (result.success) {
        await dbRun(`UPDATE tasks SET notified_due = 1 WHERE id = ?`, [task.id]);
        await dbRun(
          `INSERT INTO email_logs (user_email, subject, body, type) VALUES (?, ?, ?, ?)`,
          [task.user_email, subject, body, 'due_now']
        );
      }
    }

    // STAGE 3: Overdue / Pending Work Email Alert
    // Rule: Sent when task passes deadline uncompleted
    // Subject: ALERT: You have pending overdue work!
    // Body: Alert: You have pending work! Task "[Task Name]" is overdue. Please log in and complete it.
    if (diffMs < 0 && task.notified_overdue === 0) {
      const subject = `ALERT: You have pending overdue work!`;
      const body = `Alert: You have pending work! Task "${task.title}" is overdue. Please log in and complete it.`;

      const result = await sendEmail({ to: task.user_email, subject, text: body });
      if (result.success) {
        await dbRun(`UPDATE tasks SET status = 'overdue', notified_overdue = 1 WHERE id = ?`, [task.id]);
        await dbRun(
          `INSERT INTO email_logs (user_email, subject, body, type) VALUES (?, ?, ?, ?)`,
          [task.user_email, subject, body, 'overdue_alert']
        );
      }
    }
  }
}

module.exports = {
  startScheduler,
  checkTasksAndSendEmails
};
