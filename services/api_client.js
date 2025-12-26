const fetch = require('node-fetch');
const apiAuth = require('./api_auth');
require('dotenv').config();

class APIClient {
    constructor() {
        this.baseUrl = null;
    }

    /**
     * Initialize with base URL
     */
    initialize(baseUrl) {
        this.baseUrl = baseUrl;
    }

    /**
     * Get interview details by ID
     * Replaces database.getInterviewDetails()
     */
    async getInterviewDetails(interviewId) {
        try {
            if (!this.baseUrl) {
                throw new Error('API base URL not configured');
            }

            console.log(`📊 Fetching interview details for ID: ${interviewId}`);

            const headers = await apiAuth.getAuthHeaders();
            const response = await fetch(`${this.baseUrl}/api/interviews/${interviewId}`, {
                method: 'GET',
                headers: headers
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                const error = await response.json().catch(() => ({ detail: 'Request failed' }));
                throw new Error(error.detail || `API request failed: ${response.status}`);
            }

            const data = await response.json();

            // Log the raw API response for debugging
            console.log('📦 Raw API response:', JSON.stringify(data, null, 2));

            // Extract candidate name from nested candidate object
            // The API returns: { id, candidate_id, candidate: { id, full_name, ... }, company, ... }
            let candidateName = 'Unknown';
            if (data.candidate && data.candidate.full_name) {
                candidateName = data.candidate.full_name;
            } else if (data.candidate_name) {
                candidateName = data.candidate_name;
            } else if (data.full_name) {
                candidateName = data.full_name;
            }

            // Transform API response to match the format expected by queue_manager
            const interview = {
                id: data.id,
                full_name: candidateName,
                company: data.company,
                type_of_interview: data.type_of_interview,
                interview_date: data.interview_date,
                recording_link: data.recording_link,
                backup_recording_url: data.backup_recording_url
            };

            console.log('✅ Transformed interview data:', interview);

            // Check if recording already exists (same logic as database.js)
            if (interview.recording_link && interview.recording_link.trim() !== '') {
                console.log('⚠️ Recording already exists for ID:', interviewId);
                const error = new Error(
                    `Recording already uploaded!\n\nGoogle Drive: ${interview.recording_link}\nYouTube: ${interview.backup_recording_url || 'N/A'}`
                );
                error.alreadyExists = true;
                error.existingLink = interview.recording_link;
                error.backupLink = interview.backup_recording_url;
                throw error;
            }

            console.log('✅ Recording link is empty, can proceed');
            return interview;

        } catch (error) {
            console.error('❌ Failed to fetch interview details:', error.message);
            throw error;
        }
    }

    /**
     * Update recording links for an interview
     * Replaces database.updateRecordingLinks()
     */
    async updateRecordingLinks(interviewId, driveLink, backupPath, transcriptLink = null, filename = null) {
        try {
            if (!this.baseUrl) {
                throw new Error('API base URL not configured');
            }

            console.log(`💾 Updating recording links for interview ID: ${interviewId}`);

            const headers = await apiAuth.getAuthHeaders();

            const updateData = {
                recording_link: driveLink,
                backup_recording_url: backupPath
            };

            // Add transcript if provided
            if (transcriptLink) {
                updateData.transcript = transcriptLink;
            }

            const response = await fetch(`${this.baseUrl}/api/interviews/${interviewId}`, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify(updateData)
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Interview not found');
                }
                const error = await response.json().catch(() => ({ detail: 'Update failed' }));
                throw new Error(error.detail || `API update failed: ${response.status}`);
            }

            const data = await response.json();
            console.log('✅ Recording links updated successfully');

            // Log to job activity log with filename
            await this.logJobActivity(interviewId, driveLink, backupPath, transcriptLink, filename);

            return data;

        } catch (error) {
            console.error('❌ Failed to update recording links:', error.message);
            throw error;
        }
    }

    /**
     * Log job activity for interview recording upload
     */
    async logJobActivity(interviewId, driveLink, backupPath, transcriptLink, filename) {
        try {
            if (!this.baseUrl) {
                throw new Error('API base URL not configured');
            }

            console.log(`📝 Logging job activity for interview ID: ${interviewId}`);

            const headers = await apiAuth.getAuthHeaders();

            // First, get the job type ID by unique_id
            const jobTypesResponse = await fetch(`${this.baseUrl}/api/job-types`, {
                method: 'GET',
                headers: headers
            });

            if (!jobTypesResponse.ok) {
                console.warn('⚠️ Could not fetch job types for logging');
                return;
            }

            const jobTypes = await jobTypesResponse.json();
            const botJobType = jobTypes.find(jt => jt.unique_id === 'bot_interview_recording_uploader');

            if (!botJobType) {
                console.warn('⚠️ Job type "bot_interview_recording_uploader" not found');
                return;
            }

            // Get the interview to extract candidate_id
            const interviewResponse = await fetch(`${this.baseUrl}/api/interviews/${interviewId}`, {
                method: 'GET',
                headers: headers
            });

            if (!interviewResponse.ok) {
                console.warn('⚠️ Could not fetch interview for logging');
                return;
            }

            const interviewData = await interviewResponse.json();
            const candidateId = interviewData.candidate_id;

            // Get today's date in YYYY-MM-DD format
            const today = new Date().toISOString().split('T')[0];

            // Get employee ID from environment
            const employeeId = process.env.EMPLOYEE_ID ? parseInt(process.env.EMPLOYEE_ID) : null;

            // Build notes with filename instead of URLs for better readability
            const notes = filename || `Interview ID ${interviewId} recording uploaded`;

            const activityData = {
                job_id: botJobType.id, // Use the correct job_type_id from unique_id lookup
                candidate_id: candidateId,
                employee_id: employeeId,
                activity_date: today,
                activity_count: 1,
                notes: notes
            };

            const response = await fetch(`${this.baseUrl}/api/job_activity_logs`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(activityData)
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ detail: 'Failed to log activity' }));
                console.warn('⚠️ Failed to log job activity:', error.detail || response.status);
                // Don't throw - logging failure shouldn't stop the upload
                return;
            }

            console.log('✅ Job activity logged successfully');

        } catch (error) {
            console.warn('⚠️ Failed to log job activity:', error.message);
            // Don't throw - logging failure shouldn't stop the upload
        }
    }

    /**
     * Test connection to API
     */
    async testConnection() {
        try {
            if (!apiAuth.isAuthenticated()) {
                throw new Error('Not authenticated');
            }

            // Try to fetch interviews list as a connection test
            const headers = await apiAuth.getAuthHeaders();
            const response = await fetch(`${this.baseUrl}/api/interviews`, {
                method: 'GET',
                headers: headers
            });

            return response.ok;
        } catch (error) {
            console.error('❌ Connection test failed:', error.message);
            return false;
        }
    }
}

// Singleton instance
const apiClient = new APIClient();

module.exports = {
    getInterviewDetails: (interviewId) => apiClient.getInterviewDetails(interviewId),
    updateRecordingLinks: (interviewId, driveLink, backupPath, transcriptLink, filename) =>
        apiClient.updateRecordingLinks(interviewId, driveLink, backupPath, transcriptLink, filename),
    testConnection: () => apiClient.testConnection(),
    initialize: (baseUrl) => apiClient.initialize(baseUrl)
};
