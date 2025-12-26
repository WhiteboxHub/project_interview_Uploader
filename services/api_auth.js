const Store = require('electron-store');
const FormData = require('form-data');
const fetch = require('node-fetch');
require('dotenv').config();

const tokenStore = new Store({ name: 'api-tokens' });

class APIAuth {
    constructor() {
        this.baseUrl = null;
        this.email = null;
        this.password = null;
        this.token = null;
        this.tokenExpiry = null;
    }

    /**
     * Initialize with credentials from .env
     */
    initialize(baseUrl, email, password) {
        this.baseUrl = baseUrl;
        this.email = email;
        this.password = password;

        // Try to load existing token from store
        const stored = tokenStore.get('auth');
        if (stored && stored.token && stored.expiry) {
            this.token = stored.token;
            this.tokenExpiry = stored.expiry;
            console.log(' Loaded stored auth token');
        }
    }

    /**
     * Login and get access token
     */
    async login(email = null, password = null) {
        try {
            const loginEmail = email || this.email;
            const loginPassword = password || this.password;

            if (!this.baseUrl) {
                throw new Error('API base URL not configured');
            }

            if (!loginEmail || !loginPassword) {
                throw new Error('Email and password are required');
            }

            console.log(' Logging in to API...');

            // FastAPI OAuth2PasswordRequestForm expects form-data with username/password fields
            const formData = new URLSearchParams();
            formData.append('username', loginEmail);
            formData.append('password', loginPassword);

            const response = await fetch(`${this.baseUrl}/api/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString()
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ detail: 'Login failed' }));
                throw new Error(error.detail || `Login failed: ${response.status}`);
            }

            const data = await response.json();

            if (!data.access_token) {
                throw new Error('No access token received');
            }

            this.token = data.access_token;

            // Store token with expiry (default 24 hours if not specified)
            this.tokenExpiry = Date.now() + (24 * 60 * 60 * 1000);

            // Persist to store
            tokenStore.set('auth', {
                token: this.token,
                expiry: this.tokenExpiry
            });

            console.log(' Login successful!');
            console.log(' Team:', data.team);
            console.log(' Login count:', data.login_count);

            return {
                success: true,
                token: this.token,
                team: data.team,
                loginCount: data.login_count
            };

        } catch (error) {
            console.error(' Login failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get current valid token
     */
    async getToken() {
        // Check if token exists and is not expired
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.token;
        }

        // Token expired or doesn't exist, try to login again
        console.log(' Token expired or missing, re-authenticating...');
        const result = await this.login();

        if (!result.success) {
            throw new Error('Authentication failed: ' + result.error);
        }

        return this.token;
    }

    /**
     * Check if currently authenticated
     */
    isAuthenticated() {
        return this.token && this.tokenExpiry && Date.now() < this.tokenExpiry;
    }

    /**
     * Logout and clear token
     */
    logout() {
        this.token = null;
        this.tokenExpiry = null;
        tokenStore.delete('auth');
        console.log('🚪 Logged out');
    }

    /**
     * Get authentication headers for API requests
     */
    async getAuthHeaders() {
        const token = await this.getToken();
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }
}

// Singleton instance
const apiAuth = new APIAuth();

module.exports = apiAuth;
