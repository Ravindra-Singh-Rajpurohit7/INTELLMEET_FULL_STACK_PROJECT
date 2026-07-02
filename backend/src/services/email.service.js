import { Resend } from 'resend';

// Initialize Resend with API Key from environment
const resend = new Resend(process.env.RESEND_API_KEY);

const baseHTML = (bodyContent) => `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;padding:40px 20px}
  .wrapper{max-width:600px;margin:0 auto}
  .card{background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
  .header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:40px 32px;text-align:center}
  .header h1{color:#fff;font-size:26px;font-weight:700;letter-spacing:-0.5px}
  .header p{color:rgba(255,255,255,0.8);margin-top:6px;font-size:14px}
  .body{padding:36px 32px;color:#374151;line-height:1.7;font-size:15px}
  .body h2{color:#111827;font-size:20px;font-weight:600;margin-bottom:16px}
  .body p{margin-bottom:14px}
  .highlight{background:#f5f3ff;border-left:4px solid #7c3aed;border-radius:0 8px 8px 0;padding:14px 18px;margin:20px 0}
  .highlight strong{display:block;color:#5b21b6;margin-bottom:4px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em}
  .highlight span{color:#374151;font-size:15px}
  .btn{display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;margin:20px 0}
  .badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em}
  .badge-urgent{background:#fee2e2;color:#dc2626}
  .badge-high{background:#ffedd5;color:#ea580c}
  .badge-medium{background:#fef9c3;color:#ca8a04}
  .badge-low{background:#dcfce7;color:#16a34a}
  .divider{border:none;border-top:1px solid #e5e7eb;margin:24px 0}
  .footer{background:#f9fafb;padding:24px 32px;text-align:center;color:#9ca3af;font-size:13px}
  .footer a{color:#6366f1;text-decoration:none}
</style>
</head>
<body>
<div class="wrapper">
  <div class="card">
    <div class="header">
      <h1>🤖 IntellMeet</h1>
      <p>AI-Powered Meeting Intelligence Platform</p>
    </div>
    <div class="body">${bodyContent}</div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} IntellMeet · <a href="${process.env.FRONTEND_URL || '#'}">Visit Platform</a></p>
      <p style="margin-top:6px">This is an automated email. Please do not reply directly.</p>
    </div>
  </div>
</div>
</body>
</html>
`;

// 🔥 Replaced Nodemailer with Resend API call (Bypasses all network/port blocks)
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const { data, error } = await resend.emails.send({
      // Resend free tier allows sending from onboarding@resend.dev to your verified register email
      from: 'IntellMeet <onboarding@resend.dev>',
      to: [to],
      subject: subject,
      html: html,
      text: text || subject,
    });

    if (error) {
      console.error('[Resend Error]:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ [EmailService] Email sent successfully via Resend API: ${data.id}`);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error(`[EmailService] HTTP Request Failed for ${to}:`, error.message);
    return { success: false, error: error.message };
  }
};

const sendTeamInviteEmail = async ({ to, inviterName, teamName, inviteLink, role }) => {
  const subject = `${inviterName} invited you to join "${teamName}" on IntellMeet`;
  const html = baseHTML(`
    <h2>You've been invited to a team! 🎉</h2>
    <p>Hi there,</p>
    <p><strong>${inviterName}</strong> has invited you to join the team
    <strong>"${teamName}"</strong> on IntellMeet as a <strong>${role}</strong>.</p>
    <div class="highlight">
      <strong>What is IntellMeet?</strong>
      <span>IntellMeet helps teams have smarter meetings with AI-powered summaries,
      automatic action items, and built-in task management.</span>
    </div>
    <p>Click below to accept the invitation and get started:</p>
    <a href="${inviteLink}" class="btn">Accept Invitation →</a>
    <hr class="divider"/>
    <p style="color:#9ca3af;font-size:13px">
      This invitation expires in <strong>7 days</strong>.
      If you were not expecting this, you can safely ignore this email.
    </p>
  `);
  return sendEmail({ to, subject, html });
};

const sendTaskAssignedEmail = async ({ to, assigneeName, taskTitle, projectName, dueDate, assignedBy, taskLink, priority }) => {
  const subject = `New task assigned to you: "${taskTitle}"`;
  const badgeClass = `badge-${priority || "medium"}`;
  const formattedDue = dueDate ? new Date(dueDate).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "No due date set";

  const html = baseHTML(`
    <h2>You have a new task 📋</h2>
    <p>Hi ${assigneeName},</p>
    <p><strong>${assignedBy}</strong> has assigned you a task in the <strong>${projectName}</strong> project.</p>
    <div class="highlight">
      <strong>Task</strong>
      <span>${taskTitle}</span>
    </div>
    <div class="highlight">
      <strong>Priority</strong>
      <span><span class="badge ${badgeClass}">${priority || "medium"}</span></span>
    </div>
    <div class="highlight">
      <strong>Due Date</strong>
      <span>📅 ${formattedDue}</span>
    </div>
    <a href="${taskLink}" class="btn">View Task →</a>
    <hr class="divider"/>
    <p style="color:#9ca3af;font-size:13px">Log in to IntellMeet to see full task details.</p>
  `);
  return sendEmail({ to, subject, html });
};

const sendMeetingReminderEmail = async ({ to, userName, meetingTitle, scheduledAt, meetingCode, hostName, joinLink, minutesBefore = 30 }) => {
  const subject = `Reminder: "${meetingTitle}" starts in ${minutesBefore} minutes`;
  const formattedTime = new Date(scheduledAt).toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

  const html = baseHTML(`
    <h2>Your meeting is starting soon ⏰</h2>
    <p>Hi ${userName},</p>
    <p>Just a reminder that your meeting is starting in <strong>${minutesBefore} minutes</strong>.</p>
    <div class="highlight">
      <strong>Meeting</strong>
      <span>${meetingTitle}</span>
    </div>
    <div class="highlight">
      <strong>Host</strong>
      <span>${hostName}</span>
    </div>
    <div class="highlight">
      <strong>Time</strong>
      <span>🗓️ ${formattedTime}</span>
    </div>
    <div class="highlight">
      <strong>Meeting Code</strong>
      <span style="font-family:monospace;font-size:18px;font-weight:700;letter-spacing:0.15em;color:#6d28d9">${meetingCode}</span>
    </div>
    <a href="${joinLink}" class="btn">Join Meeting Now →</a>
  `);
  return sendEmail({ to, subject, html });
};

const sendMeetingSummaryEmail = async ({ to, userName, meetingTitle, summary, actionItems, dashboardLink }) => {
  const subject = `AI Summary Ready: "${meetingTitle}"`;
  const actionItemsHTML = actionItems?.length > 0 ? `
      <h3 style="margin-top:24px;margin-bottom:12px;color:#111827">Action Items (${actionItems.length})</h3>
      <ul style="padding-left:20px">
        ${actionItems.map((item) => `<li style="margin-bottom:10px"><strong>${item.text}</strong></li>`).join("")}
      </ul>
    ` : "";

  const html = baseHTML(`
    <h2>Your meeting summary is ready 🤖</h2>
    <p>Hi ${userName},</p>
    <p>The AI has finished analyzing your meeting <strong>"${meetingTitle}"</strong>.</p>
    <div class="highlight">
      <strong>Summary</strong>
      <span>${summary}</span>
    </div>
    ${actionItemsHTML}
    <a href="${dashboardLink}" class="btn">View Full Summary →</a>
  `);
  return sendEmail({ to, subject, html });
};

export {
  sendEmail,
  sendTeamInviteEmail,
  sendTaskAssignedEmail,
  sendMeetingReminderEmail,
  sendMeetingSummaryEmail,
};