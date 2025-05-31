import axios from 'axios';

class ApiHelper {
    constructor(url, token) {
        this.url = url;
        this.token = token;
    }

    async get(endpoint) {
        const response = await fetch(`${this.url}${endpoint}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.token}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return await response.json();
    }

    async post(endpoint, payload) {
        const response = await fetch(`${this.url}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return await response.json();
    }
}

export default ApiHelper;
