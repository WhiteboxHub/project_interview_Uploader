          const mysql = require('mysql2/promise');
let connection = null;

async function connect(config) {
  try {
    connection = await mysql.createConnection({
      host: config.host || 'localhost',
      port: config.port || 3306,
      user: config.user,
      password: config.password,
      database: config.database
    });
    
    await connection.ping();
    console.log('Database connected successfully');
    return { success: true };
  } catch (error) {
    console.error('Database connection failed:', error);
    return { success: false, error: error.message };
  }
}

async function getInterviewDetails(interviewId) {
  if (!connection) {
    throw new Error('Database not connected');
  }
  
  const query = `
    SELECT 
      ci.id,
      c.full_name,
      ci.company,
      ci.type_of_interview,
      ci.interview_date,
      ci.recording_link,
      ci.backup_recording_url
    FROM candidate_interview ci
    JOIN candidate c ON ci.candidate_id = c.id
    WHERE ci.id = ?
  `;
  
  const [rows] = await connection.execute(query, [interviewId]);
  
  if (rows.length === 0) {
    return null;
  }
  
  const interview = rows[0];
  
  // Check if recording already exists
  if (interview.recording_link && interview.recording_link.trim() !== '') {
    console.log('⚠️ Recording already exists for ID:', interviewId);
    const error = new Error(`Recording already uploaded!\n\nGoogle Drive: ${interview.recording_link}\nYouTube: ${interview.backup_recording_url || 'N/A'}`);
    error.alreadyExists = true;
    error.existingLink = interview.recording_link;
    error.backupLink = interview.backup_recording_url;
    throw error;
  }
  
  console.log('✅ Recording link is empty, can proceed');
  return interview;
}

async function updateRecordingLinks(interviewId, driveLink, backupPath, transcriptLink = null) {
  if (!connection) {
    throw new Error('Database not connected');
  }
  
  const query = `
    UPDATE candidate_interview
    SET recording_link = ?, backup_recording_url = ?, transcript = ?
    WHERE id = ?
  `;
  
  await connection.execute(query, [driveLink, backupPath, transcriptLink, interviewId]);
}

async function disconnect() {
  if (connection) {
    await connection.end();
    connection = null;
    console.log('Database disconnected');
  }
}

module.exports = {
  connect,
  getInterviewDetails,
  updateRecordingLinks,
  disconnect
};
